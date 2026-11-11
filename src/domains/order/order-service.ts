/**
 * Authoritative Order Service
 * Handles server-side order creation via PostgreSQL RPC and receipt retrieval.
 */

import { Config } from '../../config/env';
import { supabase } from '../../config/supabase';
import { CartState } from '../cart/cart-types';
import { OrderStatus, Order } from '../../types/order';
import { HALF_AND_HALF_OPTION_ID } from '../catalog/catalog-repository';
import { calculateOrderTotal, reconcileClientEstimateWithServer } from './order-calculator';
import { GuestReceiptStore } from './guest-receipt-store';

export interface CustomerCheckoutDetails {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryNotes?: string;
}

export interface AuthoritativeOrderResult {
  success: boolean;
  orderId: string;
  orderNumber: string;
  receiptToken: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  totalInKobo: number;
  status: OrderStatus;
  isRetry?: boolean;
  error?: string;
}

export interface CancelOrderResult {
  success: boolean;
  code?: string;
  message?: string;
  orderId?: string;
  orderNumber?: string;
  status?: OrderStatus;
  refundStatus?: string;
  cancelledAt?: string;
  error?: string;
}

export interface PriceDiscrepancyDetails {
  clientEstimated: number;
  serverAuthoritative: number;
  variance: number;
  clientSubtotal: number;
  serverSubtotal: number;
  clientDeliveryFee: number;
  serverDeliveryFee: number;
  orderId: string;
  orderNumber: string;
  receiptToken: string;
  totalInKobo: number;
  status: OrderStatus;
}

export interface CreateAuthoritativeOrderOptions {
  idempotencyKey?: string;
  acceptedAuthoritativeTotal?: number;
}

export class AuthoritativePriceDiscrepancyError extends Error {
  readonly clientEstimated: number;
  readonly serverAuthoritative: number;
  readonly variance: number;
  readonly details: PriceDiscrepancyDetails;

  constructor(
    detailsOrClientEstimated: PriceDiscrepancyDetails | number,
    serverAuthoritative?: number,
    variance?: number
  ) {
    let details: PriceDiscrepancyDetails;
    if (typeof detailsOrClientEstimated === 'object') {
      details = detailsOrClientEstimated;
    } else {
      const client = detailsOrClientEstimated;
      const server = serverAuthoritative ?? 0;
      const diff = variance ?? Math.abs(client - server);
      details = {
        clientEstimated: client,
        serverAuthoritative: server,
        variance: diff,
        clientSubtotal: client,
        serverSubtotal: server,
        clientDeliveryFee: 0,
        serverDeliveryFee: 0,
        orderId: '',
        orderNumber: '',
        receiptToken: '',
        totalInKobo: Math.round(server * 100),
        status: 'PENDING_PAYMENT',
      };
    }

    super(
      `Price Discrepancy: Cart estimate (₦${details.clientEstimated.toLocaleString()}) does not match server authoritative calculation (₦${details.serverAuthoritative.toLocaleString()}). Difference: ₦${details.variance.toLocaleString()}.`
    );
    this.name = 'AuthoritativePriceDiscrepancyError';
    this.clientEstimated = details.clientEstimated;
    this.serverAuthoritative = details.serverAuthoritative;
    this.variance = details.variance;
    this.details = details;
  }
}

