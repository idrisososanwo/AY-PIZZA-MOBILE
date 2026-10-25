import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Config } from '../config/env';
import { paymentService } from '../domains/payment/payment-service';

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
  const [loading, setLoading] = useState(true);
  const [reference, setReference] = useState('');
  const [authorizationUrl, setAuthorizationUrl] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!params || !visible) return;
      try {
        setLoading(true);
        setErrorMessage(null);

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

  const handleSimulatePayment = async (simulateSuccess: boolean) => {
    if (!reference) return;

    if (!simulateSuccess) {
      Alert.alert('Payment Failed', 'The simulated transaction was cancelled or declined.');
      return;
    }

    try {
      setVerifying(true);
      const verifyResult = await paymentService.verifyPayment(reference);

      if (verifyResult.success) {
        onPaymentSuccess({
          orderId: params?.orderId || '',
          orderNumber: params?.orderNumber || '',
          paymentReference: reference,
        });
      } else {
        Alert.alert('Verification Failed', verifyResult.error || 'Payment was not confirmed.');
      }
    } catch (err: any) {
      Alert.alert('Verification Error', err.message || 'Could not verify payment.');
    } finally {
      setVerifying(false);
    }
  };

  if (!params) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
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
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.neon} />
              <Text style={styles.loadingText}>Initializing secure Paystack session...</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Payment Initialization Error</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={onClose}>
                <Text style={styles.retryBtnText}>Close & Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.body}>
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
                <Text style={styles.detailVal}>{reference.slice(0, 22)}...</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailKey}>Customer:</Text>
                <Text style={styles.detailVal}>{params.customerName}</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailKey}>Payment Channels:</Text>
                <Text style={styles.detailVal}>Card, USSD, Bank Transfer</Text>
              </View>

              {/* Development Sandbox Helper Notice */}
              <View style={styles.sandboxNotice}>
                <Text style={styles.sandboxTitle}>🛠️ Development / Sandbox Mode</Text>
                <Text style={styles.sandboxSubtitle}>
                  In test environment, you can simulate a successful or failed Paystack transaction
                  to verify the end-to-end receipt generation.
                </Text>
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.successBtn, verifying && styles.btnDisabled]}
                  onPress={() => handleSimulatePayment(true)}
                  disabled={verifying}
                  activeOpacity={0.8}
                >
                  {verifying ? (
                    <ActivityIndicator color={Colors.crust} />
                  ) : (
                    <Text style={styles.successBtnText}>Simulate Successful Payment ✅</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => handleSimulatePayment(false)}
                  disabled={verifying}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Simulate Cancel / Failure ❌</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: Colors.charcoal,
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
    color: 'rgba(255, 255, 255, 0.85)',
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
    color: Colors.frost,
    fontSize: 13,
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorTitle: {
    color: Colors.crimson,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  errorText: {
    color: Colors.frost,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: Colors.charcoal,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryBtnText: {
    color: Colors.frost,
    fontWeight: '700',
  },
  body: {
    padding: 20,
  },
  amountBox: {
    backgroundColor: Colors.night,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.charcoal,
  },
  amountLabel: {
    color: Colors.muted,
    fontSize: 12,
  },
  amountValue: {
    color: Colors.neon,
    fontSize: 28,
    fontWeight: '900',
    marginVertical: 4,
  },
  koboSubtext: {
    color: Colors.muted,
    fontSize: 11,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.charcoal,
  },
  detailKey: {
    color: Colors.muted,
    fontSize: 12,
  },
  detailVal: {
    color: Colors.frost,
    fontSize: 12,
    fontWeight: '600',
  },
  sandboxNotice: {
    backgroundColor: 'rgba(2, 195, 154, 0.1)',
    borderColor: Colors.neon,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  sandboxTitle: {
    color: Colors.neon,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  sandboxSubtitle: {
    color: Colors.frost,
    fontSize: 11,
    lineHeight: 15,
  },
  actions: {
    gap: 10,
  },
  successBtn: {
    backgroundColor: Colors.neon,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  successBtnText: {
    color: Colors.crust,
    fontSize: 15,
    fontWeight: '800',
  },
  cancelBtn: {
    backgroundColor: Colors.charcoal,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
});
