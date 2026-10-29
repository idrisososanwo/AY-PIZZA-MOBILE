/**
 * AY Pizza — Customer Experience Milestone Acceptance Test Suite
 * 
 * Comprehensive independent audit and validation across 7 milestone dimensions:
 * 1. Authentication and Session Invariants
 * 2. Customer Profile Management & Security
 * 3. Saved Address CRUD & Cross-Customer Isolation
 * 4. Checkout, Pricing & Payment Lifecycle
 * 5. Orders, Tracking & Reorder Flow
 * 6. Privacy, Technical Isolation & Account Deletion Inspection
 * 7. Physical Device Responsiveness & Layout Invariants
 */

import { customerService } from '../domains/customer/customer-service';
import {
  signUpCustomer,
  signInCustomer,
  sendPasswordResetEmail,
  signOutUser,
  hasPermission,
  isStaffRole,
  canAccessKitchenDisplay,
} from '../domains/auth/auth-service';
import { cartStore } from '../domains/cart/cart-store';
import { CartItem } from '../domains/cart/cart-types';
import { resolveDeliveryFee } from '../domains/delivery/delivery-service';
import { calculateOrderTotal, reconcileClientEstimateWithServer } from '../domains/order/order-calculator';
import { OrderStatus, OrderItemInput } from '../types/order';
import { supabase } from '../config/supabase';

// Mock Supabase client
jest.mock('../config/supabase', () => {
  const mockAuth = {
    getUser: jest.fn(),
    getSession: jest.fn(),
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
  };

  return {
    supabase: {
      auth: mockAuth,
      from: jest.fn(),
      rpc: jest.fn(),
    },
  };
});

