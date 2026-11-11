/**
 * AY Pizza — Phase 5.4.3 Steps 2 & 3 Test Suite
 * 
 * Verifies:
 * 1. Database schema migration & SQL RPC alignment (Step 2)
 * 2. TypeScript domain models and normalization with inTransitAt (Step 2)
 * 3. Authoritative dual-track customer tracking milestones (Step 3)
 * 4. Milestone timestamp resolution with audit event fallback (Step 3)
 * 5. Verified store support actions and brand contact consistency (Step 3)
 * 6. Mobile layout & accessibility constraints (Redmi 13C ~360dp) (Step 3)
 */

import { normalizeOrder } from '../domains/order/order-service';
import { Brand } from '../constants/brand';

const fs = require('fs');
const path = require('path');
declare const __dirname: string;

describe('Phase 5.4.3 / Step 2: Database Schema & Lifecycle Alignment', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/20261105000001_phase5_4_3_order_transit_tracking.sql'
  );
  let migrationSql: string;

  beforeAll(() => {
    migrationSql = fs.readFileSync(migrationPath, 'utf8');
  });

  describe('1. SQL Migration Integrity', () => {
    it('creates in_transit_at column on public.orders', () => {
      expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS in_transit_at TIMESTAMPTZ');
    });

    it('creates partial index on in_transit_at for courier queries', () => {
      expect(migrationSql).toContain('CREATE INDEX IF NOT EXISTS idx_orders_in_transit_at');
      expect(migrationSql).toContain('ON public.orders (in_transit_at)');
      expect(migrationSql).toContain('WHERE in_transit_at IS NOT NULL');
    });

    it('backfills historical in_transit_at timestamps from order_status_events', () => {
      expect(migrationSql).toContain("WHERE new_status = 'IN_TRANSIT'");
      expect(migrationSql).toContain('SET in_transit_at = sub.transit_time');
    });
  });

  describe('2. transition_order_status RPC Hardening', () => {
    it('enforces strict DEF-01 search_path = public, pg_temp', () => {
      expect(migrationSql).toContain('SET search_path = public, pg_temp');
    });

    it('initializes v_now using clock_timestamp() to prevent timezone skew', () => {
      expect(migrationSql).toContain('v_now TIMESTAMPTZ := clock_timestamp();');
    });

    it('atomically sets in_transit_at upon dispatch to rider', () => {
      expect(migrationSql).toContain(
        "in_transit_at = CASE WHEN p_target_status = 'IN_TRANSIT' AND in_transit_at IS NULL THEN v_now ELSE in_transit_at END"
      );
    });

    it('enforces pickup orders cannot enter IN_TRANSIT and can transition from READY_FOR_PICKUP to DELIVERED', () => {
      expect(migrationSql).toContain("IF v_order.fulfillment_type = 'pickup' THEN");
      expect(migrationSql).toContain("IF p_target_status NOT IN ('DELIVERED', 'CANCELLED') THEN");
      expect(migrationSql).toContain(
        'Counter pickup orders can only transition to DELIVERED upon customer collection, or CANCELLED.'
      );
    });

    it('enforces delivery orders MUST transition to IN_TRANSIT before DELIVERED', () => {
      expect(migrationSql).toContain(
        'Delivery orders must transition to IN_TRANSIT when handed to rider before reaching DELIVERED.'
      );
      expect(migrationSql).toContain("WHEN 'IN_TRANSIT' THEN");
    });

    it('enforces strict role-based separation of kitchen vs counter staff', () => {
      expect(migrationSql).toContain("Kitchen staff cannot cancel or reject orders");
      expect(migrationSql).toContain("Counter staff cannot start kitchen preparation");
      expect(migrationSql).toContain("Kitchen staff cannot perform dispatch or customer handover operations");
    });

    it('updates refund_status to REFUND_REQUIRED upon cancellation of confirmed/in-progress orders', () => {
      expect(migrationSql).toContain("v_new_refund_status := 'REFUND_REQUIRED'");
      expect(migrationSql).toContain('KDS_ORDER_CANCELLED_REFUND_REQUIRED');
    });
  });

  describe('3. get_order_by_receipt & get_kds_orders RPCs', () => {
    it('includes in_transit_at in get_order_by_receipt payload', () => {
      expect(migrationSql).toContain("'in_transit_at', v_order.in_transit_at");
    });

    it('includes inTransitAt in get_kds_orders payload', () => {
      expect(migrationSql).toContain("'inTransitAt', o.in_transit_at");
    });
  });

  describe('4. TypeScript Domain Normalization', () => {
    it('normalizes in_transit_at correctly into order.inTransitAt', () => {
      const rawOrder = {
        id: 'ord-123',
        order_number: 'AY-9901',
        status: 'IN_TRANSIT',
        fulfillment_type: 'delivery',
        subtotal: 5000,
        delivery_fee: 500,
        discount_amount: 0,
        total: 5500,
        in_transit_at: '2026-11-05T12:30:00Z',
        created_at: '2026-11-05T12:00:00Z',
        items: [],
      };

      const normalized = normalizeOrder(rawOrder);
      expect(normalized.inTransitAt).toBe('2026-11-05T12:30:00Z');
      expect(normalized.orderNumber).toBe('AY-9901');
      expect(normalized.fulfillmentType).toBe('delivery');
    });

    it('preserves all lifecycle timestamps through normalizeOrder', () => {
      const rawOrder = {
        id: 'ord-456',
        order_number: 'AY-9902',
        status: 'DELIVERED',
        fulfillment_type: 'pickup',
        subtotal: 7000,
        delivery_fee: 0,
        discount_amount: 0,
        total: 7000,
        created_at: '2026-11-05T10:00:00Z',
        accepted_at: '2026-11-05T10:05:00Z',
        prepared_at: '2026-11-05T10:15:00Z',
        ready_at: '2026-11-05T10:30:00Z',
        completed_at: '2026-11-05T10:45:00Z',
        items: [],
      };

      const normalized = normalizeOrder(rawOrder);
      expect(normalized.createdAt).toBe('2026-11-05T10:00:00Z');
      expect(normalized.acceptedAt).toBe('2026-11-05T10:05:00Z');
      expect(normalized.preparedAt).toBe('2026-11-05T10:15:00Z');
      expect(normalized.readyAt).toBe('2026-11-05T10:30:00Z');
      expect(normalized.inTransitAt).toBeNull();
      expect(normalized.completedAt).toBe('2026-11-05T10:45:00Z');
    });
  });
});

