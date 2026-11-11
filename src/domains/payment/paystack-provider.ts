/**
 * Paystack Payment Provider Implementation
 * Follows official Paystack API specifications and converts amounts to kobo.
 */

import { Config } from '../../config/env';
import { supabase } from '../../config/supabase';
import {
  PaymentProvider,
  PaymentInitializationParams,
  PaymentInitializationResult,
  PaymentVerificationResult,
  PaymentVerificationOutcome,
  StagingSimulationParams,
} from './payment-types';

export class PaystackProvider implements PaymentProvider {
  readonly gatewayName = 'paystack';

  /**
   * Initializes a transaction with Paystack.
   * Calculations use integer kobo (Naira * 100).
   */
  async initializePayment(
    params: PaymentInitializationParams
  ): Promise<PaymentInitializationResult> {
    if (params.amount <= 0) {
      throw new Error(`Invalid transaction amount: ₦${params.amount}. Must be greater than zero.`);
    }

    const amountInKobo = Math.round(params.amount * 100);
    const sanitizedOrderNum = params.orderNumber.replace(/[^a-zA-Z0-9]/g, '_');
    const reference = `ay_ord_${sanitizedOrderNum}_${Date.now()}`;

    // Production safety check
    if (Config.isProduction) {
      if (Config.supabaseUrl.includes('placeholder')) {
        throw new Error('[PaystackProvider] Cannot initialize live payment with placeholder Supabase credentials.');
      }
      if (Config.paystackPublicKey.includes('placeholder')) {
        throw new Error('[PaystackProvider] Cannot initialize live payment with placeholder Paystack key.');
      }
    }

    // Attempt backend initialization via Supabase Edge Function
    try {
      const { data, error } = await supabase.functions.invoke('paystack-init', {
        body: {
          orderId: params.orderId,
          receiptToken: params.receiptToken,
        },
      });

      if (!error && data && data.success) {
        return {
          success: true,
          authorizationUrl: data.authorizationUrl,
          accessCode: data.accessCode,
          reference: data.reference,
          amount: params.amount,
          amountInKobo,
        };
      }

      if (error && Config.isProduction) {
        return {
          success: false,
          reference,
          amount: params.amount,
          amountInKobo,
          error: error.message || 'Payment initialization failed on server.',
        };
      }
    } catch (err: any) {
      if (Config.isProduction) {
        return {
          success: false,
          reference,
          amount: params.amount,
          amountInKobo,
          error: err.message || 'Network error initializing payment.',
        };
      }
    }

    // Non-production fallback URL for offline testing shells
    const sandboxAuthorizationUrl = `https://checkout.paystack.com/sandbox-mock-${reference}`;
    const sandboxAccessCode = `acc_${Math.random().toString(36).substring(2, 10)}`;

    return {
      success: true,
      authorizationUrl: sandboxAuthorizationUrl,
      accessCode: sandboxAccessCode,
      reference,
      amount: params.amount,
      amountInKobo,
    };
  }

  /**
   * Verifies transaction status independently with the backend.
   * Strictly enforces server-authoritative settlement: never returns fake success.
   */
  async verifyPayment(
    reference: string,
    orderId?: string,
    receiptToken?: string
  ): Promise<PaymentVerificationResult> {
    if (!reference || reference.trim().length === 0) {
      throw new Error('Transaction reference is required for verification.');
    }

    try {
      const { data, error } = await supabase.functions.invoke('paystack-verify', {
        body: {
          reference: reference.trim(),
          orderId: orderId?.trim(),
          receiptToken: receiptToken?.trim(),
        },
      });

      // 1. Authoritative Server-Side Settlement Confirmation
      if (!error && data && data.success) {
        return {
          success: true,
          outcome: 'SUCCESS',
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          status: data.status || 'CONFIRMED',
          paymentReference: reference,
          channel: data.channel || 'card',
          alreadySettled: data.alreadySettled,
        };
      }

      // 2. Explicit Non-Success Response from Backend
      if (data) {
        const rawStatus = (data.status || '').toLowerCase();
        if (rawStatus === 'pending' || rawStatus === 'ongoing' || rawStatus === 'processing') {
          return {
            success: false,
            outcome: 'PENDING',
            paymentReference: reference,
            error: data.message || 'Payment is still processing with your bank or Paystack.',
          };
        }

        if (rawStatus === 'abandoned' || rawStatus === 'failed' || data.success === false) {
          return {
            success: false,
            outcome: 'FAILED',
            paymentReference: reference,
            error: data.message || data.error || 'Payment was cancelled or declined by processor.',
          };
        }
      }

      // 3. Error from Supabase Edge Function Call
      if (error) {
        const errorMsg = error.message || 'Payment verification failed on server.';
        const lower = errorMsg.toLowerCase();
        let outcome: PaymentVerificationOutcome = 'UNKNOWN';

        if (lower.includes('pending') || lower.includes('ongoing') || lower.includes('processing')) {
          outcome = 'PENDING';
        } else if (
          lower.includes('declined') ||
          lower.includes('transaction failed') ||
          lower.includes('payment failed') ||
          lower.includes('not found') ||
          lower.includes('cancelled') ||
          lower.includes('rejected')
        ) {
          outcome = 'FAILED';
        }

        return {
          success: false,
          outcome,
          paymentReference: reference,
          error: errorMsg,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        outcome: 'UNKNOWN',
        paymentReference: reference,
        error: err.message || 'Network error verifying payment.',
      };
    }

    // 4. Default Inconclusive Outcome
    return {
      success: false,
      outcome: 'UNKNOWN',
      paymentReference: reference,
      error: 'Payment verification was inconclusive. Your order remains safely preserved.',
    };
  }

  /**
   * Secure Staging-Only Payment Simulation (QA / Internal Testing)
   * Strictly disallowed in production mode.
   * Calls the server-side paystack-simulate Edge Function to execute settle_order_payment.
   */
  async simulateStagingPayment(
    params: StagingSimulationParams
  ): Promise<PaymentVerificationResult> {
    if (Config.isProduction) {
      throw new Error('Payment simulation is strictly forbidden in production mode.');
    }

    if (!params.orderId) {
      throw new Error('Order ID is required for simulation.');
    }

    try {
      const { data, error } = await supabase.functions.invoke('paystack-simulate', {
        body: {
          orderId: params.orderId.trim(),
          receiptToken: params.receiptToken?.trim(),
        },
      });

      if (!error && data && data.success) {
        return {
          success: true,
          outcome: 'SUCCESS',
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          status: data.status || 'CONFIRMED',
          paymentReference: data.paymentReference,
          channel: 'qa_simulator',
          simulated: true,
        };
      }

      return {
        success: false,
        outcome: 'FAILED',
        paymentReference: '',
        error: error?.message || data?.error || 'Staging payment simulation was rejected by server.',
      };
    } catch (err: any) {
      return {
        success: false,
        outcome: 'UNKNOWN',
        paymentReference: '',
        error: err.message || 'Network error executing staging simulation.',
      };
    }
  }
}

export const paystackProvider = new PaystackProvider();
