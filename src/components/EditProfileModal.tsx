import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors } from '../constants/colors';
import { CustomerProfile } from '../domains/customer/customer-types';
import { customerService } from '../domains/customer/customer-service';

interface EditProfileModalProps {
  visible: boolean;
  profile: CustomerProfile;
  onClose: () => void;
  onProfileUpdated: (updated: CustomerProfile) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  visible,
  profile,
  onClose,
  onProfileUpdated,
}) => {
  const [fullName, setFullName] = useState(profile.fullName || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = async () => {
    if (!fullName.trim()) {
      setErrorMsg('Full name cannot be blank.');
      return;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      setErrorMsg('Please enter a valid phone number (at least 10 digits).');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await customerService.updateProfile(profile.id, {
        fullName: fullName.trim(),
        phone: phone.trim(),
      });

      if (res.success && res.profile) {
        onProfileUpdated(res.profile);
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to update profile.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.title}>Edit Profile 👤</Text>
              <Text style={styles.subtitle}>Update your contact information</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {errorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Adebayo Idris"
              placeholderTextColor={Colors.textMuted}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 0812 345 6789"
              placeholderTextColor={Colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>Email Address</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={profile.email || 'No email attached'}
              editable={false}
            />
            <Text style={styles.helperText}>Account email cannot be changed directly.</Text>

            <TouchableOpacity
              style={[styles.saveBtn, loading && styles.btnDisabled]}
              onPress={handleSave}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes 💾</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
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
    color: Colors.charcoal,
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
  errorBanner: {
    backgroundColor: Colors.softTomato,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(201, 35, 43, 0.2)',
  },
  errorText: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.charcoal,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: Colors.warmCream,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: Colors.charcoal,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.12)',
  },
  inputDisabled: {
    backgroundColor: 'rgba(39, 33, 31, 0.04)',
    color: Colors.textMuted,
  },
  helperText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  saveBtn: {
    backgroundColor: Colors.primaryRed,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});

