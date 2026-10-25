/**
 * Payment and Financial Transaction Types
 */

export type PaymentGateway = 'paystack';

export type PaymentMethod = 'card' | 'bank_transfer' | 'ussd' | 'apple_pay' | 'cash_on_pickup';

export type PaymentTransactionStatus = 'initialized' | 'pending' | 'success' | 'failed' | 'reversed';

export interface PaymentTransaction {
  id: string;
  orderId: string;
  gateway: PaymentGateway;
  reference: string;          // Paystack transaction reference
  amount: number;             // Amount in NGN
  amountInKobo: number;       // Amount in Kobo (Naira * 100)
  currency: 'NGN';
  status: PaymentTransactionStatus;
  channel?: PaymentMethod | null;
  paidAt?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaystackInitResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}
