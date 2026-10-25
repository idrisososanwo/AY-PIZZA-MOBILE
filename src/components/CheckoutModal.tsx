import React, { useState } from 'react';
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
} from 'react-native';
import { Colors } from '../constants/colors';
import { CartState } from '../domains/cart/cart-types';
import { orderService, CustomerCheckoutDetails, AuthoritativePriceDiscrepancyError } from '../domains/order/order-service';
import { paymentService } from '../domains/payment/payment-service';
import { GuestReceiptStore } from '../domains/order/guest-receipt-store';

interface CheckoutModalProps {
  visible: boolean;
  cartState: CartState;
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
  onClose,
  onProceedToPayment,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discrepancyNotice, setDiscrepancyNotice] = useState<{
    estimated: number;
    authoritative: number;
    variance: number;
  } | null>(null);

  const isDelivery = cartState.fulfillmentType === 'delivery';

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

        // Scenario B: The order exists on the server, but network dropped before this device
        // ever received the receipt token. Local recovery is impossible without server OTP.
        if (!finalReceiptToken) {
          Alert.alert(
            'Order Already Received',
            `Order #${result.orderNumber} is already recorded in the restaurant system. Due to an interrupted connection during initial creation, your device did not receive the receipt credential. Please check your confirmation email or contact AY Pizza counter at King Jaja Hall with your phone number (${customerDetails.customerPhone}).`
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
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Order Checkout 🛍️</Text>
              <Text style={styles.headerSubtitle}>Authoritative Server Pricing & Paystack</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* Fulfillment Mode Badge */}
            <View style={styles.fulfillmentBanner}>
              <Text style={styles.fulfillmentEmoji}>{isDelivery ? '🛵' : '🏪'}</Text>
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

            {/* Price Discrepancy Alert */}
            {discrepancyNotice && (
              <View style={styles.discrepancyCard}>
                <Text style={styles.discrepancyTitle}>⚠️ Menu Price Update</Text>
                <Text style={styles.discrepancyText}>
                  The live server calculation differs from your original estimate:
                </Text>
                <Text style={styles.discrepancyAmount}>
                  Cart Estimate: ₦{discrepancyNotice.estimated.toLocaleString()} → Server Total: ₦
                  {discrepancyNotice.authoritative.toLocaleString()}
                </Text>
                <Text style={styles.discrepancyNote}>
                  Please review and accept the authoritative total before proceeding.
                </Text>
              </View>
            )}

            {/* Customer Contact Form */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>1. Customer Information (Guest or Account)</Text>

              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Adebayo Idris"
                placeholderTextColor={Colors.muted}
                value={customerName}
                onChangeText={setCustomerName}
              />

              <Text style={styles.inputLabel}>Phone Number (WhatsApp / Call) *</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.phonePrefixBox}>
                  <Text style={styles.phonePrefixText}>🇳🇬 +234</Text>
                </View>
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  placeholder="08012345678"
                  placeholderTextColor={Colors.muted}
                  keyboardType="phone-pad"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                />
              </View>

              <Text style={styles.inputLabel}>Email Address (For e-receipt, optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. adebayo@unilag.edu.ng"
                placeholderTextColor={Colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={customerEmail}
                onChangeText={setCustomerEmail}
              />

              <Text style={styles.inputLabel}>Order / Kitchen Notes (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.notesInput]}
                placeholder="e.g. Call when outside Jaja Hall, please include extra serviette"
                placeholderTextColor={Colors.muted}
                multiline
                numberOfLines={2}
                value={deliveryNotes}
                onChangeText={setDeliveryNotes}
              />
            </View>

            {/* Order Review List */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>2. Itemized Order Review ({cartState.itemCount} items)</Text>
              {cartState.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
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
            </View>

            {/* Total Breakdown */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>3. Authoritative Order Total</Text>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal:</Text>
                <Text style={styles.summaryValue}>₦{cartState.subtotal.toLocaleString()}</Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {isDelivery ? `Delivery (${cartState.selectedLandmark?.name}):` : 'Pickup Fee:'}
                </Text>
                <Text style={styles.summaryValue}>
                  {cartState.deliveryFee === 0 ? 'FREE (₦0)' : `₦${cartState.deliveryFee.toLocaleString()}`}
                </Text>
              </View>

              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Grand Total:</Text>
                <Text style={styles.totalValue}>
                  ₦{cartState.estimatedTotal.toLocaleString()}
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer Action */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.payBtn, isSubmitting && styles.payBtnDisabled]}
              onPress={handleCheckoutSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.crust} />
              ) : (
                <Text style={styles.payBtnText}>
                  Pay ₦{cartState.estimatedTotal.toLocaleString()} with Paystack 🔒
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.night,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.charcoal,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.frost,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.muted,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.frost,
    fontSize: 16,
    fontWeight: '700',
  },
  scrollArea: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  fulfillmentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.charcoal,
    marginBottom: 16,
    gap: 12,
  },
  fulfillmentEmoji: {
    fontSize: 26,
  },
  fulfillmentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.frost,
  },
  fulfillmentDetail: {
    fontSize: 12,
    color: Colors.muted,
    marginTop: 2,
  },
  discrepancyCard: {
    backgroundColor: 'rgba(230, 81, 0, 0.15)',
    borderColor: '#e65100',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  discrepancyTitle: {
    color: '#ff9800',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  discrepancyText: {
    color: Colors.frost,
    fontSize: 12,
    marginBottom: 4,
  },
  discrepancyAmount: {
    color: Colors.frost,
    fontSize: 13,
    fontWeight: '700',
    marginVertical: 4,
  },
  discrepancyNote: {
    color: Colors.muted,
    fontSize: 11,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.charcoal,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.neon,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.frost,
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: Colors.night,
    borderWidth: 1,
    borderColor: Colors.charcoal,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.frost,
    fontSize: 14,
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  phonePrefixBox: {
    backgroundColor: Colors.charcoal,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phonePrefixText: {
    color: Colors.frost,
    fontWeight: '700',
    fontSize: 13,
  },
  notesInput: {
    height: 60,
    textAlignVertical: 'top',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.charcoal,
  },
  itemName: {
    color: Colors.frost,
    fontSize: 13,
    fontWeight: '700',
  },
  itemSubtext: {
    color: Colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  itemPrice: {
    color: Colors.frost,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    color: Colors.muted,
    fontSize: 13,
  },
  summaryValue: {
    color: Colors.frost,
    fontSize: 13,
    fontWeight: '600',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.charcoal,
    marginTop: 8,
    paddingTop: 10,
  },
  totalLabel: {
    color: Colors.frost,
    fontSize: 16,
    fontWeight: '800',
  },
  totalValue: {
    color: Colors.neon,
    fontSize: 18,
    fontWeight: '900',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  payBtn: {
    backgroundColor: Colors.lava,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.lava,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  payBtnDisabled: {
    opacity: 0.5,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
