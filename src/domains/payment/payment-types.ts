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

export type PaymentVerificationOutcome = 'SUCCESS' | 'FAILED' | 'PENDING' | 'UNKNOWN';

export interface PaymentVerificationResult {
  success: boolean;
  outcome?: PaymentVerificationOutcome;
  orderId?: string;
  orderNumber?: string;
  status?: OrderStatus;
  paymentReference: string;
  amountInKobo?: number;
  channel?: string;
  error?: string;
  alreadySettled?: boolean;
  simulated?: boolean;
}

export interface StagingSimulationParams {
  orderId: string;
  receiptToken?: string;
}

/**
 * Payment Provider Abstraction
 * Decouples the application from any specific payment gateway.
 */
export interface PaymentProvider {
  readonly gatewayName: string;
  initializePayment(params: PaymentInitializationParams): Promise<PaymentInitializationResult>;
  verifyPayment(reference: string, orderId?: string, receiptToken?: string): Promise<PaymentVerificationResult>;
  simulateStagingPayment?(params: StagingSimulationParams): Promise<PaymentVerificationResult>;
}
