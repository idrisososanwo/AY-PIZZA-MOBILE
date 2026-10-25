/**
 * Kitchen Display System (KDS) Service
 * Manages staff order retrieval, Realtime subscriptions, reconnection recovery,
 * and atomic server-side state transitions.
 */

import { supabase } from '../../config/supabase';
import { OrderStatus } from '../../types/order';
import { KdsOrder, TransitionOrderResult } from './kds-types';
import { RealtimeChannel } from '@supabase/supabase-js';

export type KdsConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

export type KdsSubscriber = (orders: KdsOrder[]) => void;
export type KdsConnectionSubscriber = (status: KdsConnectionState) => void;
export type KdsNewOrderSubscriber = (order: KdsOrder) => void;

class KdsService {
  private orders: Map<string, KdsOrder> = new Map();
  private subscribers: Set<KdsSubscriber> = new Set();
  private connectionSubscribers: Set<KdsConnectionSubscriber> = new Set();
  private newOrderSubscribers: Set<KdsNewOrderSubscriber> = new Set();
  private channel: RealtimeChannel | null = null;
  private connectionState: KdsConnectionState = 'DISCONNECTED';
  private isSyncing = false;
  private lastProcessedUpdate: Map<string, string> = new Map(); // id -> updatedAt ISO

  /**
   * Fetch live orders for KDS
   */
  async fetchActiveOrders(statuses: OrderStatus[] = ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']): Promise<KdsOrder[]> {
    this.isSyncing = true;
    try {
      // 1. Try server-side get_kds_orders RPC
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('get_kds_orders', {
        p_statuses: statuses,
      });

      if (!rpcError && Array.isArray(rpcData)) {
        this.updateLocalStore(rpcData);
        return this.getSortedOrders();
      }

      // 2. Fallback direct table query if RPC not present in environment
      const { data: tableData, error: tableError } = await (supabase as any)
        .from('orders')
        .select(`
          id,
          order_number,
          status,
          fulfillment_type,
          landmark_name,
          delivery_address,
          delivery_notes,
          subtotal,
          delivery_fee,
          total,
          guest_name,
          guest_phone,
          rejection_reason,
          staff_notes,
          assigned_staff_id,
          created_at,
          updated_at,
          accepted_at,
          prepared_at,
          ready_at,
          completed_at,
          order_items (
            id,
            product_name,
            size_name,
            quantity,
            unit_base_price,
            item_total,
            half_secondary_flavor,
            flavors,
            special_instructions,
            order_item_customizations (
              id,
              option_name,
              price
            )
          )
        `)
        .in('status', statuses)
        .order('created_at', { ascending: true });

      if (tableError) {
        console.warn('[KdsService] Error fetching orders:', tableError.message);
        return this.getSortedOrders();
      }

      if (tableData) {
        const mappedOrders: KdsOrder[] = tableData.map((row: any) => ({
          id: row.id,
          orderNumber: row.order_number,
          status: row.status,
          fulfillmentType: row.fulfillment_type,
          landmarkName: row.landmark_name,
          deliveryAddress: row.delivery_address,
          deliveryNotes: row.delivery_notes,
          subtotal: Number(row.subtotal),
          deliveryFee: Number(row.delivery_fee),
          total: Number(row.total),
          guestName: row.guest_name,
          guestPhone: row.guest_phone,
          rejectionReason: row.rejection_reason,
          staffNotes: row.staff_notes,
          assignedStaffId: row.assigned_staff_id,
          version: Number(row.version ?? 1),
          refundStatus: row.refund_status ?? 'NOT_APPLICABLE',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          acceptedAt: row.accepted_at,
          preparedAt: row.prepared_at,
          readyAt: row.ready_at,
          completedAt: row.completed_at,
          items: (row.order_items || []).map((oi: any) => ({
            id: oi.id,
            productName: oi.product_name,
            sizeName: oi.size_name,
            quantity: oi.quantity,
            unitBasePrice: Number(oi.unit_base_price),
            itemTotal: Number(oi.item_total),
            halfSecondaryFlavor: oi.half_secondary_flavor,
            flavors: oi.flavors,
            specialInstructions: oi.special_instructions,
            customizations: (oi.order_item_customizations || []).map((oic: any) => ({
              id: oic.id,
              optionName: oic.option_name,
              price: Number(oic.price),
            })),
          })),
        }));

        this.updateLocalStore(mappedOrders);
      }

      return this.getSortedOrders();
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Start Supabase Realtime channel subscription with automatic reconnection
   */
  subscribeToRealtime(onNewOrder?: KdsNewOrderSubscriber): () => void {
    if (onNewOrder) {
      this.newOrderSubscribers.add(onNewOrder);
    }

    if (this.channel) {
      return () => {
        if (onNewOrder) this.newOrderSubscribers.delete(onNewOrder);
      };
    }

    this.setConnectionState('CONNECTING');

    this.channel = supabase
      .channel('kds-live-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        async (payload: any) => {
          this.handleRealtimeEvent(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.setConnectionState('CONNECTED');
          // Perform full synchronization after connecting/reconnecting
          this.fetchActiveOrders();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.setConnectionState('RECONNECTING');
        }
      });

    return () => {
      if (onNewOrder) {
        this.newOrderSubscribers.delete(onNewOrder);
      }
    };
  }

  /**
   * Handle incoming Realtime event with deduplication
   */
  async handleRealtimeEvent(payload: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'DELETE' && oldRecord?.id) {
      this.orders.delete(oldRecord.id);
      this.notifySubscribers();
      return;
    }

    // Deduplication check: check version counter first, fallback to timestamp
    const existing = this.orders.get(newRecord.id);
    if (existing && newRecord.version !== undefined && newRecord.version <= existing.version) {
      return;
    }

    const lastUpdate = this.lastProcessedUpdate.get(newRecord.id);
    if (lastUpdate && newRecord.updated_at && new Date(newRecord.updated_at) <= new Date(lastUpdate)) {
      return;
    }

    if (newRecord.updated_at) {
      this.lastProcessedUpdate.set(newRecord.id, newRecord.updated_at);
    }

    const isNowConfirmed = newRecord.status === 'CONFIRMED';

    // If new incoming order arrived
    if (!existing && isNowConfirmed) {
      // Re-fetch full details to include joined items & customizations
      await this.fetchSingleOrder(newRecord.id, true);
      return;
    }

    if (existing) {
      // Fast in-place status and version update
      existing.status = newRecord.status;
      existing.version = newRecord.version ?? (existing.version + 1);
      existing.refundStatus = newRecord.refund_status ?? existing.refundStatus;
      existing.updatedAt = newRecord.updated_at;
      existing.rejectionReason = newRecord.rejection_reason ?? existing.rejectionReason;
      existing.acceptedAt = newRecord.accepted_at ?? existing.acceptedAt;
      existing.preparedAt = newRecord.prepared_at ?? existing.preparedAt;
      existing.readyAt = newRecord.ready_at ?? existing.readyAt;
      existing.completedAt = newRecord.completed_at ?? existing.completedAt;
      existing.staffNotes = newRecord.staff_notes ?? existing.staffNotes;
      this.notifySubscribers();
    } else {
      // Order not in local store, fetch full record
      await this.fetchSingleOrder(newRecord.id, false);
    }
  }

