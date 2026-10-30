import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { CartState } from '../domains/cart/cart-types';
import { orderService, CustomerCheckoutDetails, AuthoritativePriceDiscrepancyError } from '../domains/order/order-service';
import { GuestReceiptStore } from '../domains/order/guest-receipt-store';
import { CustomerProfile, CustomerAddress } from '../domains/customer/customer-types';
import { customerService } from '../domains/customer/customer-service';

interface CheckoutModalProps {
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
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  visible,
  cartState,
  customerProfile,
  onClose,
  onProceedToPayment,
}) => {
  const insets = useSafeAreaInsets();
  const [customerName, setCustomerName] = useState(customerProfile?.fullName || '');
  const [customerPhone, setCustomerPhone] = useState(customerProfile?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(customerProfile?.email || '');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [discrepancyNotice, setDiscrepancyNotice] = useState<{
    estimated: number;
    authoritative: number;
    variance: number;
  } | null>(null);

  const isDelivery = cartState.fulfillmentType === 'delivery';

  // Pre-fill profile info if customer is logged in
  useEffect(() => {
    if (!visible || !customerProfile) return;

    customerService.getAddresses(customerProfile.id).then((res) => {
      if (res.success && res.addresses) {
        setSavedAddresses(res.addresses);
      }
      if (customerProfile.fullName) setCustomerName(customerProfile.fullName);
      if (customerProfile.phone) setCustomerPhone(customerProfile.phone);
      if (customerProfile.email) setCustomerEmail(customerProfile.email);
    });
  }, [customerProfile, visible]);

  const validateInputs = (): boolean => {
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
    return true;
  };

  const handleCheckoutSubmit = async () => {
    if (!validateInputs()) return;

    try {
      setIsSubmitting(true);
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
          // Hardware-backed SecureStore persistence
          await GuestReceiptStore.saveReceipt(result.orderId, result.orderNumber, finalReceiptToken);
        } else {
          // Scenario A fallback: Recover from local SecureStore if previously received
          const stored = await GuestReceiptStore.getReceipt(result.orderId);
          if (stored?.receiptToken) {
            finalReceiptToken = stored.receiptToken;
          }
        }

        if (!finalReceiptToken) {
          Alert.alert(
            'Order Already Received',
            `Order #${result.orderNumber} is already recorded in the restaurant system. Please check your confirmation or contact AY Pizza counter at King Jaja Hall with your phone number (${customerDetails.customerPhone}).`
          );
          return;
        }

        onProceedToPayment({
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          receiptToken: finalReceiptToken,
          amount: result.total,
          amountInKobo: result.totalInKobo,
          email: customerDetails.customerEmail || 'guest@aypizza.ng',
          customerName: customerDetails.customerName,
          customerPhone: customerDetails.customerPhone,
        });
      }
    } catch (err: any) {
      if (err instanceof AuthoritativePriceDiscrepancyError) {
        setDiscrepancyNotice({
          estimated: err.clientEstimated,
          authoritative: err.serverAuthoritative,
          variance: err.variance,
        });
      } else {
        Alert.alert('Checkout Error', err.message || 'Failed to initialize order.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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
              <Text style={styles.headerSubtitle}>Complete your contact & delivery details</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom + 20, 36) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Fulfillment Mode Badge */}
            <View style={styles.fulfillmentBanner}>
              <Text style={styles.fulfillmentEmoji}>{isDelivery ? '🛵' : '🏬'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fulfillmentTitle}>
                  {isDelivery ? `Campus Delivery to ${cartState.selectedLandmark?.name}` : 'Free Pickup at King Jaja Hall'}
                </Text>
                <Text style={styles.fulfillmentDetail}>
                  {isDelivery
                    ? cartState.deliveryAddress
                    : 'Pick up hot & fresh at our store opposite King Jaja Hall (Fee: ₦0)'}
                </Text>
              </View>
            </View>

            {/* Price Update Notice */}
            {discrepancyNotice && (
              <View style={styles.discrepancyCard}>
                <Text style={styles.discrepancyTitle}>⚠️ Menu Price Update</Text>
                <Text style={styles.discrepancyText}>
                  The live calculation differs slightly from your estimate:
                </Text>
                <Text style={styles.discrepancyAmount}>
                  Cart Estimate: ₦{discrepancyNotice.estimated.toLocaleString()} → Total: ₦
                  {discrepancyNotice.authoritative.toLocaleString()}
                </Text>
                <Text style={styles.discrepancyNote}>
                  Please review the verified total before proceeding.
                </Text>
              </View>
            )}

            {/* Customer Contact Form */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>1. Contact Details</Text>

              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Adebayo Idris"
                placeholderTextColor={Colors.textMuted}
                value={customerName}
                onChangeText={setCustomerName}
                autoCapitalize="words"
              />

              <Text style={styles.inputLabel}>Phone Number (Call / WhatsApp) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 0812 345 6789"
                placeholderTextColor={Colors.textMuted}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Email Address (For receipt)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. adebayo@unilag.edu.ng"
                placeholderTextColor={Colors.textMuted}
                value={customerEmail}
                onChangeText={setCustomerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Delivery Instructions */}
            {isDelivery && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>2. Delivery Instructions</Text>

                {savedAddresses.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={[styles.inputLabel, { marginBottom: 6 }]}>Saved Addresses (Tap to apply contact / notes):</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                      {savedAddresses.map((addr) => (
                        <TouchableOpacity
                          key={addr.id}
                          style={{
                            backgroundColor: Colors.warmCream,
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            marginRight: 8,
                            borderWidth: 1,
                            borderColor: Colors.borderLight,
                          }}
                          onPress={() => {
                            if (addr.contactPhone) setCustomerPhone(addr.contactPhone);
                            if (addr.deliveryNotes) setDeliveryNotes(addr.deliveryNotes);
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.charcoal }}>
                            📍 {addr.landmarkName}
                          </Text>
                          <Text style={{ fontSize: 11, color: Colors.textMuted }} numberOfLines={1}>
                            {addr.detailedAddress}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <TextInput
                  style={[styles.textInput, styles.notesInput]}
                  placeholder="e.g. Leave at porter's desk / Call when outside gate"
                  placeholderTextColor={Colors.textMuted}
                  value={deliveryNotes}
                  onChangeText={setDeliveryNotes}
                  multiline
                />
              </View>
            )}

            {/* Order Items Review */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {isDelivery ? '3. Order Summary' : '2. Order Summary'}
              </Text>

              {cartState.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.itemName}>
                      {item.quantity}x {item.productName}
                      {item.sizeName ? ` (${item.sizeName})` : ''}
                    </Text>
                    {item.halfSecondaryFlavor && (
                      <Text style={styles.itemSubtext}>🍕 Half: {item.halfSecondaryFlavor}</Text>
                    )}
                    {item.customizations
                      .filter((c) => !c.optionId.startsWith('half-'))
                      .map((c, i) => (
                        <Text key={i} style={styles.itemSubtext}>
                          + {c.optionName}
                        </Text>
                      ))}
                  </View>
                  <Text style={styles.itemPrice}>₦{item.lineTotal.toLocaleString()}</Text>
                </View>
              ))}

              <View style={{ marginTop: 12 }}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal:</Text>
                  <Text style={styles.summaryValue}>₦{cartState.subtotal.toLocaleString()}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery Fee:</Text>
                  <Text style={styles.summaryValue}>
                    {cartState.deliveryFee > 0
                      ? `₦${cartState.deliveryFee.toLocaleString()}`
                      : 'FREE (₦0)'}
                  </Text>
                </View>
                <View style={[styles.summaryRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Total to Pay:</Text>
                  <Text style={styles.totalValue}>
                    ₦{cartState.estimatedTotal.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Proceed to Payment CTA */}
            <TouchableOpacity
              style={[styles.payBtn, isSubmitting && styles.payBtnDisabled]}
              onPress={handleCheckoutSubmit}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.payBtnText}>
                  Pay ₦{cartState.estimatedTotal.toLocaleString()} Securely 💳
                </Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 32 }} />
          </ScrollView>
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
    borderBottomColor: 'rgba(39, 33, 31, 0.08)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(39, 33, 31, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.charcoal,
    fontSize: 15,
    fontWeight: '700',
  },
  scrollArea: {
    paddingHorizontal: 18,
  },
  scrollContent: {
    paddingVertical: 14,
    paddingBottom: 40,
  },
  fulfillmentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warmCream,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    marginBottom: 14,
    gap: 12,
  },
  fulfillmentEmoji: {
    fontSize: 26,
  },
  fulfillmentTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  fulfillmentDetail: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  discrepancyCard: {
    backgroundColor: Colors.softTomato,
    borderColor: 'rgba(201, 35, 43, 0.25)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  discrepancyTitle: {
    color: Colors.primaryRed,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  discrepancyText: {
    color: Colors.charcoal,
    fontSize: 12,
    marginBottom: 4,
  },
  discrepancyAmount: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '800',
    marginVertical: 4,
  },
  discrepancyNote: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    marginBottom: 14,
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.charcoal,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.charcoal,
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: Colors.warmCream,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: Colors.charcoal,
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.1)',
  },
  notesInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.06)',
  },
  itemName: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '700',
  },
  itemSubtext: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  itemPrice: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '800',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  summaryValue: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '700',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(39, 33, 31, 0.08)',
    marginTop: 8,
    paddingTop: 10,
  },
  totalLabel: {
    color: Colors.charcoal,
    fontSize: 16,
    fontWeight: '900',
  },
  totalValue: {
    color: Colors.primaryRed,
    fontSize: 18,
    fontWeight: '900',
  },
  payBtn: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
    marginTop: 8,
  },
  payBtnDisabled: {
    opacity: 0.6,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
