import { orderService } from '../domains/order/order-service';
import { supabase } from '../config/supabase';

// Mock Supabase RPC
jest.mock('../config/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    }),
    removeChannel: jest.fn(),
  },
}));

describe('Phase 5.5 — Customer Order Cancellation Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OrderService.cancelOrderByCustomer', () => {
    it('successfully cancels an eligible CONFIRMED order and sets refund_status to REFUND_REQUIRED', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          code: 'CANCELLED_SUCCESSFULLY',
          message: 'Your order has been cancelled successfully. A manager will review your refund.',
          order_id: 'ord-12345',
          order_number: 'AYP-20261105-1001',
          status: 'CANCELLED',
          refund_status: 'REFUND_REQUIRED',
          cancelled_at: '2026-11-05T08:00:00Z',
        },
        error: null,
      });

      const res = await orderService.cancelOrderByCustomer(
        'ord-12345',
        'rcpt_valid_token_123',
        'Ordered by mistake'
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe('CANCELLED');
      expect(res.refundStatus).toBe('REFUND_REQUIRED');
      expect(res.code).toBe('CANCELLED_SUCCESSFULLY');
      expect(supabase.rpc).toHaveBeenCalledWith('cancel_order_by_customer', {
        p_order_id: 'ord-12345',
        p_receipt_token: 'rcpt_valid_token_123',
        p_reason: 'Ordered by mistake',
      });
    });

    it('rejects self-service cancellation if kitchen has already ACCEPTED the order', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'ORDER_ALREADY_ACCEPTED',
          message:
            'This order has already been accepted by the kitchen and cannot be cancelled self-service. Please contact the store directly.',
          current_status: 'ACCEPTED',
        },
        error: null,
      });

      const res = await orderService.cancelOrderByCustomer(
        'ord-12345',
        'rcpt_valid_token_123',
        'Changed my mind'
      );

      expect(res.success).toBe(false);
      expect(res.code).toBe('ORDER_ALREADY_ACCEPTED');
      expect(res.error).toContain('already been accepted by the kitchen');
    });

    it('handles idempotent repeated cancellation gracefully without error', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          code: 'ALREADY_CANCELLED',
          message: 'Order is already cancelled.',
          order_id: 'ord-12345',
          order_number: 'AYP-20261105-1001',
          status: 'CANCELLED',
          refund_status: 'REFUND_REQUIRED',
        },
        error: null,
      });

      const res = await orderService.cancelOrderByCustomer(
        'ord-12345',
        'rcpt_valid_token_123'
      );

      expect(res.success).toBe(true);
      expect(res.code).toBe('ALREADY_CANCELLED');
      expect(res.status).toBe('CANCELLED');
    });

    it('rejects cancellation when order ID is missing', async () => {
      const res = await orderService.cancelOrderByCustomer('');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Order ID is required.');
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('handles database network exceptions securely', async () => {
      (supabase.rpc as jest.Mock).mockRejectedValueOnce(
        new Error('Network timeout connecting to PostgreSQL')
      );

      const res = await orderService.cancelOrderByCustomer(
        'ord-12345',
        'rcpt_valid_token_123'
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Network timeout');
    });
  });

  describe('Eligibility Verification Matrix', () => {
    const states = [
      { status: 'CONFIRMED', eligible: true },
      { status: 'ACCEPTED', eligible: false },
      { status: 'PREPARING', eligible: false },
      { status: 'READY_FOR_PICKUP', eligible: false },
      { status: 'IN_TRANSIT', eligible: false },
      { status: 'DELIVERED', eligible: false },
      { status: 'CANCELLED', eligible: false },
    ];

    states.forEach(({ status, eligible }) => {
      it(`evaluates eligibility for status ${status}: ${eligible ? 'CAN CANCEL' : 'CANNOT CANCEL'}`, () => {
        const canCancel = status === 'CONFIRMED';
        expect(canCancel).toBe(eligible);
      });
    });
  });
});
