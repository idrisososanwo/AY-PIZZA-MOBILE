/**
 * AY Pizza — Phase 6.0.3: Customer Order Cancellation & Push Notification Error Investigation Tests
 */

import React from 'react';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from '../domains/notifications/notification-service';
import { orderService } from '../domains/order/order-service';
import { OrderReceiptModal, OrderReceiptModalProps } from '../components/OrderReceiptModal';
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

describe('Phase 6.0.3 — Order Cancellation Visibility & Push Notification Resilience', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('1. Push Notification Resilience & FCM Missing Credentials Fallback', () => {
    it('reuses existing cached push token from AsyncStorage without triggering native token lookup', async () => {
      await AsyncStorage.setItem('ay_pizza_device_push_token_v1', 'ExponentPushToken[cached-device-token-123]');

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await notificationService.requestPermissionAndRegister();
      expect(result.success).toBe(true);
      expect(result.status).toBe('granted');
      expect(result.pushToken).toBe('ExponentPushToken[cached-device-token-123]');
      expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
      expect(supabase.rpc).toHaveBeenCalledWith('register_device_push_token', expect.objectContaining({
        p_push_token: 'ExponentPushToken[cached-device-token-123]',
      }));
    });

    it('gracefully handles missing FCM credentials on Android preview builds without surfacing technical error', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
        canAskAgain: true,
      });

      // Simulate native exception thrown by expo-notifications PushTokenModule.kt
      const fcmError = new Error(
        'Unable to get Firebase Messaging instance. Did you configure `googleServicesFile` path in app config? Make sure to complete the guide at https://docs.expo.dev/push-notifications/fcm-credentials/ : Default FirebaseApp is not initialized in this process'
      );
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValueOnce(fcmError);

      const result = await notificationService.requestPermissionAndRegister();
      expect(result.success).toBe(true);
      expect(result.status).toBe('granted');
      expect(result.error).toBeUndefined();
    });

    it('returns denied status with user guidance when OS permission is permanently declined', async () => {
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
      expect(result.error).toContain('enable alerts in device settings');
    });
  });

  describe('2. Authoritative Customer Cancellation RPC & Migration Safeguards', () => {
    it('gracefully handles missing staging migration (PGRST202) with store dispatch guidance', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.cancel_order_by_customer(p_order_id) in the schema cache',
        },
      });

      const res = await orderService.cancelOrderByCustomer('ord-123', 'tok-abc', 'Mistake');
      expect(res.success).toBe(false);
      expect(res.error).toContain('0913 385 5334');
      expect(res.error).not.toContain('schema cache');
    });

    it('successfully processes order cancellation when RPC succeeds', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          code: 'CANCELLED_SUCCESSFULLY',
          message: 'Order cancelled.',
          order_id: 'ord-123',
          order_number: 'AYP-1234',
          status: 'CANCELLED',
          refund_status: 'REFUND_REQUIRED',
          cancelled_at: new Date().toISOString(),
        },
        error: null,
      });

      const res = await orderService.cancelOrderByCustomer('ord-123', 'tok-abc', 'Change of mind');
      expect(res.success).toBe(true);
      expect(res.status).toBe('CANCELLED');
      expect(res.refundStatus).toBe('REFUND_REQUIRED');
    });
  });

  describe('3. Order Receipt Modal Cancellation Visibility', () => {
    const baseReceiptProps: OrderReceiptModalProps = {
      visible: true,
      orderNumber: 'AYP-2026-9999',
      paymentReference: 'PAY_REF_123',
      receiptToken: 'token_123',
      customerName: 'Student Customer',
      fulfillmentType: 'delivery',
      landmarkName: 'New Hall',
      deliveryAddress: 'Room 204',
      items: [
        {
          quantity: 1,
          productName: 'Pepperoni Supreme',
          basePrice: 5000,
          lineTotal: 5000,
        },
      ],
      subtotal: 5000,
      deliveryFee: 500,
      total: 5500,
      onDone: jest.fn(),
      onTrackOrder: jest.fn(),
    };

    it('renders the Cancel Order button when orderStatus is CONFIRMED and onCancelOrder is provided', () => {
      const onCancelMock = jest.fn();
      const tree = OrderReceiptModal({
        ...baseReceiptProps,
        orderStatus: 'CONFIRMED',
        onCancelOrder: onCancelMock,
      });

      const cancelBtn = findByTestId(tree, 'receipt-cancel-order-btn');
      expect(cancelBtn).not.toBeNull();
    });

    it('hides the Cancel Order button when orderStatus is PAID', () => {
      const onCancelMock = jest.fn();
      const tree = OrderReceiptModal({
        ...baseReceiptProps,
        orderStatus: 'PAID' as any,
        onCancelOrder: onCancelMock,
      });

      const cancelBtn = findByTestId(tree, 'receipt-cancel-order-btn');
      expect(cancelBtn).toBeNull();
    });

    it('hides the Cancel Order button when orderStatus is ACCEPTED by the kitchen', () => {
      const onCancelMock = jest.fn();
      const tree = OrderReceiptModal({
        ...baseReceiptProps,
        orderStatus: 'ACCEPTED',
        onCancelOrder: onCancelMock,
      });

      const cancelBtn = findByTestId(tree, 'receipt-cancel-order-btn');
      expect(cancelBtn).toBeNull();
    });

    it('hides the Cancel Order button when onCancelOrder is not provided', () => {
      const tree = OrderReceiptModal({
        ...baseReceiptProps,
        orderStatus: 'CONFIRMED',
        onCancelOrder: undefined,
      });

      const cancelBtn = findByTestId(tree, 'receipt-cancel-order-btn');
      expect(cancelBtn).toBeNull();
    });
  });
});

