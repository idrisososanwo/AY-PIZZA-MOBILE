/**
 * AY Pizza — Customer Realtime Order Tracking Service
 * 
 * Manages Supabase Realtime WebSocket subscriptions, monotonic version validation,
 * authoritative re-fetching, and connection resilience with polling fallback.
 * 
 * Security & Reliability Rules:
 * 1. Single-Order Scoping: Subscribes strictly to `postgres_changes` where `id=eq.${orderId}`.
 * 2. Monotonic Versioning: Stale or duplicate events (`version <= currentVersion`) are discarded.
 * 3. Authoritative Re-fetch: Realtime payloads are treated as signals, not truth. An authorized
 *    database query via `getOrderReceipt` is executed to re-fetch verified data.
 * 4. Guest Receipt Isolation: Guests track exclusively via authenticated receipt-token polling.
 *    If an order has no authenticated owner session, Realtime channels are torn down to avoid
 *    dead subscriptions suppressed by PostgreSQL RLS.
 * 5. Reconnection & Polling Fallback: Periodic polling (10s) ensures delivery even during network drop.
 * 6. Terminal State Shutdown: Polling and WebSocket subscriptions are cleanly stopped upon reaching
 *    terminal status (DELIVERED or CANCELLED).
 */

import { supabase } from '../../config/supabase';
import { Order, OrderStatus } from '../../types/order';
import { orderService } from './order-service';

export interface TrackingState {
  order: Order | null;
  isLoading: boolean;
  isRealtimeConnected: boolean;
  trackingMode?: 'realtime' | 'polling' | 'terminal';
  error: string | null;
}

export type TrackingUpdateCallback = (state: TrackingState) => void;

export class OrderTrackingService {
  /**
   * Begins authoritative tracking of an order with Supabase Realtime and polling fallback.
   * Returns a cleanup function that must be called on unmount or navigation away.
   */
  startTracking(
    orderId: string,
    receiptToken: string,
    onUpdate: TrackingUpdateCallback
  ): () => void {
    if (!orderId) {
      onUpdate({
        order: null,
        isLoading: false,
        isRealtimeConnected: false,
        trackingMode: 'polling',
        error: 'Order ID is required for tracking.',
      });
      return () => {};
    }

    let isDisposed = false;
    let currentOrder: Order | null = null;
    let isRealtimeConnected = false;
    let pollIntervalId: any = null;
    let realtimeChannel: any = null;

    // Helper to safely broadcast state updates
    const emitState = (isLoading: boolean = false, error: string | null = null) => {
      if (isDisposed) return;
      const isTerminal = currentOrder?.status === 'DELIVERED' || currentOrder?.status === 'CANCELLED';
      onUpdate({
        order: currentOrder,
        isLoading,
        isRealtimeConnected,
        trackingMode: isTerminal ? 'terminal' : isRealtimeConnected ? 'realtime' : 'polling',
        error,
      });
    };

    const cleanupResources = () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
      if (realtimeChannel) {
        try {
          supabase.removeChannel(realtimeChannel);
        } catch {
          // Channel removal error ignored
        }
        realtimeChannel = null;
      }
      isRealtimeConnected = false;
    };

    // Authoritative fetch function
    const fetchAuthoritativeOrder = async (isInitial: boolean = false) => {
      try {
        if (isInitial) emitState(true, null);

        const result = await orderService.getOrderReceipt(orderId, receiptToken);
        if (isDisposed) return;

        if (result.success && result.order) {
          const incomingOrder = result.order;
          const incomingVersion = incomingOrder.version ?? 1;
          const existingVersion = currentOrder?.version ?? 0;

          // Monotonic check: Ensure state never regresses
          if (!currentOrder || incomingVersion >= existingVersion) {
            currentOrder = incomingOrder;
            emitState(false, null);

            // If terminal state reached, stop polling and close subscription immediately
            if (incomingOrder.status === 'DELIVERED' || incomingOrder.status === 'CANCELLED') {
              cleanupResources();
              emitState(false, null);
              return;
            }
          }

          // DEF-42-05: Realtime Authorization Scoping check
          // Verify if caller is the authenticated owner of the order.
          // In Supabase, RLS suppresses Realtime row changes if auth.uid() doesn't match orders policy.
          // If caller is an unauthenticated guest, teardown the Realtime channel and rely strictly on receipt polling.
          try {
            const { data } = await supabase.auth.getSession();
            const session = data?.session;
            const isAuthenticatedOwner = Boolean(
              session?.user?.id && incomingOrder.customerId && session.user.id === incomingOrder.customerId
            );

            if (!isAuthenticatedOwner && realtimeChannel) {
              try {
                supabase.removeChannel(realtimeChannel);
              } catch {}
              realtimeChannel = null;
              isRealtimeConnected = false;
              emitState(false, null);
            }
          } catch {
            // Ignore session check error
          }
        } else if (isInitial) {
          emitState(false, result.error || 'Unable to retrieve order details.');
        }
      } catch (err: any) {
        if (!isDisposed && isInitial) {
          emitState(false, err.message || 'Network error fetching order.');
        }
      }
    };

    // 1. Initial Authoritative Load
    fetchAuthoritativeOrder(true);

    // 2. Setup Supabase Realtime Channel
    const channelName = `order_live_${orderId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now().toString(36)}`;
    realtimeChannel = supabase.channel(channelName);

    realtimeChannel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload: any) => {
          if (isDisposed) return;

          const incomingVersion = payload.new?.version ?? 0;
          const existingVersion = currentOrder?.version ?? 0;

          // Monotonic check: Drop stale or duplicate events
          if (incomingVersion <= existingVersion && existingVersion > 0) {
            return;
          }

          // Authoritative re-fetch
          fetchAuthoritativeOrder(false);
        }
      )
      .subscribe((status: string) => {
        if (isDisposed) return;

        if (status === 'SUBSCRIBED') {
          isRealtimeConnected = true;
          emitState(false, null);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          isRealtimeConnected = false;
          emitState(false, null);
          // On disconnect, perform an authoritative re-fetch
          fetchAuthoritativeOrder(false);
        }
      });

    // 3. Fallback Periodic Polling (Every 10 seconds for active orders)
    pollIntervalId = setInterval(() => {
      if (!isDisposed) {
        // Only poll if not already at terminal state
        if (currentOrder?.status !== 'DELIVERED' && currentOrder?.status !== 'CANCELLED') {
          fetchAuthoritativeOrder(false);
        }
      }
    }, 10000);

    // Cleanup function
    return () => {
      isDisposed = true;
      cleanupResources();
    };
  }
}

export const orderTrackingService = new OrderTrackingService();
