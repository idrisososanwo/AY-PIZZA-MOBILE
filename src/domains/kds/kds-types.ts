/**
 * Kitchen Display System (KDS) Types and Contracts
 */

import { OrderStatus } from '../../types/order';
import { FulfillmentType } from '../../types/delivery';

export interface KdsItemCustomization {
  id: string;
  optionName: string;
  price: number;
}

export interface KdsOrderItem {
  id: string;
  productName: string;
  sizeName?: string | null;
  quantity: number;
  unitBasePrice: number;
  itemTotal: number;
  halfSecondaryFlavor?: string | null;
  flavors?: string[] | null;
  specialInstructions?: string | null;
  customizations: KdsItemCustomization[];
}

export interface KdsOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  landmarkName?: string | null;
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  guestName?: string | null;
  guestPhone?: string | null;
  rejectionReason?: string | null;
  staffNotes?: string | null;
  assignedStaffId?: string | null;
  version: number;
  refundStatus: 'NOT_APPLICABLE' | 'REFUND_REQUIRED' | 'REFUND_PENDING' | 'REFUNDED';
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string | null;
  preparedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  items: KdsOrderItem[];
}

export type KdsLane = 'incoming' | 'accepted' | 'preparing' | 'ready' | 'transit' | 'completed' | 'cancelled';

export interface TransitionOrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  previousStatus?: OrderStatus;
  newStatus?: OrderStatus;
  version?: number;
  refundStatus?: string;
  code?: string;
  message?: string;
  currentStatus?: OrderStatus;
}
