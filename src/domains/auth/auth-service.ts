/**
 * Role-Based Access Control (RBAC) & Authentication Service
 */

import { UserRole } from '../../types/auth';
import { supabase } from '../../config/supabase';

export const Permissions = {
  // Customer permissions
  CREATE_ORDER: ['customer', 'staff', 'admin'] as UserRole[],
  VIEW_OWN_ORDERS: ['customer', 'staff', 'admin', 'rider', 'kitchen', 'counter', 'manager'] as UserRole[],
  
  // Kitchen Display & Staff operations
  ACCESS_KDS: ['staff', 'admin', 'kitchen', 'counter', 'manager'] as UserRole[],
  ACCEPT_ORDER: ['staff', 'admin', 'kitchen', 'counter', 'manager'] as UserRole[],
  REJECT_ORDER: ['staff', 'admin', 'counter', 'manager'] as UserRole[],
  UPDATE_ORDER_PREPARATION_STATUS: ['staff', 'admin', 'kitchen', 'manager'] as UserRole[],
  MARK_ORDER_READY: ['staff', 'admin', 'kitchen', 'counter', 'manager'] as UserRole[],
  COMPLETE_ORDER_HANDOVER: ['staff', 'admin', 'counter', 'manager'] as UserRole[],
  TOGGLE_INVENTORY_AVAILABILITY: ['staff', 'admin', 'kitchen', 'manager'] as UserRole[],

  // Rider operations
  ACCESS_DISPATCH_QUEUE: ['rider', 'staff', 'admin', 'counter', 'manager'] as UserRole[],
  UPDATE_DELIVERY_STATUS: ['rider', 'staff', 'admin', 'manager'] as UserRole[],

  // Administrator & Manager capabilities
  CANCEL_ANY_ORDER: ['admin', 'manager'] as UserRole[],
  PROCESS_PAYMENT_REFUND: ['admin'] as UserRole[],
  MODIFY_PRICES: ['admin'] as UserRole[],
  MANAGE_DELIVERY_ZONES: ['admin', 'manager'] as UserRole[],
  VIEW_AUDIT_LOGS: ['admin', 'manager'] as UserRole[],
  MANAGE_USER_ROLES: ['admin'] as UserRole[],
} as const;

export type PermissionKey = keyof typeof Permissions;

/**
 * Checks whether a given role possesses a specific permission.
 */
export function hasPermission(role: UserRole | undefined | null, permission: PermissionKey): boolean {
  if (!role) return false;
  const allowedRoles = Permissions[permission];
  return (allowedRoles as readonly string[]).includes(role);
}

export function canAccessKitchenDisplay(role: UserRole | undefined | null): boolean {
  return hasPermission(role, 'ACCESS_KDS');
}

export function isStaffRole(role: UserRole | undefined | null): boolean {
  return Boolean(role && ['staff', 'admin', 'kitchen', 'counter', 'manager'].includes(role));
}

export function canModifyInventory(role: UserRole | undefined | null): boolean {
  return hasPermission(role, 'TOGGLE_INVENTORY_AVAILABILITY');
}

export function canProcessRefunds(role: UserRole | undefined | null): boolean {
  return hasPermission(role, 'PROCESS_PAYMENT_REFUND');
}

export function canModifyPrices(role: UserRole | undefined | null): boolean {
  return hasPermission(role, 'MODIFY_PRICES');
}

/**
 * Fetches the authoritative database role for the current authenticated user.
 * Returns null if not logged in or if the profile cannot be found.
 */
export async function fetchAuthenticatedRole(): Promise<UserRole | null> {
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      return null;
    }

    return (profile as any).role as UserRole;
  } catch {
    return null;
  }
}

/**
 * Subscribes to Supabase authentication state changes.
 * Immediately invokes callback on SIGNED_IN, SIGNED_OUT, or USER_UPDATED.
 */
export function subscribeAuthState(callback: (role: UserRole | null) => void): { unsubscribe: () => void } {
  const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT') {
      callback(null);
    } else {
      const role = await fetchAuthenticatedRole();
      callback(role);
    }
  });

  return {
    unsubscribe: () => sub.subscription.unsubscribe(),
  };
}

/**
 * Signs out the current user session and clears cached auth state.
 */
export async function signOutUser(): Promise<void> {
  try {
    try {
      const { notificationService } = await import('../notifications/notification-service');
      await notificationService.deactivateCurrentToken('User Logged Out');
    } catch {
      // Ignore notification deactivation errors on signout
    }
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Error during signOut:', err);
  }
}