  /**
   * Fetch a single order with items and notify
   */
  async fetchSingleOrder(orderId: string, isNewlyIncoming: boolean): Promise<KdsOrder | null> {
    try {
      const { data, error } = await (supabase as any)
        .from('orders')
        .select(`
          id,
          order_number,
          status,
          fulfillment_type,
          landmark_name,
          delivery_address,
          delivery_notes,
          subtotal,
          delivery_fee,
          total,
          guest_name,
          guest_phone,
          rejection_reason,
          staff_notes,
          assigned_staff_id,
          created_at,
          updated_at,
          accepted_at,
          prepared_at,
          ready_at,
          completed_at,
          order_items (
            id,
            product_name,
            size_name,
            quantity,
            unit_base_price,
            item_total,
            half_secondary_flavor,
            flavors,
            special_instructions,
            order_item_customizations (
              id,
              option_name,
              price
            )
          )
        `)
        .eq('id', orderId)
        .single();

      if (error || !data) return null;

      const order: KdsOrder = {
        id: data.id,
        orderNumber: data.order_number,
        status: data.status,
        fulfillmentType: data.fulfillment_type,
        landmarkName: data.landmark_name,
        deliveryAddress: data.delivery_address,
        deliveryNotes: data.delivery_notes,
        subtotal: Number(data.subtotal),
        deliveryFee: Number(data.delivery_fee),
        total: Number(data.total),
        guestName: data.guest_name,
        guestPhone: data.guest_phone,
        rejectionReason: data.rejection_reason,
        staffNotes: data.staff_notes,
        assignedStaffId: data.assigned_staff_id,
        version: Number(data.version ?? 1),
        refundStatus: data.refund_status ?? 'NOT_APPLICABLE',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        acceptedAt: data.accepted_at,
        preparedAt: data.prepared_at,
        readyAt: data.ready_at,
        completedAt: data.completed_at,
        items: (data.order_items || []).map((oi: any) => ({
          id: oi.id,
          productName: oi.product_name,
          sizeName: oi.size_name,
          quantity: oi.quantity,
          unitBasePrice: Number(oi.unit_base_price),
          itemTotal: Number(oi.item_total),
          halfSecondaryFlavor: oi.half_secondary_flavor,
          flavors: oi.flavors,
          specialInstructions: oi.special_instructions,
          customizations: (oi.order_item_customizations || []).map((oic: any) => ({
            id: oic.id,
            optionName: oic.option_name,
            price: Number(oic.price),
          })),
        })),
      };

      this.orders.set(order.id, order);
      this.notifySubscribers();

      if (isNewlyIncoming) {
        this.newOrderSubscribers.forEach((cb) => cb(order));
      }

      return order;
    } catch {
      return null;
    }
  }

