import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';

interface CancelOrderConfirmationModalProps {
  visible: boolean;
  orderNumber: string;
  orderTotal: number;
  isCancelling: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

const CANCELLATION_REASONS = [
  'Ordered by mistake',
  'Delivery time too long',
  'Changed my mind',
  'Selected wrong address',
  'Other',
];

export const CancelOrderConfirmationModal: React.FC<CancelOrderConfirmationModalProps> = ({
  visible,
  orderNumber,
  orderTotal,
  isCancelling,
  onConfirm,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedReason, setSelectedReason] = useState<string>(CANCELLATION_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleConfirm = async () => {
    try {
      setErrorMsg(null);
      const finalReason = selectedReason === 'Other' && customReason.trim()
        ? `Other: ${customReason.trim()}`
        : selectedReason;
      await onConfirm(finalReason);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to cancel order.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.title}>Cancel Order? 🚫</Text>
              <Text style={styles.subtitle}>Order #{orderNumber} • ₦{orderTotal.toLocaleString()}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              disabled={isCancelling}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {/* Warning Callout */}
            <View style={styles.warningBox}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.warningTitle}>Cancellation is Final</Text>
                <Text style={styles.warningText}>
                  Because your order was verified via Paystack, cancelling now will flag your payment for a manager refund review. Once confirmed, this action cannot be undone.
                </Text>
              </View>
            </View>

            {errorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
              </View>
            )}

            {/* Reason Selection */}
            <Text style={styles.fieldLabel}>Reason for cancellation:</Text>
            <View style={styles.reasonsContainer}>
              {CANCELLATION_REASONS.map((reason) => {
                const isSelected = selectedReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonPill, isSelected && styles.reasonPillSelected]}
                    onPress={() => setSelectedReason(reason)}
                    activeOpacity={0.8}
                    disabled={isCancelling}
                  >
                    <Text
                      style={[styles.reasonPillText, isSelected && styles.reasonPillTextSelected]}
                    >
                      {isSelected ? '✓ ' : ''}{reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom reason input if 'Other' selected */}
            {selectedReason === 'Other' && (
              <TextInput
                style={styles.customInput}
                placeholder="Please describe why you are cancelling..."
                placeholderTextColor={Colors.textMuted}
                selectionColor={Colors.primaryRed}
                value={customReason}
                onChangeText={setCustomReason}
                maxLength={200}
                multiline
                numberOfLines={2}
                editable={!isCancelling}
              />
            )}

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.keepOrderBtn}
                onPress={onClose}
                disabled={isCancelling}
                activeOpacity={0.85}
              >
                <Text style={styles.keepOrderBtnText}>Keep Order 🍕</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmCancelBtn, isCancelling && styles.btnDisabled]}
                onPress={handleConfirm}
                disabled={isCancelling}
                activeOpacity={0.85}
              >
                {isCancelling ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmCancelBtnText}>Cancel Order</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(31, 31, 31, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(31, 31, 31, 0.08)',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 31, 31, 0.06)',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(31, 31, 31, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  body: {
    padding: 20,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
    alignItems: 'flex-start',
    gap: 10,
  },
  warningIcon: {
    fontSize: 18,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#78350F',
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: Colors.softTomato,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.2)',
  },
  errorText: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
    marginBottom: 10,
  },
  reasonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  reasonPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.warmCream,
    borderWidth: 1,
    borderColor: 'rgba(31, 31, 31, 0.1)',
  },
  reasonPillSelected: {
    backgroundColor: '#FEE2E2',
    borderColor: Colors.primaryRed,
  },
  reasonPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.charcoal,
  },
  reasonPillTextSelected: {
    color: Colors.primaryRed,
    fontWeight: '800',
  },
  customInput: {
    backgroundColor: Colors.warmCream,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.charcoal,
    borderWidth: 1,
    borderColor: 'rgba(31, 31, 31, 0.12)',
    marginBottom: 16,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  keepOrderBtn: {
    flex: 1,
    backgroundColor: Colors.warmCream,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(31, 31, 31, 0.12)',
    minHeight: 48,
  },
  keepOrderBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: Colors.primaryRed,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  confirmCancelBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.65,
  },
});

