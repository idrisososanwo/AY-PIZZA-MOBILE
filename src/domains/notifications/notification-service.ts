/**
 * AY Pizza — Customer Push Notification & Device Token Management
 * 
 * Implements secure Expo Push Notification registration, permission management,
 * token lifecycle tracking, and clean account deactivation upon logout.
 * 
 * Security & Reliability Rules:
 * 1. Expo access tokens (push send secrets) are NEVER stored or accessed in client code.
 * 2. Token registration passes through validated PostgreSQL RPCs.
 * 3. On account switch or logout, device tokens are deactivated on the server.
 * 4. Respectful permission model: clear contextual prompt before native dialog.
 * 5. Cross-platform safe: Web and emulators fall back gracefully.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../config/supabase';

// Configure foreground notification presentation handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldPresentAlert: true,
    shouldShowList: true,
  }),
});

const STORED_PUSH_TOKEN_KEY = 'ay_pizza_device_push_token_v1';
const PERMISSION_EXPLAINED_KEY = 'ay_pizza_notif_permission_explained_v1';
const GUEST_DEVICE_ID_KEY = 'ay_pizza_guest_device_id_v1';

export type NotificationPermissionState = 'undetermined' | 'granted' | 'denied' | 'unsupported';

export interface DeviceTokenRegistrationResult {
  success: boolean;
  pushToken?: string;
  status: NotificationPermissionState;
  error?: string;
}

export class NotificationService {
  /**
   * Retrieves or creates a stable anonymous device ID for guest push token registration.
   */
  async getOrCreateGuestDeviceId(): Promise<string> {
    try {
      let guestId = await AsyncStorage.getItem(GUEST_DEVICE_ID_KEY);
      if (!guestId) {
        guestId = `guest_dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
        await AsyncStorage.setItem(GUEST_DEVICE_ID_KEY, guestId);
      }
      return guestId;
    } catch {
      return `guest_fallback_${Date.now()}`;
    }
  }

  /**
   * Checks current notification permission without triggering a native system prompt.
   */
  async checkPermissionStatus(): Promise<NotificationPermissionState> {
    if (Platform.OS === 'web' || !Device.isDevice) {
      return 'unsupported';
    }

    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') return 'granted';
      if (status === 'denied') return 'denied';
      return 'undetermined';
    } catch {
      return 'unsupported';
    }
  }

  /**
   * Checks whether the explanatory modal or prompt has already been shown to the user.
   */
  async hasExplainedPermission(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(PERMISSION_EXPLAINED_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Records that the user has seen the explanatory notification rationale.
   */
  async markPermissionExplained(): Promise<void> {
    try {
      await AsyncStorage.setItem(PERMISSION_EXPLAINED_KEY, 'true');
    } catch {
      // Ignore local storage error
    }
  }

  /**
   * Requests native push permissions and registers the resulting Expo Push Token
   * with the AY Pizza backend database.
   */
  async requestPermissionAndRegister(): Promise<DeviceTokenRegistrationResult> {
    if (Platform.OS === 'web' || !Device.isDevice) {
      return {
        success: false,
        status: 'unsupported',
        error: 'Push notifications require a physical iOS or Android mobile device.',
      };
    }

    try {
      // Mark explanation shown
      await this.markPermissionExplained();

      // Check current permission
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return {
          success: false,
          status: 'denied',
          error: 'Notification permission was declined.',
        };
      }

      // Configure Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('order_updates', {
          name: 'Order Updates',
          importance: AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#ff7700',
          sound: 'default',
        });
      }

      // Obtain Expo Push Token
      const tokenResponse = await Notifications.getExpoPushTokenAsync();
      const pushToken = tokenResponse.data;

      if (!pushToken) {
        return {
          success: false,
          status: 'granted',
          error: 'Failed to retrieve Expo push token from provider.',
        };
      }

      // Persist locally
      await AsyncStorage.setItem(STORED_PUSH_TOKEN_KEY, pushToken);

      // Register with PostgreSQL backend
      const guestDeviceId = await this.getOrCreateGuestDeviceId();
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';

      const { data, error } = await (supabase.rpc as any)('register_device_push_token', {
        p_push_token: pushToken,
        p_platform: platform,
        p_guest_device_id: guestDeviceId,
      });

      if (error) {
        return {
          success: false,
          pushToken,
          status: 'granted',
          error: error.message || 'Database token registration failed.',
        };
      }

      return {
        success: true,
        pushToken,
        status: 'granted',
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'unsupported',
        error: err.message || 'Push registration failed.',
      };
    }
  }

  /**
   * Deactivates the current device token on server and removes from local storage
   * upon user logout or account switching to prevent notification leakage.
   */
  async deactivateCurrentToken(reason: string = 'User Logged Out'): Promise<boolean> {
    try {
      const storedToken = await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
      if (storedToken) {
        await (supabase.rpc as any)('deactivate_device_push_token', {
          p_push_token: storedToken,
          p_reason: reason,
        });
        await AsyncStorage.removeItem(STORED_PUSH_TOKEN_KEY);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves locally stored active push token if registered.
   */
  async getStoredPushToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
    } catch {
      return null;
    }
  }
}

export const notificationService = new NotificationService();