  /**
   * Atomic Server-Side Order Transition
   */
  async transitionOrderStatus(params: {
    orderId: string;
    targetStatus: OrderStatus;
    reason?: string;
    notes?: string;
    expectedCurrentStatus?: OrderStatus;
  }): Promise<TransitionOrderResult> {
    const { orderId, targetStatus, reason, notes, expectedCurrentStatus } = params;

    // Optimistically check in local store
    const local = this.orders.get(orderId);
    if (expectedCurrentStatus && local && local.status !== expectedCurrentStatus) {
      return {
        success: false,
        code: 'CONCURRENT_MODIFICATION',
        message: `Order status was already changed to ${local.status}`,
        currentStatus: local.status,
      };
    }

    try {
      const { data, error } = await (supabase.rpc as any)('transition_order_status', {
        p_order_id: orderId,
        p_target_status: targetStatus,
        p_reason: reason || null,
        p_notes: notes || null,
        p_expected_current_status: expectedCurrentStatus || null,
      });

      if (error) {
        return {
          success: false,
          code: error.code || 'RPC_ERROR',
          message: error.message || 'Failed to update order status on server.',
        };
      }

      const result = data as TransitionOrderResult;

      if (result.success && local) {
        local.status = targetStatus;
        local.version = result.version ?? (local.version + 1);
        if (result.refundStatus) {
          local.refundStatus = result.refundStatus as any;
        }
        local.updatedAt = new Date().toISOString();
        if (targetStatus === 'ACCEPTED') local.acceptedAt = local.updatedAt;
        if (targetStatus === 'PREPARING') local.preparedAt = local.updatedAt;
        if (targetStatus === 'READY_FOR_PICKUP') local.readyAt = local.updatedAt;
        if (targetStatus === 'DELIVERED') local.completedAt = local.updatedAt;
        if (targetStatus === 'CANCELLED') {
          local.rejectionReason = reason;
          if (['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT'].includes(local.status)) {
            local.refundStatus = 'REFUND_REQUIRED';
          }
        }
        if (notes) local.staffNotes = notes;
        this.notifySubscribers();
      } else if (!result.success && result.currentStatus && local) {
        local.status = result.currentStatus;
        if (result.version) local.version = result.version;
        this.notifySubscribers();
      }

      return result;
    } catch (err: any) {
      return {
        success: false,
        code: 'NETWORK_OR_SERVER_ERROR',
        message: err?.message || 'Error communicating with database server.',
      };
    }
  }

  // --- Store & Subscription Helpers ---

  private updateLocalStore(ordersList: KdsOrder[]) {
    this.orders.clear();
    for (const order of ordersList) {
      this.orders.set(order.id, order);
      this.lastProcessedUpdate.set(order.id, order.updatedAt);
    }
    this.notifySubscribers();
  }

  getSortedOrders(): KdsOrder[] {
    return Array.from(this.orders.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  subscribe(callback: KdsSubscriber): () => void {
    this.subscribers.add(callback);
    callback(this.getSortedOrders());
    return () => this.subscribers.delete(callback);
  }

  subscribeConnection(callback: KdsConnectionSubscriber): () => void {
    this.connectionSubscribers.add(callback);
    callback(this.connectionState);
    return () => this.connectionSubscribers.delete(callback);
  }

  private setConnectionState(state: KdsConnectionState) {
    this.connectionState = state;
    this.connectionSubscribers.forEach((cb) => cb(state));
  }

  private notifySubscribers() {
    const list = this.getSortedOrders();
    this.subscribers.forEach((cb) => cb(list));
  }

  disconnect() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.setConnectionState('DISCONNECTED');
  }
}

export const kdsService = new KdsService();