export class OrderService {
  /**
   * Generates a collision-resistant idempotency key for order submission.
   */
  generateIdempotencyKey(): string {
    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 10);
    return `ayp_idem_${timestamp}_${randomHex}`;
  }

  /**
   * Submits an order through the authoritative database RPC.
   */
  async createAuthoritativeOrder(
    cartState: CartState,
    customer: CustomerCheckoutDetails,
    idempotencyKeyOrOptions?: string | CreateAuthoritativeOrderOptions
  ): Promise<AuthoritativeOrderResult> {
    if (cartState.items.length === 0) {
      throw new Error('Cannot submit an empty cart.');
    }

    if (!customer.customerName || customer.customerName.trim().length === 0) {
      throw new Error('Customer name is required.');
    }

    const cleanPhone = customer.customerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      throw new Error('A valid phone number (at least 10 digits) is required.');
    }

    if (cartState.fulfillmentType === 'delivery') {
      if (!cartState.selectedLandmark || !cartState.selectedLandmark.isActive) {
        throw new Error('A valid delivery landmark must be selected.');
      }
      if (!cartState.deliveryAddress || cartState.deliveryAddress.trim().length === 0) {
        throw new Error('Delivery address / hostel room number is required.');
      }
    }

    const options: CreateAuthoritativeOrderOptions =
      typeof idempotencyKeyOrOptions === 'object'
        ? idempotencyKeyOrOptions
        : { idempotencyKey: idempotencyKeyOrOptions };

    const finalIdempotencyKey = options.idempotencyKey || this.generateIdempotencyKey();

    // Map items for the PostgreSQL RPC
    const rpcItems = cartState.items.map((item) => {
      const optionIds: string[] = [];

      // 1. Process regular customizations
      for (const c of item.customizations) {
        if (c.optionId === HALF_AND_HALF_OPTION_ID || c.optionId.startsWith('half-')) {
          if (!optionIds.includes(HALF_AND_HALF_OPTION_ID)) {
            optionIds.push(HALF_AND_HALF_OPTION_ID);
          }
        } else if (c.optionId && c.optionId.trim().length > 0) {
          if (!optionIds.includes(c.optionId)) {
            optionIds.push(c.optionId);
          }
        }
      }

      // 2. If halfSecondaryFlavor is present, ensure HALF_AND_HALF_OPTION_ID is included
      if (item.halfSecondaryFlavor && !optionIds.includes(HALF_AND_HALF_OPTION_ID)) {
        optionIds.push(HALF_AND_HALF_OPTION_ID);
      }

      return {
        product_id: item.productId,
        size_id: item.sizeId || null,
        quantity: item.quantity,
        half_secondary_flavor: item.halfSecondaryFlavor || null,
        special_instructions: item.specialInstructions || null,
        customizations: optionIds.map((id) => ({ option_id: id })),
      };
    });

    // Production safety
    if (Config.isProduction) {
      if (Config.supabaseUrl.includes('placeholder')) {
        throw new Error('[OrderService] Cannot create live orders with placeholder Supabase URL.');
      }
    }

    // Call Supabase RPC
    try {
      const { data, error } = await (supabase.rpc as any)('create_order_authoritative', {
        p_fulfillment_type: cartState.fulfillmentType,
        p_landmark_id: cartState.fulfillmentType === 'delivery' ? cartState.selectedLandmark?.id : null,
        p_delivery_address: cartState.fulfillmentType === 'delivery' ? cartState.deliveryAddress : null,
        p_delivery_notes: customer.deliveryNotes || null,
        p_guest_email: customer.customerEmail || null,
        p_guest_phone: customer.customerPhone,
        p_guest_name: customer.customerName,
        p_idempotency_key: finalIdempotencyKey,
        p_items: rpcItems,
      });

      if (!error && data && data.success) {
        const serverTotal = Number(data.total);
        const serverSubtotal = Number(data.subtotal);
        const serverDeliveryFee = Number(data.delivery_fee);
        const totalInKobo = Number(data.total_in_kobo) || Math.round(serverTotal * 100);

        const reconciliation = reconcileClientEstimateWithServer(cartState.estimatedTotal, serverTotal);
        const isExplicitlyAccepted =
          options.acceptedAuthoritativeTotal !== undefined &&
          Math.abs(options.acceptedAuthoritativeTotal - serverTotal) < 0.01;

        if (!reconciliation.matches && !isExplicitlyAccepted) {
          throw new AuthoritativePriceDiscrepancyError({
            clientEstimated: cartState.estimatedTotal,
            serverAuthoritative: serverTotal,
            variance: reconciliation.variance,
            clientSubtotal: cartState.subtotal,
            serverSubtotal,
            clientDeliveryFee: cartState.deliveryFee,
            serverDeliveryFee,
            orderId: data.order_id,
            orderNumber: data.order_number,
            receiptToken: data.receipt_token,
            totalInKobo,
            status: data.status as OrderStatus,
          });
        }

        return {
          success: true,
          orderId: data.order_id,
          orderNumber: data.order_number,
          receiptToken: data.receipt_token,
          subtotal: serverSubtotal,
          deliveryFee: serverDeliveryFee,
          total: serverTotal,
          totalInKobo,
          status: data.status as OrderStatus,
          isRetry: data.is_retry,
        };
      }

      if (error && Config.isProduction) {
        throw new Error(`Order creation failed on database: ${error.message}`);
      }
    } catch (err: any) {
      if (err instanceof AuthoritativePriceDiscrepancyError) {
        throw err;
      }
      if (Config.isProduction) {
        throw err;
      }
    }

    // Development / Offline Fallback Simulation
    // Provides full offline testability and development preview
    const calculated = calculateOrderTotal({
      items: cartState.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        sizeId: i.sizeId,
        sizeName: i.sizeName,
        sizePrice: i.sizePrice,
        basePrice: i.basePrice,
        quantity: i.quantity,
        customizations: i.customizations,
        halfSecondaryFlavor: i.halfSecondaryFlavor,
        specialInstructions: i.specialInstructions,
      })),
      fulfillmentType: cartState.fulfillmentType,
      deliveryFee: cartState.fulfillmentType === 'delivery' ? cartState.deliveryFee : 0,
    });

    const mockOrderId = `ord-mock-${Date.now().toString(36)}`;
    const mockOrderNum = `AYP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
    const mockReceiptToken = `rcpt_${Math.random().toString(36).substring(2)}${Date.now()}`;

    const offlineReconciliation = reconcileClientEstimateWithServer(cartState.estimatedTotal, calculated.total);
    const isExplicitlyAcceptedOffline =
      options.acceptedAuthoritativeTotal !== undefined &&
      Math.abs(options.acceptedAuthoritativeTotal - calculated.total) < 0.01;

    if (!offlineReconciliation.matches && !isExplicitlyAcceptedOffline) {
      throw new AuthoritativePriceDiscrepancyError({
        clientEstimated: cartState.estimatedTotal,
        serverAuthoritative: calculated.total,
        variance: offlineReconciliation.variance,
        clientSubtotal: cartState.subtotal,
        serverSubtotal: calculated.subtotal,
        clientDeliveryFee: cartState.deliveryFee,
        serverDeliveryFee: calculated.deliveryFee,
        orderId: mockOrderId,
        orderNumber: mockOrderNum,
        receiptToken: mockReceiptToken,
        totalInKobo: calculated.totalInKobo,
        status: 'PENDING_PAYMENT',
      });
    }

    return {
      success: true,
      orderId: mockOrderId,
      orderNumber: mockOrderNum,
      receiptToken: mockReceiptToken,
      subtotal: calculated.subtotal,
      deliveryFee: calculated.deliveryFee,
      total: calculated.total,
      totalInKobo: calculated.totalInKobo,
      status: 'PENDING_PAYMENT',
    };
  }

  /**
   * Retrieves an order receipt authoritatively using the unguessable receipt token
   * or active authenticated user session.
   * If receiptToken is omitted, attempts automatic recovery from hardware-backed SecureStore.
   */
  async getOrderReceipt(
    orderId: string,
    receiptToken?: string
  ): Promise<{ success: boolean; order?: Order; error?: string }> {
    if (!orderId) {
      return { success: false, error: 'Order ID is required.' };
    }

    let effectiveToken = receiptToken ? receiptToken.trim() : '';

    // If receiptToken is missing, attempt recovery from hardware-backed SecureStore
    if (!effectiveToken) {
      try {
        const stored = await GuestReceiptStore.getReceipt(orderId);
        if (stored?.receiptToken) {
          effectiveToken = stored.receiptToken.trim();
        }
      } catch {
        // Fallback: Check if user has an active authenticated session
      }
    }

    // If still no token, verify whether caller is an authenticated user
    if (!effectiveToken) {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.user?.id) {
          return { success: false, error: 'Order ID and Receipt Token are required.' };
        }
      } catch {
        return { success: false, error: 'Order ID and Receipt Token are required.' };
      }
    }

    try {
      const { data, error } = await (supabase.rpc as any)('get_order_by_receipt', {
        p_order_id: orderId,
        p_receipt_token: effectiveToken || '',
      });

      if (error) {
        return { success: false, error: error.message || 'Database error retrieving order.' };
      }

      if (data) {
        if (data.success && data.order) {
          return { success: true, order: normalizeOrder(data.order) };
        }
        return { success: false, error: data.error || 'Receipt not found.' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error retrieving order.' };
    }

    return { success: false, error: 'Receipt not found.' };
  }

  /**
   * Fetches all orders belonging to an authenticated customer.
   * Scoped strictly by `customer_id` via Supabase RLS policies.
   */
  async getCustomerOrders(
    customerId: string
  ): Promise<{ success: boolean; orders: Order[]; error?: string }> {
    if (!customerId) {
      return { success: true, orders: [] };
    }

    try {
      const { data, error } = await (supabase
        .from('orders') as any)
        .select(`
          *,
          items:order_items (
            *,
            customizations:order_item_customizations (*)
          ),
          events:order_status_events (*)
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, orders: [], error: error.message || 'Failed to fetch customer orders.' };
      }

      const orders = (data || []).map(normalizeOrder);
      return { success: true, orders };
    } catch (err: any) {
      return { success: false, orders: [], error: err.message || 'Network error fetching customer orders.' };
    }
  }

  /**
   * Authoritatively cancels an order on behalf of a customer.
   * Customer cancellation is strictly permitted only while the order is in CONFIRMED state.
   */
  async cancelOrderByCustomer(
    orderId: string,
    receiptToken?: string,
    reason?: string
  ): Promise<CancelOrderResult> {
    if (!orderId) {
      return { success: false, error: 'Order ID is required.' };
    }

    let effectiveToken = receiptToken ? receiptToken.trim() : '';
    if (!effectiveToken) {
      try {
        const stored = await GuestReceiptStore.getReceipt(orderId);
        if (stored?.receiptToken) {
          effectiveToken = stored.receiptToken.trim();
        }
      } catch {
        // Fallback
      }
    }

    try {
      const { data, error } = await (supabase.rpc as any)('cancel_order_by_customer', {
        p_order_id: orderId,
        p_receipt_token: effectiveToken || null,
        p_reason: reason || null,
      });

      if (error) {
        if (
          error.code === 'PGRST202' ||
          (error.message && error.message.includes('cancel_order_by_customer'))
        ) {
          return {
            success: false,
            error:
              'Order cancellation service is currently undergoing database update. Please call store dispatch at 0913 385 5334 to cancel immediately.',
          };
        }
        return { success: false, error: error.message || 'Database error cancelling order.' };
      }

      if (data) {
        if (data.success) {
          return {
            success: true,
            code: data.code,
            message: data.message,
            orderId: data.order_id,
            orderNumber: data.order_number,
            status: data.status,
            refundStatus: data.refund_status,
            cancelledAt: data.cancelled_at,
          };
        }
        return {
          success: false,
          code: data.code,
          error: data.message || 'Could not cancel order.',
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error cancelling order.' };
    }

    return { success: false, error: 'Cancellation failed.' };
  }
}

export function normalizeOrder(raw: any): Order {
  if (!raw) return raw;
  return {
    id: raw.id,
    orderNumber: raw.order_number || raw.orderNumber || '',
    customerId: raw.customer_id || raw.customerId || null,
    guestName: raw.guest_name || raw.guestName || null,
    guestPhone: raw.guest_phone || raw.guestPhone || null,
    guestEmail: raw.guest_email || raw.guestEmail || null,
    fulfillmentType: raw.fulfillment_type || raw.fulfillmentType || 'pickup',
    landmarkName: raw.landmark_name || raw.landmarkName || null,
    deliveryAddress: raw.delivery_address || raw.deliveryAddress || null,
    deliveryNotes: raw.delivery_notes || raw.deliveryNotes || null,
    subtotal: Number(raw.subtotal ?? 0),
    deliveryFee: Number(raw.delivery_fee ?? raw.deliveryFee ?? 0),
    discountAmount: Number(raw.discount_amount ?? raw.discountAmount ?? 0),
    total: Number(raw.total ?? 0),
    status: raw.status,
    version: raw.version ?? 1,
    refundStatus: raw.refund_status || raw.refundStatus || 'NONE',
    rejectionReason: raw.rejection_reason || raw.rejectionReason || null,
    acceptedAt: raw.accepted_at || raw.acceptedAt || null,
    preparedAt: raw.prepared_at || raw.preparedAt || null,
    readyAt: raw.ready_at || raw.readyAt || null,
    inTransitAt: raw.in_transit_at || raw.inTransitAt || null,
    completedAt: raw.completed_at || raw.completedAt || null,
    staffNotes: raw.staff_notes || raw.staffNotes || null,
    assignedStaffId: raw.assigned_staff_id || raw.assignedStaffId || null,
    paymentReference: raw.payment_reference || raw.paymentReference || null,
    items: (raw.items || []).map((item: any) => ({
      id: item.id,
      productId: item.product_id || item.productId,
      productName: item.product_name || item.productName,
      sizeName: item.size_name || item.sizeName,
      sizePrice: Number(item.size_price ?? item.sizePrice ?? 0),
      quantity: item.quantity,
      basePrice: Number(item.unit_base_price ?? item.basePrice ?? 0),
      itemTotal: Number(item.item_total ?? item.itemTotal ?? 0),
      halfSecondaryFlavor: item.half_secondary_flavor || item.halfSecondaryFlavor,
      specialInstructions: item.special_instructions || item.specialInstructions,
      customizations: (item.customizations || []).map((c: any) => ({
        optionId: c.option_id || c.optionId,
        optionName: c.option_name || c.optionName,
        price: Number(c.price ?? 0),
      })),
    })),
    events: (raw.events || []).map((e: any) => ({
      id: e.id,
      orderId: e.order_id || e.orderId,
      previousStatus: e.previous_status || e.previousStatus || null,
      newStatus: e.new_status || e.newStatus,
      version: e.version ?? 1,
      title: e.title || '',
      description: e.description || '',
      createdAt: e.created_at || e.createdAt,
    })),
    idempotencyKey: raw.idempotency_key || raw.idempotencyKey || '',
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
  };
}

export const orderService = new OrderService();
