/**
 * Role-Based Access Control (RBAC) & Authentication Service
 * AY Pizza — Official Mobile Application
 */

import { UserRole } from '../../types/auth';
import { CustomerProfile } from '../customer/customer-types';
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

export function isRiderRole(role: UserRole | undefined | null): boolean {
  return role === 'rider';
}

export function canUpdateDeliveryStatus(role: UserRole | undefined | null): boolean {
  return hasPermission(role, 'UPDATE_DELIVERY_STATUS');
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
 * Returns null if not logged in.
 */
export async function fetchAuthenticatedRole(): Promise<UserRole | null> {
  try {
    let authUser: any = null;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (!authError && authData?.user) {
      authUser = authData.user;
    } else {
      const { data: sessData } = await supabase.auth.getSession();
      if (sessData?.session?.user) {
        authUser = sessData.session.user;
      }
    }

    if (!authUser) {
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .single();

    if (!profileError && profile) {
      return (profile as any).role as UserRole;
    }

    // Default to 'customer' for authenticated user if profile lookup fails
    return 'customer';
  } catch {
    return null;
  }
}

/**
 * Fetches the currently authenticated customer profile from the database.
 * If user is authenticated in Supabase, guarantees returning a non-null CustomerProfile.
 */
export async function fetchCurrentCustomerProfile(): Promise<CustomerProfile | null> {
  try {
    let authUser: any = null;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (!authError && authData?.user) {
      authUser = authData.user;
    } else {
      // Fallback to local session
      const { data: sessData } = await supabase.auth.getSession();
      if (sessData?.session?.user) {
        authUser = sessData.session.user;
      }
    }

    if (!authUser) {
      return null;
    }

    // Attempt to read from public.profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    const rawProfile = profile as any;
    if (rawProfile && !profileError) {
      return {
        id: rawProfile.id,
        fullName: rawProfile.full_name || authUser.user_metadata?.full_name || 'Valued Customer',
        phone: rawProfile.phone || authUser.user_metadata?.phone || null,
        email: rawProfile.email || authUser.email || null,
        role: (rawProfile.role as UserRole) || 'customer',
        avatarUrl: rawProfile.avatar_url,
        isPhoneVerified: Boolean(rawProfile.is_phone_verified),
        createdAt: rawProfile.created_at || authUser.created_at,
        updatedAt: rawProfile.updated_at || authUser.updated_at,
      };
    }

    // Heal: Ensure public.profiles record exists if trigger was delayed or missing.
    // Omit server-managed fields (role, is_phone_verified) to prevent role-escalation, demotion,
    // or overwriting trusted database state. PostgreSQL defaults role to 'customer' on insert.
    try {
      await (supabase.from('profiles') as any).upsert(
        {
          id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata?.full_name || 'Valued Customer',
          phone: authUser.user_metadata?.phone || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    } catch {
      // Non-blocking
    }

    // Self-healing fallback: Never treat authenticated user as guest
    return {
      id: authUser.id,
      fullName: authUser.user_metadata?.full_name || 'Valued Customer',
      phone: authUser.user_metadata?.phone || null,
      email: authUser.email || null,
      role: 'customer',
      avatarUrl: authUser.user_metadata?.avatar_url || null,
      isPhoneVerified: Boolean(authUser.phone_confirmed_at),
      createdAt: authUser.created_at || new Date().toISOString(),
      updatedAt: authUser.updated_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export interface SignUpResult {
  success: boolean;
  user?: any;
  session?: any;
  emailConfirmationRequired?: boolean;
  alreadyRegistered?: boolean;
  error?: string;
}

export interface SignInResult {
  success: boolean;
  user?: any;
  session?: any;
  emailNotConfirmed?: boolean;
  error?: string;
}

/**
 * Customer Sign-Up with Email and Password
 * Links new auth user with metadata (fullName, phone) which triggers
 * `handle_new_user()` in PostgreSQL to create `public.profiles`.
 * 
 * If Supabase email confirmation is enabled, session will be null and
 * emailConfirmationRequired will be true.
 */
export async function signUpCustomer(
  email: string,
  password: string,
  fullName: string,
  phone: string
): Promise<SignUpResult> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'A valid email address is required.' };
    }
    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }
    if (!cleanName) {
      return { success: false, error: 'Full name is required.' };
    }
    if (cleanPhone.replace(/[^0-9]/g, '').length < 10) {
      return { success: false, error: 'A valid phone number (at least 10 digits) is required.' };
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          phone: cleanPhone,
        },
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      const isAlready = msg.includes('already registered') || msg.includes('already in use') || msg.includes('user already exists');
      return {
        success: false,
        alreadyRegistered: isAlready,
        error: error.message,
      };
    }

    // In Supabase, if email is already registered and email confirmation is on,
    // signUp returns a user with empty identities array to prevent user enumeration
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return {
        success: false,
        alreadyRegistered: true,
        error: 'An account with this email address already exists. Please sign in instead.',
      };
    }

    // Ensure database profile is immediately created/updated without dictating server-managed role
    if (data.user) {
      try {
        await (supabase.from('profiles') as any).upsert(
          {
            id: data.user.id,
            email: cleanEmail,
            full_name: cleanName,
            phone: cleanPhone,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      } catch {
        // Non-blocking fallback
      }
    }

    let activeSession = data.session;
    let emailConfirmationRequired = !activeSession;

    // Immediate active session support: if signUp returned user but no session
    // (e.g. Supabase response nuance or delayed token), attempt signIn immediately
    // so user gets instantaneous authenticated session without verification delay.
    if (!activeSession && data.user) {
      try {
        const loginRes = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (loginRes.data?.session) {
          activeSession = loginRes.data.session;
          emailConfirmationRequired = false;
        }
      } catch {
        // If password login fails with unconfirmed email, emailConfirmationRequired remains true
      }
    }

    return {
      success: true,
      user: data.user,
      session: activeSession,
      emailConfirmationRequired,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Registration failed.' };
  }
}

/**
 * Resends the sign-up email confirmation link.
 */
export async function resendVerificationEmail(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'A valid email address is required.' };
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Could not resend verification email.' };
  }
}

/**
 * Customer Sign-In with Email and Password
 */
export async function signInCustomer(
  email: string,
  password: string
): Promise<SignInResult> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Email address is required.' };
    }
    if (!password) {
      return { success: false, error: 'Password is required.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      const isUnconfirmed = error.message.toLowerCase().includes('email not confirmed');
      return {
        success: false,
        emailNotConfirmed: isUnconfirmed,
        error: isUnconfirmed
          ? 'Email not confirmed. Please check your inbox or request a new verification link below.'
          : error.message,
      };
    }

    return { success: true, user: data.user, session: data.session };
  } catch (err: any) {
    return { success: false, error: err.message || 'Login failed.' };
  }
}

/**
 * Sends a password reset email to the customer.
 */
export async function sendPasswordResetEmail(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: 'aypizza://reset-password',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Could not send recovery email.' };
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
 * Subscribes to customer profile changes.
 */
export function subscribeCustomerProfile(
  callback: (profile: CustomerProfile | null) => void
): { unsubscribe: () => void } {
  const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT') {
      callback(null);
    } else {
      const prof = await fetchCurrentCustomerProfile();
      callback(prof);
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
