import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  useWindowDimensions,
  Platform,
  BackHandler,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Brand } from '../constants/brand';
import { CustomerProfile } from '../domains/customer/customer-types';
import { isStaffRole } from '../domains/auth/auth-service';
import { CustomerTab } from './BottomTabBar';

const BrandLogo = require('../../assets/brand-logo.png');

export interface NavigationDrawerProps {
  visible: boolean;
  onClose: () => void;
  customer: CustomerProfile | null;
  activeTab: CustomerTab;
  onNavigateHome: () => void;
  onNavigateMenu: () => void;
  onNavigateOrders: () => void;
  onNavigateAccount: () => void;
  onOpenAddresses: () => void;
  onOpenSupport: () => void;
  onOpenPromotions?: () => void;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
  onSignOut: () => void;
  onOpenKitchenDisplay?: () => void;
  activeOrdersCount?: number;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  visible,
  onClose,
  customer,
  activeTab,
  onNavigateHome,
  onNavigateMenu,
  onNavigateOrders,
  onNavigateAccount,
  onOpenAddresses,
  onOpenSupport,
  onOpenPromotions,
  onOpenAuth,
  onSignOut,
  onOpenKitchenDisplay,
  activeOrdersCount = 0,
}) => {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const screenWidth = windowWidth || 360;
  // Standard responsive width for 360dp phone viewports (leaves backdrop visible)
  const drawerWidth = Math.min(300, Math.max(280, screenWidth * 0.8));

  const [slideAnim] = useState(() => new Animated.Value(-drawerWidth));
  const [opacityAnim] = useState(() => new Animated.Value(0));

  // Handle slide-in / slide-out animations
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -drawerWidth,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, drawerWidth, opacityAnim, slideAnim]);

  // Handle hardware / gesture back button on Android
  useEffect(() => {
    if (!visible) return;

    const backAction = () => {
      onClose();
      return true; // Prevents default back navigation
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  const isStaff = isStaffRole(customer?.role);
  const initials = customer?.fullName
    ? customer.fullName
        .trim()
        .split(/\s+/)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'AY';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.modalRoot}>
        {/* Backdrop overlay */}
        <Animated.View
          style={[styles.backdrop, { opacity: opacityAnim }]}
          testID="drawer-backdrop"
        >
          <TouchableOpacity
            style={styles.backdropTouchable}
            activeOpacity={1}
            onPress={onClose}
            accessibilityLabel="Close navigation drawer"
          />
        </Animated.View>

        {/* Sliding Drawer Panel */}
        <Animated.View
          style={[
            styles.drawerPanel,
            {
              width: drawerWidth,
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateX: slideAnim }],
            },
          ]}
          testID="navigation-drawer-panel"
        >
          {/* Header Brand Bar */}
          <View style={styles.drawerHeader}>
            <View style={styles.brandIdentityRow}>
              <Image source={BrandLogo} style={styles.brandLogoImage} resizeMode="contain" />
              <View style={styles.brandTitleWrap}>
                <Text style={styles.drawerBrandTitle}>{Brand.name}</Text>
                <View style={styles.unilagPill}>
                  <Text style={styles.unilagPillText}>UNILAG CAMPUS</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Close drawer"
              testID="drawer-close-btn"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* User Profile / Greeting Card */}
          <View style={styles.userSection}>
            {customer ? (
              <View style={styles.authenticatedProfileCard} testID="drawer-auth-profile">
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.profileTextWrap}>
                  <View style={styles.nameBadgeRow}>
                    <Text style={styles.profileName} numberOfLines={1}>
                      {customer.fullName || 'Valued Customer'}
                    </Text>
                    {isStaff && (
                      <View style={styles.staffTag}>
                        <Text style={styles.staffTagText}>STAFF</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.profileEmail} numberOfLines={1}>
                    {customer.email || 'No email attached'}
                  </Text>
                  {Boolean(customer.phone) && (
                    <Text style={styles.profilePhone} numberOfLines={1}>
                      📞 {customer.phone}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.guestCard} testID="drawer-guest-profile">
                <View style={styles.guestGreetingRow}>
                  <View style={styles.guestAvatar}>
                    <Text style={styles.guestEmoji}>🍕</Text>
                  </View>
                  <View style={styles.guestTextWrap}>
                    <Text style={styles.guestTitle}>Welcome, Foodie!</Text>
                    <Text style={styles.guestSubtitle}>Sign in for addresses & order history</Text>
                  </View>
                </View>

                <View style={styles.guestActionButtons}>
                  <TouchableOpacity
                    style={styles.guestSignInBtn}
                    onPress={() => {
                      onClose();
                      onOpenAuth('signin');
                    }}
                    activeOpacity={0.85}
                    testID="drawer-signin-btn"
                  >
                    <Text style={styles.guestSignInText}>Sign In</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.guestSignUpBtn}
                    onPress={() => {
                      onClose();
                      onOpenAuth('signup');
                    }}
                    activeOpacity={0.85}
                    testID="drawer-signup-btn"
                  >
                    <Text style={styles.guestSignUpText}>Register</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Navigation Links ScrollBody */}
          <ScrollView
            style={styles.scrollNav}
            contentContainerStyle={styles.scrollNavContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.navSectionLabel}>EXPLORE & ORDER</Text>

            {/* 1. Home */}
            <TouchableOpacity
              style={[styles.navItem, activeTab === 'home' && styles.navItemActive]}
              onPress={() => {
                onClose();
                onNavigateHome();
              }}
              activeOpacity={0.75}
              testID="drawer-nav-home"
            >
              <Text style={styles.navIcon}>🍕</Text>
              <Text style={[styles.navLabel, activeTab === 'home' && styles.navLabelActive]}>
                Home
              </Text>
              {activeTab === 'home' && <View style={styles.activeIndicator} />}
            </TouchableOpacity>

            {/* 2. Menu */}
            <TouchableOpacity
              style={[styles.navItem, activeTab === 'menu' && styles.navItemActive]}
              onPress={() => {
                onClose();
                onNavigateMenu();
              }}
              activeOpacity={0.75}
              testID="drawer-nav-menu"
            >
              <Text style={styles.navIcon}>📖</Text>
              <Text style={[styles.navLabel, activeTab === 'menu' && styles.navLabelActive]}>
                Explore Menu
              </Text>
              {activeTab === 'menu' && <View style={styles.activeIndicator} />}
            </TouchableOpacity>

            {/* 3. My Orders */}
            <TouchableOpacity
              style={[styles.navItem, activeTab === 'orders' && styles.navItemActive]}
              onPress={() => {
                onClose();
                onNavigateOrders();
              }}
              activeOpacity={0.75}
              testID="drawer-nav-orders"
            >
              <Text style={styles.navIcon}>🧾</Text>
              <Text style={[styles.navLabel, activeTab === 'orders' && styles.navLabelActive]}>
                My Orders
              </Text>
              {activeOrdersCount > 0 && (
                <View style={styles.orderCountBadge} testID="drawer-orders-badge">
                  <Text style={styles.orderCountBadgeText}>{String(activeOrdersCount)}</Text>
                </View>
              )}
              {activeTab === 'orders' && <View style={styles.activeIndicator} />}
            </TouchableOpacity>

            {/* 4. Promotions & Offers */}
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => {
                onClose();
                onOpenPromotions?.();
              }}
              activeOpacity={0.75}
              testID="drawer-nav-promotions"
            >
              <Text style={styles.navIcon}>🏷️</Text>
              <Text style={styles.navLabel}>Promotions & Offers</Text>
            </TouchableOpacity>

            <View style={styles.divider} />
            <Text style={styles.navSectionLabel}>ACCOUNT & PREFERENCES</Text>

            {/* 4. Saved Addresses */}
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => {
                onClose();
                onOpenAddresses();
              }}
              activeOpacity={0.75}
              testID="drawer-nav-addresses"
            >
              <Text style={styles.navIcon}>📍</Text>
              <Text style={styles.navLabel}>Saved Addresses</Text>
            </TouchableOpacity>

            {/* 5. My Account */}
            <TouchableOpacity
              style={[styles.navItem, activeTab === 'account' && styles.navItemActive]}
              onPress={() => {
                onClose();
                onNavigateAccount();
              }}
              activeOpacity={0.75}
              testID="drawer-nav-account"
            >
              <Text style={styles.navIcon}>👤</Text>
              <Text style={[styles.navLabel, activeTab === 'account' && styles.navLabelActive]}>
                My Account
              </Text>
              {activeTab === 'account' && <View style={styles.activeIndicator} />}
            </TouchableOpacity>

            {/* 6. Help & Support */}
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => {
                onClose();
                onOpenSupport();
              }}
              activeOpacity={0.75}
              testID="drawer-nav-support"
            >
              <Text style={styles.navIcon}>💬</Text>
              <Text style={styles.navLabel}>Help & Support</Text>
            </TouchableOpacity>

            {/* 7. Staff KDS (Strictly visible only if staff) */}
            {isStaff && (
              <TouchableOpacity
                style={[styles.navItem, styles.staffNavItem]}
                onPress={() => {
                  onClose();
                  onOpenKitchenDisplay?.();
                }}
                activeOpacity={0.75}
                testID="drawer-nav-staff-kds"
              >
                <Text style={styles.navIcon}>👨‍🍳</Text>
                <Text style={styles.staffNavLabel}>Kitchen Display (Staff)</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Drawer Footer */}
          <View style={styles.drawerFooter}>
            {customer && (
              <TouchableOpacity
                style={styles.signOutBtn}
                onPress={() => {
                  onClose();
                  onSignOut();
                }}
                activeOpacity={0.8}
                testID="drawer-signout-btn"
              >
                <Text style={styles.signOutIcon}>🚪</Text>
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            )}

            <View style={styles.footerBrandNote}>
              <Text style={styles.footerBrandTitle}>AY Pizza & Ice Cream</Text>
              <Text style={styles.footerBrandDesc}>Opposite King Jaja Hall, UNILAG Main Campus</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20, 10, 5, 0.52)',
  },
  backdropTouchable: {
    flex: 1,
  },
  drawerPanel: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#27211F',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.08)',
  },
  brandIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  brandLogoImage: {
    width: 38,
    height: 38,
    borderRadius: 8,
    marginRight: 10,
  },
  brandTitleWrap: {
    flex: 1,
  },
  drawerBrandTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.chocolateBrown,
    letterSpacing: 0.2,
  },
  unilagPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.warmCream,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    marginTop: 2,
  },
  unilagPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(39, 33, 31, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  userSection: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FCFAF7',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.06)',
  },
  authenticatedProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.brandRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: Colors.brandRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  profileTextWrap: {
    flex: 1,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  staffTag: {
    backgroundColor: Colors.chocolateBrown,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  staffTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.goldenOrange,
    letterSpacing: 0.5,
  },
  profileEmail: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  profilePhone: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  guestCard: {
    paddingVertical: 4,
  },
  guestGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  guestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.warmCream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    marginRight: 10,
  },
  guestEmoji: {
    fontSize: 20,
  },
  guestTextWrap: {
    flex: 1,
  },
  guestTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  guestSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  guestActionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  guestSignInBtn: {
    flex: 1,
    minHeight: 40,
    backgroundColor: Colors.brandRed,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestSignInText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  guestSignUpBtn: {
    flex: 1,
    minHeight: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.chocolateBrown,
  },
  guestSignUpText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.chocolateBrown,
  },
  scrollNav: {
    flex: 1,
  },
  scrollNavContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
  },
  navSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
    paddingHorizontal: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 3,
  },
  navItemActive: {
    backgroundColor: Colors.warmCream,
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.18)',
  },
  navIcon: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
    marginRight: 10,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.charcoal,
    flex: 1,
  },
  navLabelActive: {
    color: Colors.brandRed,
    fontWeight: '800',
  },
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.brandRed,
    marginLeft: 6,
  },
  orderCountBadge: {
    backgroundColor: Colors.brandRed,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
  },
  orderCountBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  staffNavItem: {
    backgroundColor: 'rgba(62, 39, 35, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(62, 39, 35, 0.15)',
    marginTop: 6,
  },
  staffNavLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.chocolateBrown,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.07)',
    marginVertical: 10,
    marginHorizontal: 8,
  },
  drawerFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(39, 33, 31, 0.08)',
    backgroundColor: '#FFFFFF',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.3)',
    backgroundColor: '#FFF5F5',
    marginBottom: 10,
  },
  signOutIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.brandRed,
  },
  footerBrandNote: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  footerBrandTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.chocolateBrown,
  },
  footerBrandDesc: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
    textAlign: 'center',
  },
});
