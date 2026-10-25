/**
 * Payment Domain Types and Provider Abstraction
 */

import { OrderStatus } from '../../types/order';

export interface PaymentInitializationParams {
  orderId: string;
  orderNumber: string;
  amount: number;         // In NGN
  amountInKobo: number;   // In Kobo (NGN * 100)
  email: string;
  receiptToken: string;
  customerName?: string;
  customerPhone?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentInitializationResult {
  success: boolean;
  authorizationUrl?: string;
  accessCode?: string;
  reference: string;
  amount: number;
  amountInKobo: number;
  error?: string;
}

export interface PaymentVerificationResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  status?: OrderStatus;
  paymentReference: string;
  amountInKobo?: number;
  channel?: string;
  error?: string;
  alreadySettled?: boolean;
}

/**
 * Payment Provider Abstraction
 * Decouples the application from any specific payment gateway.
 */
export interface PaymentProvider {
  readonly gatewayName: string;
  initializePayment(params: PaymentInitializationParams): Promise<PaymentInitializationResult>;
  verifyPayment(reference: string): Promise<PaymentVerificationResult>;
}
