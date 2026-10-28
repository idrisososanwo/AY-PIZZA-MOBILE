/**
 * Safe, validated environment configuration for AY Pizza Mobile
 * Exposes client-facing variables and strictly guards against secret leakage.
 */

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  paystackPublicKey: string;
  appEnv: 'development' | 'staging' | 'production';
  isDevelopment: boolean;
  isProduction: boolean;
}

// Fallback values allow unit tests and offline development shells to boot cleanly
const DEFAULT_SUPABASE_URL = 'https://placeholder-aypizza.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder-anon-key';
const DEFAULT_PAYSTACK_KEY = 'pk_test_placeholder_key';

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const rawPaystackKey = process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY;
const rawAppEnv = process.env.EXPO_PUBLIC_APP_ENV;

export const Config: AppConfig = {
  supabaseUrl: (rawSupabaseUrl && rawSupabaseUrl.trim().length > 0) ? rawSupabaseUrl.trim() : DEFAULT_SUPABASE_URL,
  supabaseAnonKey: (rawAnonKey && rawAnonKey.trim().length > 0) ? rawAnonKey.trim() : DEFAULT_SUPABASE_ANON_KEY,
  paystackPublicKey: (rawPaystackKey && rawPaystackKey.trim().length > 0) ? rawPaystackKey.trim() : DEFAULT_PAYSTACK_KEY,
  appEnv: ((rawAppEnv && rawAppEnv.trim().length > 0 ? rawAppEnv.trim() : 'development') as AppConfig['appEnv']),
  isDevelopment: (rawAppEnv || 'development').trim() === 'development',
  isProduction: (rawAppEnv || '').trim() === 'production',
};

/**
 * Validates that production and staging configurations have non-placeholder credentials.
 */
export const validateEnvironmentConfig = (): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const isLiveEnv = Config.appEnv === 'production' || Config.appEnv === 'staging';
  if (isLiveEnv) {
    if (!rawSupabaseUrl || Config.supabaseUrl.includes('placeholder')) {
      errors.push(`EXPO_PUBLIC_SUPABASE_URL must be configured with a valid Supabase project URL in ${Config.appEnv} mode.`);
    }
    if (!rawAnonKey || Config.supabaseAnonKey.includes('placeholder')) {
      errors.push(`EXPO_PUBLIC_SUPABASE_ANON_KEY must be configured with a valid Supabase anonymous key in ${Config.appEnv} mode.`);
    }
    if (!rawPaystackKey || Config.paystackPublicKey.includes('placeholder')) {
      errors.push(`EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY must be configured with a valid Paystack public key in ${Config.appEnv} mode.`);
    }
  }
  return { valid: errors.length === 0, errors };
};

export const validateProductionConfig = validateEnvironmentConfig;
