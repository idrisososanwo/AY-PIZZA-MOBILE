import {
  hasPermission,
  canAccessKitchenDisplay,
  canModifyInventory,
  canProcessRefunds,
  canModifyPrices,
} from '../domains/auth/auth-service';

describe('Role-Based Access Control (RBAC) Service', () => {
  describe('Customer Role Permissions', () => {
    const role = 'customer';

    it('allows creating orders and viewing own orders', () => {
      expect(hasPermission(role, 'CREATE_ORDER')).toBe(true);
      expect(hasPermission(role, 'VIEW_OWN_ORDERS')).toBe(true);
    });

    it('denies access to Kitchen Display System (KDS)', () => {
      expect(canAccessKitchenDisplay(role)).toBe(false);
    });

    it('denies inventory modification, price modification, and refunds', () => {
      expect(canModifyInventory(role)).toBe(false);
      expect(canModifyPrices(role)).toBe(false);
      expect(canProcessRefunds(role)).toBe(false);
    });
  });

  describe('Staff (Kitchen) Role Permissions', () => {
    const role = 'staff';

    it('grants access to Kitchen Display System', () => {
      expect(canAccessKitchenDisplay(role)).toBe(true);
    });

    it('grants permission to update preparation status and toggle item inventory', () => {
      expect(hasPermission(role, 'UPDATE_ORDER_PREPARATION_STATUS')).toBe(true);
      expect(canModifyInventory(role)).toBe(true);
    });

    it('denies modifying prices, issuing refunds, and viewing audit logs', () => {
      expect(canModifyPrices(role)).toBe(false);
      expect(canProcessRefunds(role)).toBe(false);
      expect(hasPermission(role, 'VIEW_AUDIT_LOGS')).toBe(false);
    });
  });

  describe('Admin Role Permissions', () => {
    const role = 'admin';

    it('grants full administrative, KDS, inventory, pricing, and audit access', () => {
      expect(canAccessKitchenDisplay(role)).toBe(true);
      expect(canModifyInventory(role)).toBe(true);
      expect(canModifyPrices(role)).toBe(true);
      expect(canProcessRefunds(role)).toBe(true);
      expect(hasPermission(role, 'CANCEL_ANY_ORDER')).toBe(true);
      expect(hasPermission(role, 'VIEW_AUDIT_LOGS')).toBe(true);
      expect(hasPermission(role, 'MANAGE_USER_ROLES')).toBe(true);
    });
  });

  describe('Null / Undefined Role Handling', () => {
    it('denies all permissions gracefully when unauthenticated', () => {
      expect(canAccessKitchenDisplay(null)).toBe(false);
      expect(canAccessKitchenDisplay(undefined)).toBe(false);
      expect(canModifyInventory(null)).toBe(false);
      expect(hasPermission(undefined, 'CREATE_ORDER')).toBe(false);
    });
  });
});
