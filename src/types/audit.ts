/**
 * Audit Logging and Security Event Types
 */

export type AuditAction =
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_INITIALIZED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_FAILED'
  | 'INVENTORY_TOGGLED'
  | 'PRICE_MODIFIED'
  | 'USER_ROLE_CHANGED'
  | 'SECURITY_EVENT';

export interface AuditRecord {
  id?: string;
  action: AuditAction;
  performedBy?: string | null; // User ID or 'system' / 'paystack_webhook'
  targetType: 'order' | 'payment' | 'product' | 'user' | 'system';
  targetId: string;
  details: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt?: string;
}
