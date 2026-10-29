import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Brand } from '../constants/brand';
import { CustomerProfile } from '../domains/customer/customer-types';
import { isStaffRole, signOutUser } from '../domains/auth/auth-service';
import { notificationService, NotificationPermissionState } from '../domains/notifications/notification-service';
import { AuthModal } from './AuthModal';
import { EditProfileModal } from './EditProfileModal';
import { SavedAddressesModal } from './SavedAddressesModal';
import { SupportModal } from './SupportModal';
import { TermsPrivacyModal } from './TermsPrivacyModal';
import { AccountDeletionModal } from './AccountDeletionModal';

interface AccountScreenProps {
  customer: CustomerProfile | null;
  onRefreshProfile: () => void;
  onOpenKitchenDisplay: () => void;
  onNavigateToOrders: () => void;
}

export const AccountScreen: React.FC<AccountScreenProps> = ({
  customer,
  onRefreshProfile,
  onOpenKitchenDisplay,
  onNavigateToOrders,
}) => {
  // Modal states
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [addressesVisible, setAddressesVisible] = useState(false);
  const [supportVisible, setSupportVisible] = useState(false);
  const [termsPrivacyVisible, setTermsPrivacyVisible] = useState(false);
  const [termsPrivacyType, setTermsPrivacyType] = useState<'terms' | 'privacy'>('terms');
  const [deletionVisible, setDeletionVisible] = useState(false);

  // Notification status
  const [notifState, setNotifState] = useState<NotificationPermissionState>('undetermined');
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    notificationService.checkPermissionStatus().then(setNotifState);
  }, []);

  const handleToggleNotifications = async () => {
    if (notifState === 'granted') {
      Alert.alert(
        'Notifications Enabled',
        'Push notifications are currently active for order status updates. You can adjust permissions in device settings.'
      );
      return;
    }

    try {
      setNotifLoading(true);
      const res = await notificationService.requestPermissionAndRegister();
      setNotifState(res.status);
      if (res.success) {
        Alert.alert('Notifications Enabled', 'You will now receive instant alerts for baking and delivery milestones! 🍕');
      } else if (res.error) {
        Alert.alert('Notice', res.error);
      }
    } finally {
      setNotifLoading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of AY Pizza?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOutUser();
            onRefreshProfile();
          },
        },
      ]
    );
  };

  const isStaff = isStaffRole(customer?.role);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* 1. PROFILE HEADER */}
      {customer ? (
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {customer.fullName ? customer.fullName.charAt(0).toUpperCase() : '👤'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.customerName}>{customer.fullName || 'Valued Customer'}</Text>
              {isStaff && (
                <View style={styles.staffBadge}>
                  <Text style={styles.staffBadgeText}>STAFF ({customer.role.toUpperCase()})</Text>
                </View>
              )}
            </View>
            <Text style={styles.customerContact}>{customer.email || 'No email attached'}</Text>
            {customer.phone && <Text style={styles.customerContact}>📞 {customer.phone}</Text>}
            <Text style={styles.memberSince}>
              Member since {new Date(customer.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      ) : (
        /* GUEST HEADER */
        <View style={styles.guestCard}>
          <Text style={styles.guestIcon}>🍕</Text>
          <Text style={styles.guestTitle}>Welcome to AY Pizza!</Text>
          <Text style={styles.guestSubtitle}>
            Sign in or create an account to save campus addresses, view order history, and reorder your favorites.
          </Text>
          <View style={styles.guestButtonsRow}>
            <TouchableOpacity
              style={styles.guestSignInBtn}
              onPress={() => {
                setAuthModalMode('signin');
                setAuthModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.guestSignInText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.guestSignUpBtn}
              onPress={() => {
                setAuthModalMode('signup');
                setAuthModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.guestSignUpText}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 2. ORDER HISTORY SHORTCUT */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Orders & Activity</Text>
        <TouchableOpacity style={styles.menuRow} onPress={onNavigateToOrders} activeOpacity={0.75}>
          <View style={styles.menuRowLeft}>
            <Text style={styles.menuIcon}>📜</Text>
            <Text style={styles.menuLabel}>My Orders & Receipts</Text>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 3. ACCOUNT MANAGEMENT SECTION (SIGNED-IN CUSTOMERS) */}
      {customer && (
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Account & Delivery</Text>

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setEditProfileVisible(true)}
            activeOpacity={0.75}
          >
            <View style={styles.menuRowLeft}>
              <Text style={styles.menuIcon}>👤</Text>
              <Text style={styles.menuLabel}>Personal Information</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setAddressesVisible(true)}
            activeOpacity={0.75}
          >
            <View style={styles.menuRowLeft}>
              <Text style={styles.menuIcon}>📍</Text>
              <Text style={styles.menuLabel}>Saved Delivery Addresses</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 4. PREFERENCES */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Preferences</Text>

        <TouchableOpacity
          style={styles.menuRow}
          onPress={handleToggleNotifications}
          activeOpacity={0.75}
        >
          <View style={styles.menuRowLeft}>
            <Text style={styles.menuIcon}>🔔</Text>
            <View>
              <Text style={styles.menuLabel}>Order Push Alerts</Text>
              <Text style={styles.menuSubLabel}>
                {notifState === 'granted' ? 'Enabled (Milestone alerts active)' : 'Tap to enable live baking & delivery alerts'}
              </Text>
            </View>
          </View>
          {notifLoading ? (
            <ActivityIndicator size="small" color={Colors.primaryRed} />
          ) : (
            <Switch
              value={notifState === 'granted'}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: '#E0D8D0', true: Colors.primaryRed }}
              thumbColor="#FFFFFF"
            />
          )}
        </TouchableOpacity>
      </View>

      {/* 5. SUPPORT & RESTAURANT INFO */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Support & Information</Text>

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => setSupportVisible(true)}
          activeOpacity={0.75}
        >
          <View style={styles.menuRowLeft}>
            <Text style={styles.menuIcon}>💬</Text>
            <View>
              <Text style={styles.menuLabel}>Help & Customer Support</Text>
              <Text style={styles.menuSubLabel}>Phone: {Brand.contact.phone} • WhatsApp</Text>
            </View>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => {
            setTermsPrivacyType('terms');
            setTermsPrivacyVisible(true);
          }}
          activeOpacity={0.75}
        >
          <View style={styles.menuRowLeft}>
            <Text style={styles.menuIcon}>📜</Text>
            <Text style={styles.menuLabel}>Terms of Service</Text>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => {
            setTermsPrivacyType('privacy');
            setTermsPrivacyVisible(true);
          }}
          activeOpacity={0.75}
        >
          <View style={styles.menuRowLeft}>
            <Text style={styles.menuIcon}>🔒</Text>
            <Text style={styles.menuLabel}>Privacy Policy</Text>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 6. STAFF ONLY ROUTE (Strictly gated) */}
      {isStaff && (
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Internal Operations</Text>
          <TouchableOpacity
            style={[styles.menuRow, styles.staffMenuRow]}
            onPress={onOpenKitchenDisplay}
            activeOpacity={0.75}
          >
            <View style={styles.menuRowLeft}>
              <Text style={styles.menuIcon}>👨‍🍳</Text>
              <View>
                <Text style={styles.staffMenuLabel}>Kitchen Display System (KDS)</Text>
                <Text style={styles.menuSubLabel}>Manage live kitchen tickets & oven queues</Text>
              </View>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 7. ACCOUNT ACTIONS */}
      {customer && (
        <View style={styles.sectionContainer}>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
            <Text style={styles.signOutText}>Sign Out of AY Pizza 🚪</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteAccountBtn}
            onPress={() => setDeletionVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.deleteAccountText}>Request Account Deletion 🗑️</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* App Version Info */}
      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>AY Pizza Mobile • UNILAG Campus v1.0.0</Text>
        <Text style={styles.copyrightText}>Opposite King Jaja Hall, UNILAG, Akoka</Text>
      </View>

      <View style={{ height: 32 }} />

      {/* Modals */}
      <AuthModal
        visible={authModalVisible}
        initialMode={authModalMode}
        onClose={() => setAuthModalVisible(false)}
        onSuccess={() => onRefreshProfile()}
      />

      {customer && (
        <EditProfileModal
          visible={editProfileVisible}
          profile={customer}
          onClose={() => setEditProfileVisible(false)}
          onProfileUpdated={() => onRefreshProfile()}
        />
      )}

      {customer && (
        <SavedAddressesModal
          visible={addressesVisible}
          userId={customer.id}
          onClose={() => setAddressesVisible(false)}
        />
      )}

      <SupportModal
        visible={supportVisible}
        onClose={() => setSupportVisible(false)}
      />

      <TermsPrivacyModal
        visible={termsPrivacyVisible}
        type={termsPrivacyType}
        onClose={() => setTermsPrivacyVisible(false)}
      />

      {customer && (
        <AccountDeletionModal
          visible={deletionVisible}
          userId={customer.id}
          onClose={() => setDeletionVisible(false)}
          onSuccess={() => onRefreshProfile()}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.warmCream,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primaryRed,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  customerName: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  staffBadge: {
    backgroundColor: 'rgba(40, 122, 75, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  staffBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: Colors.freshGreen,
  },
  customerContact: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  memberSince: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  guestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  guestIcon: {
    fontSize: 44,
    marginBottom: 10,
  },
  guestTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.charcoal,
    marginBottom: 4,
  },
  guestSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    maxWidth: 290,
  },
  guestButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  guestSignInBtn: {
    flex: 1,
    backgroundColor: Colors.warmCream,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.12)',
  },
  guestSignInText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  guestSignUpBtn: {
    flex: 1,
    backgroundColor: Colors.primaryRed,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  guestSignUpText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(39, 33, 31, 0.05)',
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  menuIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  menuSubLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  menuArrow: {
    fontSize: 18,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  staffMenuRow: {
    backgroundColor: '#F6FFF8',
  },
  staffMenuLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.freshGreen,
  },
  signOutBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primaryRed,
  },
  deleteAccountBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(39, 33, 31, 0.05)',
  },
  deleteAccountText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  copyrightText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
