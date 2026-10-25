/**
 * Supabase Client Initialization for AY Pizza Mobile Application
 * Configured with AsyncStorage for React Native session persistence and auto-refresh tokens.
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Config } from './env';
import { Database } from '../types/database';

export const supabase = createClient<Database>(
  Config.supabaseUrl,
  Config.supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);
