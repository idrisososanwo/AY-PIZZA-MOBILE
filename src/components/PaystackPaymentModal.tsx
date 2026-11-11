import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Brand } from '../constants/brand';
import { Config } from '../config/env';
import { paymentService } from '../domains/payment/payment-service';
import { orderService } from '../domains/order/order-service';

interface PaystackPaymentModalProps {
  visible: boolean;
  params: {
    orderId: string;
    orderNumber: string;
    receiptToken: string;
    amount: number;
    amountInKobo: number;
    email: string;
    customerName: string;
    customerPhone: string;
  } | null;
  onClose: () => void;
  onPaymentSuccess: (result: {
    orderId: string;
    orderNumber: string;
    paymentReference: string;
  }) => void;
}

export const PaystackPaymentModal: React.FC<PaystackPaymentModalProps> = ({
  visible,
  params,
  onClose,
  onPaymentSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [reference, setReference] = useState('');
  const [authorizationUrl, setAuthorizationUrl] = useState('');
  const [isPaystackLaunched, setIsPaystackLaunched] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [simulatingStaging, setSimulatingStaging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ambiguousOutcomeNotice, setAmbiguousOutcomeNotice] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!params || !visible) return;
      try {
        setLoading(true);
        setErrorMessage(null);
        setAmbiguousOutcomeNotice(null);
        setIsPaystackLaunched(false);

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

        if (isMounted) {
          if (initResult.success) {
            setReference(initResult.reference);
            setAuthorizationUrl(initResult.authorizationUrl || '');
          } else {
            setErrorMessage(initResult.error || 'Failed to initialize payment.');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err.message || 'Initialization error.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [params, visible]);

  // Background polling while modal is open to catch webhook confirmation
  useEffect(() => {
    if (!visible || !params) return;

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
        const orderRes = await orderService.getOrderReceipt(params.orderId, params.receiptToken);
        if (isMounted && orderRes.success && orderRes.order?.status === 'CONFIRMED') {
          clearInterval(intervalId);
          onPaymentSuccess({
            orderId: params.orderId,
            orderNumber: params.orderNumber,
            paymentReference: orderRes.order.paymentReference || reference,
          });
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
  }, [visible, params, onPaymentSuccess, onClose, reference]);

  // Launch Paystack hosted checkout in external browser
  const handleLaunchPaystackCheckout = async () => {
    if (!authorizationUrl || !/^https:\/\/checkout\.paystack\.com\//i.test(authorizationUrl)) {
      Alert.alert(
        'Invalid Checkout URL',
        'Paystack checkout session is invalid or not yet ready. Please wait a moment.'
      );
      return;
    }

    try {
      await Linking.openURL(authorizationUrl);
      setIsPaystackLaunched(true);
    } catch (err: any) {
      Alert.alert(
        'Unable to Open Browser',
        err.message || 'Could not open Paystack checkout. Please check device internet access.'
      );
    }
  };

  // Check genuine Paystack transaction status via backend verification
  const handleCheckPaymentStatus = async () => {
    if (!reference) return;

    try {
      setVerifying(true);
      setAmbiguousOutcomeNotice(null);

      const verifyResult = await paymentService.verifyPayment(
        reference,
        params?.orderId,
        params?.receiptToken
      );

      if (verifyResult.success) {
        onPaymentSuccess({
          orderId: params?.orderId || '',
          orderNumber: params?.orderNumber || '',
          paymentReference: reference,
        });
        onClose();
      } else if (verifyResult.outcome === 'PENDING') {
        setAmbiguousOutcomeNotice(
          verifyResult.error ||
            'Payment is currently pending or processing with Paystack / bank. Tap Check Status again shortly.'
        );
      } else if (verifyResult.outcome === 'FAILED') {
        setAmbiguousOutcomeNotice(
          verifyResult.error ||
            'Payment was cancelled or declined by processor. You can try again when ready.'
        );
      } else {
        setAmbiguousOutcomeNotice(
          verifyResult.error ||
            'Payment verification response was ambiguous. If your account was debited, your order will confirm automatically upon webhook arrival.'
        );
      }
    } catch {
      setAmbiguousOutcomeNotice(
        'Network error during verification. Your order is safely preserved in our system. Tap "Check Status" below.'
      );
    } finally {
      setVerifying(false);
    }
  };

  // Internal Staging QA Simulation Pathway (Strictly non-production)
  const handleSimulateStagingPayment = async () => {
    if (!params?.orderId) return;
    if (Config.isProduction) {
      Alert.alert('Simulation Forbidden', 'Payment simulation is strictly forbidden in production mode.');
      return;
    }

    try {
      setSimulatingStaging(true);
      setAmbiguousOutcomeNotice(null);

      const simResult = await paymentService.simulateStagingPayment({
        orderId: params.orderId,
        receiptToken: params.receiptToken,
      });

      if (simResult.success) {
        onPaymentSuccess({
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          paymentReference: simResult.paymentReference || reference,
        });
        onClose();
      } else {
        setAmbiguousOutcomeNotice(simResult.error || 'Staging payment simulation was rejected by server.');
      }
    } catch (err: any) {
      setAmbiguousOutcomeNotice(err.message || 'Error executing staging simulation.');
    } finally {
      setSimulatingStaging(false);
    }
  };

  if (!params) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.paystackHeader}>
            <View style={styles.paystackLogoBox}>
              <Text style={styles.paystackLogoText}>P</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.paystackTitle}>Paystack Secure Checkout</Text>
              <Text style={styles.merchantText}>Merchant: AY Pizza (UNILAG Campus)</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 540 }} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={Colors.primaryRed} />
                <Text style={styles.loadingText}>Initializing secure Paystack session...</Text>
              </View>
            ) : errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Payment Initialization Error</Text>
                <Text style={styles.errorText}>{errorMessage}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={onClose} activeOpacity={0.8}>
                  <Text style={styles.retryBtnText}>Close & Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.body}>
                {/* Ambiguous Outcome Recovery Banner */}
                {ambiguousOutcomeNotice && (
                  <View style={styles.ambiguousBanner}>
                    <Text style={styles.ambiguousTitle}>⚠️ Payment Status Notice</Text>
                    <Text style={styles.ambiguousText}>{ambiguousOutcomeNotice}</Text>
                    <Text style={styles.ambiguousHelp}>
                      Helpline: {Brand.contact.phone} • Stand: {Brand.location.address}
                    </Text>
                  </View>
                )}

                {/* Order and Amount Summary */}
                <View style={styles.amountBox}>
                  <Text style={styles.amountLabel}>Total to Pay:</Text>
                  <Text style={styles.amountValue}>₦{params.amount.toLocaleString()}</Text>
                  <Text style={styles.koboSubtext}>
                    ({params.amountInKobo.toLocaleString()} Kobo NGN)
                  </Text>
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailKey}>Order Number:</Text>
                  <Text style={styles.detailVal}>{params.orderNumber}</Text>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailKey}>Reference:</Text>
                  <Text style={styles.detailVal}>{reference ? `${reference.slice(0, 22)}...` : 'Pending'}</Text>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailKey}>Customer:</Text>
                  <Text style={styles.detailVal}>{params.customerName}</Text>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailKey}>Payment Channels:</Text>
                  <Text style={styles.detailVal}>Card, USSD, Bank Transfer</Text>
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                  {/* Real Paystack Hosted Checkout Launch Button */}
                  <TouchableOpacity
                    style={[styles.paystackLaunchBtn, (!authorizationUrl || verifying) && styles.btnDisabled]}
                    onPress={handleLaunchPaystackCheckout}
                    disabled={!authorizationUrl || verifying}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.paystackLaunchBtnText}>
                      {isPaystackLaunched
                        ? 'Re-open Paystack Checkout ↗️'
                        : 'Pay with Paystack (Card, Transfer, USSD) 💳'}
                    </Text>
                  </TouchableOpacity>

                  {/* Manual Return-to-App Check Status Button */}
                  <TouchableOpacity
                    style={[styles.successBtn, verifying && styles.btnDisabled]}
                    onPress={handleCheckPaymentStatus}
                    disabled={verifying}
                    activeOpacity={0.8}
                  >
                    {verifying ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.successBtnText}>
                        I Have Paid — Check Payment Status 🔄
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* Staging QA Server-Side Simulation (Strictly non-production internal testing) */}
                  {!Config.isProduction && (
                    <View style={styles.sandboxNotice}>
                      <Text style={styles.sandboxTitle}>🛠️ Internal QA: Staging Payment Simulation</Text>
                      <Text style={styles.sandboxSubtitle}>
                        Authorizes a server-side settlement in PostgreSQL for internal lifecycle testing.
                      </Text>
                      <TouchableOpacity
                        style={[styles.qaSimulateBtn, simulatingStaging && styles.btnDisabled]}
                        onPress={handleSimulateStagingPayment}
                        disabled={simulatingStaging || verifying}
                        activeOpacity={0.85}
                      >
                        {simulatingStaging ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.qaSimulateBtnText}>QA: Settle Staging Payment ⚙️</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      Alert.alert(
                        'Cancel Payment Session',
                        'Your order is saved as pending payment. You can pay anytime from the Orders screen.',
                        [
                          { text: 'Keep Waiting', style: 'cancel' },
                          { text: 'Close', style: 'destructive', onPress: onClose },
                        ]
                      );
                    }}
                    disabled={verifying}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cancelBtnText}>Cancel / Close ✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#E8DFD1',
    overflow: 'hidden',
  },
  paystackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0ba4db',
    gap: 12,
  },
  paystackLogoBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paystackLogoText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0ba4db',
  },
  paystackTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  merchantText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#1F1F1F',
    fontSize: 13,
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorTitle: {
    color: '#B91C1C',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  errorText: {
    color: '#1F1F1F',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#B91C1C',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  ambiguousBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  ambiguousTitle: {
    color: '#B45309',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  ambiguousText: {
    color: '#1F1F1F',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  ambiguousHelp: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '600',
  },
  body: {
    padding: 20,
  },
  amountBox: {
    backgroundColor: '#FFF7E6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8DFD1',
  },
  amountLabel: {
    color: '#6B5E59',
    fontSize: 12,
  },
  amountValue: {
    color: '#B91C1C',
    fontSize: 28,
    fontWeight: '900',
    marginVertical: 4,
  },
  koboSubtext: {
    color: '#85746E',
    fontSize: 11,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3EFE6',
  },
  detailKey: {
    color: '#6B5E59',
    fontSize: 12,
  },
  detailVal: {
    color: '#1F1F1F',
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    gap: 10,
    marginTop: 12,
  },
  paystackLaunchBtn: {
    backgroundColor: '#0ba4db',
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  successBtn: {
    backgroundColor: '#B91C1C',
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  successBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  sandboxNotice: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  sandboxTitle: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  sandboxSubtitle: {
    color: '#3E2723',
    fontSize: 10,
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
  cancelBtn: {
    backgroundColor: '#F7F2E7',
    borderWidth: 1,
    borderColor: '#E8DFD1',
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#3E2723',
    fontSize: 13,
    fontWeight: '600',
  },
});
