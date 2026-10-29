/**
 * AY Pizza — Customer Profile & Address Management Service
 * 
 * Interacts with Supabase `profiles` and `customer_addresses` tables
 * with strict user-ownership RLS compliance.
 */

import { supabase } from '../../config/supabase';
import { CustomerProfile, CustomerAddress, NewAddressInput } from './customer-types';

export class CustomerService {
  /**
   * Fetches the customer profile for a given user ID.
   */
  async getProfile(userId: string): Promise<{ success: boolean; profile?: CustomerProfile; error?: string }> {
    if (!userId) {
      return { success: false, error: 'User ID is required.' };
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const raw = data as any;
      if (error || !raw) {
        return { success: false, error: error?.message || 'Profile not found.' };
      }

      const profile: CustomerProfile = {
        id: raw.id,
        fullName: raw.full_name,
        phone: raw.phone,
        email: raw.email,
        role: raw.role as any,
        avatarUrl: raw.avatar_url,
        isPhoneVerified: Boolean(raw.is_phone_verified),
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
      };

      return { success: true, profile };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch customer profile.' };
    }
  }

  /**
   * Updates customer profile details (full_name and phone).
   * Note: The database trigger `prevent_role_self_escalation()` prevents altering `role`.
   */
  async updateProfile(
    userId: string,
    updates: { fullName?: string; phone?: string }
  ): Promise<{ success: boolean; profile?: CustomerProfile; error?: string }> {
    if (!userId) {
      return { success: false, error: 'User ID is required.' };
    }

    try {
      const payload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.fullName !== undefined) payload.full_name = updates.fullName.trim();
      if (updates.phone !== undefined) payload.phone = updates.phone.trim();

      const { data, error } = await (supabase
        .from('profiles') as any)
        .update(payload)
        .eq('id', userId)
        .select('*')
        .single();

      const raw = data as any;
      if (error || !raw) {
        return { success: false, error: error?.message || 'Failed to update profile.' };
      }

      const updatedProfile: CustomerProfile = {
        id: raw.id,
        fullName: raw.full_name,
        phone: raw.phone,
        email: raw.email,
        role: raw.role as any,
        avatarUrl: raw.avatar_url,
        isPhoneVerified: Boolean(raw.is_phone_verified),
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
      };

      return { success: true, profile: updatedProfile };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error updating profile.' };
    }
  }

  /**
   * Fetches all saved addresses for the authenticated customer.
   */
  async getAddresses(userId: string): Promise<{ success: boolean; addresses: CustomerAddress[]; error?: string }> {
    if (!userId) {
      return { success: true, addresses: [] };
    }

    try {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select(`
          id,
          customer_id,
          landmark_id,
          detailed_address,
          contact_phone,
          delivery_notes,
          is_default,
          created_at,
          updated_at,
          delivery_landmarks (
            id,
            name
          )
        `)
        .eq('customer_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, addresses: [], error: error.message };
      }

      const addresses: CustomerAddress[] = (data || []).map((row: any) => ({
        id: row.id,
        customerId: row.customer_id,
        landmarkId: row.landmark_id,
        landmarkName: row.delivery_landmarks?.name || 'UNILAG Campus',
        detailedAddress: row.detailed_address,
        contactPhone: row.contact_phone,
        deliveryNotes: row.delivery_notes,
        isDefault: Boolean(row.is_default),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return { success: true, addresses };
    } catch (err: any) {
      return { success: false, addresses: [], error: err.message || 'Failed to fetch addresses.' };
    }
  }

  /**
   * Adds a new delivery address for the customer.
   */
  async addAddress(
    userId: string,
    input: NewAddressInput
  ): Promise<{ success: boolean; address?: CustomerAddress; error?: string }> {
    if (!userId) {
      return { success: false, error: 'User ID is required.' };
    }

    if (!input.landmarkId) {
      return { success: false, error: 'A landmark must be selected.' };
    }

    if (!input.detailedAddress?.trim()) {
      return { success: false, error: 'Detailed address / room number is required.' };
    }

    if (!input.contactPhone?.trim()) {
      return { success: false, error: 'Contact phone number is required.' };
    }

    try {
      // If marking as default, unset other defaults first
      if (input.isDefault) {
        await (supabase
          .from('customer_addresses') as any)
          .update({ is_default: false })
          .eq('customer_id', userId);
      }

      const { data, error } = await (supabase
        .from('customer_addresses') as any)
        .insert({
          customer_id: userId,
          landmark_id: input.landmarkId,
          detailed_address: input.detailedAddress.trim(),
          contact_phone: input.contactPhone.trim(),
          delivery_notes: input.deliveryNotes?.trim() || null,
          is_default: Boolean(input.isDefault),
        })
        .select(`
          id,
          customer_id,
          landmark_id,
          detailed_address,
          contact_phone,
          delivery_notes,
          is_default,
          created_at,
          updated_at,
          delivery_landmarks (
            id,
            name
          )
        `)
        .single();

      const raw = data as any;
      if (error || !raw) {
        return { success: false, error: error?.message || 'Failed to save address.' };
      }

      const newAddress: CustomerAddress = {
        id: raw.id,
        customerId: raw.customer_id,
        landmarkId: raw.landmark_id,
        landmarkName: raw.delivery_landmarks?.name || 'UNILAG Campus',
        detailedAddress: raw.detailed_address,
        contactPhone: raw.contact_phone,
        deliveryNotes: raw.delivery_notes,
        isDefault: Boolean(raw.is_default),
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
      };

      return { success: true, address: newAddress };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error adding address.' };
    }
  }

  /**
   * Updates an existing address.
   */
  async updateAddress(
    userId: string,
    addressId: string,
    updates: Partial<NewAddressInput>
  ): Promise<{ success: boolean; error?: string }> {
    if (!userId || !addressId) {
      return { success: false, error: 'User ID and Address ID are required.' };
    }

    try {
      if (updates.isDefault) {
        await (supabase
          .from('customer_addresses') as any)
          .update({ is_default: false })
          .eq('customer_id', userId);
      }

      const payload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.landmarkId) payload.landmark_id = updates.landmarkId;
      if (updates.detailedAddress !== undefined) payload.detailed_address = updates.detailedAddress.trim();
      if (updates.contactPhone !== undefined) payload.contact_phone = updates.contactPhone.trim();
      if (updates.deliveryNotes !== undefined) payload.delivery_notes = updates.deliveryNotes?.trim() || null;
      if (updates.isDefault !== undefined) payload.is_default = updates.isDefault;

      const { error } = await (supabase
        .from('customer_addresses') as any)
        .update(payload)
        .eq('id', addressId)
        .eq('customer_id', userId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update address.' };
    }
  }

  /**
   * Deletes a saved address.
   */
  async deleteAddress(userId: string, addressId: string): Promise<{ success: boolean; error?: string }> {
    if (!userId || !addressId) {
      return { success: false, error: 'User ID and Address ID are required.' };
    }

    try {
      const { error } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', addressId)
        .eq('customer_id', userId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete address.' };
    }
  }

  /**
   * Sets an address as the default delivery address.
   */
  async setDefaultAddress(userId: string, addressId: string): Promise<{ success: boolean; error?: string }> {
    if (!userId || !addressId) {
      return { success: false, error: 'User ID and Address ID are required.' };
    }

    try {
      // 1. Unset all defaults
      await (supabase
        .from('customer_addresses') as any)
        .update({ is_default: false })
        .eq('customer_id', userId);

      // 2. Set this one as default
      const { error } = await (supabase
        .from('customer_addresses') as any)
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', addressId)
        .eq('customer_id', userId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to set default address.' };
    }
  }

  /**
   * Logs an account deletion request safely for compliance.
   */
  async requestAccountDeletion(userId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    if (!userId) {
      return { success: false, error: 'User ID is required.' };
    }

    try {
      // Record in audit log
      await (supabase.from('audit_logs') as any).insert({
        action: 'CUSTOMER_ACCOUNT_DELETION_REQUESTED' as any,
        performed_by: userId,
        target_type: 'CUSTOMER_PROFILE',
        target_id: userId,
        details: {
          reason: reason || 'Customer requested account deletion from mobile settings.',
          requestedAt: new Date().toISOString(),
        },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to process deletion request.' };
    }
  }
}

export const customerService = new CustomerService();
