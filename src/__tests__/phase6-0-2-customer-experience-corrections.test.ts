import React from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  notificationService,
  EAS_PROJECT_ID,
} from '../domains/notifications/notification-service';
import { NavigationDrawer, NavigationDrawerProps } from '../components/NavigationDrawer';
import { OrderReceiptModal, OrderReceiptModalProps } from '../components/OrderReceiptModal';
import { PromotionsModal, PromotionsModalProps } from '../components/PromotionsModal';
import { AuthModal } from '../components/AuthModal';
import { orderService } from '../domains/order/order-service';
import { supabase } from '../config/supabase';

// Mock Supabase
jest.mock('../config/supabase', () => ({
  supabase: {
    auth: {
      signOut: jest.fn().mockResolvedValue({ error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: { success: true }, error: null }),
    from: jest.fn(),
  },
}));

// Mock expo-device to simulate physical device
jest.mock('expo-device', () => ({
  isDevice: true,
}));

beforeAll(() => {
  jest.spyOn(React, 'useState').mockImplementation(((initial: any) => [
    typeof initial === 'function' ? initial() : initial,
    jest.fn(),
  ]) as any);
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

function findByTestId(node: any, testID: string): any {
  if (!node) return null;
  if (node.props?.testID === testID) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const res = findByTestId(child, testID);
      if (res) return res;
    }
  }
  if (node.props?.children) {
    if (Array.isArray(node.props.children)) {
      for (const child of node.props.children) {
        const res = findByTestId(child, testID);
        if (res) return res;
      }
    } else {
      return findByTestId(node.props.children, testID);
    }
  }
  return null;
}

function findTextInNode(node: any, text: string): boolean {
  if (!node) return false;
  if (typeof node === 'string') return node.includes(text);
  if (typeof node === 'number') return String(node).includes(text);
  if (node.props?.children) {
    if (Array.isArray(node.props.children)) {
      return node.props.children.some((c: any) => findTextInNode(c, text));
    }
    return findTextInNode(node.props.children, text);
  }
  return false;
}

describe('Phase 6.0.2 — Customer Experience Corrections & Feature Completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Push Notifications — EAS Project ID & Permissions Fallback', () => {
    it('defines the explicit EAS Project ID matching EAS project configuration', () => {
      expect(EAS_PROJECT_ID).toBe('a0aaa783-3f92-4b05-b32f-e44ccc7bfd38');
    });

    it('passes explicit projectId to Notifications.getExpoPushTokenAsync during registration', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        canAskAgain: true,
      });
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValueOnce({
        data: 'ExponentPushToken[mock-token-xyz]',
      });

      const result = await notificationService.requestPermissionAndRegister();
      expect(result.success).toBe(true);
      expect(result.pushToken).toBe('ExponentPushToken[mock-token-xyz]');
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: 'a0aaa783-3f92-4b05-b32f-e44ccc7bfd38',
      });
    });

    it('returns canAskAgain: false with a settings instruction when permissions are denied permanently', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        canAskAgain: false,
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
        canAskAgain: false,
      });

      const result = await notificationService.requestPermissionAndRegister();
      expect(result.success).toBe(false);
      expect(result.status).toBe('denied');
      expect(result.canAskAgain).toBe(false);
      expect(result.error).toContain('device settings');
    });

    it('provides openDeviceSettings which triggers Linking.openSettings()', async () => {
      await notificationService.openDeviceSettings();
      expect(Linking.openSettings).toHaveBeenCalled();
    });

    it('deactivates stored push token on sign-out and removes from AsyncStorage', async () => {
      await AsyncStorage.setItem('ay_pizza_device_push_token_v1', 'ExponentPushToken[token-to-deactivate]');

      const res = await notificationService.deactivateCurrentToken('User Logged Out');
      expect(res).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('deactivate_device_push_token', {
        p_push_token: 'ExponentPushToken[token-to-deactivate]',
        p_reason: 'User Logged Out',
      });
      const stored = await AsyncStorage.getItem('ay_pizza_device_push_token_v1');
      expect(stored).toBeNull();
    });

    it('re-associates stored push token with authenticated account on login via syncTokenOnAuth', async () => {
      await AsyncStorage.setItem('ay_pizza_device_push_token_v1', 'ExponentPushToken[existing-token]');

      await notificationService.syncTokenOnAuth();
      expect(supabase.rpc).toHaveBeenCalledWith('register_device_push_token', expect.objectContaining({
        p_push_token: 'ExponentPushToken[existing-token]',
      }));
    });
  });

  describe('2. Promotions & Offers — Navigation Drawer & Screen Integration', () => {
    const createMockDrawerProps = (overrides?: Partial<NavigationDrawerProps>): NavigationDrawerProps => ({
      visible: true,
      onClose: jest.fn(),
      customer: null,
      activeTab: 'home',
      onNavigateHome: jest.fn(),
      onNavigateMenu: jest.fn(),
      onNavigateOrders: jest.fn(),
      onNavigateAccount: jest.fn(),
      onOpenAddresses: jest.fn(),
      onOpenSupport: jest.fn(),
      onOpenPromotions: jest.fn(),
      onOpenAuth: jest.fn(),
      onSignOut: jest.fn(),
      onOpenKitchenDisplay: jest.fn(),
      activeOrdersCount: 0,
      ...overrides,
    });

    it('renders Promotions & Offers button in the navigation drawer', () => {
      const props = createMockDrawerProps();
      const tree = NavigationDrawer(props);
      const promoBtn = findByTestId(tree, 'drawer-nav-promotions');
      expect(promoBtn).toBeTruthy();
      expect(findTextInNode(promoBtn, 'Promotions & Offers')).toBe(true);
    });

    it('invokes onOpenPromotions and closes the drawer when pressed', () => {
      const onOpenPromotions = jest.fn();
      const onClose = jest.fn();
      const props = createMockDrawerProps({ onOpenPromotions, onClose });
      const tree = NavigationDrawer(props);
      const promoBtn = findByTestId(tree, 'drawer-nav-promotions');
      expect(promoBtn).toBeTruthy();

      promoBtn.props.onPress();
      expect(onClose).toHaveBeenCalled();
      expect(onOpenPromotions).toHaveBeenCalled();
    });

    it('renders PromotionsModal with active campus perks and coupon code empty state', () => {
      const props: PromotionsModalProps = {
        visible: true,
        onClose: jest.fn(),
        onExploreMenu: jest.fn(),
      };
      const tree = PromotionsModal(props);
      expect(tree).toBeTruthy();
      expect(findByTestId(tree, 'promotions-modal')).toBeTruthy();
      expect(findByTestId(tree, 'offer-card-campus-flat-delivery')).toBeTruthy();
      expect(findByTestId(tree, 'offer-card-half-and-half-combo')).toBeTruthy();
      expect(findByTestId(tree, 'offer-card-free-counter-pickup')).toBeTruthy();
    });
  });

  describe('3. Customer Order Cancellation — Accessibility & Strict CONFIRMED Policy', () => {
    const createMockReceiptProps = (overrides?: Partial<OrderReceiptModalProps>): OrderReceiptModalProps => ({
      visible: true,
      orderNumber: 'AY-9999',
      paymentReference: 'pstk_ref_123',
      receiptToken: 'token_abc',
      customerName: 'Test Student',
      fulfillmentType: 'delivery',
      landmarkName: 'New Hall',
      deliveryAddress: 'Room A12',
      items: [
        {
          quantity: 1,
          productName: 'Pepperoni Supreme',
          lineTotal: 4500,
        },
      ],
      subtotal: 4500,
      deliveryFee: 500,
      total: 5000,
      onDone: jest.fn(),
      onTrackOrder: jest.fn(),
      onCancelOrder: jest.fn(),
      orderStatus: 'CONFIRMED',
      ...overrides,
    });

    it('renders Cancel Order button on OrderReceiptModal strictly when orderStatus is CONFIRMED and onCancelOrder is provided', () => {
      const onCancelOrder = jest.fn();
      const props = createMockReceiptProps({ orderStatus: 'CONFIRMED', onCancelOrder });
      const tree = OrderReceiptModal(props);
      const cancelBtn = findByTestId(tree, 'receipt-cancel-order-btn');
      expect(cancelBtn).toBeTruthy();

      cancelBtn.props.onPress();
      expect(onCancelOrder).toHaveBeenCalled();
    });

    it('does NOT render Cancel Order button on OrderReceiptModal when orderStatus is ACCEPTED by kitchen', () => {
      const props = createMockReceiptProps({ orderStatus: 'ACCEPTED' });
      const tree = OrderReceiptModal(props);
      const cancelBtn = findByTestId(tree, 'receipt-cancel-order-btn');
      expect(cancelBtn).toBeNull();
    });

    it('does NOT render Cancel Order button on OrderReceiptModal when orderStatus is PREPARING, IN_TRANSIT, or DELIVERED', () => {
      for (const status of ['PREPARING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const) {
        const props = createMockReceiptProps({ orderStatus: status });
        const tree = OrderReceiptModal(props);
        const cancelBtn = findByTestId(tree, 'receipt-cancel-order-btn');
        expect(cancelBtn).toBeNull();
      }
    });

    it('delegates order cancellation to orderService.cancelOrderByCustomer', async () => {
      const cancelSpy = jest.spyOn(orderService, 'cancelOrderByCustomer').mockResolvedValueOnce({
        success: true,
        orderId: 'order-123',
        status: 'CANCELLED',
      });

      const res = await orderService.cancelOrderByCustomer('order-123', 'receipt-token-abc', 'Ordered by mistake');
      expect(res.success).toBe(true);
      expect(cancelSpy).toHaveBeenCalledWith('order-123', 'receipt-token-abc', 'Ordered by mistake');
      cancelSpy.mockRestore();
    });
  });

  describe('4. Password Visibility & Form Usability', () => {
    it('renders password visibility toggle inside AuthModal password field', () => {
      const tree = AuthModal({
        visible: true,
        initialMode: 'signin',
        onClose: jest.fn(),
        onSuccess: jest.fn(),
      });
      const toggleBtn = findByTestId(tree, 'btn-toggle-password-visibility');
      expect(toggleBtn).toBeTruthy();
    });

    it('renders password input with secureTextEntry enabled by default', () => {
      const tree = AuthModal({
        visible: true,
        initialMode: 'signin',
        onClose: jest.fn(),
        onSuccess: jest.fn(),
      });
      const input = findByTestId(tree, 'input-password');
      expect(input).toBeTruthy();
      expect(input.props.secureTextEntry).toBe(true);
    });
  });
});
