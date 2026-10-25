/**
 * Authoritative Order Service
 * Handles server-side order creation via PostgreSQL RPC and receipt retrieval.
 */

import { Config } from '../../config/env';
import { supabase } from '../../config/supabase';
import { CartState, CartItem } from '../cart/cart-types';
import { OrderStatus, Order } from '../../types/order';
import { calculateOrderTotal, reconcileClientEstimateWithServer } from './order-calculator';

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

export class AuthoritativePriceDiscrepancyError extends Error {
  readonly clientEstimated: number;
  readonly serverAuthoritative: number;
  readonly variance: number;

  constructor(clientEstimated: number, serverAuthoritative: number, variance: number) {
    super(
      `Price Discrepancy: Cart estimate (₦${clientEstimated.toLocaleString()}) does not match server authoritative calculation (₦${serverAuthoritative.toLocaleString()}). Difference: ₦${variance.toLocaleString()}.`
    );
    this.name = 'AuthoritativePriceDiscrepancyError';
    this.clientEstimated = clientEstimated;
    this.serverAuthoritative = serverAuthoritative;
    this.variance = variance;
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
    idempotencyKey?: string
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

    const finalIdempotencyKey = idempotencyKey || this.generateIdempotencyKey();

    // Map items for the PostgreSQL RPC
    const rpcItems = cartState.items.map((item) => ({
      product_id: item.productId,
      size_id: item.sizeId || null,
      quantity: item.quantity,
      half_secondary_flavor: item.halfSecondaryFlavor || null,
      special_instructions: item.specialInstructions || null,
      customizations: item.customizations
        .filter((c) => !c.optionId.startsWith('half-'))
        .map((c) => ({ option_id: c.optionId })),
    }));

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
        const reconciliation = reconcileClientEstimateWithServer(cartState.estimatedTotal, serverTotal);

        if (!reconciliation.matches) {
          throw new AuthoritativePriceDiscrepancyError(
            cartState.estimatedTotal,
            serverTotal,
            reconciliation.variance
          );
        }

        return {
          success: true,
          orderId: data.order_id,
          orderNumber: data.order_number,
          receiptToken: data.receipt_token,
          subtotal: Number(data.subtotal),
          deliveryFee: Number(data.delivery_fee),
          total: serverTotal,
          totalInKobo: data.total_in_kobo || Math.round(serverTotal * 100),
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
   * Retrieves an order receipt authoritatively using the unguessable receipt token.
   */
  async getOrderReceipt(orderId: string, receiptToken: string): Promise<{ success: boolean; order?: Order; error?: string }> {
    if (!orderId || !receiptToken) {
      return { success: false, error: 'Order ID and Receipt Token are required.' };
    }

    try {
      const { data, error } = await (supabase.rpc as any)('get_order_by_receipt', {
        p_order_id: orderId,
        p_receipt_token: receiptToken,
      });

      if (!error && data && data.success && data.order) {
        return { success: true, order: normalizeOrder(data.order) };
      }
    } catch (err: any) {
      if (Config.isProduction) {
        return { success: false, error: err.message };
      }
    }

    return { success: false, error: 'Receipt not found.' };
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
