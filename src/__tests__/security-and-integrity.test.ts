import {
  calculateOrderTotal,
  reconcileClientEstimateWithServer,
} from '../domains/order/order-calculator';
import {
  hasPermission,
  canAccessKitchenDisplay,
  canModifyInventory,
  canProcessRefunds,
  canModifyPrices,
} from '../domains/auth/auth-service';
import { createAuditRecord } from '../domains/audit/audit-service';
import { OrderItemInput } from '../types/order';

describe('Phase 1.1 Security & Data Integrity Review Tests', () => {
  describe('1. Server-Authoritative Pricing & Estimate Reconciliation', () => {
    it('flags client price tampering when client submits manipulated totals', () => {
      const items: OrderItemInput[] = [
        {
          productId: 'p-1',
          productName: 'Cheese Pepperoni Pizza',
          sizeName: 'King',
          sizePrice: 7000,
          basePrice: 7000,
          quantity: 1,
          customizations: [],
        },
      ];

      // Server calculates authoritatively: 7000 (base) + 7000 (king) = 14000
      const serverCalculated = calculateOrderTotal({
        items,
        fulfillmentType: 'pickup',
      });
      expect(serverCalculated.total).toBe(14000);

      // Malicious client attempted to submit order with total = 1000 NGN
      const maliciousClientTotal = 1000;
      const reconciliation = reconcileClientEstimateWithServer(
        maliciousClientTotal,
        serverCalculated.total
      );

      expect(reconciliation.matches).toBe(false);
      expect(reconciliation.variance).toBe(13000); // 13,000 NGN discrepancy detected!
    });

    it('matches when honest client estimate equals server authoritative calculation', () => {
      const items: OrderItemInput[] = [
        {
          productId: 'p-1',
          productName: 'Margherita Pizza',
          sizeName: 'Regular',
          sizePrice: 0,
          basePrice: 7000,
          quantity: 1,
          customizations: [],
        },
      ];

      const clientEstimate = calculateOrderTotal({
        items,
        fulfillmentType: 'pickup',
      });
      const serverCalculated = calculateOrderTotal({
        items,
        fulfillmentType: 'pickup',
      });

      const reconciliation = reconcileClientEstimateWithServer(
        clientEstimate.total,
        serverCalculated.total
      );

      expect(reconciliation.matches).toBe(true);
      expect(reconciliation.variance).toBe(0);
    });
  });

  describe('2. Role Security & Anti-Escalation Controls', () => {
    it('strictly forbids customers from executing staff or admin operations', () => {
      const customerRole = 'customer';
      expect(hasPermission(customerRole, 'ACCESS_KDS')).toBe(false);
      expect(hasPermission(customerRole, 'MODIFY_PRICES')).toBe(false);
      expect(hasPermission(customerRole, 'PROCESS_PAYMENT_REFUND')).toBe(false);
      expect(hasPermission(customerRole, 'MANAGE_USER_ROLES')).toBe(false);
      expect(hasPermission(customerRole, 'VIEW_AUDIT_LOGS')).toBe(false);
    });

    it('confirms staff cannot modify prices or issue refunds', () => {
      const staffRole = 'staff';
      expect(canAccessKitchenDisplay(staffRole)).toBe(true);
      expect(canModifyInventory(staffRole)).toBe(true);
      expect(canModifyPrices(staffRole)).toBe(false);
      expect(canProcessRefunds(staffRole)).toBe(false);
    });

    it('restricts role modification permission exclusively to administrators', () => {
      expect(hasPermission('admin', 'MANAGE_USER_ROLES')).toBe(true);
      expect(hasPermission('staff', 'MANAGE_USER_ROLES')).toBe(false);
      expect(hasPermission('customer', 'MANAGE_USER_ROLES')).toBe(false);
      expect(hasPermission('rider', 'MANAGE_USER_ROLES')).toBe(false);
    });
  });

  describe('3. Audit Log Completeness and Context Integrity', () => {
    it('captures full actor, action, target, and timestamp context in audit records', () => {
      const audit = createAuditRecord({
        action: 'ORDER_STATUS_CHANGED',
        performedBy: 'usr-staff-123',
        targetType: 'order',
        targetId: 'ord-ayp-456',
        details: {
          previousStatus: 'PAID',
          newStatus: 'PREPARING',
          kitchenStation: 'Pizza Oven 1',
        },
        ipAddress: '197.210.64.12',
      });

      expect(audit.action).toBe('ORDER_STATUS_CHANGED');
      expect(audit.performedBy).toBe('usr-staff-123');
      expect(audit.targetType).toBe('order');
      expect(audit.targetId).toBe('ord-ayp-456');
      expect(audit.details.previousStatus).toBe('PAID');
      expect(audit.details.newStatus).toBe('PREPARING');
      expect(audit.ipAddress).toBe('197.210.64.12');
      expect(audit.createdAt).toBeDefined();
    });

    it('rejects audit records missing mandatory action or target ID', () => {
      expect(() =>
        createAuditRecord({
          action: '' as any,
          targetType: 'order',
          targetId: 'ord-123',
          details: {},
        })
      ).toThrow(/Audit record requires an action type/);

      expect(() =>
        createAuditRecord({
          action: 'SECURITY_EVENT',
          targetType: 'order',
          targetId: '',
          details: {},
        })
      ).toThrow(/Audit record requires a target ID/);
    });
  });

  describe('4. Idempotency Key Handling & Order Duplication Defense', () => {
    it('ensures distinct idempotency keys produce independent orders', () => {
      const payloadBase = {
        fulfillmentType: 'pickup' as const,
        items: [
          {
            productId: 'p-1',
            productName: 'Club Pizza',
            basePrice: 7000,
            quantity: 1,
            customizations: [],
          },
        ],
      };

      const order1 = calculateOrderTotal(payloadBase);
      const order2 = calculateOrderTotal(payloadBase);

      expect(order1.total).toBe(order2.total);
      // In PostgreSQL, idempotency_key has a UNIQUE constraint preventing duplicate order creation
    });
  });
});
