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
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { signInCustomer, signUpCustomer, sendPasswordResetEmail } from '../domains/auth/auth-service';

type AuthMode = 'signin' | 'signup' | 'forgot';

interface AuthModalProps {
  visible: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  initialMode = 'signin',
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSwitchMode = (newMode: AuthMode) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setMode(newMode);
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await signInCustomer(email, password);
      if (res.success) {
        resetForm();
        onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || 'Failed to sign in. Please verify your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!phone.trim() || phone.replace(/[^0-9]/g, '').length < 10) {
      setErrorMessage('Please enter a valid phone number (at least 10 digits).');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await signUpCustomer(email, password, fullName, phone);
      if (res.success) {
        resetForm();
        onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || 'Registration failed. Email may already be in use.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter the email address linked to your account.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await sendPasswordResetEmail(email);
      if (res.success) {
        setSuccessMessage('Password recovery instructions sent to your email.');
      } else {
        setErrorMessage(res.error || 'Could not send recovery instructions.');
      }
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
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.brandTitle}>AY PIZZA 🍕</Text>
              <Text style={styles.headerSubtitle}>
                {mode === 'signin' && 'Sign in to access your orders & saved addresses'}
                {mode === 'signup' && 'Create your customer account'}
                {mode === 'forgot' && 'Reset your account password'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tab Selector (Sign In vs Create Account) */}
          {mode !== 'forgot' && (
            <View style={styles.tabSelector}>
              <TouchableOpacity
                style={[styles.tabButton, mode === 'signin' && styles.tabButtonActive]}
                onPress={() => handleSwitchMode('signin')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabButtonText, mode === 'signin' && styles.tabButtonTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, mode === 'signup' && styles.tabButtonActive]}
                onPress={() => handleSwitchMode('signup')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabButtonText, mode === 'signup' && styles.tabButtonTextActive]}>
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom + 12, 24) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Error Banner */}
            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
              </View>
            )}

            {/* Success Banner */}
            {successMessage && (
              <View style={styles.successBanner}>
                <Text style={styles.successText}>✅ {successMessage}</Text>
              </View>
            )}

            {/* Form Fields: Sign Up Mode */}
            {mode === 'signup' && (
              <>
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
              </>
            )}

            {/* Form Fields: Email (All Modes) */}
            <Text style={styles.fieldLabel}>Email Address *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. adebayo@unilag.edu.ng"
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Form Fields: Password (Sign In & Sign Up) */}
            {mode !== 'forgot' && (
              <>
                <Text style={styles.fieldLabel}>Password *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="At least 6 characters"
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </>
            )}

            {/* Forgot Password Link */}
            {mode === 'signin' && (
              <TouchableOpacity
                style={styles.forgotBtn}
                onPress={() => handleSwitchMode('forgot')}
                activeOpacity={0.8}
              >
                <Text style={styles.forgotBtnText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {/* Primary Action Button */}
            <TouchableOpacity
              style={[styles.primaryActionBtn, loading && styles.btnDisabled]}
              onPress={
                mode === 'signin'
                  ? handleSignIn
                  : mode === 'signup'
                  ? handleSignUp
                  : handleForgotPassword
              }
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryActionText}>
                  {mode === 'signin' && 'Sign In to AY Pizza'}
                  {mode === 'signup' && 'Create Account'}
                  {mode === 'forgot' && 'Send Recovery Email'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Back to sign in link for forgot mode */}
            {mode === 'forgot' && (
              <TouchableOpacity
                style={styles.backToSignInBtn}
                onPress={() => handleSwitchMode('signin')}
                activeOpacity={0.8}
              >
                <Text style={styles.backToSignInText}>← Back to Sign In</Text>
              </TouchableOpacity>
            )}

            {/* Guest Dismissal */}
            <TouchableOpacity
              style={styles.guestDismissBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.guestDismissText}>Continue as Guest 🍕</Text>
            </TouchableOpacity>
          </ScrollView>
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
    maxHeight: '90%',
    paddingBottom: 24,
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
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.primaryRed,
    letterSpacing: 0.5,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.warmCream,
    marginHorizontal: 18,
    marginTop: 14,
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  tabButtonTextActive: {
    color: Colors.charcoal,
    fontWeight: '800',
  },
  scrollBody: {
    paddingHorizontal: 18,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
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
    lineHeight: 16,
  },
  successBanner: {
    backgroundColor: 'rgba(40, 122, 75, 0.1)',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(40, 122, 75, 0.25)',
  },
  successText: {
    fontSize: 12,
    color: Colors.freshGreen,
    fontWeight: '700',
    lineHeight: 16,
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
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 4,
  },
  forgotBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  primaryActionBtn: {
    backgroundColor: Colors.primaryRed,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  backToSignInBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },
  backToSignInText: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '700',
  },
  guestDismissBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  guestDismissText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
});

