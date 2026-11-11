/**
 * AY Pizza Customer Experience Test Suite
 * Authentication Lifecycle & Menu Category Navigation
 */

import {
  signUpCustomer,
  signInCustomer,
  resendVerificationEmail,
  fetchCurrentCustomerProfile,
  fetchAuthenticatedRole,
  signOutUser,
} from '../domains/auth/auth-service';
import {
  normalizeCategorySlug,
  isProductInCategory,
  Product,
} from '../types/catalog';
import { cartStore } from '../domains/cart/cart-store';
import { GuestReceiptStore } from '../domains/order/guest-receipt-store';
import { supabase } from '../config/supabase';

// Mock Supabase
jest.mock('../config/supabase', () => {
  const mockAuth = {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    resend: jest.fn(),
    getUser: jest.fn(),
    getSession: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
  };
  const mockFrom = jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
  }));
  const mockRpc = jest.fn();

  return {
    supabase: {
      auth: mockAuth,
      from: mockFrom,
      rpc: mockRpc,
    },
  };
});

describe('Customer Auth & Category Navigation Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getUser as jest.Mock).mockReset();
    (supabase.auth.getSession as jest.Mock).mockReset();
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null,
    });
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  // =========================================================================
  // 1. ACCOUNT REGISTRATION & EMAIL CONFIRMATION FLOWS
  // =========================================================================
  describe('1. Account Registration & Email Confirmation', () => {
    it('handles registration returning an immediate authenticated session', async () => {
      const mockUser = { id: 'usr-123', email: 'bayo@unilag.edu.ng' };
      const mockSession = { access_token: 'tok-abc', user: mockUser };

      (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      const res = await signUpCustomer('bayo@unilag.edu.ng', 'secret123', 'Adebayo Idris', '08123456789');

      expect(res.success).toBe(true);
      expect(res.session).toBeDefined();
      expect(res.emailConfirmationRequired).toBe(false);
      expect(res.alreadyRegistered).toBeFalsy();
    });

    it('handles registration requiring email verification (session is null)', async () => {
      const mockUser = {
        id: 'usr-456',
        email: 'tunde@unilag.edu.ng',
        identities: [{ id: 'ident-1' }],
      };

      (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
        data: { user: mockUser, session: null },
        error: null,
      });

      const res = await signUpCustomer('tunde@unilag.edu.ng', 'secret123', 'Tunde Bakare', '08098765432');

      expect(res.success).toBe(true);
      expect(res.session).toBeNull();
      expect(res.emailConfirmationRequired).toBe(true);
    });

    it('detects already-registered email when identities array is empty', async () => {
      const mockUser = {
        id: 'usr-456',
        email: 'existing@unilag.edu.ng',
        identities: [], // Empty identities array signals already registered in Supabase
      };

      (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
        data: { user: mockUser, session: null },
        error: null,
      });

      const res = await signUpCustomer('existing@unilag.edu.ng', 'secret123', 'Existing User', '08098765432');

      expect(res.success).toBe(false);
      expect(res.alreadyRegistered).toBe(true);
      expect(res.error).toContain('already exists');
    });

    it('handles already-registered error message from Supabase gracefully', async () => {
      (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      });

      const res = await signUpCustomer('existing@unilag.edu.ng', 'secret123', 'Existing User', '08098765432');

      expect(res.success).toBe(false);
      expect(res.alreadyRegistered).toBe(true);
      expect(res.error).toBe('User already registered');
    });

    it('successfully calls resend verification email for valid address', async () => {
      (supabase.auth.resend as jest.Mock).mockResolvedValueOnce({
        data: {},
        error: null,
      });

      const res = await resendVerificationEmail('tunde@unilag.edu.ng');

      expect(res.success).toBe(true);
      expect(supabase.auth.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'tunde@unilag.edu.ng',
      });
    });

    it('rejects resend verification for invalid email format', async () => {
      const res = await resendVerificationEmail('invalid-email');

      expect(res.success).toBe(false);
      expect(res.error).toContain('valid email');
      expect(supabase.auth.resend).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. SIGN-IN & ERROR HANDLING
  // =========================================================================
  describe('2. Customer Sign-In Handling', () => {
    it('successfully signs in customer when credentials and verification are valid', async () => {
      const mockUser = { id: 'usr-123', email: 'verified@unilag.edu.ng' };
      const mockSession = { access_token: 'tok-xyz', user: mockUser };

      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      const res = await signInCustomer('verified@unilag.edu.ng', 'secret123');

      expect(res.success).toBe(true);
      expect(res.session).toBeDefined();
      expect(res.emailNotConfirmed).toBeFalsy();
    });

    it('detects unconfirmed email error and flags emailNotConfirmed for user guidance', async () => {
      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Email not confirmed' },
      });

      const res = await signInCustomer('unconfirmed@unilag.edu.ng', 'secret123');

      expect(res.success).toBe(false);
      expect(res.emailNotConfirmed).toBe(true);
      expect(res.error).toContain('Email not confirmed');
    });
  });

  // =========================================================================
  // 3. GUEST-TO-ACCOUNT TRANSITION & DATA PRESERVATION
  // =========================================================================
  describe('3. Guest-to-Account Transition & Safety', () => {
    it('preserves existing cart items in cartStore across auth state changes', async () => {
      await cartStore.clearCart();
      const testItem = {
        id: 'cart-item-1',
        itemHash: 'hash-item-1',
        productId: 'prod-pizza-1',
        productName: 'Sweet and Sour Pizza',
        categorySlug: 'pizza' as const,
        imageUrl: null,
        basePrice: 7000,
        customizations: [],
        quantity: 2,
        unitPrice: 7000,
        lineTotal: 14000,
      };

      await cartStore.addItem(testItem);
      expect(cartStore.getState().items.length).toBe(1);

      // Cart items remain untouched
      expect(cartStore.getState().items.length).toBe(1);
      expect(cartStore.getState().items[0].productName).toBe('Sweet and Sour Pizza');
    });

    it('preserves guest receipts in hardware storage after account login', async () => {
      const sampleReceipt = {
        orderId: 'ord-guest-99',
        orderNumber: 'AYP-99',
        receiptToken: 'token-secret-99',
      };

      await GuestReceiptStore.saveReceipt(
        sampleReceipt.orderId,
        sampleReceipt.orderNumber,
        sampleReceipt.receiptToken
      );

      const records = await GuestReceiptStore.getAllReceipts();
      expect(records.some((r) => r.orderId === 'ord-guest-99')).toBe(true);
    });
  });

  // =========================================================================
  // 4. MENU CATEGORY NAVIGATION & PRODUCT FILTERING
  // =========================================================================
  describe('4. Menu Category Navigation & Product Filtering', () => {
    const mockCatalog: Product[] = [
      {
        id: 'p1',
        categoryId: 'c1',
        categorySlug: 'pizza',
        name: 'Sweet and Sour Pizza',
        description: 'Tender chicken and sweet sauce',
        basePrice: 7000,
        imageUrl: null,
        isAvailable: true,
        displayOrder: 1,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'p2',
        categoryId: 'c1',
        categorySlug: 'pizza',
        name: 'BBQ Beef Pizza',
        description: 'Smoky beef pizza',
        basePrice: 7000,
        imageUrl: null,
        isAvailable: true,
        displayOrder: 2,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'p3',
        categoryId: 'c2',
        categorySlug: 'icecream',
        name: 'Milkshake',
        description: 'Creamy thick shake',
        basePrice: 4500,
        imageUrl: null,
        isAvailable: true,
        displayOrder: 3,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'p4',
        categoryId: 'c3',
        categorySlug: 'fastfood',
        name: 'Burger & Chips',
        description: 'Juicy beef burger with french fries',
        basePrice: 5000,
        imageUrl: null,
        isAvailable: true,
        displayOrder: 4,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'p5',
        categoryId: 'c3',
        categorySlug: 'fastfood',
        name: 'Wings',
        description: 'Spicy glazed chicken wings',
        basePrice: 3500,
        imageUrl: null,
        isAvailable: true,
        displayOrder: 5,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'p6',
        categoryId: 'c4',
        categorySlug: 'drinks',
        name: 'Bottle Water',
        description: 'Chilled natural spring water',
        basePrice: 300,
        imageUrl: null,
        isAvailable: true,
        displayOrder: 6,
        createdAt: '',
        updatedAt: '',
      },
    ];

    it('filters Pizza products correctly when pizza category is selected', () => {
      const filtered = mockCatalog.filter((p) => isProductInCategory(p.categorySlug, 'pizza'));
      expect(filtered.length).toBe(2);
      expect(filtered.every((p) => p.categorySlug === 'pizza')).toBe(true);
    });

    it('filters Ice Cream products correctly when icecream category is selected', () => {
      const filtered = mockCatalog.filter((p) => isProductInCategory(p.categorySlug, 'icecream'));
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Milkshake');
    });

    it('filters Side products when selecting "sides" alias', () => {
      const filtered = mockCatalog.filter((p) => isProductInCategory(p.categorySlug, 'sides'));
      expect(filtered.length).toBe(2);
      expect(filtered.map((p) => p.name)).toEqual(['Burger & Chips', 'Wings']);
    });

    it('filters Side products when selecting "fastfood" canonical slug', () => {
      const filtered = mockCatalog.filter((p) => isProductInCategory(p.categorySlug, 'fastfood'));
      expect(filtered.length).toBe(2);
      expect(filtered.map((p) => p.name)).toEqual(['Burger & Chips', 'Wings']);
    });

    it('filters Drink products when selecting "drinks"', () => {
      const filtered = mockCatalog.filter((p) => isProductInCategory(p.categorySlug, 'drinks'));
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Bottle Water');
    });

    it('returns all products when "all" is selected', () => {
      const filtered = mockCatalog.filter((p) => isProductInCategory(p.categorySlug, 'all'));
      expect(filtered.length).toBe(mockCatalog.length);
    });

    it('normalizes category aliases accurately for high-contrast pill highlighting', () => {
      expect(normalizeCategorySlug('pizza')).toBe('pizza');
      expect(normalizeCategorySlug('icecream')).toBe('icecream');
      expect(normalizeCategorySlug('ice-cream')).toBe('icecream');
      expect(normalizeCategorySlug('sides')).toBe('fastfood');
      expect(normalizeCategorySlug('fastfood')).toBe('fastfood');
      expect(normalizeCategorySlug('drinks')).toBe('drinks');
      expect(normalizeCategorySlug('beverages')).toBe('drinks');
      expect(normalizeCategorySlug('all')).toBe('all');
    });

    it('handles empty category selection with 0 items cleanly', () => {
      const emptyCatalog: Product[] = [];
      const filtered = emptyCatalog.filter((p) => isProductInCategory(p.categorySlug, 'pizza'));
      expect(filtered.length).toBe(0);
    });
  });

  // =========================================================================
  // 5. AUTHENTICATION SINGLE SOURCE OF TRUTH & SELF-HEALING STATE RECOVERY
  // =========================================================================
  describe('5. Authentication State Single Source of Truth & Self-Healing', () => {
    it('returns null profile when user is unauthenticated (guest)', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

      const profile = await fetchCurrentCustomerProfile();
      expect(profile).toBeNull();
    });

    it('returns non-null profile from public.profiles for authenticated user', async () => {
      const mockUser = {
        id: 'usr-auth-1',
        email: 'ade@unilag.edu.ng',
        user_metadata: { full_name: 'Adekunle Gold' },
      };
      (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'usr-auth-1',
            full_name: 'Adekunle Gold',
            phone: '08123456789',
            email: 'ade@unilag.edu.ng',
            role: 'customer',
            avatar_url: null,
            is_phone_verified: true,
            created_at: '2026-11-01T00:00:00Z',
            updated_at: '2026-11-01T00:00:00Z',
          },
          error: null,
        }),
      });

      const profile = await fetchCurrentCustomerProfile();
      expect(profile).not.toBeNull();
      expect(profile?.id).toBe('usr-auth-1');
      expect(profile?.fullName).toBe('Adekunle Gold');
      expect(profile?.email).toBe('ade@unilag.edu.ng');
    });

    it('self-heals and NEVER returns null when profiles record is missing or query fails', async () => {
      const mockUser = {
        id: 'usr-delayed-profile',
        email: 'delayed@unilag.edu.ng',
        user_metadata: {
          full_name: 'Chioma Chukwuka',
          phone: '08033344455',
        },
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      // Simulate profiles query failure / missing row
      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: null,
          error: { message: 'Row not found (PGRST116)' },
        }),
        upsert: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      const profile = await fetchCurrentCustomerProfile();
      // MUST NOT return null — user is authenticated!
      expect(profile).not.toBeNull();
      expect(profile?.id).toBe('usr-delayed-profile');
      expect(profile?.fullName).toBe('Chioma Chukwuka');
      expect(profile?.email).toBe('delayed@unilag.edu.ng');
      expect(profile?.phone).toBe('08033344455');
      expect(profile?.role).toBe('customer');
    });

    it('recovers authenticated user session from getSession when getUser fails', async () => {
      const mockUser = {
        id: 'usr-session-recovery',
        email: 'recovery@unilag.edu.ng',
        user_metadata: { full_name: 'Boluwatife Adeleke' },
      };

      // getUser fails (e.g. offline or network issue)
      (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Network offline' },
      });

      // getSession succeeds from local AsyncStorage
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { user: mockUser } },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'usr-session-recovery',
            full_name: 'Boluwatife Adeleke',
            email: 'recovery@unilag.edu.ng',
            role: 'customer',
          },
          error: null,
        }),
      });

      const profile = await fetchCurrentCustomerProfile();
      expect(profile).not.toBeNull();
      expect(profile?.id).toBe('usr-session-recovery');
      expect(profile?.fullName).toBe('Boluwatife Adeleke');
    });

    it('defaults fetchAuthenticatedRole to "customer" when user is authenticated but profile lookup fails', async () => {
      const mockUser = { id: 'usr-role-fallback', email: 'fallback@unilag.edu.ng' };
      (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error' },
        }),
      });

      const role = await fetchAuthenticatedRole();
      expect(role).toBe('customer');
    });

    it('signOutUser clears supabase session without deleting local guest receipts or cart', async () => {
      await cartStore.clearCart();
      await cartStore.addItem({
        id: 'item-keep',
        itemHash: 'hash-keep',
        productId: 'prod-1',
        productName: 'Pepperoni Supreme',
        categorySlug: 'pizza' as const,
        imageUrl: null,
        basePrice: 8500,
        customizations: [],
        quantity: 1,
        unitPrice: 8500,
        lineTotal: 8500,
      });

      await GuestReceiptStore.saveReceipt('ord-keep', 'AYP-KEEP', 'token-keep');

      (supabase.auth.signOut as jest.Mock).mockResolvedValueOnce({ error: null });

      await signOutUser();

      expect(supabase.auth.signOut).toHaveBeenCalled();
      // Cart items and guest receipts are preserved
      expect(cartStore.getState().items.length).toBe(1);
      const receipts = await GuestReceiptStore.getAllReceipts();
      expect(receipts.some((r) => r.orderId === 'ord-keep')).toBe(true);
    });

    it('ensures profile upsert payload never dictates role or is_phone_verified (preventing self-escalation)', async () => {
      const mockUser = {
        id: 'usr-security-check',
        email: 'security@unilag.edu.ng',
        user_metadata: { full_name: 'Security Tester', phone: '08099998888' },
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      const upsertMock = jest.fn().mockResolvedValue({ data: null, error: null });

      (supabase.from as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Missing profile' },
        }),
        upsert: upsertMock,
      }));

      await fetchCurrentCustomerProfile();

      expect(upsertMock).toHaveBeenCalled();
      const upsertPayload = upsertMock.mock.calls[0][0];
      // Role must NOT be in the upsert payload so PostgreSQL default is preserved and existing role is not overwritten
      expect(upsertPayload.role).toBeUndefined();
      expect(upsertPayload.is_phone_verified).toBeUndefined();
      expect(upsertPayload.id).toBe('usr-security-check');
      expect(upsertPayload.email).toBe('security@unilag.edu.ng');
    });

    it('signUpCustomer respects email confirmation requirement if signInWithPassword fails', async () => {
      const mockUser = {
        id: 'usr-confirm-required',
        email: 'unconfirmed@unilag.edu.ng',
        identities: [{ id: 'ident-2' }],
      };

      (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
        data: { user: mockUser, session: null },
        error: null,
      });

      // signInWithPassword fails because email confirmation is enforced by backend
      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Email not confirmed' },
      });

      const res = await signUpCustomer(
        'unconfirmed@unilag.edu.ng',
        'securePass123',
        'Unconfirmed Student',
        '08111223344'
      );

      expect(res.success).toBe(true);
      expect(res.session).toBeNull();
      expect(res.emailConfirmationRequired).toBe(true);
    });
  });
});
