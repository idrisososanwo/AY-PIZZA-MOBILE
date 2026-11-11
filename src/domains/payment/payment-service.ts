/**
 * Payment Service Coordinator
 * Orchestrates payment provider interactions, currency formatting, and state safety.
 */

import {
  PaymentProvider,
  PaymentInitializationParams,
  PaymentInitializationResult,
  PaymentVerificationResult,
  StagingSimulationParams,
} from './payment-types';
import { paystackProvider } from './paystack-provider';
import { Config } from '../../config/env';

export class PaymentService {
  private provider: PaymentProvider;

  constructor(provider: PaymentProvider = paystackProvider) {
    this.provider = provider;
  }

  setProvider(provider: PaymentProvider): void {
    this.provider = provider;
  }

  getGatewayName(): string {
    return this.provider.gatewayName;
  }

  /**
   * Initializes payment with the configured provider.
   */
  async initializePayment(params: PaymentInitializationParams): Promise<PaymentInitializationResult> {
    return this.provider.initializePayment(params);
  }

  /**
   * Independently verifies payment status with the backend.
   */
  async verifyPayment(reference: string, orderId?: string, receiptToken?: string): Promise<PaymentVerificationResult> {
    return this.provider.verifyPayment(reference, orderId, receiptToken);
  }

  /**
   * Secure Staging-Only Payment Simulation (QA / Internal Testing)
   * Strictly disallowed in production mode.
   */
  async simulateStagingPayment(params: StagingSimulationParams): Promise<PaymentVerificationResult> {
    if (Config.isProduction) {
      throw new Error('Payment simulation is strictly forbidden in production mode.');
    }
    if (this.provider.simulateStagingPayment) {
      return this.provider.simulateStagingPayment(params);
    }
    throw new Error('Payment simulation is not supported by the configured payment provider.');
  }

  /**
   * Converts amount in Naira to integer Kobo without float rounding bugs.
   */
  toKobo(amountInNaira: number): number {
    return Math.round(amountInNaira * 100);
  }

  /**
   * Formats a Naira amount for display (e.g. ₦12,500).
   */
  formatNaira(amount: number): string {
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
}

export const paymentService = new PaymentService();
