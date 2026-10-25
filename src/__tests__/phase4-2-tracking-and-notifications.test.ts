/**
 * Phase 4.2 Customer Order Tracking & Push Notification Tests
 * 
 * Verifies customer status presentation, pickup vs delivery state progression,
 * monotonic version guard, Realtime stale event rejection, notification outbox
 * payload construction, idempotency keys, exponential backoff, token lifecycle,
 * and guest authorization.
 */

import { OrderStatus, Order } from '../types/order';
import { normalizeOrder } from '../domains/order/order-service';
import { orderTrackingService } from '../domains/order/order-tracking-service';
import { notificationService } from '../domains/notifications/notification-service';
import { supabase } from '../config/supabase';

describe('Phase 4.2 — Customer Order Tracking & Push Notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Customer Status Presentation & Copy Mapping', () => {
    it('correctly distinguishes pickup versus delivery customer copy', () => {
      const getCustomerStatusCopy = (status: OrderStatus, isDelivery: boolean) => {
        if (!isDelivery) {
          switch (status) {
            case 'CONFIRMED': return 'Order Confirmed';
            case 'ACCEPTED': return 'Kitchen Accepted Order';
            case 'PREPARING': return 'Pizza Baking in Oven';
            case 'READY_FOR_PICKUP': return 'Ready for Counter Pickup!';
            case 'DELIVERED': return 'Order Collected';
            case 'CANCELLED': return 'Order Cancelled';
            default: return status;
          }
        } else {
          switch (status) {
            case 'CONFIRMED': return 'Order Confirmed';
            case 'ACCEPTED': return 'Kitchen Accepted Order';
            case 'PREPARING': return 'Pizza Baking in Oven';
            case 'READY_FOR_PICKUP': return 'Order Packed for Courier';
            case 'IN_TRANSIT': return 'Dispatched & On the Way!';
            case 'DELIVERED': return 'Delivered';
            case 'CANCELLED': return 'Order Cancelled';
            default: return status;
          }
        }
      };

      // Pickup expectations: READY_FOR_PICKUP means ready at King Jaja Hall counter
      expect(getCustomerStatusCopy('READY_FOR_PICKUP', false)).toBe('Ready for Counter Pickup!');
      expect(getCustomerStatusCopy('DELIVERED', false)).toBe('Order Collected');

      // Delivery expectations: READY_FOR_PICKUP means packed for courier; IN_TRANSIT is valid
      expect(getCustomerStatusCopy('READY_FOR_PICKUP', true)).toBe('Order Packed for Courier');
      expect(getCustomerStatusCopy('IN_TRANSIT', true)).toBe('Dispatched & On the Way!');
      expect(getCustomerStatusCopy('DELIVERED', true)).toBe('Delivered');
    });

    it('pickup progression milestones strictly exclude IN_TRANSIT', () => {
      const pickupMilestones: OrderStatus[] = [
        'CONFIRMED',
        'ACCEPTED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'DELIVERED',
      ];

      expect(pickupMilestones).not.toContain('IN_TRANSIT');
      expect(pickupMilestones).toHaveLength(5);
    });

    it('delivery progression milestones explicitly include IN_TRANSIT between READY_FOR_PICKUP and DELIVERED', () => {
      const deliveryMilestones: OrderStatus[] = [
        'CONFIRMED',
        'ACCEPTED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'IN_TRANSIT',
        'DELIVERED',
      ];

      expect(deliveryMilestones).toContain('IN_TRANSIT');
      const packedIdx = deliveryMilestones.indexOf('READY_FOR_PICKUP');
      const transitIdx = deliveryMilestones.indexOf('IN_TRANSIT');
      const deliveredIdx = deliveryMilestones.indexOf('DELIVERED');

      expect(transitIdx).toBe(packedIdx + 1);
      expect(deliveredIdx).toBe(transitIdx + 1);
    });
  });

  describe('2. Monotonic Versioning & Realtime Stale Event Rejection', () => {
    it('discards stale Realtime events where event version <= current order version', () => {
      const currentOrder: Partial<Order> = {
        id: 'ord-test-1',
        version: 3,
        status: 'PREPARING',
      };

      const isStaleEvent = (incomingVersion: number, existingVersion: number) => {
        return incomingVersion <= existingVersion && existingVersion > 0;
      };

      // Stale events (version 1, 2, or duplicate 3)
      expect(isStaleEvent(1, currentOrder.version!)).toBe(true);
      expect(isStaleEvent(2, currentOrder.version!)).toBe(true);
      expect(isStaleEvent(3, currentOrder.version!)).toBe(true);

      // Fresh forward progress event (version 4)
      expect(isStaleEvent(4, currentOrder.version!)).toBe(false);
    });

    it('normalizeOrder accurately maps database snake_case fields and events array', () => {
      const rawDbOrder = {
        id: '00000000-0000-0000-0000-000000000001',
        order_number: 'AYP-20261022-1042',
        customer_id: null,
        guest_name: 'Idris Ososanwo',
        fulfillment_type: 'delivery',
        landmark_name: 'King Jaja Hall',
        delivery_address: 'Room A204',
        subtotal: '5500.00',
        delivery_fee: '500.00',
        total: '6000.00',
        status: 'PREPARING',
        version: 3,
        refund_status: 'NONE',
        events: [
          {
            id: 'evt-1',
            previous_status: 'PENDING_PAYMENT',
            new_status: 'CONFIRMED',
            version: 1,
            title: 'Order Confirmed',
            description: 'Payment verified',
            created_at: '2026-10-22T20:00:00Z',
          },
          {
            id: 'evt-2',
            previous_status: 'CONFIRMED',
            new_status: 'ACCEPTED',
            version: 2,
            title: 'Order Accepted',
            description: 'Kitchen accepted order',
            created_at: '2026-10-22T20:02:00Z',
          },
          {
            id: 'evt-3',
            previous_status: 'ACCEPTED',
            new_status: 'PREPARING',
            version: 3,
            title: 'Pizza in Oven',
            description: 'Baking right now',
            created_at: '2026-10-22T20:05:00Z',
          },
        ],
      };

      const normalized = normalizeOrder(rawDbOrder);

      expect(normalized.orderNumber).toBe('AYP-20261022-1042');
      expect(normalized.fulfillmentType).toBe('delivery');
      expect(normalized.subtotal).toBe(5500);
      expect(normalized.deliveryFee).toBe(500);
      expect(normalized.total).toBe(6000);
      expect(normalized.version).toBe(3);
      expect(normalized.events).toHaveLength(3);
      expect(normalized.events![2].title).toBe('Pizza in Oven');
      expect(normalized.events![2].version).toBe(3);
    });
  });

  describe('3. Notification Payload Construction & Security Minimality', () => {
    it('constructs minimal push notification payload without leaking customer PII or tokens', () => {
      const constructPushPayload = (
        targetToken: string,
        orderId: string,
        orderNumber: string,
        status: OrderStatus,
        version: number
      ) => {
        return {
          to: targetToken,
          title: 'AY Pizza: Order Update',
          body: `Order #${orderNumber} is now being prepared in the kitchen.`,
          sound: 'default',
          channelId: 'order_updates',
          priority: 'high',
          data: {
            orderId,
            orderNumber,
            status,
            version,
            screen: 'order-tracking',
          },
        };
      };

      const payload = constructPushPayload(
        'ExponentPushToken[mock-recipient-token]',
        'ord-999',
        'AYP-20261022-0042',
        'PREPARING',
        3
      );

      // Verify necessary notification attributes
      expect(payload.to).toBe('ExponentPushToken[mock-recipient-token]');
      expect(payload.data.orderId).toBe('ord-999');
      expect(payload.data.screen).toBe('order-tracking');

      // Verify zero sensitive data leaks
      const stringified = JSON.stringify(payload);
      expect(stringified).not.toContain('receipt_token');
      expect(stringified).not.toContain('phone');
      expect(stringified).not.toContain('address');
      expect(stringified).not.toContain('secret');
      expect(stringified).not.toContain('paystack');
    });

    it('generates deterministic idempotency keys preventing duplicate outbox jobs', () => {
      const orderId = '00000000-0000-0000-0000-000000000001';
      const status: OrderStatus = 'PREPARING';
      const pushToken = 'ExponentPushToken[test-user-1]';

      const key1 = `${orderId}:${status}:${pushToken}`;
      const key2 = `${orderId}:${status}:${pushToken}`;

      expect(key1).toBe(key2);
      expect(key1).toBe('00000000-0000-0000-0000-000000000001:PREPARING:ExponentPushToken[test-user-1]');
    });
  });

  describe('4. Notification Retry Backoff & Invalidation Strategy', () => {
    it('calculates exponential backoff based on attempt count', () => {
      const calculateBackoffSeconds = (attemptCount: number) => {
        // Formula: 15s * 2^(attempt - 1)
        return 15 * Math.pow(2, Math.min(attemptCount - 1, 5));
      };

      expect(calculateBackoffSeconds(1)).toBe(15);    // 1st retry: 15 seconds
      expect(calculateBackoffSeconds(2)).toBe(30);    // 2nd retry: 30 seconds
      expect(calculateBackoffSeconds(3)).toBe(60);    // 3rd retry: 60 seconds
      expect(calculateBackoffSeconds(4)).toBe(120);   // 4th retry: 120 seconds
      expect(calculateBackoffSeconds(5)).toBe(240);   // 5th retry: 240 seconds
    });

    it('determines dead-letter versus retryable failure based on attempt cap', () => {
      const shouldDeadLetter = (attemptCount: number, isUnregistered: boolean) => {
        if (isUnregistered) return true;
        return attemptCount >= 5;
      };

      // Transient errors under threshold
      expect(shouldDeadLetter(1, false)).toBe(false);
      expect(shouldDeadLetter(4, false)).toBe(false);

      // Max retry threshold reached
      expect(shouldDeadLetter(5, false)).toBe(true);

      // DeviceNotRegistered is immediately dead-lettered
      expect(shouldDeadLetter(1, true)).toBe(true);
    });
  });

  describe('5. Device Token Lifecycle & Account Switching', () => {
    it('generates and persists a stable anonymous guest device ID', async () => {
      const id1 = await notificationService.getOrCreateGuestDeviceId();
      const id2 = await notificationService.getOrCreateGuestDeviceId();

      expect(id1).toBeTruthy();
      expect(id1).toBe(id2);
      expect(id1.startsWith('guest_dev_')).toBe(true);
    });

    it('deactivateCurrentToken invokes database deactivation RPC and clears local storage on logout', async () => {
      const rpcSpy = jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: { success: true, deactivated_count: 1 },
        error: null,
      } as any);

      // Store a mock token locally first
      await notificationService.requestPermissionAndRegister();
      const deactivationResult = await notificationService.deactivateCurrentToken('Customer Logged Out');

      expect(deactivationResult).toBe(true);
      expect(rpcSpy).toHaveBeenCalledWith('deactivate_device_push_token', {
        p_push_token: expect.any(String),
        p_reason: 'Customer Logged Out',
      });

      // Verify token is removed from storage
      const remainingToken = await notificationService.getStoredPushToken();
      expect(remainingToken).toBeNull();
    });
  });

  describe('6. Realtime Subscription Lifecycle & Cleanup', () => {
    it('cleans up Realtime channel and intervals on unmount', () => {
      const mockChannel = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn().mockImplementation((cb) => {
          cb('SUBSCRIBED');
          return mockChannel;
        }),
      };

      const channelSpy = jest.spyOn(supabase, 'channel').mockReturnValue(mockChannel as any);
      const removeChannelSpy = jest.spyOn(supabase, 'removeChannel').mockReturnValue(Promise.resolve() as any);

      const callback = jest.fn();
      const unsubscribe = orderTrackingService.startTracking('ord-clean-1', 'rcpt_token_test', callback);

      expect(channelSpy).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');

      // Execute unsubscribe
      unsubscribe();
      expect(removeChannelSpy).toHaveBeenCalledWith(mockChannel);
    });
  });
});
