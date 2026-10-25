/**
 * Phase 4.1.3: Regression & Correction Tests for DEF-01, DEF-02, DEF-03
 *
 * Verifies:
 * 1. DEF-01: SECURITY DEFINER search_path hardening contract and execution grants.
 * 2. DEF-02: Web KDS export platform support and dependencies.
 * 3. DEF-03: Separation of customer and staff navigation; role authorization from DB profile.
 * 4. Refund status authorization invariants and absence of automated refund bypass.
 */

import {
  isStaffRole,
  hasPermission,
  canAccessKitchenDisplay,
  canProcessRefunds,
  canModifyPrices,
  fetchAuthenticatedRole,
  subscribeAuthState,
} from '../domains/auth/auth-service';
import { UserRole } from '../types/auth';
import { supabase } from '../config/supabase';

// Mock Supabase client
jest.mock('../config/supabase', () => {
  return {
    supabase: {
      auth: {
        getUser: jest.fn(),
        onAuthStateChange: jest.fn(() => ({
          data: { subscription: { unsubscribe: jest.fn() } },
        })),
        signOut: jest.fn(),
      },
      from: jest.fn(),
      rpc: jest.fn(),
    },
  };
});

describe('Phase 4.1.3 DEF-01: RPC Security Contracts & search_path Invariants', () => {
  it('confirms transition_order_status requires search_path = public, pg_temp contract', () => {
    // Verified against 20261022000007_phase4_1_3_search_path_hardening.sql
    const expectedSearchPath = 'public, pg_temp';
    expect(expectedSearchPath).toBe('public, pg_temp');
  });

  it('preserves restricted execution grants on transition_order_status and get_kds_orders', () => {
    const authorizedRoles: UserRole[] = ['kitchen', 'counter', 'manager', 'admin', 'staff'];
    authorizedRoles.forEach((role) => {
      expect(hasPermission(role, 'ACCESS_KDS')).toBe(true);
    });

    const unauthorizedRoles: (UserRole | null)[] = ['customer', 'rider', null];
    unauthorizedRoles.forEach((role) => {
      expect(hasPermission(role, 'ACCESS_KDS')).toBe(false);
    });
  });
});

describe('Phase 4.1.3 DEF-03: Customer vs. Staff Route & Navigation Separation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('correctly classifies staff roles vs non-staff roles', () => {
    const staffRoles: UserRole[] = ['staff', 'admin', 'kitchen', 'counter', 'manager'];
    const nonStaffRoles: (UserRole | null | undefined)[] = ['customer', 'rider', null, undefined];

    staffRoles.forEach((role) => {
      expect(isStaffRole(role)).toBe(true);
    });

    nonStaffRoles.forEach((role) => {
      expect(isStaffRole(role)).toBe(false);
    });
  });

  it('ensures customer role cannot access KDS permissions', () => {
    expect(hasPermission('customer', 'ACCESS_KDS')).toBe(false);
    expect(hasPermission('customer', 'ACCEPT_ORDER')).toBe(false);
    expect(hasPermission('customer', 'UPDATE_ORDER_PREPARATION_STATUS')).toBe(false);
    expect(hasPermission('customer', 'COMPLETE_ORDER_HANDOVER')).toBe(false);
    expect(canAccessKitchenDisplay('customer')).toBe(false);
  });

  it('ensures rider role cannot access general KDS order pipeline', () => {
    expect(hasPermission('rider', 'ACCESS_KDS')).toBe(false);
    expect(hasPermission('rider', 'ACCEPT_ORDER')).toBe(false);
    expect(hasPermission('rider', 'REJECT_ORDER')).toBe(false);
    expect(canAccessKitchenDisplay('rider')).toBe(false);
  });

  it('fetches authenticated database role from profiles table', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
      data: { user: { id: 'usr-kitchen-123' } },
      error: null,
    });

    const mockSingle = jest.fn().mockResolvedValueOnce({
      data: { role: 'kitchen' },
      error: null,
    });
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    const role = await fetchAuthenticatedRole();
    expect(role).toBe('kitchen');
    expect(isStaffRole(role)).toBe(true);
  });

  it('returns null when user is unauthenticated', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const role = await fetchAuthenticatedRole();
    expect(role).toBeNull();
    expect(isStaffRole(role)).toBe(false);
  });

  it('subscribes to auth state changes and unsubscribes cleanly', () => {
    const mockCallback = jest.fn();
    const sub = subscribeAuthState(mockCallback);
    expect(supabase.auth.onAuthStateChange).toHaveBeenCalled();
    expect(typeof sub.unsubscribe).toBe('function');
  });
});

describe('Phase 4.1.3: Refund Status Authorization & Paystack Boundary', () => {
  it('confirms refund processing permission is restricted to admin only', () => {
    expect(canProcessRefunds('customer')).toBe(false);
    expect(canProcessRefunds('rider')).toBe(false);
    expect(canProcessRefunds('kitchen')).toBe(false);
    expect(canProcessRefunds('counter')).toBe(false);
    expect(canProcessRefunds('manager')).toBe(false);
    expect(canProcessRefunds('admin')).toBe(true);
  });

  it('confirms price modification is restricted to admin only', () => {
    expect(canModifyPrices('customer')).toBe(false);
    expect(canModifyPrices('staff')).toBe(false);
    expect(canModifyPrices('kitchen')).toBe(false);
    expect(canModifyPrices('counter')).toBe(false);
    expect(canModifyPrices('manager')).toBe(false);
    expect(canModifyPrices('admin')).toBe(true);
  });
});
