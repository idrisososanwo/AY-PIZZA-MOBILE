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
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import {
  signInCustomer,
  signUpCustomer,
  sendPasswordResetEmail,
  resendVerificationEmail,
} from '../domains/auth/auth-service';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'verification';

interface AuthModalProps {
  visible: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  onNavigateHome?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  initialMode = 'signin',
  onClose,
  onSuccess,
  onNavigateHome,
}) => {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEmailUnconfirmed, setIsEmailUnconfirmed] = useState(false);
  const [isAlreadyRegistered, setIsAlreadyRegistered] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsEmailUnconfirmed(false);
    setIsAlreadyRegistered(false);
    setShowPassword(false);
  };

  const handleSwitchMode = (newMode: AuthMode) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsEmailUnconfirmed(false);
    setIsAlreadyRegistered(false);
    setShowPassword(false);
    setMode(newMode);
  };

  const handleSignIn = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      setIsEmailUnconfirmed(false);
      const res = await signInCustomer(email, password);
      if (res.success) {
        resetForm();
        await onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || 'Failed to sign in. Please verify your credentials.');
        if (res.emailNotConfirmed) {
          setIsEmailUnconfirmed(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    Keyboard.dismiss();
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
      setIsAlreadyRegistered(false);
      const res = await signUpCustomer(email, password, fullName, phone);
      if (res.success) {
        if (res.emailConfirmationRequired) {
          // Supabase email confirmation required!
          setErrorMessage(null);
          setSuccessMessage('Account created! Please verify your email.');
          setMode('verification');
        } else {
          // Immediate active session!
          resetForm();
          await onSuccess();
          onClose();
        }
      } else {
        setErrorMessage(res.error || 'Registration failed. Email may already be in use.');
        if (res.alreadyRegistered) {
          setIsAlreadyRegistered(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address to resend the verification link.');
      return;
    }

    try {
      setResending(true);
      setErrorMessage(null);
      const res = await resendVerificationEmail(email);
      if (res.success) {
        setSuccessMessage(`Verification email sent to ${email.trim().toLowerCase()}!`);
      } else {
        setErrorMessage(res.error || 'Could not resend verification email.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleForgotPassword = async () => {
    Keyboard.dismiss();
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.backdropTouchDismiss} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.brandTitle}>AY PIZZA 🍕</Text>
              <Text style={styles.headerSubtitle}>
                {mode === 'signin' && 'Sign in to access your orders & saved addresses'}
                {mode === 'signup' && 'Create your customer account'}
                {mode === 'forgot' && 'Reset your account password'}
                {mode === 'verification' && 'Verify your email to activate your account'}
              </Text>
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

          {/* Tab Selector (Sign In vs Create Account) */}
          {mode !== 'forgot' && mode !== 'verification' && (
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
                {isEmailUnconfirmed && (
                  <TouchableOpacity
                    style={styles.resendInlineBtn}
                    onPress={handleResendVerification}
                    disabled={resending}
                    activeOpacity={0.85}
                  >
                    {resending ? (
                      <ActivityIndicator size="small" color={Colors.primaryRed} />
                    ) : (
                      <Text style={styles.resendInlineBtnText}>Resend Verification Email ✉️</Text>
                    )}
                  </TouchableOpacity>
                )}
                {isAlreadyRegistered && (
                  <TouchableOpacity
                    style={styles.resendInlineBtn}
                    onPress={() => handleSwitchMode('signin')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.resendInlineBtnText}>Sign In to Your Account →</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Success Banner */}
            {successMessage && (
              <View style={styles.successBanner}>
                <Text style={styles.successText}>✅ {successMessage}</Text>
              </View>
            )}

            {/* MODE: EMAIL VERIFICATION REQUIRED */}
            {mode === 'verification' ? (
              <View style={styles.verificationContainer}>
                <View style={styles.verificationIconBox}>
                  <Text style={styles.verificationIcon}>✉️</Text>
                </View>

                <Text style={styles.verificationTitle}>Check Your Inbox</Text>
                <Text style={styles.verificationSubtitle}>
                  We sent an account confirmation link to:
                </Text>
                <View style={styles.emailBadge}>
                  <Text style={styles.emailBadgeText}>{email || 'your email address'}</Text>
                </View>

                <Text style={styles.verificationInstructions}>
                  Please click the link inside the email to verify your account. Once verified, you can sign in to view your orders and sync saved delivery addresses.
                </Text>

                <View style={styles.verificationTipBox}>
                  <Text style={styles.verificationTipText}>
                    💡 <Text style={{ fontWeight: '700' }}>Can&apos;t find it?</Text> Check your Spam or Promotions folder. Links can take up to 2 minutes to arrive.
                  </Text>
                </View>

                {/* Resend Verification Button */}
                <TouchableOpacity
                  style={[styles.resendActionBtn, resending && styles.btnDisabled]}
                  onPress={handleResendVerification}
                  disabled={resending}
                  activeOpacity={0.85}
                >
                  {resending ? (
                    <ActivityIndicator color={Colors.charcoal} />
                  ) : (
                    <Text style={styles.resendActionText}>Resend Verification Link ✉️</Text>
                  )}
                </TouchableOpacity>

                {/* Sign In Button */}
                <TouchableOpacity
                  style={styles.primaryActionBtn}
                  onPress={() => handleSwitchMode('signin')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryActionText}>I&apos;ve Confirmed — Sign In →</Text>
                </TouchableOpacity>

                {/* Continue as Guest */}
                <TouchableOpacity
                  style={styles.guestDismissBtn}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.guestDismissText}>Continue as Guest 🍕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* REGULAR FORMS (SIGNIN, SIGNUP, FORGOT) */
              <>
                {/* Form Fields: Sign Up Mode */}
                {mode === 'signup' && (
                  <>
                    <Text style={styles.fieldLabel}>Full Name *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Adebayo Idris"
                      placeholderTextColor={Colors.textMuted}
                      selectionColor={Colors.primaryRed}
                      value={fullName}
                      onChangeText={setFullName}
                      autoCapitalize="words"
                    />

                    <Text style={styles.fieldLabel}>Phone Number *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 0812 345 6789"
                      placeholderTextColor={Colors.textMuted}
                      selectionColor={Colors.primaryRed}
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
                  selectionColor={Colors.primaryRed}
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
                    <View style={styles.passwordFieldWrap}>
                      <TextInput
                        style={styles.passwordInput}
                        placeholder="At least 6 characters"
                        placeholderTextColor={Colors.textMuted}
                        selectionColor={Colors.primaryRed}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        testID="input-password"
                      />
                      <TouchableOpacity
                        style={styles.passwordToggleBtn}
                        onPress={() => setShowPassword((prev) => !prev)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        testID="btn-toggle-password-visibility"
                      >
                        {showPassword ? (
                          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.charcoal} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <Path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                          </Svg>
                        ) : (
                          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <Path d="M1 1l22 22" />
                          </Svg>
                        )}
                      </TouchableOpacity>
                    </View>
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
              </>
            )}
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
    minHeight: 40,
    justifyContent: 'center',
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
    minHeight: 48,
    fontSize: 14,
    color: Colors.charcoal,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.12)',
  },
  passwordFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warmCream,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.12)',
    minHeight: 48,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 48,
    fontSize: 14,
    color: Colors.charcoal,
  },
  passwordToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  backdropTouchDismiss: {
    flex: 1,
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
  resendInlineBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primaryRed,
  },
  resendInlineBtnText: {
    color: Colors.primaryRed,
    fontSize: 12,
    fontWeight: '700',
  },
  verificationContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  verificationIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  verificationIcon: {
    fontSize: 32,
  },
  verificationTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 6,
    textAlign: 'center',
  },
  verificationSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emailBadge: {
    backgroundColor: Colors.warmCream,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.12)',
    marginBottom: 16,
  },
  emailBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  verificationInstructions: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.charcoal,
    textAlign: 'center',
    marginBottom: 16,
  },
  verificationTipBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    marginBottom: 20,
    width: '100%',
  },
  verificationTipText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#8A5800',
  },
  resendActionBtn: {
    backgroundColor: Colors.warmCream,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.18)',
    marginBottom: 10,
  },
  resendActionText: {
    color: Colors.charcoal,
    fontSize: 14,
    fontWeight: '700',
  },
});

