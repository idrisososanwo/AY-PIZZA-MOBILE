/**
 * Order Domain Types and State Machine
 */

import { FulfillmentType } from './delivery';

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'CONFIRMED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface SelectedCustomization {
  optionId: string;
  optionName: string;
  price: number;
}

export interface OrderItemInput {
  productId: string;
  productName: string;
  sizeId?: string;
  sizeName?: string;
  sizePrice?: number;
  quantity: number;
  basePrice: number;
  customizations: SelectedCustomization[];
  halfSecondaryFlavor?: string; // For Half & Half pizzas
  flavors?: string[];           // For milkshakes/ice creams (max 2)
  specialInstructions?: string;
}

export interface OrderItem extends OrderItemInput {
  id: string;
  orderId: string;
  itemTotal: number;
}

export interface CreateOrderPayload {
  customerId?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestName?: string | null;
  fulfillmentType: FulfillmentType;
  landmarkId?: string | null;
  landmarkName?: string | null;
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  deliveryFee: number;
  items: OrderItemInput[];
  idempotencyKey: string;
}

export interface Order {
  id: string;
  orderNumber: string;        // Human-readable (e.g. AYP-20261021-0042)
  customerId?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestName?: string | null;
  fulfillmentType: FulfillmentType;
  landmarkId?: string | null;
  landmarkName?: string | null;
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  total: number;
  status: OrderStatus;
  paymentReference?: string | null;
  idempotencyKey: string;
  rejectionReason?: string | null;
  acceptedAt?: string | null;
  preparedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  staffNotes?: string | null;
  assignedStaffId?: string | null;
  version?: number;
  refundStatus?: 'NOT_APPLICABLE' | 'REFUND_REQUIRED' | 'REFUND_PENDING' | 'REFUNDED';
  items?: OrderItem[];
  events?: OrderStatusEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderStatusEvent {
  id: string;
  orderId?: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  version: number;
  actorType?: string;
  title: string;
  description: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

