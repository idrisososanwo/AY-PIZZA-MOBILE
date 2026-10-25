/**
 * Supabase Database TypeScript Schema Definitions
 * Provides complete compile-time type-safety for Supabase queries and mutations.
 */

import { UserRole } from './auth';
import { OrderStatus } from './order';
import { FulfillmentType } from './delivery';
import { PaymentTransactionStatus } from './payment';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          email: string | null;
          role: UserRole;
          avatar_url: string | null;
          is_phone_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          role?: UserRole;
          avatar_url?: string | null;
          is_phone_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          role?: UserRole;
          avatar_url?: string | null;
          is_phone_verified?: boolean;
          updated_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          display_order?: number;
          is_active?: boolean;
        };
      };
      products: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          description: string;
          base_price: number;
          image_url: string | null;
          is_available: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          description: string;
          base_price: number;
          image_url?: string | null;
          is_available?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          name?: string;
          description?: string;
          base_price?: number;
          image_url?: string | null;
          is_available?: boolean;
          display_order?: number;
          updated_at?: string;
        };
      };
      product_sizes: {
        Row: {
          id: string;
          product_id: string | null; // null if universal (e.g. all pizzas)
          category_slug: string | null;
          name: string;
          size_price: number;
          is_available: boolean;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id?: string | null;
          category_slug?: string | null;
          name: string;
          size_price: number;
          is_available?: boolean;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          size_price?: number;
          is_available?: boolean;
          display_order?: number;
        };
      };
      customization_groups: {
        Row: {
          id: string;
          name: string;
          min_selections: number;
          max_selections: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          min_selections?: number;
          max_selections?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          min_selections?: number;
          max_selections?: number;
        };
      };
      customization_options: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          price: number;
          is_available: boolean;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          price: number;
          is_available?: boolean;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          name?: string;
          price?: number;
          is_available?: boolean;
          display_order?: number;
        };
      };
      delivery_zones: {
        Row: {
          id: string;
          name: string;
          base_fee: number;
          estimated_minutes_min: number;
          estimated_minutes_max: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          base_fee: number;
          estimated_minutes_min?: number;
          estimated_minutes_max?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          base_fee?: number;
          estimated_minutes_min?: number;
          estimated_minutes_max?: number;
          is_active?: boolean;
        };
      };
      delivery_landmarks: {
        Row: {
          id: string;
          zone_id: string;
          name: string;
          fee: number;
          is_campus: boolean;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          zone_id: string;
          name: string;
          fee: number;
          is_campus?: boolean;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          zone_id?: string;
          name?: string;
          fee?: number;
          is_campus?: boolean;
          display_order?: number;
          is_active?: boolean;
        };
      };
      customer_addresses: {
        Row: {
          id: string;
          customer_id: string;
          landmark_id: string;
          detailed_address: string;
          contact_phone: string;
          delivery_notes: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          landmark_id: string;
          detailed_address: string;
          contact_phone: string;
          delivery_notes?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          landmark_id?: string;
          detailed_address?: string;
          contact_phone?: string;
          delivery_notes?: string | null;
          is_default?: boolean;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_id: string | null;
          guest_email: string | null;
          guest_phone: string | null;
          guest_name: string | null;
          fulfillment_type: FulfillmentType;
          landmark_id: string | null;
          landmark_name: string | null;
          delivery_address: string | null;
          delivery_notes: string | null;
          subtotal: number;
          delivery_fee: number;
          discount_amount: number;
          total: number;
          status: OrderStatus;
          payment_reference: string | null;
          idempotency_key: string;
          receipt_token?: string;
          receipt_token_hash?: string;
          rejection_reason?: string | null;
          accepted_at?: string | null;
          prepared_at?: string | null;
          ready_at?: string | null;
          completed_at?: string | null;
          staff_notes?: string | null;
          assigned_staff_id?: string | null;
          version: number;
          refund_status: 'NOT_APPLICABLE' | 'REFUND_REQUIRED' | 'REFUND_PENDING' | 'REFUNDED';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number?: string;
          customer_id?: string | null;
          guest_email?: string | null;
          guest_phone?: string | null;
          guest_name?: string | null;
          fulfillment_type: FulfillmentType;
          landmark_id?: string | null;
          landmark_name?: string | null;
          delivery_address?: string | null;
          delivery_notes?: string | null;
          subtotal: number;
          delivery_fee: number;
          discount_amount?: number;
          total: number;
          status?: OrderStatus;
          payment_reference?: string | null;
          idempotency_key: string;
          receipt_token?: string;
          receipt_token_hash?: string;
          rejection_reason?: string | null;
          accepted_at?: string | null;
          prepared_at?: string | null;
          ready_at?: string | null;
          completed_at?: string | null;
          staff_notes?: string | null;
          assigned_staff_id?: string | null;
          version?: number;
          refund_status?: 'NOT_APPLICABLE' | 'REFUND_REQUIRED' | 'REFUND_PENDING' | 'REFUNDED';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          status?: OrderStatus;
          payment_reference?: string | null;
          rejection_reason?: string | null;
          accepted_at?: string | null;
          prepared_at?: string | null;
          ready_at?: string | null;
          completed_at?: string | null;
          staff_notes?: string | null;
          assigned_staff_id?: string | null;
          version?: number;
          refund_status?: 'NOT_APPLICABLE' | 'REFUND_REQUIRED' | 'REFUND_PENDING' | 'REFUNDED';
          updated_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          product_name: string;
          size_name: string | null;
          size_price: number;
          quantity: number;
          unit_base_price: number;
          customizations_total: number;
          item_total: number;
          half_secondary_flavor: string | null;
          flavors: string[] | null;
          special_instructions: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          product_name: string;
          size_name?: string | null;
          size_price?: number;
          quantity: number;
          unit_base_price: number;
          customizations_total?: number;
          item_total: number;
          half_secondary_flavor?: string | null;
          flavors?: string[] | null;
          special_instructions?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          quantity?: number;
          item_total?: number;
        };
      };
      order_item_customizations: {
        Row: {
          id: string;
          order_item_id: string;
          option_id: string;
          option_name: string;
          price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_item_id: string;
          option_id: string;
          option_name: string;
          price: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          option_name?: string;
          price?: number;
        };
      };
      payment_transactions: {
        Row: {
          id: string;
          order_id: string;
          gateway: string;
          reference: string;
          amount: number;
          amount_in_kobo: number;
          currency: string;
          status: PaymentTransactionStatus;
          channel: string | null;
          paid_at: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          gateway?: string;
          reference: string;
          amount: number;
          amount_in_kobo: number;
          currency?: string;
          status?: PaymentTransactionStatus;
          channel?: string | null;
          paid_at?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          status?: PaymentTransactionStatus;
          channel?: string | null;
          paid_at?: string | null;
          metadata?: Json | null;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          action: string;
          performed_by: string | null;
          target_type: string;
          target_id: string;
          details: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action: string;
          performed_by?: string | null;
          target_type: string;
          target_id: string;
          details?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: never; // Audit logs are strictly immutable
      };
    };
    Functions: {
      create_order_authoritative: {
        Args: {
          p_fulfillment_type: FulfillmentType;
          p_landmark_id?: string | null;
          p_delivery_address?: string | null;
          p_delivery_notes?: string | null;
          p_guest_email?: string | null;
          p_guest_phone: string;
          p_guest_name: string;
          p_idempotency_key: string;
          p_items: Json;
        };
        Returns: {
          success: boolean;
          is_retry?: boolean;
          order_id: string;
          order_number: string;
          receipt_token: string;
          subtotal: number;
          delivery_fee: number;
          total: number;
          total_in_kobo: number;
          status: string;
          error?: string;
        };
      };
      get_order_by_receipt: {
        Args: {
          p_order_id: string;
          p_receipt_token: string;
        };
        Returns: {
          success: boolean;
          order?: any;
          error?: string;
        };
      };
      settle_order_payment: {
        Args: {
          p_order_id: string;
          p_reference: string;
          p_gateway: string;
          p_amount_in_kobo: number;
          p_channel: string;
          p_metadata: Json;
        };
        Returns: {
          success: boolean;
          order_id?: string;
          order_number?: string;
          status?: string;
          payment_reference?: string;
          already_settled?: boolean;
          error?: string;
        };
      };
    };
  };
}
