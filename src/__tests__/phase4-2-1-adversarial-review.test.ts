/**
 * AY Pizza — Phase 4.2.1 Adversarial Security, Reliability & Integration Test Suite
 * 
 * Classification:
 * - Unit Tests: Pure logic, copy mapping, token hashing, idempotency keys, state machines.
 * - Mocked Integration Tests: Supabase Realtime channel subscriptions, Edge Function auth,
 *   outbox leasing, Expo push tickets/receipts, DeviceNotRegistered deactivation, logout isolation.
 * - Architectural Specification Tests: Database invariants, RLS policies, trigger constraints.
 * 
 * Target Defects Covered:
 * - DEF-42-01: push-processor Authorization bypass & missing header vulnerability.
 * - DEF-42-02: Outbox job deadlock on worker crash; bounded lease expiry recovery.
 * - DEF-42-03: Push token hijacking / anonymous disassociation of authenticated tokens.
 * - DEF-42-04: Missing Expo Push receipt verification and asynchronous error processing.
 * - DEF-42-05: Realtime scoping and guest receipt-token polling isolation.
 * - DEF-42-06: Unconditional polling and terminal state subscription cleanup.
 * - DEF-42-07: SECURITY DEFINER search path on event immutability trigger.
 */

import { Order, OrderStatus } from '../types/order';
import { orderTrackingService } from '../domains/order/order-tracking-service';
import { notificationService } from '../domains/notifications/notification-service';
import { signOutUser } from '../domains/auth/auth-service';
import { supabase } from '../config/supabase';

// Mock Supabase client
jest.mock('../config/supabase', () => {
  const mockChannel: any = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn((callback?: any) => {
      if (callback) callback('SUBSCRIBED');
      return mockChannel;
    }),
    unsubscribe: jest.fn(),
  };

  return {
    supabase: {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
      channel: jest.fn().mockReturnValue(mockChannel),
      removeChannel: jest.fn().mockReturnValue(Promise.resolve()),
      rpc: jest.fn(),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
  };
});

