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
  title?: string;
  landmarkId: string;
  landmarkName?: string;
  detailedAddress: string;
  estateOrHostel?: string | null;
  roomOrPlot?: string | null;
  streetAddress?: string | null;
  area?: string | null;
  contactPhone: string;
  deliveryNotes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface NewAddressInput {
  title?: string;
  landmarkId: string;
  detailedAddress: string;
  estateOrHostel?: string;
  roomOrPlot?: string;
  streetAddress?: string;
  area?: string;
  contactPhone: string;
  deliveryNotes?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

export interface AccountDeletionRequest {
  id: string;
  userId: string;
  reason?: string;
  requestedAt: string;
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
}
