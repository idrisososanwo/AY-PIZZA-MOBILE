import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Config } from '../config/env';
import { Colors } from '../constants/colors';
import { Brand } from '../constants/brand';
import { getProductImage } from '../constants/images';
import { CartState } from '../domains/cart/cart-types';
import { cartStore } from '../domains/cart/cart-store';
import {
  orderService,
  CustomerCheckoutDetails,
  AuthoritativePriceDiscrepancyError,
  PriceDiscrepancyDetails,
} from '../domains/order/order-service';
import { GuestReceiptStore } from '../domains/order/guest-receipt-store';
import { CustomerProfile, CustomerAddress } from '../domains/customer/customer-types';
import { customerService } from '../domains/customer/customer-service';
import { deliveryPricingEngine, PROVISIONAL_LANDMARKS } from '../domains/delivery/delivery-pricing-engine';
import { locationService } from '../domains/delivery/location-service';
import { paymentService } from '../domains/payment/payment-service';
import { SavedAddressesModal } from './SavedAddressesModal';
import { LandmarkPickerModal } from './LandmarkPickerModal';
import { DeliveryLandmark } from '../types/delivery';

export interface CheckoutModalProps {
  visible: boolean;
  cartState: CartState;
  customerProfile?: CustomerProfile | null;
  onClose: () => void;
  onProceedToPayment: (orderParams: {
    orderId: string;
    orderNumber: string;
    receiptToken: string;
    amount: number;
    amountInKobo: number;
    email: string;
    customerName: string;
    customerPhone: string;
  }) => void;
  onPaymentSuccess?: (result: {
    orderId: string;
    orderNumber: string;
    paymentReference: string;
  }) => void;
}

