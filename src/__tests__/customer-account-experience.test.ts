/**
 * AY Pizza — Customer Account Experience, Profile & Addresses Test Suite
 * 
 * Verifies customer authentication, profile updates, address CRUD,
 * account deletion compliance, RBAC screen isolation, and reorder flow.
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
import { supabase } from '../config/supabase';
import { cartStore } from '../domains/cart/cart-store';
import { CartItem } from '../domains/cart/cart-types';

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

describe('Customer Account Experience & Domain Services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Customer Authentication Service', () => {
    describe('signUpCustomer', () => {
      it('validates required fields before calling Supabase', async () => {
        // Missing email
        const res1 = await signUpCustomer('', 'password123', 'John Doe', '08130731895');
        expect(res1.success).toBe(false);
        expect(res1.error).toContain('email');

        // Invalid email
        const res2 = await signUpCustomer('invalid-email', 'password123', 'John Doe', '08130731895');
        expect(res2.success).toBe(false);
        expect(res2.error).toContain('valid email');

        // Short password
        const res3 = await signUpCustomer('test@aypizza.ng', '12345', 'John Doe', '08130731895');
        expect(res3.success).toBe(false);
        expect(res3.error).toContain('at least 6 characters');

        // Missing full name
        const res4 = await signUpCustomer('test@aypizza.ng', 'password123', '   ', '08130731895');
        expect(res4.success).toBe(false);
        expect(res4.error).toContain('Full name is required');

        // Short / invalid phone
        const res5 = await signUpCustomer('test@aypizza.ng', 'password123', 'John Doe', '12345');
        expect(res5.success).toBe(false);
        expect(res5.error).toContain('at least 10 digits');
      });

      it('calls supabase.auth.signUp with normalized credentials and metadata', async () => {
        const mockUser = { id: 'usr-123', email: 'john@unilag.edu.ng' };
        (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
          data: { user: mockUser },
          error: null,
        });

        const res = await signUpCustomer(
          '  JOHN@UNILAG.EDU.NG  ',
          'securePass123',
          '  John Doe  ',
          ' 0813-073-1895 '
        );

        expect(res.success).toBe(true);
        expect(res.user).toEqual(mockUser);
        expect(supabase.auth.signUp).toHaveBeenCalledWith({
          email: 'john@unilag.edu.ng',
          password: 'securePass123',
          options: {
            data: {
              full_name: 'John Doe',
              phone: '0813-073-1895',
            },
          },
        });
      });

      it('returns error when supabase.auth.signUp fails', async () => {
        (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({
          data: { user: null },
          error: { message: 'User already registered' },
        });

        const res = await signUpCustomer('existing@aypizza.ng', 'password123', 'Jane Doe', '08023456789');
        expect(res.success).toBe(false);
        expect(res.error).toBe('User already registered');
      });
    });

    describe('signInCustomer', () => {
      it('validates presence of email and password', async () => {
        const res1 = await signInCustomer('', 'password');
        expect(res1.success).toBe(false);
        expect(res1.error).toContain('Email');

        const res2 = await signInCustomer('test@aypizza.ng', '');
        expect(res2.success).toBe(false);
        expect(res2.error).toContain('Password');
      });

      it('signs in with trimmed, lowercase email', async () => {
        const mockUser = { id: 'usr-789', email: 'student@unilag.ng' };
        (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
          data: { user: mockUser },
          error: null,
        });

        const res = await signInCustomer(' Student@UNILAG.ng  ', 'correctPassword');
        expect(res.success).toBe(true);
        expect(res.user).toEqual(mockUser);
        expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
          email: 'student@unilag.ng',
          password: 'correctPassword',
        });
      });

      it('returns error on invalid credentials', async () => {
        (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
          data: { user: null },
          error: { message: 'Invalid login credentials' },
        });

        const res = await signInCustomer('test@aypizza.ng', 'wrongPass');
        expect(res.success).toBe(false);
        expect(res.error).toBe('Invalid login credentials');
      });
    });

    describe('sendPasswordResetEmail', () => {
      it('validates email format before sending reset email', async () => {
        const res = await sendPasswordResetEmail('not-an-email');
        expect(res.success).toBe(false);
        expect(res.error).toContain('valid email');
      });

      it('calls supabase.auth.resetPasswordForEmail with deep link redirect', async () => {
        (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValueOnce({
          error: null,
        });

        const res = await sendPasswordResetEmail('forgot@aypizza.ng');
        expect(res.success).toBe(true);
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          'forgot@aypizza.ng',
          { redirectTo: 'aypizza://reset-password' }
        );
      });
    });

    describe('signOutUser', () => {
      it('calls supabase.auth.signOut', async () => {
        (supabase.auth.signOut as jest.Mock).mockResolvedValueOnce({});
        await signOutUser();
        expect(supabase.auth.signOut).toHaveBeenCalled();
      });
    });
  });

  describe('2. Customer Profile Service', () => {
    describe('getProfile', () => {
      it('requires userId', async () => {
        const res = await customerService.getProfile('');
        expect(res.success).toBe(false);
        expect(res.error).toContain('User ID is required');
      });

      it('fetches and formats customer profile from profiles table', async () => {
        const mockRawProfile = {
          id: 'usr-123',
          full_name: 'Adeola Johnson',
          phone: '08130731895',
          email: 'adeola@unilag.edu.ng',
          role: 'customer',
          avatar_url: 'https://example.com/avatar.jpg',
          is_phone_verified: true,
          created_at: '2026-10-21T12:00:00Z',
          updated_at: '2026-10-29T10:00:00Z',
        };

        const mockSingle = jest.fn().mockResolvedValueOnce({ data: mockRawProfile, error: null });
        const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
        (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

        const res = await customerService.getProfile('usr-123');

        expect(res.success).toBe(true);
        expect(res.profile).toBeDefined();
        expect(res.profile?.fullName).toBe('Adeola Johnson');
        expect(res.profile?.email).toBe('adeola@unilag.edu.ng');
        expect(res.profile?.role).toBe('customer');
        expect(res.profile?.isPhoneVerified).toBe(true);
        expect(supabase.from).toHaveBeenCalledWith('profiles');
      });

      it('handles profile not found error', async () => {
        const mockSingle = jest.fn().mockResolvedValueOnce({ data: null, error: { message: 'Row not found' } });
        const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
        (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

        const res = await customerService.getProfile('non-existent');
        expect(res.success).toBe(false);
        expect(res.error).toBe('Row not found');
      });
    });

    describe('updateProfile', () => {
      it('requires userId', async () => {
        const res = await customerService.updateProfile('', { fullName: 'New Name' });
        expect(res.success).toBe(false);
        expect(res.error).toContain('User ID is required');
      });

      it('trims whitespace and updates profiles table', async () => {
        const updatedRow = {
          id: 'usr-123',
          full_name: 'Kemi Balogun',
          phone: '08098765432',
          email: 'kemi@unilag.edu.ng',
          role: 'customer',
          avatar_url: null,
          is_phone_verified: false,
          created_at: '2026-10-21T12:00:00Z',
          updated_at: '2026-10-29T11:00:00Z',
        };

        const mockSingle = jest.fn().mockResolvedValueOnce({ data: updatedRow, error: null });
        const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
        const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
        const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
        (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate });

        const res = await customerService.updateProfile('usr-123', {
          fullName: '  Kemi Balogun  ',
          phone: ' 08098765432 ',
        });

        expect(res.success).toBe(true);
        expect(res.profile?.fullName).toBe('Kemi Balogun');
        expect(res.profile?.phone).toBe('08098765432');
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            full_name: 'Kemi Balogun',
            phone: '08098765432',
          })
        );
      });
    });
  });

  describe('3. Customer Saved Addresses Management', () => {
    describe('getAddresses', () => {
      it('returns empty array if userId is empty', async () => {
        const res = await customerService.getAddresses('');
        expect(res.success).toBe(true);
        expect(res.addresses).toEqual([]);
      });

      it('fetches addresses joined with landmarks ordered by default and created_at', async () => {
        const mockAddressRows = [
          {
            id: 'addr-1',
            customer_id: 'usr-123',
            landmark_id: 'lm-jaja',
            detailed_address: 'Room B204, King Jaja Hall',
            contact_phone: '08130731895',
            delivery_notes: 'Call when at security gate',
            is_default: true,
            created_at: '2026-10-22T10:00:00Z',
            updated_at: '2026-10-22T10:00:00Z',
            delivery_landmarks: { id: 'lm-jaja', name: 'King Jaja Hall' },
          },
          {
            id: 'addr-2',
            customer_id: 'usr-123',
            landmark_id: 'lm-lib',
            detailed_address: 'Main Library 2nd Floor Study Room',
            contact_phone: '08130731895',
            delivery_notes: null,
            is_default: false,
            created_at: '2026-10-23T14:00:00Z',
            updated_at: '2026-10-23T14:00:00Z',
            delivery_landmarks: { id: 'lm-lib', name: 'Main Library' },
          },
        ];

        const mockOrder2 = jest.fn().mockResolvedValueOnce({ data: mockAddressRows, error: null });
        const mockOrder1 = jest.fn().mockReturnValue({ order: mockOrder2 });
        const mockEq = jest.fn().mockReturnValue({ order: mockOrder1 });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
        (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

        const res = await customerService.getAddresses('usr-123');

        expect(res.success).toBe(true);
        expect(res.addresses.length).toBe(2);
        expect(res.addresses[0].id).toBe('addr-1');
        expect(res.addresses[0].landmarkName).toBe('King Jaja Hall');
        expect(res.addresses[0].isDefault).toBe(true);
        expect(res.addresses[1].landmarkName).toBe('Main Library');
        expect(res.addresses[1].isDefault).toBe(false);
      });
    });

    describe('addAddress', () => {
      it('validates landmarkId, detailedAddress, and contactPhone', async () => {
        const res1 = await customerService.addAddress('usr-123', {
          landmarkId: '',
          detailedAddress: 'Room 12',
          contactPhone: '08130731895',
        });
        expect(res1.success).toBe(false);
        expect(res1.error).toContain('landmark');

        const res2 = await customerService.addAddress('usr-123', {
          landmarkId: 'lm-jaja',
          detailedAddress: '   ',
          contactPhone: '08130731895',
        });
        expect(res2.success).toBe(false);
        expect(res2.error).toContain('Detailed address');

        const res3 = await customerService.addAddress('usr-123', {
          landmarkId: 'lm-jaja',
          detailedAddress: 'Room 12',
          contactPhone: '   ',
        });
        expect(res3.success).toBe(false);
        expect(res3.error).toContain('Contact phone');
      });

      it('inserts address and unsets previous defaults when isDefault is true', async () => {
        const mockNewRow = {
          id: 'addr-new',
          customer_id: 'usr-123',
          landmark_id: 'lm-moremi',
          detailed_address: 'Room A101, Moremi Hall',
          contact_phone: '08012345678',
          delivery_notes: 'Leave with porter',
          is_default: true,
          created_at: '2026-10-29T12:00:00Z',
          updated_at: '2026-10-29T12:00:00Z',
          delivery_landmarks: { id: 'lm-moremi', name: 'Moremi Hall' },
        };

        const mockSingle = jest.fn().mockResolvedValueOnce({ data: mockNewRow, error: null });
        const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
        const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
        const mockEq = jest.fn().mockResolvedValueOnce({ error: null });
        const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });

        (supabase.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'customer_addresses') {
            return {
              update: mockUpdate,
              insert: mockInsert,
            };
          }
          return {};
        });

        const res = await customerService.addAddress('usr-123', {
          landmarkId: 'lm-moremi',
          detailedAddress: 'Room A101, Moremi Hall',
          contactPhone: '08012345678',
          deliveryNotes: 'Leave with porter',
          isDefault: true,
        });

        expect(res.success).toBe(true);
        expect(res.address?.id).toBe('addr-new');
        expect(res.address?.landmarkName).toBe('Moremi Hall');
        expect(res.address?.isDefault).toBe(true);
        // Verify default unsetting occurred
        expect(mockUpdate).toHaveBeenCalledWith({ is_default: false });
      });
    });

    describe('deleteAddress', () => {
      it('requires userId and addressId', async () => {
        const res = await customerService.deleteAddress('', 'addr-1');
        expect(res.success).toBe(false);
      });

      it('deletes address matching both id and customer_id', async () => {
        const mockEqCustomer = jest.fn().mockResolvedValueOnce({ error: null });
        const mockEqId = jest.fn().mockReturnValue({ eq: mockEqCustomer });
        const mockDelete = jest.fn().mockReturnValue({ eq: mockEqId });
        (supabase.from as jest.Mock).mockReturnValue({ delete: mockDelete });

        const res = await customerService.deleteAddress('usr-123', 'addr-1');
        expect(res.success).toBe(true);
        expect(mockEqId).toHaveBeenCalledWith('id', 'addr-1');
        expect(mockEqCustomer).toHaveBeenCalledWith('customer_id', 'usr-123');
      });
    });

    describe('setDefaultAddress', () => {
      it('unsets existing defaults then sets target address as default', async () => {
        const mockEqCustomer = jest.fn().mockResolvedValueOnce({ error: null });
        const mockEqId = jest.fn().mockReturnValue({ eq: mockEqCustomer });
        const mockUpdate2 = jest.fn().mockReturnValue({ eq: mockEqId });

        const mockEqUnset = jest.fn().mockResolvedValueOnce({ error: null });
        const mockUpdate1 = jest.fn().mockReturnValue({ eq: mockEqUnset });

        let callCount = 0;
        (supabase.from as jest.Mock).mockImplementation(() => {
          callCount++;
          if (callCount === 1) return { update: mockUpdate1 };
          return { update: mockUpdate2 };
        });

        const res = await customerService.setDefaultAddress('usr-123', 'addr-2');
        expect(res.success).toBe(true);
        expect(mockUpdate1).toHaveBeenCalledWith({ is_default: false });
        expect(mockUpdate2).toHaveBeenCalledWith(
          expect.objectContaining({ is_default: true })
        );
      });
    });
  });

  describe('4. Account Deletion Compliance', () => {
    it('requires userId', async () => {
      const res = await customerService.requestAccountDeletion('');
      expect(res.success).toBe(false);
    });

    it('safely logs deletion request in audit_logs table', async () => {
      const mockInsert = jest.fn().mockResolvedValueOnce({ error: null });
      (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });

      const res = await customerService.requestAccountDeletion('usr-123', 'Graduated from UNILAG');
      expect(res.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('audit_logs');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CUSTOMER_ACCOUNT_DELETION_REQUESTED',
          performed_by: 'usr-123',
          target_type: 'CUSTOMER_PROFILE',
          target_id: 'usr-123',
          details: expect.objectContaining({
            reason: 'Graduated from UNILAG',
          }),
        })
      );
    });
  });

  describe('5. RBAC & Customer Screen Isolation', () => {
    it('denies customer role access to Kitchen Display System (KDS)', () => {
      expect(canAccessKitchenDisplay('customer')).toBe(false);
      expect(isStaffRole('customer')).toBe(false);
    });

    it('allows staff roles access to KDS', () => {
      expect(isStaffRole('staff')).toBe(true);
      expect(isStaffRole('kitchen')).toBe(true);
      expect(isStaffRole('admin')).toBe(true);
      expect(isStaffRole('manager')).toBe(true);
      expect(isStaffRole('counter')).toBe(true);
    });

    it('denies unauthorized guest / null access to KDS and order creation', () => {
      expect(isStaffRole(null)).toBe(false);
      expect(canAccessKitchenDisplay(null)).toBe(false);
      expect(hasPermission(null, 'CREATE_ORDER')).toBe(false);
    });
  });

  describe('6. Reorder Experience Integration', () => {
    it('reconstructs cart items correctly for reordering', async () => {
      const sampleReorderItem: CartItem = {
        id: 'reorder-item-1',
        productId: 'prod-pepperoni',
        productName: 'Pepperoni Pizza',
        categorySlug: 'pizza',
        itemHash: 'pepperoni-medium-hash',
        imageUrl: 'https://images.unsplash.com/pepperoni',
        sizeId: 'size-medium',
        sizeName: 'Medium',
        basePrice: 6000,
        sizePrice: 2000,
        quantity: 2,
        customizations: [],
        unitPrice: 8000,
        lineTotal: 16000,
      };

      await cartStore.clearCart();
      expect(cartStore.getState().items.length).toBe(0);

      await cartStore.addItem(sampleReorderItem);
      const state = cartStore.getState();

      expect(state.items.length).toBe(1);
      expect(state.items[0].productName).toBe('Pepperoni Pizza');
      expect(state.items[0].quantity).toBe(2);
      expect(state.subtotal).toBe(16000);
      expect(state.itemCount).toBe(2);
    });
  });
});

