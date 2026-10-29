import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors } from '../constants/colors';
import { customerService } from '../domains/customer/customer-service';
import { signOutUser } from '../domains/auth/auth-service';

interface AccountDeletionModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AccountDeletionModal: React.FC<AccountDeletionModalProps> = ({
  visible,
  userId,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reasons = [
    'I graduated / no longer at UNILAG',
    'I want to remove my personal data',
    'Created a duplicate account',
    'Other reason',
  ];

  const handleConfirmDeletion = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await customerService.requestAccountDeletion(userId, reason);
      if (res.success) {
        Alert.alert(
          'Account Deletion Requested',
          'Your account deletion request has been submitted. You have been safely signed out.',
          [
            {
              text: 'OK',
              onPress: async () => {
                await signOutUser();
                onSuccess();
                onClose();
              },
            },
          ]
        );
      } else {
        setErrorMsg(res.error || 'Failed to submit deletion request.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error processing request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.title}>Delete Account ⚠️</Text>
              <Text style={styles.subtitle}>Permanent account and data removal</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.warningText}>
              Submitting an account deletion request will remove your saved addresses, account profile, and order history from active AY Pizza customer systems.
            </Text>

            {errorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>⚠️ {errorMsg}</Text>
              </View>
            )}

            <Text style={styles.reasonLabel}>Please let us know why you are leaving:</Text>
            {reasons.map((r, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.reasonOption, reason === r && styles.reasonOptionSelected]}
                onPress={() => setReason(r)}
                activeOpacity={0.8}
              >
                <Text style={[styles.reasonOptionText, reason === r && styles.reasonOptionTextSelected]}>
                  {reason === r ? '◉ ' : '○ '}
                  {r}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.deleteBtn, loading && styles.btnDisabled]}
              onPress={handleConfirmDeletion}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.deleteBtnText}>Confirm Deletion Request 🗑️</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Keep My Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.06)',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(39, 33, 31, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  body: {
    padding: 18,
  },
  warningText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },
  errorBanner: {
    backgroundColor: Colors.softTomato,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  errorBannerText: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '600',
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
    marginBottom: 10,
  },
  reasonOption: {
    backgroundColor: Colors.warmCream,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
  },
  reasonOptionSelected: {
    borderColor: Colors.primaryRed,
    backgroundColor: '#FFF1EF',
  },
  reasonOptionText: {
    fontSize: 13,
    color: Colors.charcoal,
    fontWeight: '600',
  },
  reasonOptionTextSelected: {
    color: Colors.primaryRed,
    fontWeight: '800',
  },
  deleteBtn: {
    backgroundColor: Colors.primaryRed,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  cancelBtnText: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '700',
  },
});