export interface CreatedOrderParams {
  orderId: string;
  orderNumber: string;
  receiptToken: string;
  amount: number;
  amountInKobo: number;
  email: string;
  customerName: string;
  customerPhone: string;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  visible,
  cartState,
  customerProfile,
  onClose,
  onProceedToPayment,
  onPaymentSuccess,
}) => {
  const insets = useSafeAreaInsets();

  // Three-stage workflow state: 1 = Fulfilment & Details, 2 = Order Review, 3 = Payment
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);

  // Stage 1: Contact & Location form state
  const [customerName, setCustomerName] = useState(customerProfile?.fullName || '');
  const [customerPhone, setCustomerPhone] = useState(customerProfile?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(customerProfile?.email || '');
  const [deliveryNotes, setDeliveryNotes] = useState(cartState.deliveryNotes || '');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsNote, setGpsNote] = useState<string | null>(null);

  // Address & Landmark Sub-modals
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [savedAddressesModalVisible, setSavedAddressesModalVisible] = useState(false);
  const [landmarkPickerVisible, setLandmarkPickerVisible] = useState(false);

  // Discrepancy State
  const [discrepancyNotice, setDiscrepancyNotice] = useState<PriceDiscrepancyDetails | null>(null);

  // Stage 3: Payment State
  const [createdOrderParams, setCreatedOrderParams] = useState<CreatedOrderParams | null>(null);
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [authorizationUrl, setAuthorizationUrl] = useState<string>('');
  const [isPaystackLaunched, setIsPaystackLaunched] = useState(false);
  const [isInitializingPayment, setIsInitializingPayment] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [isSimulatingStaging, setIsSimulatingStaging] = useState(false);
  const [paymentInitError, setPaymentInitError] = useState<string | null>(null);
  const [ambiguousPaymentNotice, setAmbiguousPaymentNotice] = useState<string | null>(null);

  const isDelivery = cartState.fulfillmentType === 'delivery';

  // Address selection helper
  const handleSelectAddress = useCallback(async (addr: CustomerAddress) => {
    const activeLms = deliveryPricingEngine.getActiveLandmarks();
    const matchedLm = activeLms.find((l) => l.id === addr.landmarkId);
    if (matchedLm) {
      await cartStore.setLandmark(matchedLm);
    }
    await cartStore.setDeliveryDetails(addr.detailedAddress, addr.deliveryNotes || '');
    if (addr.contactPhone) setCustomerPhone((prev) => prev || addr.contactPhone);
    if (addr.deliveryNotes) setDeliveryNotes(addr.deliveryNotes);
  }, []);

  // Pre-fill profile info if customer is logged in
  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheckoutStep(1);
      setCreatedOrderParams(null);
      setPaymentReference('');
      setAuthorizationUrl('');
      setIsPaystackLaunched(false);
      setPaymentInitError(null);
      setAmbiguousPaymentNotice(null);
      setDiscrepancyNotice(null);
      setIsSimulatingStaging(false);
      return;
    }

    // Refresh live delivery tariffs from database
    deliveryPricingEngine.initialize().then(() => {
      const activeLms = deliveryPricingEngine.getActiveLandmarks();
      if (cartState.selectedLandmark) {
        const liveLm = activeLms.find((l) => l.id === cartState.selectedLandmark?.id);
        if (liveLm && liveLm.fee !== cartState.selectedLandmark.fee) {
          cartStore.setLandmark(liveLm);
        }
      }
    }).catch(() => {});

    if (customerProfile) {
      customerService.getAddresses(customerProfile.id).then((res) => {
        if (res.success && res.addresses) {
          setSavedAddresses(res.addresses);
          if (isDelivery && !cartState.deliveryAddress.trim() && res.addresses.length > 0) {
            const defaultAddr = res.addresses.find((a) => a.isDefault) || res.addresses[0];
            handleSelectAddress(defaultAddr);
          }
        }
        if (customerProfile.fullName) setCustomerName((prev) => prev || customerProfile.fullName || '');
        if (customerProfile.phone) setCustomerPhone((prev) => prev || customerProfile.phone || '');
        if (customerProfile.email) setCustomerEmail((prev) => prev || customerProfile.email || '');
      });
    }
  }, [customerProfile, visible, isDelivery, cartState.deliveryAddress, cartState.selectedLandmark, handleSelectAddress]);

  // Optional GPS Location Assist (Non-mandatory helper)
  const handleGpsAssist = async () => {
    try {
      setLocatingGps(true);
      setGpsNote(null);
      const activeLms = deliveryPricingEngine.getActiveLandmarks();
      const baseLandmarks = activeLms.length > 0 ? activeLms : PROVISIONAL_LANDMARKS;
      const result = await locationService.assistAddressSelection(baseLandmarks);

      if (result.success && result.suggestedLandmark) {
        await cartStore.setLandmark(result.suggestedLandmark);
        setGpsNote(
          `GPS detected: ${result.suggestedLandmark.name} (~${result.distanceFromStoreKm} km from AY Pizza)`
        );
      } else {
        Alert.alert(
          'GPS Location Optional',
          result.error || 'Could not determine GPS coordinates. Please select your landmark manually.'
        );
      }
    } catch {
      Alert.alert(
        'Location Notice',
        'Device location is optional. You can easily choose your landmark and address manually.'
      );
    } finally {
      setLocatingGps(false);
    }
  };

  // Stage 1 Validation
  const validateStage1 = (): boolean => {
    if (!customerName.trim()) {
      Alert.alert('Required Field', 'Please enter your full name.');
      return false;
    }
    const cleanPhone = customerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number (at least 10 digits).');
      return false;
    }
    if (customerEmail.trim() && !customerEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return false;
    }
    if (isDelivery) {
      if (!cartState.selectedLandmark || !cartState.selectedLandmark.isActive) {
        Alert.alert('Delivery Landmark Required', 'Please select a valid delivery landmark for this order.');
        return false;
      }
      if (!cartState.deliveryAddress || cartState.deliveryAddress.trim().length === 0) {
        Alert.alert('Delivery Address Required', 'Please enter your room number, hostel, or delivery location.');
        return false;
      }
    }
    return true;
  };

  // Advance from Stage 1 to Stage 2
  const handleProceedToReview = () => {
    if (validateStage1()) {
      setCheckoutStep(2);
    }
  };

  // Initialize Paystack session for Stage 3
  const initializePaymentSession = useCallback(async (params: CreatedOrderParams) => {
    try {
      setIsInitializingPayment(true);
      setPaymentInitError(null);
      setAmbiguousPaymentNotice(null);

      const initResult = await paymentService.initializePayment({
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        amount: params.amount,
        amountInKobo: params.amountInKobo,
        email: params.email,
        receiptToken: params.receiptToken,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
      });

      if (initResult.success) {
        setPaymentReference(initResult.reference);
        setAuthorizationUrl(initResult.authorizationUrl || '');
      } else {
        setPaymentInitError(initResult.error || 'Failed to initialize Paystack session.');
      }
    } catch (err: any) {
      setPaymentInitError(err.message || 'Error connecting to payment provider.');
    } finally {
      setIsInitializingPayment(false);
    }
  }, []);

  // Advance from Stage 2 to Stage 3 (creates authoritative order)
  const handleCreateOrderAndProceedToPayment = async () => {
    if (!validateStage1()) {
      setCheckoutStep(1);
      return;
    }

    try {
      setIsSubmittingOrder(true);
      setDiscrepancyNotice(null);

      const customerDetails: CustomerCheckoutDetails = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        deliveryNotes: deliveryNotes.trim() || undefined,
      };

      const result = await orderService.createAuthoritativeOrder(cartState, customerDetails);

      if (result.success) {
        let finalReceiptToken = result.receiptToken;

        if (finalReceiptToken) {
          await GuestReceiptStore.saveReceipt(result.orderId, result.orderNumber, finalReceiptToken);
        } else {
          const stored = await GuestReceiptStore.getReceipt(result.orderId);
          if (stored?.receiptToken) {
            finalReceiptToken = stored.receiptToken;
          }
        }

        if (!finalReceiptToken) {
          Alert.alert(
            'Order Already Received',
            `Order #${result.orderNumber} is already recorded in the restaurant system. Please contact AY Pizza stand opposite King Jaja Hall with your phone number (${customerDetails.customerPhone}).`
          );
          return;
        }

        const params: CreatedOrderParams = {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          receiptToken: finalReceiptToken,
          amount: result.total,
          amountInKobo: result.totalInKobo,
          email: customerDetails.customerEmail || 'guest@aypizza.ng',
          customerName: customerDetails.customerName,
          customerPhone: customerDetails.customerPhone,
        };

        setCreatedOrderParams(params);
        setCheckoutStep(3);
        await initializePaymentSession(params);
      }
    } catch (err: any) {
      if (err instanceof AuthoritativePriceDiscrepancyError) {
        setDiscrepancyNotice(err.details || {
          clientEstimated: err.clientEstimated,
          serverAuthoritative: err.serverAuthoritative,
          variance: err.variance,
          clientSubtotal: cartState.subtotal,
          serverSubtotal: err.serverAuthoritative - cartState.deliveryFee,
          clientDeliveryFee: cartState.deliveryFee,
          serverDeliveryFee: cartState.deliveryFee,
          orderId: '',
          orderNumber: '',
          receiptToken: '',
          totalInKobo: Math.round(err.serverAuthoritative * 100),
          status: 'PENDING_PAYMENT',
        });
      } else {
        Alert.alert('Checkout Error', err.message || 'Failed to initialize order.');
      }
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Customer accepts the authoritative price discrepancy
  const handleAcceptPriceDiscrepancy = async () => {
    if (!discrepancyNotice) return;

    try {
      setIsSubmittingOrder(true);

      const customerDetails: CustomerCheckoutDetails = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        deliveryNotes: deliveryNotes.trim() || undefined,
      };

      // If we already have the created order details from the server RPC response
      if (discrepancyNotice.orderId && discrepancyNotice.receiptToken) {
        await GuestReceiptStore.saveReceipt(
          discrepancyNotice.orderId,
          discrepancyNotice.orderNumber,
          discrepancyNotice.receiptToken
        );

        const params: CreatedOrderParams = {
          orderId: discrepancyNotice.orderId,
          orderNumber: discrepancyNotice.orderNumber,
          receiptToken: discrepancyNotice.receiptToken,
          amount: discrepancyNotice.serverAuthoritative,
          amountInKobo: discrepancyNotice.totalInKobo,
          email: customerDetails.customerEmail || 'guest@aypizza.ng',
          customerName: customerDetails.customerName,
          customerPhone: customerDetails.customerPhone,
        };

        setCreatedOrderParams(params);
        setDiscrepancyNotice(null);
        setCheckoutStep(3);
        await initializePaymentSession(params);
      } else {
        // Fallback: create order explicitly passing acceptedAuthoritativeTotal
        const result = await orderService.createAuthoritativeOrder(cartState, customerDetails, {
          acceptedAuthoritativeTotal: discrepancyNotice.serverAuthoritative,
        });

        if (result.success && result.receiptToken) {
          await GuestReceiptStore.saveReceipt(result.orderId, result.orderNumber, result.receiptToken);

          const params: CreatedOrderParams = {
            orderId: result.orderId,
            orderNumber: result.orderNumber,
            receiptToken: result.receiptToken,
            amount: result.total,
            amountInKobo: result.totalInKobo,
            email: customerDetails.customerEmail || 'guest@aypizza.ng',
            customerName: customerDetails.customerName,
            customerPhone: customerDetails.customerPhone,
          };

          setCreatedOrderParams(params);
          setDiscrepancyNotice(null);
          setCheckoutStep(3);
          await initializePaymentSession(params);
        }
      }
    } catch (err: any) {
      Alert.alert('Checkout Error', err.message || 'Failed to proceed with updated pricing.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Customer rejects the authoritative price discrepancy
  const handleRejectPriceDiscrepancy = () => {
    setDiscrepancyNotice(null);
    onClose();
  };

  // Launch real Paystack hosted checkout in external browser
  const handleLaunchPaystackCheckout = async () => {
    if (!authorizationUrl || !/^https:\/\/checkout\.paystack\.com\//i.test(authorizationUrl)) {
      Alert.alert(
        'Invalid Checkout URL',
        'Paystack session is invalid or not yet ready. Please wait a moment or tap Retry Session.'
      );
      return;
    }

    try {
      await Linking.openURL(authorizationUrl);
      setIsPaystackLaunched(true);
    } catch (err: any) {
      Alert.alert(
        'Unable to Open Browser',
        err.message || 'Could not open Paystack checkout. Please verify device internet access.'
      );
    }
  };

  // Stage 3 Payment Verification: Checks genuine Paystack verification status
  const handleCheckPaymentStatus = async () => {
    if (!createdOrderParams) return;

    try {
      setIsVerifyingPayment(true);
      setAmbiguousPaymentNotice(null);

      const verifyResult = await paymentService.verifyPayment(
        paymentReference || `ay_ref_${createdOrderParams.orderNumber}`,
        createdOrderParams.orderId,
        createdOrderParams.receiptToken
      );

      if (verifyResult.success) {
        if (onPaymentSuccess) {
          onPaymentSuccess({
            orderId: createdOrderParams.orderId,
            orderNumber: createdOrderParams.orderNumber,
            paymentReference: paymentReference || `ay_ref_${createdOrderParams.orderNumber}`,
          });
        }
        onClose();
      } else if (verifyResult.outcome === 'PENDING') {
        setAmbiguousPaymentNotice(
          verifyResult.error ||
            'Payment is currently pending or processing with Paystack / your bank. Please tap Check Status again in a few moments.'
        );
      } else if (verifyResult.outcome === 'FAILED') {
        setAmbiguousPaymentNotice(
          verifyResult.error ||
            'Payment was cancelled or declined by processor. You can retry with another payment method.'
        );
      } else {
        setAmbiguousPaymentNotice(
          verifyResult.error ||
            'Payment verification response was ambiguous. If your account was debited, your order will confirm automatically upon webhook arrival.'
        );
      }
    } catch {
      setAmbiguousPaymentNotice(
        'Network verification interrupted. Your order is safely preserved. Tap "Check Status" below to re-check.'
      );
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  // Internal Staging QA Simulation Pathway (Strictly non-production)
  const handleSimulateStagingPayment = async () => {
    if (!createdOrderParams) return;
    if (Config.isProduction) {
      Alert.alert('Simulation Forbidden', 'Payment simulation is strictly forbidden in production mode.');
      return;
    }

    try {
      setIsSimulatingStaging(true);
      setAmbiguousPaymentNotice(null);

      const simResult = await paymentService.simulateStagingPayment({
        orderId: createdOrderParams.orderId,
        receiptToken: createdOrderParams.receiptToken,
      });

      if (simResult.success) {
        if (onPaymentSuccess) {
          onPaymentSuccess({
            orderId: createdOrderParams.orderId,
            orderNumber: createdOrderParams.orderNumber,
            paymentReference: simResult.paymentReference || paymentReference,
          });
        }
        onClose();
      } else {
        setAmbiguousPaymentNotice(simResult.error || 'Staging payment simulation was rejected by server.');
      }
    } catch (err: any) {
      setAmbiguousPaymentNotice(err.message || 'Error executing staging simulation.');
    } finally {
      setIsSimulatingStaging(false);
    }
  };

  // Background status polling while customer is on Stage 3 (webhook detection)
  useEffect(() => {
    if (!visible || checkoutStep !== 3 || !createdOrderParams) return;

    let isMounted = true;
    let pollCount = 0;
    const maxPolls = 30; // 30 * 4s = 2 minutes

    const intervalId = setInterval(async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(intervalId);
        return;
      }

      try {
        const orderRes = await orderService.getOrderReceipt(
          createdOrderParams.orderId,
          createdOrderParams.receiptToken
        );
        if (isMounted && orderRes.success && orderRes.order?.status === 'CONFIRMED') {
          clearInterval(intervalId);
          if (onPaymentSuccess) {
            onPaymentSuccess({
              orderId: createdOrderParams.orderId,
              orderNumber: createdOrderParams.orderNumber,
              paymentReference: orderRes.order.paymentReference || paymentReference,
            });
          }
          onClose();
        }
      } catch {
        // Non-fatal polling error
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [visible, checkoutStep, createdOrderParams, onPaymentSuccess, onClose, paymentReference]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Order Checkout 🛍️</Text>
              <Text style={styles.headerSubtitle}>
                {checkoutStep === 1
                  ? 'Step 1 of 3: Fulfilment & Contact'
                  : checkoutStep === 2
                  ? 'Step 2 of 3: Order Review'
                  : 'Step 3 of 3: Secure Payment'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Close Checkout"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Three-Stage Progress Stepper Indicator */}
          <View style={styles.stepperContainer} testID="checkout-progress-indicator">
            <TouchableOpacity
              style={[styles.stepTab, checkoutStep === 1 && styles.stepTabActive]}
              onPress={() => setCheckoutStep(1)}
              activeOpacity={0.8}
              testID="step-tab-1"
            >
              <View
                style={[
                  styles.stepCircle,
                  checkoutStep === 1
                    ? styles.stepCircleActive
                    : styles.stepCircleCompleted,
                ]}
              >
                <Text
                  style={[
                    styles.stepCircleText,
                    (checkoutStep === 1 || checkoutStep > 1) && styles.stepCircleTextActive,
                  ]}
                >
                  {checkoutStep > 1 ? '✓' : '1'}
                </Text>
              </View>
              <Text style={[styles.stepLabel, checkoutStep === 1 && styles.stepLabelActive]}>
                1. Fulfilment
              </Text>
            </TouchableOpacity>

            <View style={[styles.stepLine, checkoutStep > 1 && styles.stepLineActive]} />

            <TouchableOpacity
              style={[styles.stepTab, checkoutStep === 2 && styles.stepTabActive]}
              onPress={() => {
                if (validateStage1()) setCheckoutStep(2);
              }}
              activeOpacity={0.8}
              testID="step-tab-2"
            >
              <View
                style={[
                  styles.stepCircle,
                  checkoutStep === 2
                    ? styles.stepCircleActive
                    : checkoutStep > 2
                    ? styles.stepCircleCompleted
                    : styles.stepCircleInactive,
                ]}
              >
                <Text
                  style={[
                    styles.stepCircleText,
                    checkoutStep >= 2 && styles.stepCircleTextActive,
                  ]}
                >
                  {checkoutStep > 2 ? '✓' : '2'}
                </Text>
              </View>
              <Text style={[styles.stepLabel, checkoutStep === 2 && styles.stepLabelActive]}>
                2. Review
              </Text>
            </TouchableOpacity>

            <View style={[styles.stepLine, checkoutStep > 2 && styles.stepLineActive]} />

            <TouchableOpacity
              style={[styles.stepTab, checkoutStep === 3 && styles.stepTabActive]}
              disabled={!createdOrderParams}
              activeOpacity={0.8}
              testID="step-tab-3"
            >
              <View
                style={[
                  styles.stepCircle,
                  checkoutStep === 3 ? styles.stepCircleActive : styles.stepCircleInactive,
                ]}
              >
                <Text
                  style={[
                    styles.stepCircleText,
                    checkoutStep === 3 && styles.stepCircleTextActive,
                  ]}
                >
                  3
                </Text>
              </View>
              <Text style={[styles.stepLabel, checkoutStep === 3 && styles.stepLabelActive]}>
                3. Payment
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom + 24, 48) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ================================================================= */}
            {/* STAGE 1: FULFILMENT & CONTACT LOCATION */}
            {/* ================================================================= */}
            {checkoutStep === 1 && (
              <View testID="checkout-stage-1">
                {/* Fulfilment Selector Segment */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>1. Fulfilment Method</Text>
                  <View style={styles.segmentedRow}>
                    <TouchableOpacity
                      style={[styles.segmentBtn, isDelivery && styles.segmentBtnActive]}
                      onPress={() => cartStore.setFulfillmentType('delivery')}
                      activeOpacity={0.8}
                      testID="checkout-select-delivery"
                    >
                      <Text style={[styles.segmentText, isDelivery && styles.segmentTextActive]}>
                        🛵 Campus Delivery
                      </Text>
                      <Text style={[styles.segmentBadge, isDelivery && styles.segmentBadgeActive]}>
                        {cartState.deliveryFee > 0
                          ? `₦${cartState.deliveryFee.toLocaleString()}`
                          : '₦500 Flat'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.segmentBtn, !isDelivery && styles.segmentBtnActive]}
                      onPress={() => cartStore.setFulfillmentType('pickup')}
                      activeOpacity={0.8}
                      testID="checkout-select-pickup"
                    >
                      <Text style={[styles.segmentText, !isDelivery && styles.segmentTextActive]}>
                        🏬 King Jaja Pickup
                      </Text>
                      <Text style={[styles.segmentBadge, !isDelivery && styles.segmentBadgeActive]}>
                        FREE
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Customer Contact Details */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>2. Contact Information</Text>

                  <Text style={styles.inputLabel}>Full Name *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Adebayo Idris"
                    placeholderTextColor={Colors.textMuted}
                    selectionColor={Colors.primaryRed}
                    value={customerName}
                    onChangeText={setCustomerName}
                    autoCapitalize="words"
                    testID="input-customer-name"
                  />

                  <Text style={styles.inputLabel}>Phone Number (Call / WhatsApp) *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 0812 345 6789"
                    placeholderTextColor={Colors.textMuted}
                    selectionColor={Colors.primaryRed}
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                    keyboardType="phone-pad"
                    testID="input-customer-phone"
                  />

                  <Text style={styles.inputLabel}>Email Address (For receipt)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. adebayo@unilag.edu.ng"
                    placeholderTextColor={Colors.textMuted}
                    selectionColor={Colors.primaryRed}
                    value={customerEmail}
                    onChangeText={setCustomerEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    testID="input-customer-email"
                  />
                </View>

                {/* Delivery Location or Pickup Stand Details */}
                {isDelivery ? (
                  <View style={styles.sectionCard}>
                    <View style={styles.sectionTitleRow}>
                      <Text style={styles.sectionTitle}>3. Delivery Destination *</Text>
                      <TouchableOpacity
                        style={styles.changeAddressBtn}
                        onPress={() => setSavedAddressesModalVisible(true)}
                        activeOpacity={0.8}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        testID="btn-saved-addresses"
                      >
                        <Text style={styles.changeAddressBtnText}>
                          {savedAddresses.length > 0
                            ? `Saved (${savedAddresses.length}) 📍`
                            : '+ Saved Address'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Landmark Selector Card */}
                    <Text style={styles.fieldLabel}>Delivery Landmark & Tariff:</Text>
                    <TouchableOpacity
                      style={styles.landmarkCardTrigger}
                      onPress={() => setLandmarkPickerVisible(true)}
                      activeOpacity={0.8}
                      testID="btn-choose-landmark"
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.landmarkCardTitle}>
                          📍 {cartState.selectedLandmark ? cartState.selectedLandmark.name : 'Select Delivery Landmark *'}
                        </Text>
                        <Text style={styles.landmarkCardFee}>
                          {cartState.selectedLandmark
                            ? `Delivery fee: ₦${cartState.deliveryFee.toLocaleString()} • ${
                                cartState.selectedLandmark.isCampus ? 'UNILAG Campus' : 'Lagos Mainland'
                              }`
                            : 'Tap to browse supported UNILAG hostels & areas'}
                        </Text>
                      </View>
                      <Text style={styles.changeTag}>Change ▾</Text>
                    </TouchableOpacity>

                    {/* Optional GPS Assist Button */}
                    <TouchableOpacity
                      style={styles.gpsAssistBtn}
                      onPress={handleGpsAssist}
                      disabled={locatingGps}
                      activeOpacity={0.8}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      testID="btn-gps-assist"
                    >
                      {locatingGps ? (
                        <ActivityIndicator size="small" color={Colors.primaryRed} />
                      ) : (
                        <Text style={styles.gpsAssistBtnText}>
                          📍 Detect Closest Landmark via GPS (Optional Assist)
                        </Text>
                      )}
                    </TouchableOpacity>
                    {gpsNote && <Text style={styles.gpsNoteText}>✓ {gpsNote}</Text>}

                    {/* Detailed Room / Hostel / Floor */}
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                      Room Number / Floor / Building *
                    </Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. King Jaja Hall, Block A, Room 14"
                      placeholderTextColor={Colors.textMuted}
                      selectionColor={Colors.primaryRed}
                      value={cartState.deliveryAddress}
                      onChangeText={(val) => cartStore.setDeliveryDetails(val, deliveryNotes)}
                      testID="input-delivery-address"
                    />

                    {/* Delivery Instructions */}
                    <Text style={[styles.fieldLabel, { marginTop: 10 }]}>
                      Delivery Instructions (Optional):
                    </Text>
                    <TextInput
                      style={[styles.textInput, styles.notesInput]}
                      placeholder="e.g. Call when outside the hall gate / Leave with hall porter"
                      placeholderTextColor={Colors.textMuted}
                      selectionColor={Colors.primaryRed}
                      value={deliveryNotes}
                      onChangeText={(val) => {
                        setDeliveryNotes(val);
                        cartStore.setDeliveryDetails(cartState.deliveryAddress, val);
                      }}
                      multiline
                      testID="input-delivery-notes"
                    />
                  </View>
                ) : (
                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>3. Pickup Location Details</Text>
                    <View style={styles.pickupCard}>
                      <Text style={styles.pickupTitle}>🏬 AY Pizza King Jaja Kitchen Stand</Text>
                      <Text style={styles.pickupAddress}>
                        Opposite King Jaja Hall, UNILAG Main Campus, Akoka, Lagos.
                      </Text>
                      <View style={styles.pickupFeeRow}>
                        <Text style={styles.pickupFeeBadge}>Fulfillment Fee: FREE (₦0)</Text>
                        <Text style={styles.pickupTimeBadge}>Ready in ~15 mins</Text>
                      </View>
                      <Text style={styles.pickupInstructions}>
                        Present your order confirmation number at the counter when ready.
                      </Text>
                    </View>
                  </View>
                )}

                {/* Continue to Review CTA */}
                <TouchableOpacity
                  style={styles.primaryActionBtn}
                  onPress={handleProceedToReview}
                  activeOpacity={0.85}
                  testID="btn-continue-to-review"
                >
                  <Text style={styles.primaryActionBtnText}>
                    Continue to Order Review (₦{cartState.estimatedTotal.toLocaleString()}) →
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ================================================================= */}
            {/* STAGE 2: ORDER REVIEW */}
            {/* ================================================================= */}
            {checkoutStep === 2 && (
              <View testID="checkout-stage-2">
                <View style={styles.stageNavigationHeader}>
                  <TouchableOpacity
                    style={styles.backStepBtn}
                    onPress={() => setCheckoutStep(1)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID="btn-back-to-details"
                  >
                    <Text style={styles.backStepBtnText}>← Edit Location & Contact</Text>
                  </TouchableOpacity>
                </View>

                {/* Discrepancy Notice Banner */}
                {discrepancyNotice && (
                  <View style={styles.discrepancyCard} testID="discrepancy-card">
                    <View style={styles.discrepancyHeaderRow}>
                      <Text style={styles.discrepancyTitle}>⚠️ Menu Price Update</Text>
                      <View style={styles.discrepancyBadge}>
                        <Text style={styles.discrepancyBadgeText}>ACTION REQUIRED</Text>
                      </View>
                    </View>
                    <Text style={styles.discrepancyText}>
                      The live calculation differs slightly from your estimate:
                    </Text>

                    {/* Itemized Difference Details */}
                    <View style={styles.discrepancyItemizedBox}>
                      {discrepancyNotice.clientDeliveryFee !== discrepancyNotice.serverDeliveryFee && (
                        <View style={styles.discrepancyDetailRow}>
                          <Text style={styles.discrepancyDetailLabel}>Delivery Tariff:</Text>
                          <Text style={styles.discrepancyDetailValue}>
                            ₦{discrepancyNotice.clientDeliveryFee.toLocaleString()} → ₦{discrepancyNotice.serverDeliveryFee.toLocaleString()}
                          </Text>
                        </View>
                      )}
                      {discrepancyNotice.clientSubtotal !== discrepancyNotice.serverSubtotal && (
                        <View style={styles.discrepancyDetailRow}>
                          <Text style={styles.discrepancyDetailLabel}>Items Subtotal:</Text>
                          <Text style={styles.discrepancyDetailValue}>
                            ₦{discrepancyNotice.clientSubtotal.toLocaleString()} → ₦{discrepancyNotice.serverSubtotal.toLocaleString()}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.discrepancyDetailRow, styles.discrepancyTotalRow]}>
                        <Text style={styles.discrepancyTotalLabel}>Revised Total:</Text>
                        <Text style={styles.discrepancyTotalValue}>
                          ₦{discrepancyNotice.serverAuthoritative.toLocaleString()}
                        </Text>
                      </View>
                      <Text style={styles.discrepancyAmount}>
                        Cart Estimate: ₦{discrepancyNotice.clientEstimated.toLocaleString()} → Total: ₦
                        {discrepancyNotice.serverAuthoritative.toLocaleString()}
                      </Text>
                      <Text style={styles.discrepancyDifferenceNote}>
                        Difference: {discrepancyNotice.serverAuthoritative > discrepancyNotice.clientEstimated ? '+' : '-'}₦
                        {discrepancyNotice.variance.toLocaleString()}
                      </Text>
                    </View>

                    {/* Explicit Acceptance / Rejection Actions */}
                    <View style={styles.discrepancyActionsRow}>
                      <TouchableOpacity
                        style={styles.acceptPriceBtn}
                        onPress={handleAcceptPriceDiscrepancy}
                        disabled={isSubmittingOrder}
                        activeOpacity={0.85}
                        testID="btn-accept-price-update"
                      >
                        {isSubmittingOrder ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.acceptPriceBtnText}>
                            Accept & Pay ₦{discrepancyNotice.serverAuthoritative.toLocaleString()} 💳
                          </Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.rejectPriceBtn}
                        onPress={handleRejectPriceDiscrepancy}
                        disabled={isSubmittingOrder}
                        activeOpacity={0.85}
                        testID="btn-reject-price-update"
                      >
                        <Text style={styles.rejectPriceBtnText}>Reject & Return to Cart 🛒</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Items Detailed List */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>
                    Order Items ({cartState.itemCount} item{cartState.itemCount === 1 ? '' : 's'})
                  </Text>

                  {cartState.items.map((item) => (
                    <View key={item.id} style={styles.reviewItemRow}>
                      <View style={styles.checkoutItemThumbContainer}>
                        <Image
                          source={getProductImage(item.productName)}
                          style={styles.checkoutItemThumb}
                          resizeMode="cover"
                        />
                      </View>
                      <View style={styles.reviewItemBody}>
                        <View style={styles.reviewItemHeader}>
                          <Text style={styles.reviewItemTitle} numberOfLines={2}>
                            {item.quantity}x {item.productName}
                          </Text>
                          {item.sizeName && (
                            <View style={styles.reviewSizePill}>
                              <Text style={styles.reviewSizePillText}>{item.sizeName}</Text>
                            </View>
                          )}
                        </View>

                        {/* Half & Half Breakdown */}
                        {item.halfSecondaryFlavor && (
                          <View style={styles.reviewHalfTag}>
                            <Text style={styles.reviewHalfTagText}>
                              🍕 Half & Half: {item.productName} + {item.halfSecondaryFlavor}
                            </Text>
                          </View>
                        )}

                        {/* Customizations & Toppings */}
                        {item.customizations
                          .filter((c) => !c.optionId.startsWith('half-'))
                          .map((c, i) => (
                            <Text key={i} style={styles.reviewCustomizationText}>
                              + {c.optionName} (₦{c.price.toLocaleString()})
                            </Text>
                          ))}

                        {/* Instructions */}
                        {item.specialInstructions && (
                          <Text style={styles.reviewNotesText}>
                            {`📝 "${item.specialInstructions}"`}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.reviewItemPrice}>₦{item.lineTotal.toLocaleString()}</Text>
                    </View>
                  ))}
                </View>

                {/* Fulfilment & Recipient Summary */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Fulfilment & Delivery Destination</Text>
                  <View style={styles.summaryRecapCard}>
                    <View style={styles.summaryRecapHeader}>
                      <Text style={styles.summaryRecapMode}>
                        {isDelivery ? '🛵 Campus Delivery' : '🏬 King Jaja Pickup'}
                      </Text>
                      <Text style={styles.summaryRecapFee}>
                        {isDelivery ? `Tariff: ₦${cartState.deliveryFee.toLocaleString()}` : 'FREE (₦0)'}
                      </Text>
                    </View>
                    <Text style={styles.summaryRecapRecipient}>
                      👤 Recipient: {customerName} • 📞 {customerPhone}
                    </Text>
                    <Text style={styles.summaryRecapAddress}>
                      {isDelivery
                        ? `📍 ${cartState.selectedLandmark?.name}: ${cartState.deliveryAddress}`
                        : `Opposite King Jaja Hall stand (${Brand.location.address})`}
                    </Text>
                    {deliveryNotes ? (
                      <Text style={styles.summaryRecapNotes}>📝 Note: {deliveryNotes}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Cost Estimation Breakdown */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Cost Breakdown</Text>
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>Items Subtotal:</Text>
                    <Text style={styles.costValue}>₦{cartState.subtotal.toLocaleString()}</Text>
                  </View>
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>Delivery Fee:</Text>
                    <Text style={styles.costValue}>
                      {isDelivery ? `₦${cartState.deliveryFee.toLocaleString()}` : 'FREE (₦0)'}
                    </Text>
                  </View>
                  <View style={[styles.costRow, styles.costTotalRow]}>
                    <Text style={styles.costTotalLabel}>Final Total:</Text>
                    <Text style={styles.costTotalValue}>
                      ₦{cartState.estimatedTotal.toLocaleString()}
                    </Text>
                  </View>
                </View>

                {/* Proceed to Payment CTA (Hidden while discrepancy requires explicit customer decision) */}
                {!discrepancyNotice && (
                  <TouchableOpacity
                    style={[styles.primaryActionBtn, isSubmittingOrder && styles.primaryActionBtnDisabled]}
                    onPress={handleCreateOrderAndProceedToPayment}
                    disabled={isSubmittingOrder}
                    activeOpacity={0.85}
                    testID="btn-proceed-to-payment"
                  >
                    {isSubmittingOrder ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryActionBtnText}>
                        Proceed to Payment (₦{cartState.estimatedTotal.toLocaleString()}) 💳
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ================================================================= */}
            {/* STAGE 3: PAYMENT */}
            {/* ================================================================= */}
            {checkoutStep === 3 && createdOrderParams && (
              <View testID="checkout-stage-3">
                <View style={styles.stageNavigationHeader}>
                  <TouchableOpacity
                    style={styles.backStepBtn}
                    onPress={() => setCheckoutStep(2)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID="btn-back-to-review"
                  >
                    <Text style={styles.backStepBtnText}>← Back to Order Review</Text>
                  </TouchableOpacity>
                </View>

                {/* Ambiguous Payment Warning Banner */}
                {ambiguousPaymentNotice && (
                  <View style={styles.ambiguousNoticeBanner} testID="ambiguous-payment-banner">
                    <Text style={styles.ambiguousNoticeTitle}>
                      ⚠️ Payment Verification Pending
                    </Text>
                    <Text style={styles.ambiguousNoticeText}>{ambiguousPaymentNotice}</Text>
                    <Text style={styles.ambiguousNoticeHelp}>
                      Helpline: {Brand.contact.phone} • Counter: {Brand.location.address}
                    </Text>
                  </View>
                )}

                {/* Payment Overview Card */}
                <View style={styles.paymentSummaryCard}>
                  <View style={styles.paymentHeaderRow}>
                    <View style={styles.paystackLogoBox}>
                      <Text style={styles.paystackLogoText}>P</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentTitle}>Paystack Secure Checkout</Text>
                      <Text style={styles.paymentSubtitle}>Merchant: AY Pizza (UNILAG Campus)</Text>
                    </View>
                  </View>

                  <View style={styles.paymentAmountBox}>
                    <Text style={styles.paymentAmountLabel}>Total to Pay:</Text>
                    <Text style={styles.paymentAmountValue}>
                      ₦{createdOrderParams.amount.toLocaleString()}
                    </Text>
                    <Text style={styles.paymentKoboSubtext}>
                      ({createdOrderParams.amountInKobo.toLocaleString()} Kobo NGN)
                    </Text>
                  </View>

                  <View style={styles.paymentDetailRow}>
                    <Text style={styles.paymentDetailKey}>Order Number:</Text>
                    <Text style={styles.paymentDetailVal}>{createdOrderParams.orderNumber}</Text>
                  </View>
                  <View style={styles.paymentDetailRow}>
                    <Text style={styles.paymentDetailKey}>Reference:</Text>
                    <Text style={styles.paymentDetailVal}>
                      {paymentReference ? `${paymentReference.slice(0, 24)}...` : 'Generating...'}
                    </Text>
                  </View>
                  <View style={styles.paymentDetailRow}>
                    <Text style={styles.paymentDetailKey}>Customer:</Text>
                    <Text style={styles.paymentDetailVal}>{createdOrderParams.customerName}</Text>
                  </View>
                  <View style={styles.paymentDetailRow}>
                    <Text style={styles.paymentDetailKey}>Channels:</Text>
                    <Text style={styles.paymentDetailVal}>Card, USSD, Bank Transfer</Text>
                  </View>

                  {/* Payment Actions */}
                  {isInitializingPayment ? (
                    <View style={styles.paymentLoadingBox}>
                      <ActivityIndicator size="large" color={Colors.primaryRed} />
                      <Text style={styles.paymentLoadingText}>Initializing Paystack session...</Text>
                    </View>
                  ) : paymentInitError ? (
                    <View style={styles.paymentErrorBox}>
                      <Text style={styles.paymentErrorText}>⚠️ {paymentInitError}</Text>
                      <TouchableOpacity
                        style={styles.retryInitBtn}
                        onPress={() => initializePaymentSession(createdOrderParams)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.retryInitBtnText}>Retry Session 🔄</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.paymentActionsRow}>
                      {/* Real Paystack Hosted Checkout Launch Button */}
                      <TouchableOpacity
                        style={[
                          styles.paystackLaunchBtn,
                          (!authorizationUrl || isVerifyingPayment) && styles.primaryActionBtnDisabled,
                        ]}
                        onPress={handleLaunchPaystackCheckout}
                        disabled={!authorizationUrl || isVerifyingPayment}
                        activeOpacity={0.85}
                        testID="btn-paystack-launch"
                      >
                        <Text style={styles.paystackLaunchBtnText}>
                          {isPaystackLaunched
                            ? 'Re-open Paystack Checkout ↗️'
                            : 'Pay with Paystack (Card, Transfer, USSD) 💳'}
                        </Text>
                      </TouchableOpacity>

                      {/* Manual Return-to-App Check Status Button */}
                      <TouchableOpacity
                        style={[
                          styles.primaryActionBtn,
                          isVerifyingPayment && styles.primaryActionBtnDisabled,
                        ]}
                        onPress={handleCheckPaymentStatus}
                        disabled={isVerifyingPayment}
                        activeOpacity={0.85}
                        testID="btn-check-payment-status"
                      >
                        {isVerifyingPayment ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.primaryActionBtnText}>
                            I Have Paid — Check Payment Status 🔄
                          </Text>
                        )}
                      </TouchableOpacity>

                      {/* Staging QA Server-Side Simulation (Strictly non-production internal testing) */}
                      {!Config.isProduction && (
                        <View style={styles.qaSimulationBox}>
                          <Text style={styles.qaTitle}>🛠️ Internal QA: Staging Payment Simulation</Text>
                          <Text style={styles.qaSubtitle}>
                            Authorizes server-side settlement in PostgreSQL for internal lifecycle testing.
                          </Text>
                          <TouchableOpacity
                            style={[
                              styles.qaSimulateBtn,
                              isSimulatingStaging && styles.primaryActionBtnDisabled,
                            ]}
                            onPress={handleSimulateStagingPayment}
                            disabled={isSimulatingStaging || isVerifyingPayment}
                            activeOpacity={0.85}
                            testID="btn-simulate-payment-success"
                          >
                            {isSimulatingStaging ? (
                              <ActivityIndicator color="#FFFFFF" />
                            ) : (
                              <Text style={styles.qaSimulateBtnText}>
                                QA: Settle Staging Payment ⚙️
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}

                      <TouchableOpacity
                        style={styles.simulateCancelBtn}
                        onPress={() => {
                          Alert.alert(
                            'Cancel Checkout',
                            'Your order is saved as pending payment. You can pay anytime from the Orders screen.',
                            [
                              { text: 'Keep Waiting', style: 'cancel' },
                              { text: 'Close Checkout', style: 'destructive', onPress: onClose },
                            ]
                          );
                        }}
                        disabled={isVerifyingPayment}
                        activeOpacity={0.8}
                        testID="btn-simulate-payment-cancel"
                      >
                        <Text style={styles.simulateCancelBtnText}>Cancel / Close ✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Sub-modals for Saved Addresses & Landmark Selection */}
          <SavedAddressesModal
            visible={savedAddressesModalVisible}
            userId={customerProfile?.id}
            onClose={() => setSavedAddressesModalVisible(false)}
            onSelectAddress={(addr) => {
              handleSelectAddress(addr);
              setSavedAddressesModalVisible(false);
            }}
          />

          <LandmarkPickerModal
            visible={landmarkPickerVisible}
            selectedLandmark={cartState.selectedLandmark}
            onSelectLandmark={(landmark: DeliveryLandmark) => {
              cartStore.setLandmark(landmark);
              setLandmarkPickerVisible(false);
            }}
            onClose={() => setLandmarkPickerVisible(false)}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 16,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.warmCream,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  stepTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  stepTabActive: {
    opacity: 1,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  stepCircleActive: {
    backgroundColor: Colors.primaryRed,
  },
  stepCircleCompleted: {
    backgroundColor: '#16A34A',
  },
  stepCircleInactive: {
    backgroundColor: '#D1C7BD',
  },
  stepCircleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6E6259',
  },
  stepCircleTextActive: {
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6E6259',
  },
  stepLabelActive: {
    color: Colors.primaryRed,
    fontWeight: '800',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#D1C7BD',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#16A34A',
  },
  scrollArea: {
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingTop: 14,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: Colors.warmCream,
    borderRadius: 12,
    padding: 4,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.primaryRed,
    fontWeight: '800',
  },
  segmentBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 2,
  },
  segmentBadgeActive: {
    color: Colors.primaryRed,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.charcoal,
    marginBottom: 5,
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.charcoal,
    marginBottom: 5,
  },
  textInput: {
    backgroundColor: Colors.warmCream,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.charcoal,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    minHeight: 44,
  },
  notesInput: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  changeAddressBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.warmCream,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    minHeight: 36,
    justifyContent: 'center',
  },
  changeAddressBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  landmarkCardTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.warmCream,
    borderWidth: 1.5,
    borderColor: Colors.primaryRed,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    minHeight: 52,
  },
  landmarkCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  landmarkCardFee: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  changeTag: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  gpsAssistBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
    marginBottom: 4,
  },
  gpsAssistBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  gpsNoteText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '600',
    marginBottom: 6,
  },
  pickupCard: {
    backgroundColor: Colors.warmCream,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  pickupTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 4,
  },
  pickupAddress: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  pickupFeeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  pickupFeeBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pickupTimeBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.charcoal,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  pickupInstructions: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  primaryActionBtn: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 6,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryActionBtnDisabled: {
    opacity: 0.6,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  stageNavigationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backStepBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.warmCream,
    borderRadius: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  backStepBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  discrepancyCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#F97316',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  discrepancyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  discrepancyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#C2410C',
  },
  discrepancyBadge: {
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  discrepancyBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#C2410C',
    letterSpacing: 0.5,
  },
  discrepancyText: {
    fontSize: 12,
    color: '#431407',
    marginBottom: 8,
    lineHeight: 16,
  },
  discrepancyItemizedBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 12,
  },
  discrepancyDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  discrepancyDetailLabel: {
    fontSize: 12,
    color: '#7C2D12',
    fontWeight: '600',
  },
  discrepancyDetailValue: {
    fontSize: 12,
    color: '#431407',
    fontWeight: '700',
  },
  discrepancyTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#FED7AA',
    marginTop: 4,
    paddingTop: 6,
  },
  discrepancyTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9A3412',
  },
  discrepancyTotalValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9A3412',
  },
  discrepancyAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C2410C',
    marginTop: 6,
  },
  discrepancyDifferenceNote: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
    marginTop: 2,
  },
  discrepancyActionsRow: {
    marginTop: 4,
  },
  acceptPriceBtn: {
    backgroundColor: '#15803D',
    minHeight: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  acceptPriceBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  rejectPriceBtn: {
    backgroundColor: 'transparent',
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  rejectPriceBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  reviewItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  checkoutItemThumbContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginRight: 10,
    backgroundColor: Colors.surfaceCream,
  },
  checkoutItemThumb: {
    width: '100%',
    height: '100%',
  },
  reviewItemBody: {
    flex: 1,
    marginRight: 8,
  },
  reviewItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  reviewItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  reviewSizePill: {
    backgroundColor: Colors.warmCream,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  reviewSizePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  reviewHalfTag: {
    backgroundColor: '#FFF3F3',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  reviewHalfTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  reviewCustomizationText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  reviewNotesText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  reviewItemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  summaryRecapCard: {
    backgroundColor: Colors.warmCream,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  summaryRecapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryRecapMode: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  summaryRecapFee: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  summaryRecapRecipient: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.charcoal,
    marginBottom: 2,
  },
  summaryRecapAddress: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  summaryRecapNotes: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  costLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  costValue: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.charcoal,
  },
  costTotalRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  costTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  costTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  paymentSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  paymentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0ba4db',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    gap: 10,
  },
  paystackLogoBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paystackLogoText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0ba4db',
  },
  paymentTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  paymentSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
  },
  paymentAmountBox: {
    backgroundColor: '#FFF7E6',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8DFD1',
  },
  paymentAmountLabel: {
    fontSize: 11,
    color: '#6B5E59',
  },
  paymentAmountValue: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.primaryRed,
    marginVertical: 2,
  },
  paymentKoboSubtext: {
    fontSize: 10,
    color: '#85746E',
  },
  paymentDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3EFE6',
  },
  paymentDetailKey: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  paymentDetailVal: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.charcoal,
  },
  sandboxNotice: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginVertical: 12,
  },
  sandboxTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  sandboxSubtitle: {
    fontSize: 10,
    color: '#3E2723',
    lineHeight: 14,
  },
  paymentLoadingBox: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  paymentLoadingText: {
    fontSize: 12,
    color: Colors.charcoal,
  },
  paymentErrorBox: {
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#FFF1EF',
    borderRadius: 10,
    marginVertical: 10,
  },
  paymentErrorText: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  retryInitBtn: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryInitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  paymentActionsRow: {
    gap: 10,
    marginTop: 6,
  },
  paystackLaunchBtn: {
    backgroundColor: '#0ba4db',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    shadowColor: '#0ba4db',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  paystackLaunchBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  qaSimulationBox: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    marginBottom: 6,
  },
  qaTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  qaSubtitle: {
    fontSize: 10,
    color: '#78350F',
    lineHeight: 14,
    marginBottom: 8,
  },
  qaSimulateBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  qaSimulateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  simulateCancelBtn: {
    backgroundColor: '#F7F2E7',
    borderWidth: 1,
    borderColor: '#E8DFD1',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  simulateCancelBtnText: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '600',
  },
  ambiguousNoticeBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  ambiguousNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
    marginBottom: 4,
  },
  ambiguousNoticeText: {
    fontSize: 11,
    color: '#1F1F1F',
    lineHeight: 16,
    marginBottom: 4,
  },
  ambiguousNoticeHelp: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
  },
});
