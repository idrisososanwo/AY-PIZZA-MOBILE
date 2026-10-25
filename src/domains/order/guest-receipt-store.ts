/**
 * AY Pizza — Guest Receipt Credential SecureStore Repository
 *
 * Implements hardware-backed, encrypted credential persistence for guest customer
 * order receipt tokens using Expo SecureStore (iOS Keychain / Android Keystore).
 *
 * Retention & Recovery Policy:
 * 1. Scenario A (App Restart / State Reset): Token was received by client and is
 *    restored securely from hardware-backed SecureStore.
 * 2. Scenario B (Lost Initial Response): Network dropped before client received token.
 *    SecureStore cannot recover a token it never received. Local recovery is impossible;
 *    server-side phone-number OTP recovery is required.
 * 3. Delivered & Cancelled Orders: Credentials MUST be retained so the customer can
 *    inspect order history, cancellation reasons, and refund status. Credentials
 *    are NEVER prematurely deleted upon cancellation.
 * 4. Cleanup: Credentials are pruned only when explicitly dismissed by the user or
 *    when the device exceeds maximum history capacity (FIFO max 20).
 * 5. Master Index Concurrency: All reads and writes to the master index are serialized
 *    via an internal async mutex to eliminate race conditions between concurrent saves/deletes.
 */

import * as SecureStore from 'expo-secure-store';

export interface GuestReceiptRecord {
  orderId: string;
  orderNumber: string;
  receiptToken: string;
  savedAt: string;
}

const INDEX_STORAGE_KEY = 'ay_pizza_guest_receipts_idx_v1';
const RECEIPT_KEY_PREFIX = 'ay_rcpt_';

/**
 * Sanitizes keys to meet SecureStore alphanumeric, '.', '-', '_' requirements.
 */
function getSecureStoreKey(orderId: string): string {
  const sanitized = orderId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${RECEIPT_KEY_PREFIX}${sanitized}`;
}

export class GuestReceiptStore {
  // Internal async mutex to serialize all master index read-modify-write operations
  private static indexLock: Promise<any> = Promise.resolve();

  private static async withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
    const previousLock = this.indexLock;
    let releaseLock: () => void;
    this.indexLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await previousLock;
      return await fn();
    } finally {
      releaseLock!();
    }
  }

  /**
   * Securely saves a guest order's receipt token in hardware-backed SecureStore.
   * Serializes index update using an async mutex to prevent concurrent write loss.
   */
  static async saveReceipt(orderId: string, orderNumber: string, receiptToken: string): Promise<boolean> {
    if (!orderId || !receiptToken) {
      return false;
    }

    try {
      const record: GuestReceiptRecord = {
        orderId: orderId.trim(),
        orderNumber: (orderNumber || '').trim(),
        receiptToken: receiptToken.trim(),
        savedAt: new Date().toISOString(),
      };

      const itemKey = getSecureStoreKey(orderId);
      await SecureStore.setItemAsync(itemKey, JSON.stringify(record));

      // Serialize index update via mutex
      await this.withIndexLock(async () => {
        const currentIdx = await this.getOrderIndex();
        if (!currentIdx.includes(orderId)) {
          currentIdx.unshift(orderId);
          // Retain max 20 recent guest orders on device (FIFO)
          const trimmedIdx = currentIdx.slice(0, 20);
          await SecureStore.setItemAsync(INDEX_STORAGE_KEY, JSON.stringify(trimmedIdx));
        }
      });

      return true;
    } catch {
      // Intentionally do not log receiptToken or sensitive parameters
      return false;
    }
  }

  /**
   * Retrieves a stored receipt token for a specific order.
   */
  static async getReceipt(orderId: string): Promise<GuestReceiptRecord | null> {
    if (!orderId) {
      return null;
    }

    try {
      const itemKey = getSecureStoreKey(orderId);
      const raw = await SecureStore.getItemAsync(itemKey);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as GuestReceiptRecord;
    } catch {
      return null;
    }
  }

  /**
   * Restores all active guest receipts stored on the device.
   */
  static async getAllReceipts(): Promise<GuestReceiptRecord[]> {
    try {
      const index = await this.getOrderIndex();
      const records: GuestReceiptRecord[] = [];

      for (const orderId of index) {
        const itemKey = getSecureStoreKey(orderId);
        const raw = await SecureStore.getItemAsync(itemKey);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as GuestReceiptRecord;
            records.push(parsed);
          } catch {
            // Ignore corrupted individual entry
          }
        }
      }

      return records;
    } catch {
      return [];
    }
  }

  /**
   * Removes a specific guest order receipt credential from SecureStore upon explicit user dismissal.
   * Note: Cancelled and delivered orders are NOT auto-deleted so the customer maintains receipt visibility.
   */
  static async removeReceipt(orderId: string): Promise<boolean> {
    if (!orderId) {
      return false;
    }

    try {
      const itemKey = getSecureStoreKey(orderId);
      await SecureStore.deleteItemAsync(itemKey);

      await this.withIndexLock(async () => {
        const currentIdx = await this.getOrderIndex();
        const updatedIdx = currentIdx.filter((id) => id !== orderId);
        await SecureStore.setItemAsync(INDEX_STORAGE_KEY, JSON.stringify(updatedIdx));
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely clears all guest receipts from device SecureStore upon user request.
   */
  static async clearAllReceipts(): Promise<boolean> {
    try {
      return await this.withIndexLock(async () => {
        const index = await this.getOrderIndex();
        for (const orderId of index) {
          const itemKey = getSecureStoreKey(orderId);
          await SecureStore.deleteItemAsync(itemKey);
        }
        await SecureStore.deleteItemAsync(INDEX_STORAGE_KEY);
        return true;
      });
    } catch {
      return false;
    }
  }

  /**
   * Internal helper to fetch the list of active order IDs from SecureStore.
   */
  private static async getOrderIndex(): Promise<string[]> {
    try {
      const raw = await SecureStore.getItemAsync(INDEX_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
