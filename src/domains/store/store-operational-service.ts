/**
 * Store Operational Safeguards Service
 * AY Pizza & Ice Cream — Phase 6.0
 *
 * Provides database-backed opening hours evaluation, temporary closure checks,
 * independent fulfillment suspension, and secure refund lifecycle management.
 */

import { supabase } from '../../config/supabase';
import { FulfillmentType } from '../../types/delivery';
import { Brand } from '../../constants/brand';

export interface StoreOperationalStatusResult {
  canOrder: boolean;
  isOpen: boolean;
  isEnforced: boolean;
  code: string;
  message: string;
  dayOfWeek?: number;
  openTime?: string;
  closeTime?: string;
  reopenAt?: string | null;
  currentTimeLagos?: string;
}

export interface RefundInitiationResult {
  success: boolean;
  code?: string;
  message?: string;
  refundId?: string;
  orderId?: string;
  orderNumber?: string;
  paymentReference?: string;
  amountInKobo?: number;
  amount?: number;
  status?: string;
  isRetry?: boolean;
}

export interface RefundOutcomeResult {
  success: boolean;
  code?: string;
  message?: string;
  refundRecordId?: string;
  orderId?: string;
  status?: string;
}

export class StoreOperationalService {
  /**
   * Evaluates store operational status against database configuration and Lagos time.
   */
  async checkOperationalStatus(fulfillmentType: FulfillmentType): Promise<StoreOperationalStatusResult> {
    try {
      const { data, error } = await (supabase.rpc as any)('check_store_operational_status', {
        p_fulfillment_type: fulfillmentType,
      });

      if (!error && data) {
        return {
          canOrder: Boolean(data.can_order),
          isOpen: Boolean(data.is_open),
          isEnforced: Boolean(data.is_enforced),
          code: data.code || (data.can_order ? 'OK' : 'STORE_CLOSED'),
          message: data.message || '',
          dayOfWeek: data.day_of_week,
          openTime: data.open_time,
          closeTime: data.close_time,
          reopenAt: data.reopen_at,
          currentTimeLagos: data.current_time_lagos,
        };
      }
    } catch {
      // Offline / fallback calculation
    }

    // Client-side fallback computation using Brand constants
    return this.evaluateOfflineOperationalStatus(fulfillmentType);
  }

  /**
   * Offline / fallback operational status computation using Lagos time (UTC+1).
   */
  evaluateOfflineOperationalStatus(fulfillmentType: FulfillmentType): StoreOperationalStatusResult {
    // Current UTC timestamp
    const now = new Date();
    // Lagos is UTC+1 (WAT)
    const lagosMillis = now.getTime() + 60 * 60 * 1000;
    const lagosDate = new Date(lagosMillis);
    const dayOfWeek = lagosDate.getUTCDay();
    const hours = lagosDate.getUTCHours();
    const minutes = lagosDate.getUTCMinutes();
    const currentDecimalTime = hours + minutes / 60;

    const openDecimal = Brand.operatingHours.openHour; // 10:00 AM
    const closeDecimal = Brand.operatingHours.closeHour; // 09:00 PM

    const isWithinHours = currentDecimalTime >= openDecimal && currentDecimalTime < closeDecimal;

    // Provisional hours are not enforced by default pending owner confirmation
    return {
      canOrder: true,
      isOpen: isWithinHours,
      isEnforced: false,
      code: isWithinHours ? 'OK' : 'OFF_HOURS_UNENFORCED',
      message: isWithinHours
        ? 'AY Pizza is open and accepting orders.'
        : `Currently outside provisional hours (10:00 AM - 09:00 PM WAT). Unenforced pending owner confirmation.`,
      dayOfWeek,
      openTime: `${openDecimal}:00:00`,
      closeTime: `${closeDecimal}:00:00`,
      currentTimeLagos: lagosDate.toISOString(),
    };
  }

  /**
   * Initiates an order refund record through the server-authoritative RPC.
   * Restricted to authorized Manager or Administrator.
   */
  async initiateOrderRefund(params: {
    orderId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<RefundInitiationResult> {
    const { orderId, reason, idempotencyKey } = params;

    if (!orderId || !reason || !idempotencyKey) {
      return {
        success: false,
        code: 'INVALID_PARAMETERS',
        message: 'Order ID, reason, and idempotency key are required.',
      };
    }

    try {
      const { data, error } = await (supabase.rpc as any)('initiate_order_refund', {
        p_order_id: orderId,
        p_reason: reason.trim(),
        p_idempotency_key: idempotencyKey.trim(),
      });

      if (error) {
        return {
          success: false,
          code: error.code || 'RPC_ERROR',
          message: error.message || 'Failed to initiate refund on server.',
        };
      }

      return {
        success: Boolean(data?.success),
        code: data?.code,
        message: data?.message,
        refundId: data?.refund_id,
        orderId: data?.order_id,
        orderNumber: data?.order_number,
        paymentReference: data?.payment_reference,
        amountInKobo: data?.amount_in_kobo,
        amount: data?.amount,
        status: data?.status,
        isRetry: data?.is_retry,
      };
    } catch (err: any) {
      return {
        success: false,
        code: 'NETWORK_OR_SERVER_ERROR',
        message: err?.message || 'Error communicating with refund service.',
      };
    }
  }

  /**
   * Records the outcome of a server-side refund execution.
   * Restricted to Admin or Service Role.
   */
  async recordRefundOutcome(params: {
    refundRecordId: string;
    success: boolean;
    gatewayRefundId?: string;
    gatewayResponse?: Record<string, unknown>;
    errorMessage?: string;
  }): Promise<RefundOutcomeResult> {
    const { refundRecordId, success, gatewayRefundId, gatewayResponse, errorMessage } = params;

    try {
      const { data, error } = await (supabase.rpc as any)('record_refund_outcome', {
        p_refund_record_id: refundRecordId,
        p_success: success,
        p_gateway_refund_id: gatewayRefundId || null,
        p_gateway_response: gatewayResponse || null,
        p_error_message: errorMessage || null,
      });

      if (error) {
        return {
          success: false,
          code: error.code || 'RPC_ERROR',
          message: error.message || 'Failed to record refund outcome on server.',
        };
      }

      return {
        success: Boolean(data?.success),
        code: data?.code,
        message: data?.message,
        refundRecordId: data?.refund_record_id,
        orderId: data?.order_id,
        status: data?.status,
      };
    } catch (err: any) {
      return {
        success: false,
        code: 'NETWORK_OR_SERVER_ERROR',
        message: err?.message || 'Error communicating with refund service.',
      };
    }
  }
}

export const storeOperationalService = new StoreOperationalService();