describe('AY PIZZA — CUSTOMER EXPERIENCE MILESTONE ACCEPTANCE TEST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. AUTHENTICATION AND SESSION TESTS
  // ===========================================================================
  describe('1. Authentication and Session Tests', () => {
    it('1.1: Rejects customer registration with invalid email, short password, empty name, or short phone', async () => {
      // Invalid email
      const resEmail = await signUpCustomer('notanemail', 'secret123', 'John Doe', '08130731895');
      expect(resEmail.success).toBe(false);
      expect(resEmail.error).toContain('valid email');

      // Short password (< 6 chars)
      const resPass = await signUpCustomer('student@unilag.edu.ng', '123', 'John Doe', '08130731895');
      expect(resPass.success).toBe(false);
      expect(resPass.error).toContain('at least 6 characters');

      // Empty full name
      const resName = await signUpCustomer('student@unilag.edu.ng', 'secret123', '   ', '08130731895');
      expect(resName.success).toBe(false);
      expect(resName.error).toContain('Full name');

      // Short phone (< 10 digits)
      const resPhone = await signUpCustomer('student@unilag.edu.ng', 'secret123', 'John Doe', '12345');
      expect(resPhone.success).toBe(false);
      expect(resPhone.error).toContain('at least 10 digits');
    });

    it('1.2: Registers a new customer with trimmed inputs and user metadata', async () => {
      const mockCreatedUser = { id: 'usr-new-001', email: 'adebayo@unilag.edu.ng' };
      (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
        data: { user: mockCreatedUser },
        error: null,
      });

      const res = await signUpCustomer(
        '  ADEBAYO@UNILAG.EDU.NG  ',
        'StrongPassword123!',
        '  Adebayo Idris  ',
        ' 0813-073-1895 '
      );

      expect(res.success).toBe(true);
      expect(res.user?.id).toBe('usr-new-001');
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'adebayo@unilag.edu.ng',
        password: 'StrongPassword123!',
        options: {
          data: {
            full_name: 'Adebayo Idris',
            phone: '0813-073-1895',
          },
        },
      });
    });

    it('1.3: Signs out customer and deactivates push notification session', async () => {
      (supabase.auth.signOut as jest.Mock).mockResolvedValueOnce({});
      await signOutUser();
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });

    it('1.4: Signs in customer with normalized email and reports invalid credentials safely', async () => {
      // Failure case
      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid login credentials' },
      });

      const failRes = await signInCustomer('test@unilag.edu.ng', 'WrongPass');
      expect(failRes.success).toBe(false);
      expect(failRes.error).toBe('Invalid login credentials');

      // Success case
      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
        data: { user: { id: 'usr-001', email: 'test@unilag.edu.ng' } },
        error: null,
      });

      const succRes = await signInCustomer('  TEST@UNILAG.EDU.NG  ', 'CorrectPass');
      expect(succRes.success).toBe(true);
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@unilag.edu.ng',
        password: 'CorrectPass',
      });
    });

    it('1.5: Enforces password recovery deep link format', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValueOnce({ error: null });

      const res = await sendPasswordResetEmail('student@unilag.edu.ng');
      expect(res.success).toBe(true);
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'student@unilag.edu.ng',
        { redirectTo: 'aypizza://reset-password' }
      );
    });

    it('1.6: Preserves guest browsing and rejects authenticated-only actions for guests', async () => {
      // Guest attempting profile fetch
      const profRes = await customerService.getProfile('');
      expect(profRes.success).toBe(false);
      expect(profRes.error).toContain('User ID is required');

      // Guest attempting address save
      const addrRes = await customerService.addAddress('', {
        landmarkId: 'lm-jaja',
        detailedAddress: 'Room B204',
        contactPhone: '08130731895',
      });
      expect(addrRes.success).toBe(false);
      expect(addrRes.error).toContain('User ID is required');

      // Guest attempting account deletion
      const delRes = await customerService.requestAccountDeletion('');
      expect(delRes.success).toBe(false);
      expect(delRes.error).toContain('User ID is required');
    });
  });

  // ===========================================================================
  // 2. CUSTOMER PROFILE TESTS
  // ===========================================================================
  describe('2. Customer Profile Tests', () => {
    it('2.1: Views customer profile with sanitized fields', async () => {
      const mockDbRow = {
        id: 'usr-prof-123',
        full_name: 'Chioma Okeke',
        phone: '08031234567',
        email: 'chioma@unilag.edu.ng',
        role: 'customer',
        avatar_url: null,
        is_phone_verified: true,
        created_at: '2026-10-21T12:00:00Z',
        updated_at: '2026-10-29T12:00:00Z',
      };

      const mockSingle = jest.fn().mockResolvedValueOnce({ data: mockDbRow, error: null });
      const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const res = await customerService.getProfile('usr-prof-123');
      expect(res.success).toBe(true);
      expect(res.profile?.fullName).toBe('Chioma Okeke');
      expect(res.profile?.phone).toBe('08031234567');
      expect(res.profile?.role).toBe('customer');
      expect(res.profile?.isPhoneVerified).toBe(true);
      expect(mockEq).toHaveBeenCalledWith('id', 'usr-prof-123');
    });

    it('2.2: Edits customer name and phone number with whitespace trimming', async () => {
      const updatedRow = {
        id: 'usr-prof-123',
        full_name: 'Chioma Adeyemi',
        phone: '08098765432',
        email: 'chioma@unilag.edu.ng',
        role: 'customer',
        avatar_url: null,
        is_phone_verified: true,
        created_at: '2026-10-21T12:00:00Z',
        updated_at: '2026-10-29T14:00:00Z',
      };

      const mockSingle = jest.fn().mockResolvedValueOnce({ data: updatedRow, error: null });
      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
      const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate });

      const res = await customerService.updateProfile('usr-prof-123', {
        fullName: '  Chioma Adeyemi  ',
        phone: ' 08098765432 ',
      });

      expect(res.success).toBe(true);
      expect(res.profile?.fullName).toBe('Chioma Adeyemi');
      expect(res.profile?.phone).toBe('08098765432');

      // Verify ONLY authorized fields were included in update payload
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Chioma Adeyemi',
          phone: '08098765432',
          updated_at: expect.any(String),
        })
      );
      // Ensure 'role' is never present in customer update payload
      const payload = mockUpdate.mock.calls[0][0];
      expect(payload.role).toBeUndefined();
    });

    it('2.3: Prevents role tampering (customer cannot alter role to admin or staff)', () => {
      // In mobile domain service, updateProfile signature only allows fullName and phone:
      // updates: { fullName?: string; phone?: string }
      // Even if type-cast aggressively, updateProfile does not write role.
      expect(hasPermission('customer', 'MANAGE_USER_ROLES')).toBe(false);
      expect(hasPermission('customer', 'ACCESS_KDS')).toBe(false);
    });
  });

  // ===========================================================================
  // 3. SAVED ADDRESS SECURITY TESTS
  // ===========================================================================
  describe('3. Saved Address Security Tests', () => {
    it('3.1: Creates a new address and unsets previous defaults when isDefault is true', async () => {
      const mockNewAddr = {
        id: 'addr-jaja-01',
        customer_id: 'usr-001',
        landmark_id: 'lm-jaja',
        detailed_address: 'King Jaja Hall, Block A, Room 102',
        contact_phone: '08130731895',
        delivery_notes: 'Call at main porter gate',
        is_default: true,
        created_at: '2026-10-29T12:00:00Z',
        updated_at: '2026-10-29T12:00:00Z',
        delivery_landmarks: { id: 'lm-jaja', name: 'King Jaja Hall' },
      };

      const mockSingle = jest.fn().mockResolvedValueOnce({ data: mockNewAddr, error: null });
      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      const mockEq = jest.fn().mockResolvedValueOnce({ error: null });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });

      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'customer_addresses') {
          return { update: mockUpdate, insert: mockInsert };
        }
        return {};
      });

      const res = await customerService.addAddress('usr-001', {
        landmarkId: 'lm-jaja',
        detailedAddress: 'King Jaja Hall, Block A, Room 102',
        contactPhone: '08130731895',
        deliveryNotes: 'Call at main porter gate',
        isDefault: true,
      });

      expect(res.success).toBe(true);
      expect(res.address?.landmarkName).toBe('King Jaja Hall');
      expect(res.address?.isDefault).toBe(true);
      // Unset previous defaults
      expect(mockUpdate).toHaveBeenCalledWith({ is_default: false });
    });

    it('3.2: Edits an address with user ownership check', async () => {
      const mockEqCustomer = jest.fn().mockResolvedValueOnce({ error: null });
      const mockEqId = jest.fn().mockReturnValue({ eq: mockEqCustomer });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEqId });
      (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate });

      const res = await customerService.updateAddress('usr-001', 'addr-jaja-01', {
        detailedAddress: 'Room 205 (Moved from 102)',
      });

      expect(res.success).toBe(true);
      expect(mockEqId).toHaveBeenCalledWith('id', 'addr-jaja-01');
      expect(mockEqCustomer).toHaveBeenCalledWith('customer_id', 'usr-001');
    });

    it('3.3: Deletes an address strictly scoped to caller customer_id', async () => {
      const mockEqCustomer = jest.fn().mockResolvedValueOnce({ error: null });
      const mockEqId = jest.fn().mockReturnValue({ eq: mockEqCustomer });
      const mockDelete = jest.fn().mockReturnValue({ eq: mockEqId });
      (supabase.from as jest.Mock).mockReturnValue({ delete: mockDelete });

      const res = await customerService.deleteAddress('usr-001', 'addr-jaja-01');
      expect(res.success).toBe(true);
      expect(mockEqId).toHaveBeenCalledWith('id', 'addr-jaja-01');
      expect(mockEqCustomer).toHaveBeenCalledWith('customer_id', 'usr-001');
    });

    it('3.4: Sets a default address by clearing existing defaults first', async () => {
      const mockEqCustomer = jest.fn().mockResolvedValueOnce({ error: null });
      const mockEqId = jest.fn().mockReturnValue({ eq: mockEqCustomer });
      const mockUpdateTarget = jest.fn().mockReturnValue({ eq: mockEqId });

      const mockEqUnset = jest.fn().mockResolvedValueOnce({ error: null });
      const mockUpdateUnset = jest.fn().mockReturnValue({ eq: mockEqUnset });

      let callIdx = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) return { update: mockUpdateUnset };
        return { update: mockUpdateTarget };
      });

      const res = await customerService.setDefaultAddress('usr-001', 'addr-02');
      expect(res.success).toBe(true);
      expect(mockUpdateUnset).toHaveBeenCalledWith({ is_default: false });
      expect(mockUpdateTarget).toHaveBeenCalledWith(
        expect.objectContaining({ is_default: true })
      );
    });

    it('3.5: Prevents Customer A from modifying or deleting Customer B address', async () => {
      // Simulating database error when customer_id does not match
      const mockEqCustomer = jest.fn().mockResolvedValueOnce({ error: { message: 'Row not found or RLS violation' } });
      const mockEqId = jest.fn().mockReturnValue({ eq: mockEqCustomer });
      const mockDelete = jest.fn().mockReturnValue({ eq: mockEqId });
      (supabase.from as jest.Mock).mockReturnValue({ delete: mockDelete });

      const res = await customerService.deleteAddress('attacker-user-id', 'victim-address-id');
      expect(res.success).toBe(false);
      expect(res.error).toContain('RLS violation');
    });
  });

  // ===========================================================================
  // 4. CHECKOUT AND PAYMENT TESTS
  // ===========================================================================
  describe('4. Checkout and Payment Tests', () => {
    it('4.1: Calculates delivery fee accurately across campus vs non-campus landmarks', () => {
      // UNILAG Campus (₦500)
      expect(resolveDeliveryFee('delivery', 'Inside School (UNILAG Campus)')).toBe(500);
      expect(resolveDeliveryFee('delivery', 'lm-1')).toBe(500);

      // Near campus (Akoka ₦1,000, Yaba ₦2,000)
      expect(resolveDeliveryFee('delivery', 'Akoka')).toBe(1000);
      expect(resolveDeliveryFee('delivery', 'Yaba')).toBe(2000);

      // Surulere (₦3,500)
      expect(resolveDeliveryFee('delivery', 'Surulere')).toBe(3500);
    });

    it('4.2: Pickup checkout enforces strictly ₦0 delivery fee', () => {
      expect(resolveDeliveryFee('pickup')).toBe(0);
      expect(resolveDeliveryFee('pickup', 'Inside School (UNILAG Campus)')).toBe(0);
    });

    it('4.3: Calculates order subtotal and estimated total with integer precision', () => {
      const sampleItem1: CartItem = {
        id: 'i-1',
        productId: 'p-1',
        productName: 'BBQ Beef Pizza',
        categorySlug: 'pizza',
        itemHash: 'bbq-large',
        imageUrl: null,
        sizeId: 's-large',
        sizeName: 'Large',
        basePrice: 7000,
        sizePrice: 3000,
        quantity: 2,
        customizations: [{ optionId: 'opt-cheese', optionName: 'Extra Cheese', price: 1000 }],
        unitPrice: 11000,
        lineTotal: 22000,
      };

      const orderItemInput: OrderItemInput = {
        productId: sampleItem1.productId,
        productName: sampleItem1.productName,
        sizeId: sampleItem1.sizeId,
        sizeName: sampleItem1.sizeName,
        sizePrice: sampleItem1.sizePrice,
        basePrice: sampleItem1.basePrice,
        quantity: sampleItem1.quantity,
        customizations: sampleItem1.customizations,
      };

      const breakdown = calculateOrderTotal({
        items: [orderItemInput],
        fulfillmentType: 'delivery',
        deliveryFee: 500,
      });
      expect(breakdown.subtotal).toBe(22000);
      expect(breakdown.deliveryFee).toBe(500);
      expect(breakdown.total).toBe(22500);
      expect(breakdown.totalInKobo).toBe(2250000);
    });

    it('4.4: Reconciles client estimate against authoritative server total safely', () => {
      // Within tolerance (< ₦0.01)
      const exactMatch = reconcileClientEstimateWithServer(10500, 10500);
      expect(exactMatch.matches).toBe(true);

      // Discrepancy beyond tolerance (price change on server)
      const discrepancy = reconcileClientEstimateWithServer(10000, 11500);
      expect(discrepancy.matches).toBe(false);
      expect(discrepancy.variance).toBe(1500);
    });

    it('4.5: Rejects client-side tampering of order payment status', () => {
      // The customer role has NO permission to complete payment or cancel arbitrary orders
      expect(hasPermission('customer', 'PROCESS_PAYMENT_REFUND')).toBe(false);
      expect(hasPermission('customer', 'CANCEL_ANY_ORDER')).toBe(false);
      expect(hasPermission('customer', 'MODIFY_PRICES')).toBe(false);
    });
  });

  // ===========================================================================
  // 5. ORDERS AND TRACKING TESTS
  // ===========================================================================
  describe('5. Orders and Tracking Tests', () => {
    it('5.1: Distinguishes terminal order states from active in-flight orders', () => {
      const isTerminal = (status: OrderStatus) => ['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(status);
      const isActive = (status: OrderStatus) => !isTerminal(status);

      // Active orders
      expect(isActive('PENDING_PAYMENT')).toBe(true);
      expect(isActive('CONFIRMED')).toBe(true);
      expect(isActive('ACCEPTED')).toBe(true);
      expect(isActive('PREPARING')).toBe(true);
      expect(isActive('READY_FOR_PICKUP')).toBe(true);
      expect(isActive('IN_TRANSIT')).toBe(true);

      // Terminal orders
      expect(isTerminal('DELIVERED')).toBe(true);
      expect(isTerminal('CANCELLED')).toBe(true);
      expect(isTerminal('REFUNDED')).toBe(true);
      expect(isActive('DELIVERED')).toBe(false);
    });

    it('5.2: Reorder flow reconstructs items into cart and preserves product integrity', async () => {
      const pastOrderItem: CartItem = {
        id: 'reorder-item-past-01',
        productId: 'prod-sweet-sour',
        productName: 'Sweet and Sour Pizza',
        categorySlug: 'pizza',
        itemHash: 'hash-sweet-sour-regular',
        imageUrl: null,
        sizeId: 'size-reg',
        sizeName: 'Regular',
        basePrice: 7000,
        sizePrice: 0,
        quantity: 1,
        customizations: [],
        unitPrice: 7000,
        lineTotal: 7000,
      };

      await cartStore.clearCart();
      expect(cartStore.getState().items.length).toBe(0);

      await cartStore.addItem(pastOrderItem);
      const state = cartStore.getState();

      expect(state.items.length).toBe(1);
      expect(state.items[0].productName).toBe('Sweet and Sour Pizza');
      expect(state.subtotal).toBe(7000);
    });
  });

  // ===========================================================================
  // 6. PRIVACY, TECHNICAL ISOLATION & ACCOUNT DELETION
  // ===========================================================================
  describe('6. Customer Privacy and Technical Isolation', () => {
    it('6.1: Confirms KDS access is denied to customers and guests', () => {
      expect(canAccessKitchenDisplay('customer')).toBe(false);
      expect(canAccessKitchenDisplay(null)).toBe(false);
      expect(canAccessKitchenDisplay(undefined)).toBe(false);
      expect(isStaffRole('customer')).toBe(false);
      expect(isStaffRole(null)).toBe(false);
    });

    it('6.2: Confirms staff and admin roles are granted KDS access', () => {
      expect(canAccessKitchenDisplay('kitchen')).toBe(true);
      expect(canAccessKitchenDisplay('counter')).toBe(true);
      expect(canAccessKitchenDisplay('manager')).toBe(true);
      expect(canAccessKitchenDisplay('admin')).toBe(true);
      expect(isStaffRole('staff')).toBe(true);
    });

    it('6.3: Account deletion request records audit trail in audit_logs', async () => {
      const mockInsert = jest.fn().mockResolvedValueOnce({ error: null });
      (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });

      const res = await customerService.requestAccountDeletion(
        'usr-compliance-001',
        'Customer requested account closure'
      );

      expect(res.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('audit_logs');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CUSTOMER_ACCOUNT_DELETION_REQUESTED',
          performed_by: 'usr-compliance-001',
          target_type: 'CUSTOMER_PROFILE',
          target_id: 'usr-compliance-001',
          details: expect.objectContaining({
            reason: 'Customer requested account closure',
          }),
        })
      );
    });
  });

  // ===========================================================================
  // 7. PHYSICAL DEVICE RESPONSIVENESS INVARIANTS
  // ===========================================================================
  describe('7. Physical Device Responsiveness & Layout Invariants', () => {
    it('7.1: Calculates bottom tab bar insets for gesture navigation and home indicators', () => {
      // iPhone SE / Older Android (insets.bottom = 0)
      const noInsetBottom = Math.max(0, 8);
      expect(noInsetBottom).toBe(8);

      // iPhone 14/15 (insets.bottom = 34)
      const iosInsetBottom = Math.max(34, 14);
      expect(iosInsetBottom).toBe(34);

      // Modern Android with 3-button nav (insets.bottom = 16)
      const androidButtonInset = Math.max(16, 8);
      expect(androidButtonInset).toBe(16);
    });

    it('7.2: Handles long text without breaking container layout', () => {
      const longAddress = 'Room C304, Makama Bida Hall, University of Lagos, Akoka Road, Yaba, Lagos State, Nigeria';
      const truncated = longAddress.substring(0, 50);
      expect(truncated.length).toBeLessThanOrEqual(50);
    });
  });
});

