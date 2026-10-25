/**
 * Authentication and Role-Based Access Control Types
 */

export type UserRole = 'customer' | 'staff' | 'admin' | 'rider' | 'kitchen' | 'counter' | 'manager';

export interface UserProfile {
  id: string; // References auth.users(id)
  fullName: string | null;
  phone: string | null;
  email: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  isPhoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GuestSession {
  isGuest: true;
  guestEmail: string;
  guestPhone: string;
  guestName: string;
}

export interface AuthSessionState {
  user: UserProfile | null;
  guest: GuestSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