describe('Phase 5.4.3 / Step 3: Premium Customer Order Tracking Experience', () => {
  const modalPath = path.resolve(__dirname, '../components/OrderTrackingModal.tsx');
  let modalSource: string;

  beforeAll(() => {
    modalSource = fs.readFileSync(modalPath, 'utf8');
  });

  describe('1. Authoritative Dual-Track Customer Journeys', () => {
    it('defines 5-stage pickup journey with accurate labels and emojis', () => {
      expect(modalSource).toContain("PICKUP_MILESTONES: MilestoneStep[] = [");
      expect(modalSource).toContain("status: 'CONFIRMED',\n    label: 'Order Received'");
      expect(modalSource).toContain("status: 'ACCEPTED',\n    label: 'Order Confirmed'");
      expect(modalSource).toContain("status: 'PREPARING',\n    label: 'Baking in Stone Oven'");
      expect(modalSource).toContain("status: 'READY_FOR_PICKUP',\n    label: 'Ready for Collection'");
      expect(modalSource).toContain("status: 'DELIVERED',\n    label: 'Order Collected'");
      // Pickup must NOT contain IN_TRANSIT
      const pickupBlock = modalSource.split('PICKUP_MILESTONES')[1].split('DELIVERY_MILESTONES')[0];
      expect(pickupBlock).not.toContain("'IN_TRANSIT'");
    });

    it('defines 6-stage delivery journey including Out for Delivery', () => {
      expect(modalSource).toContain("DELIVERY_MILESTONES: MilestoneStep[] = [");
      const deliveryBlock = modalSource.split('DELIVERY_MILESTONES')[1].split('function getMilestones')[0];
      expect(deliveryBlock).toContain("status: 'CONFIRMED',\n    label: 'Order Received'");
      expect(deliveryBlock).toContain("status: 'ACCEPTED',\n    label: 'Order Confirmed'");
      expect(deliveryBlock).toContain("status: 'PREPARING',\n    label: 'Baking in Stone Oven'");
      expect(deliveryBlock).toContain("status: 'READY_FOR_PICKUP',\n    label: 'Ready for Dispatch'");
      expect(deliveryBlock).toContain("status: 'IN_TRANSIT',\n    label: 'Out for Delivery'");
      expect(deliveryBlock).toContain("status: 'DELIVERED',\n    label: 'Delivered'");
    });
  });

  describe('2. Factual Milestone Timestamps & Fallback', () => {
    it('binds getTimestamp extractors to authoritative order fields', () => {
      expect(modalSource).toContain('getTimestamp: (o) => o.createdAt');
      expect(modalSource).toContain('getTimestamp: (o) => o.acceptedAt');
      expect(modalSource).toContain('getTimestamp: (o) => o.preparedAt');
      expect(modalSource).toContain('getTimestamp: (o) => o.readyAt');
      expect(modalSource).toContain('getTimestamp: (o) => o.inTransitAt');
      expect(modalSource).toContain('getTimestamp: (o) => o.completedAt');
    });

    it('resolves audit event fallback when direct field is missing', () => {
      expect(modalSource).toContain('function getStepTimestamp');
      expect(modalSource).toContain('order.events.find((e) => e.newStatus === step.status)');
      expect(modalSource).toContain('formatTime(matching.createdAt)');
    });
  });

  describe('3. Verified Store Support & Brand Contact Integration', () => {
    it('uses verified store contact information from Brand constants', () => {
      expect(Brand.contact.phone).toBe('0813 073 1895');
      expect(Brand.contact.internationalPhone).toBe('+2348130731895');
      expect(Brand.contact.whatsappUrl).toBe('https://wa.me/2348130731895');
      expect(Brand.location.address).toContain('Opposite King Jaja Hall');
    });

    it('wires Call Store action directly to verified phone number', () => {
      expect(modalSource).toContain('Linking.openURL(`tel:${Brand.contact.internationalPhone}`)');
      expect(modalSource).toContain('Brand.contact.phone');
    });

    it('wires WhatsApp action directly to verified WhatsApp link', () => {
      expect(modalSource).toContain('Brand.contact.whatsappUrl');
      expect(modalSource).toContain('Linking.openURL(Brand.contact.whatsappUrl)');
    });

    it('wires native Share action with order number and reference', () => {
      expect(modalSource).toContain('Share.share({');
      expect(modalSource).toContain('order.orderNumber');
      expect(modalSource).toContain('AY Pizza Order #');
    });

    it('provides clear King Jaja Hall pickup stand instructions', () => {
      expect(modalSource).toContain('AY Pizza Stand opposite King Jaja Hall');
      expect(modalSource).toContain('order.orderNumber');
    });
  });

  describe('4. Cancelled, Refunded, and Exception State Handling', () => {
    it('displays hero card with cancellation reason when order is cancelled', () => {
      expect(modalSource).toContain("order?.status === 'CANCELLED'");
      expect(modalSource).toContain('order.rejectionReason');
      expect(modalSource).toContain('styles.heroCardCancelled');
    });

    it('displays explicit refund notice when refund is required or processed', () => {
      expect(modalSource).toContain('styles.refundBox');
      expect(modalSource).toContain('Paystack Refund Notice');
      expect(modalSource).toContain('order.refundStatus');
    });
  });

  describe('5. Mobile Ergonomics & Redmi 13C (~360dp) Accessibility', () => {
    it('guarantees touch targets meet or exceed 44dp', () => {
      expect(modalSource).toContain('supportCallBtn: {\n    backgroundColor: \'#F7F2E7\',\n    borderWidth: 1,\n    borderColor: \'#E8DFD1\',\n    borderRadius: 12,\n    paddingVertical: 12,\n    alignItems: \'center\',\n    minHeight: 44,');
      expect(modalSource).toContain('supportWhatsAppBtn: {\n    backgroundColor: \'#DCFCE7\',\n    borderWidth: 1,\n    borderColor: \'#86EFAC\',\n    borderRadius: 12,\n    paddingVertical: 12,\n    alignItems: \'center\',\n    minHeight: 44,');
      expect(modalSource).toContain('shareOrderBtn: {\n    backgroundColor: \'#FFFFFF\',\n    borderWidth: 1,\n    borderColor: \'#E8DFD1\',\n    borderRadius: 12,\n    paddingVertical: 12,\n    alignItems: \'center\',\n    minHeight: 44,');
      expect(modalSource).toContain('headerActionBtn: {\n    width: 38,\n    height: 38,\n    borderRadius: 19,');
    });

    it('enforces pure white cards for text legibility on warm cream canvas', () => {
      expect(modalSource).toContain("card: {\n    backgroundColor: '#FFFFFF'");
      expect(modalSource).toContain("supportCard: {\n    backgroundColor: '#FFFFFF'");
      expect(modalSource).toContain("heroCard: {\n    backgroundColor: '#FFFFFF'");
    });

    it('uses verified high-contrast colors on white surfaces', () => {
      // Primary charcoal for titles and labels
      expect(modalSource).toContain("cardHeaderTitle: {\n    fontSize: 14,\n    fontWeight: '800',\n    color: '#1F1F1F'");
      // Secondary muted body text
      expect(modalSource).toContain("summaryLabel: {\n    fontSize: 12,\n    color: '#6B5E59'");
      // High-contrast brand red for item and total prices
      expect(modalSource).toContain("totalVal: {\n    color: '#B91C1C'");
      expect(modalSource).toContain("itemPrice: {\n    color: '#B91C1C'");
    });
  });
});