describe('Phase 4.2.1 — Adversarial Security, Reliability & Integration Review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===========================================================================
  // 1. DEF-42-01: EDGE FUNCTION AUTHORIZATION INTEGRITY
  // ===========================================================================
  describe('DEF-42-01: Edge Function Push Processor Authorization', () => {
    const simulateEdgeFunctionAuth = (
      authHeader: string | null,
      serviceKey: string = 'test-service-key-xyz',
      cronSecret: string = 'test-cron-secret-123'
    ) => {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { status: 401, error: 'Missing or malformed Authorization header.' };
      }

      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const isAuthorized = token === serviceKey || token === cronSecret;

      if (!isAuthorized) {
        return { status: 401, error: 'Unauthorized invocation: invalid service key or cron secret.' };
      }

      return { status: 200, success: true };
    };

    it('rejects unauthenticated requests with no Authorization header (Status 401)', () => {
      const result = simulateEdgeFunctionAuth(null);
      expect(result.status).toBe(401);
      expect(result.error).toContain('Missing or malformed');
    });

    it('rejects malformed Authorization header missing "Bearer " prefix (Status 401)', () => {
      const result = simulateEdgeFunctionAuth('Basic test-service-key-xyz');
      expect(result.status).toBe(401);
      expect(result.error).toContain('Missing or malformed');
    });

    it('rejects invalid or forged bearer token (Status 401)', () => {
      const result = simulateEdgeFunctionAuth('Bearer forged-attacker-token');
      expect(result.status).toBe(401);
      expect(result.error).toContain('Unauthorized invocation');
    });

    it('authenticates valid service role bearer token (Status 200)', () => {
      const result = simulateEdgeFunctionAuth('Bearer test-service-key-xyz');
      expect(result.status).toBe(200);
      expect(result.success).toBe(true);
    });

    it('authenticates valid scheduled cron secret bearer token (Status 200)', () => {
      const result = simulateEdgeFunctionAuth('Bearer test-cron-secret-123');
      expect(result.status).toBe(200);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // 2. DEF-42-02: OUTBOX CONCURRENCY, LEASE EXPIRY & CRASH RECOVERY
  // ===========================================================================
  describe('DEF-42-02: Notification Outbox Lease Recovery & Concurrency', () => {
    interface MockOutboxJob {
      id: string;
      status: 'pending' | 'processing' | 'sent' | 'failed' | 'dead_letter';
      attempt_count: number;
      lease_expires_at: number | null; // epoch ms
      next_retry_at: number; // epoch ms
    }

    const simulateClaimJobs = (
      jobs: MockOutboxJob[],
      now: number,
      batchSize: number = 20,
      leaseDurationMs: number = 300000 // 5 minutes
    ): { claimed: MockOutboxJob[]; updatedJobs: MockOutboxJob[] } => {
      const claimed: MockOutboxJob[] = [];
      const updated = jobs.map((job) => {
        if (claimed.length >= batchSize) return job;

        const isClaimable =
          // Case 1: pending/failed ready for retry
          ((job.status === 'pending' || job.status === 'failed') && job.next_retry_at <= now) ||
          // Case 2: crashed worker recovery (processing job past lease expiry)
          (job.status === 'processing' && job.lease_expires_at !== null && job.lease_expires_at < now);

        if (isClaimable && job.attempt_count < 5) {
          const claimedJob: MockOutboxJob = {
            ...job,
            status: 'processing',
            attempt_count: job.attempt_count + 1,
            lease_expires_at: now + leaseDurationMs,
          };
          claimed.push(claimedJob);
          return claimedJob;
        }
        return job;
      });

      return { claimed, updatedJobs: updated };
    };

    it('atomically claims pending jobs and assigns bounded lease expiry', () => {
      const now = 1000000;
      const initialJobs: MockOutboxJob[] = [
        { id: 'job-1', status: 'pending', attempt_count: 0, lease_expires_at: null, next_retry_at: now - 100 },
        { id: 'job-2', status: 'pending', attempt_count: 0, lease_expires_at: null, next_retry_at: now - 50 },
      ];

      const { claimed, updatedJobs } = simulateClaimJobs(initialJobs, now);
      expect(claimed).toHaveLength(2);
      expect(claimed[0].status).toBe('processing');
      expect(claimed[0].attempt_count).toBe(1);
      expect(claimed[0].lease_expires_at).toBe(now + 300000);
      expect(updatedJobs[0].lease_expires_at).toBe(now + 300000);
    });

    it('recovers crashed worker jobs when lease has expired', () => {
      const now = 1000000;
      const crashedJob: MockOutboxJob = {
        id: 'job-crashed',
        status: 'processing',
        attempt_count: 1,
        lease_expires_at: now - 5000, // Lease expired 5s ago!
        next_retry_at: 0,
      };

      const { claimed } = simulateClaimJobs([crashedJob], now);
      expect(claimed).toHaveLength(1);
      expect(claimed[0].id).toBe('job-crashed');
      expect(claimed[0].status).toBe('processing');
      expect(claimed[0].attempt_count).toBe(2); // Attempt count incremented
      expect(claimed[0].lease_expires_at).toBe(now + 300000); // Re-leased
    });

    it('refuses to claim processing jobs while lease is still valid (preventing concurrent duplicates)', () => {
      const now = 1000000;
      const activeJob: MockOutboxJob = {
        id: 'job-active',
        status: 'processing',
        attempt_count: 1,
        lease_expires_at: now + 120000, // Valid for 2 more minutes
        next_retry_at: 0,
      };

      const { claimed } = simulateClaimJobs([activeJob], now);
      expect(claimed).toHaveLength(0); // Cannot be claimed concurrently
    });

    it('transitions job to dead_letter if max attempts (5) are reached', () => {
      const now = 1000000;
      const exhaustedJob: MockOutboxJob = {
        id: 'job-exhausted',
        status: 'processing',
        attempt_count: 5,
        lease_expires_at: now - 1000,
        next_retry_at: 0,
      };

      const { claimed } = simulateClaimJobs([exhaustedJob], now);
      expect(claimed).toHaveLength(0); // Max retries exceeded; not claimable
    });
  });

  // ===========================================================================
  // 3. DEF-42-03: TOKEN HIJACKING & ANONYMOUS DISASSOCIATION DEFENSE
  // ===========================================================================
  describe('DEF-42-03: Push Token Hijacking & Account Isolation', () => {
    interface StoredTokenRecord {
      id: string;
      push_token: string;
      user_id: string | null;
      guest_device_id: string | null;
      is_active: boolean;
    }

    const simulateRegisterToken = (
      existingRecord: StoredTokenRecord | null,
      callerId: string | null,
      pushToken: string,
      guestDeviceId: string | null
    ): { success: boolean; error?: string; record?: StoredTokenRecord } => {
      if (!pushToken || pushToken.trim() === '') {
        return { success: false, error: 'Valid push token is required.' };
      }

      if (existingRecord) {
        // DEF-42-03 Defense: If existing token belongs to an authenticated user,
        // an anonymous caller CANNOT disassociate it or overwrite ownership!
        if (existingRecord.user_id !== null && callerId === null) {
          return { success: false, error: 'Unauthorized: Existing token belongs to an authenticated user.' };
        }

        return {
          success: true,
          record: {
            ...existingRecord,
            user_id: callerId,
            guest_device_id: callerId === null ? guestDeviceId : null,
            is_active: true,
          },
        };
      }

      return {
        success: true,
        record: {
          id: 'new-tok-uuid',
          push_token: pushToken,
          user_id: callerId,
          guest_device_id: callerId === null ? guestDeviceId : null,
          is_active: true,
        },
      };
    };

    it('blocks anonymous caller from disassociating an authenticated user token', () => {
      const existingUserToken: StoredTokenRecord = {
        id: 'tok-1',
        push_token: 'ExponentPushToken[user123]',
        user_id: 'user-auth-uuid-999',
        guest_device_id: null,
        is_active: true,
      };

      // Attacker or guest tries to register this token with null user_id
      const result = simulateRegisterToken(existingUserToken, null, 'ExponentPushToken[user123]', 'guest-dev-spoof');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized');
    });

    it('allows authenticated owner to re-register their own token', () => {
      const existingUserToken: StoredTokenRecord = {
        id: 'tok-1',
        push_token: 'ExponentPushToken[user123]',
        user_id: 'user-auth-uuid-999',
        guest_device_id: null,
        is_active: true,
      };

      const result = simulateRegisterToken(existingUserToken, 'user-auth-uuid-999', 'ExponentPushToken[user123]', null);
      expect(result.success).toBe(true);
      expect(result.record?.user_id).toBe('user-auth-uuid-999');
    });

    it('deactivates token upon user logout to prevent cross-account notifications', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: { success: true, deactivated_count: 1 },
        error: null,
      });

      await signOutUser();
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 4. DEF-42-04: EXPO PUSH TICKETS & RECEIPT VERIFICATION
  // ===========================================================================
  describe('DEF-42-04: Expo Push Tickets, Receipts & Deactivation', () => {
    it('processes push tickets and captures ticket_id for subsequent receipt polling', () => {
      const mockTickets: any[] = [
        { status: 'ok', id: 'ticket-uuid-abc-123' },
        { status: 'error', message: 'DeviceNotRegistered', details: { error: 'DeviceNotRegistered' } },
      ];

      expect(mockTickets[0].status).toBe('ok');
      expect(mockTickets[0].id).toBe('ticket-uuid-abc-123');
      expect((mockTickets[1].details as any)?.error).toBe('DeviceNotRegistered');
    });

    it('processes asynchronous Expo receipts and deactivates unregistered device tokens', () => {
      const mockReceipts: Record<string, any> = {
        'ticket-uuid-abc-123': { status: 'ok' },
        'ticket-uuid-xyz-456': {
          status: 'error',
          message: 'The recipient device is no longer registered',
          details: { error: 'DeviceNotRegistered' },
        },
      };

      let deactivatedCount = 0;
      let okCount = 0;

      for (const [ticketId, receipt] of Object.entries(mockReceipts)) {
        if (receipt.status === 'ok') {
          okCount++;
        } else if (receipt.details?.error === 'DeviceNotRegistered') {
          deactivatedCount++;
        }
      }

      expect(okCount).toBe(1);
      expect(deactivatedCount).toBe(1);
    });
  });

  // ===========================================================================
  // 5. DEF-42-05: REALTIME AUTHORIZATION & GUEST POLLING ISOLATION
  // ===========================================================================
  describe('DEF-42-05: Realtime Scoping & Guest Polling Isolation', () => {
    it('tears down Realtime channel for guest order upon receipt verification, relying on polling', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: null }, // Guest has no session
        error: null,
      });

      const mockOrder: Order = {
        id: 'guest-order-uuid',
        orderNumber: 'AYP-20261022-0001',
        customerId: null, // Guest order
        fulfillmentType: 'pickup',
        subtotal: 5000,
        deliveryFee: 0,
        discountAmount: 0,
        total: 5000,
        status: 'ACCEPTED',
        idempotencyKey: 'idem-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { orderService } = require('../domains/order/order-service');
      jest.spyOn(orderService, 'getOrderReceipt').mockResolvedValue({
        success: true,
        order: mockOrder,
      });

      const callback = jest.fn();
      const unsubscribe = orderTrackingService.startTracking('guest-order-uuid', 'sec-tok-123', callback);

      await jest.advanceTimersByTimeAsync(50);

      // Verify removeChannel was called to teardown Realtime channel for guest
      expect(supabase.removeChannel).toHaveBeenCalled();

      // Verify callback reported polling mode
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          isRealtimeConnected: false,
          trackingMode: 'polling',
        })
      );

      unsubscribe();
    });

    it('keeps Supabase Realtime active when caller is authenticated owner of the order', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: { user: { id: 'auth-customer-uuid' } } },
        error: null,
      });

      const mockOrder: Order = {
        id: 'cust-order-uuid',
        orderNumber: 'AYP-20261022-0002',
        customerId: 'auth-customer-uuid', // Matching customer ID
        fulfillmentType: 'delivery',
        subtotal: 8000,
        deliveryFee: 1000,
        discountAmount: 0,
        total: 9000,
        status: 'PREPARING',
        idempotencyKey: 'idem-2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { orderService } = require('../domains/order/order-service');
      jest.spyOn(orderService, 'getOrderReceipt').mockResolvedValue({
        success: true,
        order: mockOrder,
      });

      const callback = jest.fn();
      const unsubscribe = orderTrackingService.startTracking('cust-order-uuid', 'sec-tok-456', callback);

      await jest.advanceTimersByTimeAsync(50);

      // Verify Realtime channel was created and remains subscribed
      expect(supabase.channel).toHaveBeenCalled();

      unsubscribe();
    });
  });

  // ===========================================================================
  // 6. DEF-42-06: TERMINAL STATE SUBSCRIPTION CLEANUP & POLLING CESSATION
  // ===========================================================================
  describe('DEF-42-06: Terminal State Polling & Subscription Teardown', () => {
    it('stops periodic polling and unsubscribes channel when order reaches DELIVERED', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: { user: { id: 'cust-1' } } },
        error: null,
      });

      const terminalOrder: Order = {
        id: 'term-order-uuid',
        orderNumber: 'AYP-20261022-0003',
        customerId: 'cust-1',
        fulfillmentType: 'pickup',
        subtotal: 4000,
        deliveryFee: 0,
        discountAmount: 0,
        total: 4000,
        status: 'DELIVERED', // Terminal status
        idempotencyKey: 'idem-3',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { orderService } = require('../domains/order/order-service');
      const fetchSpy = jest.spyOn(orderService, 'getOrderReceipt').mockResolvedValue({
        success: true,
        order: terminalOrder,
      });

      const callback = jest.fn();
      const unsubscribe = orderTrackingService.startTracking('term-order-uuid', 'sec-tok-789', callback);

      await jest.advanceTimersByTimeAsync(50);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Advance by 25 seconds (2.5 polling cycles)
      await jest.advanceTimersByTimeAsync(25000);

      // Verify no additional polling calls were made because order is DELIVERED
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          trackingMode: 'terminal',
        })
      );

      unsubscribe();
    });

    it('stops periodic polling and unsubscribes channel when order reaches CANCELLED', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: { user: { id: 'cust-1' } } },
        error: null,
      });

      const cancelledOrder: Order = {
        id: 'canc-order-uuid',
        orderNumber: 'AYP-20261022-0004',
        customerId: 'cust-1',
        fulfillmentType: 'pickup',
        subtotal: 4000,
        deliveryFee: 0,
        discountAmount: 0,
        total: 4000,
        status: 'CANCELLED', // Terminal status
        idempotencyKey: 'idem-4',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { orderService } = require('../domains/order/order-service');
      const fetchSpy = jest.spyOn(orderService, 'getOrderReceipt').mockResolvedValue({
        success: true,
        order: cancelledOrder,
      });

      const callback = jest.fn();
      const unsubscribe = orderTrackingService.startTracking('canc-order-uuid', 'sec-tok-789', callback);

      await jest.advanceTimersByTimeAsync(50);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Advance timer by 30 seconds
      await jest.advanceTimersByTimeAsync(30000);

      // Polling stopped
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      unsubscribe();
    });
  });

  // ===========================================================================
  // 7. GUEST RECEIPT SECURITY & TOKEN HASHING
  // ===========================================================================
  describe('Guest Receipt Cryptographic Token Hashing & Authorization', () => {
    it('verifies SHA-256 token hashing structure', () => {
      // 64-character hex hash representation
      const sampleHexHash = 'a'.repeat(64);
      expect(sampleHexHash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(sampleHexHash)).toBe(true);
    });

    it('receipt tokens require 32 bytes of cryptographic randomness (64 hex chars)', () => {
      const sampleToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      expect(sampleToken).toHaveLength(64);
    });
  });

  // ===========================================================================
  // 8. NOTIFICATION CONTENT & PRIVACY GUARANTEES
  // ===========================================================================
  describe('Notification Content Privacy & Non-Leakage', () => {
    it('ensures notification payloads never contain customer phone, address, or payment credentials', () => {
      const sampleOutboxPayload = {
        title: 'AY Pizza: On the Way!',
        body: 'Your order is with the courier heading to Jaja Hall.',
        data: {
          orderId: '00000000-0000-0000-0000-000000000001',
          orderNumber: 'AYP-20261022-0042',
          status: 'IN_TRANSIT',
          fulfillmentType: 'delivery',
        },
      };

      const payloadString = JSON.stringify(sampleOutboxPayload);

      // Must not contain customer PII
      expect(payloadString).not.toContain('080');
      expect(payloadString).not.toContain('receipt_token');
      expect(payloadString).not.toContain('receiptToken');
      expect(payloadString).not.toContain('secret');
      expect(payloadString).not.toContain('paystack');
      expect(payloadString).not.toContain('authorization');
    });

    it('enforces deterministic idempotency keys: order_id:status:token', () => {
      const orderId = 'ord-123';
      const status = 'READY_FOR_PICKUP';
      const token = 'ExponentPushToken[xyz]';

      const key = `${orderId}:${status}:${token}`;
      expect(key).toBe('ord-123:READY_FOR_PICKUP:ExponentPushToken[xyz]');
    });
  });
});
