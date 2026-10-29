/**
 * AY Pizza — Customer Domain Types
 * Defines data structures for Customer Profile, Saved Addresses,
 * and Account Preferences.
 */

import { UserRole } from '../../types/auth';

export interface CustomerProfile {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  isPhoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  landmarkId: string;
  landmarkName?: string;
  detailedAddress: string;
  contactPhone: string;
  deliveryNotes?: string | null;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface NewAddressInput {
  landmarkId: string;
  detailedAddress: string;
  contactPhone: string;
  deliveryNotes?: string;
  isDefault?: boolean;
}

export interface AccountDeletionRequest {
  id: string;
  userId: string;
  reason?: string;
  requestedAt: string;
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
}

