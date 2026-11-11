/**
 * AY Pizza & Ice Cream — Delivery Zones & Pricing Engine
 * 
 * Provides configurable delivery pricing, distance calculations,
 * operational switches, and server-synchronized landmark tariffs.
 */

import { supabase } from '../../config/supabase';
import {
  DeliveryConfig,
  DeliveryLandmark,
  DeliveryQuote,
  DeliveryZone,
  FulfillmentType,
  PricingModel,
} from '../../types/delivery';
import { locationService, STORE_COORDINATES, DEFAULT_MAX_DELIVERY_RADIUS_KM, Coordinates } from './location-service';

/**
 * Provisional Delivery Landmarks & Fees Table
 * NOTE: These rates are reverse-engineered estimates derived from the legacy web portal
 * and are strictly PROVISIONAL pending explicit sign-off from the restaurant owner.
 * In production, rates are database-driven in public.delivery_landmarks and can be updated
 * at any time by administrators without application redeployment.
 */
export const PROVISIONAL_LANDMARKS: DeliveryLandmark[] = [
  { id: '77777777-7777-7777-7777-777777777701', zoneId: 'zone-campus', name: 'Inside School (UNILAG Campus)', fee: 500, isCampus: true, displayOrder: 1, isActive: true },
  { id: '77777777-7777-7777-7777-777777777702', zoneId: 'zone-near', name: 'Abule Oja', fee: 1000, isCampus: false, displayOrder: 2, isActive: true },
  { id: '77777777-7777-7777-7777-777777777703', zoneId: 'zone-near', name: 'Akoka', fee: 1000, isCampus: false, displayOrder: 3, isActive: true },
  { id: '77777777-7777-7777-7777-777777777704', zoneId: 'zone-near', name: 'Onike', fee: 1000, isCampus: false, displayOrder: 4, isActive: true },
  { id: '77777777-7777-7777-7777-777777777705', zoneId: 'zone-near', name: 'Iwaya', fee: 1000, isCampus: false, displayOrder: 5, isActive: true },
  { id: '77777777-7777-7777-7777-777777777706', zoneId: 'zone-near', name: 'Abule Ijesha', fee: 1200, isCampus: false, displayOrder: 6, isActive: true },
  { id: '77777777-7777-7777-7777-777777777707', zoneId: 'zone-near', name: 'Bariga', fee: 1500, isCampus: false, displayOrder: 7, isActive: true },
  { id: '77777777-7777-7777-7777-777777777708', zoneId: 'zone-mid', name: 'Makoko', fee: 2000, isCampus: false, displayOrder: 8, isActive: true },
  { id: '77777777-7777-7777-7777-777777777709', zoneId: 'zone-mid', name: 'Alagomeji', fee: 2000, isCampus: false, displayOrder: 9, isActive: true },
  { id: '77777777-7777-7777-7777-777777777710', zoneId: 'zone-mid', name: 'Bajuliaye', fee: 2000, isCampus: false, displayOrder: 10, isActive: true },
  { id: '77777777-7777-7777-7777-777777777711', zoneId: 'zone-mid', name: 'Shomolu', fee: 2000, isCampus: false, displayOrder: 11, isActive: true },
  { id: '77777777-7777-7777-7777-777777777712', zoneId: 'zone-mid', name: 'Yaba', fee: 2000, isCampus: false, displayOrder: 12, isActive: true },
  { id: '77777777-7777-7777-7777-777777777713', zoneId: 'zone-mid', name: 'Palmgroove', fee: 2500, isCampus: false, displayOrder: 13, isActive: true },
  { id: '77777777-7777-7777-7777-777777777714', zoneId: 'zone-far', name: 'Luth (Idi-Araba)', fee: 3000, isCampus: false, displayOrder: 14, isActive: true },
  { id: '77777777-7777-7777-7777-777777777715', zoneId: 'zone-far', name: 'Onipanu', fee: 3000, isCampus: false, displayOrder: 15, isActive: true },
  { id: '77777777-7777-7777-7777-777777777716', zoneId: 'zone-far', name: 'Surulere', fee: 3500, isCampus: false, displayOrder: 16, isActive: true },
  { id: '77777777-7777-7777-7777-777777777717', zoneId: 'zone-far', name: 'Gbagada', fee: 4000, isCampus: false, displayOrder: 17, isActive: true },
  { id: '77777777-7777-7777-7777-777777777718', zoneId: 'zone-far', name: 'Ebute Meta', fee: 4000, isCampus: false, displayOrder: 18, isActive: true },
  { id: '77777777-7777-7777-7777-777777777719', zoneId: 'zone-far', name: 'Oworo', fee: 4000, isCampus: false, displayOrder: 19, isActive: true },
];

/** Backward-compatible alias — note: rates are provisional */
export const VERIFIED_LANDMARKS = PROVISIONAL_LANDMARKS;

/**
 * Standard Verified Delivery Zones for Lagos Mainland & UNILAG Environs
 */
export const VERIFIED_DELIVERY_ZONES: DeliveryZone[] = [
  {
    id: 'zone-campus',
    name: 'UNILAG Campus (Inside School)',
    baseFee: 500,
    estimatedMinutesMin: 15,
    estimatedMinutesMax: 25,
    isActive: true,
  },
  {
    id: 'zone-near',
    name: 'Lagos Mainland - Inner Environs (Akoka, Abule Oja, Onike, Iwaya, Bariga)',
    baseFee: 1000,
    estimatedMinutesMin: 25,
    estimatedMinutesMax: 40,
    isActive: true,
  },
  {
    id: 'zone-mid',
    name: 'Lagos Mainland - Mid Environs (Yaba, Shomolu, Alagomeji, Makoko, Palmgroove)',
    baseFee: 2000,
    estimatedMinutesMin: 30,
    estimatedMinutesMax: 50,
    isActive: true,
  },
  {
    id: 'zone-far',
    name: 'Lagos Mainland - Outer Environs (Surulere, Idi-Araba, Gbagada, Ebute Metta, Oworo)',
    baseFee: 3500,
    estimatedMinutesMin: 45,
    estimatedMinutesMax: 65,
    isActive: true,
  },
];

/**
 * Default Delivery Configuration
 */
export const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  storeName: 'AY Pizza & Ice Cream (UNILAG Kitchen)',
  storeAddress: 'Opposite King Jaja Hall, University of Lagos (UNILAG), Akoka, Lagos, Nigeria',
  storeLatitude: STORE_COORDINATES.latitude,
  storeLongitude: STORE_COORDINATES.longitude,
  maxDeliveryRadiusKm: DEFAULT_MAX_DELIVERY_RADIUS_KM,
  minDeliveryFee: 500,
  pricingModel: 'zone_landmark',
  isDeliveryActive: true,
  isPickupActive: true,
  pickupFee: 0,
};

export interface DeliveryQuoteOptions {
  fulfillmentType: FulfillmentType;
  landmarkId?: string;
  landmarkName?: string;
  customerCoordinates?: Coordinates;
}

export class DeliveryPricingEngine {
  private config: DeliveryConfig = { ...DEFAULT_DELIVERY_CONFIG };
  private landmarks: DeliveryLandmark[] = [...PROVISIONAL_LANDMARKS];
  private zones: DeliveryZone[] = [...VERIFIED_DELIVERY_ZONES];
  private isLoadedFromDb = false;

  /**
   * Initializes and synchronizes active landmarks and config with Supabase.
   * Safe offline fallback to local verified defaults.
   */
  async initialize(): Promise<void> {
    try {
      // 1. Fetch delivery configuration from database
      const { data: configData, error: configError } = await supabase
        .from('delivery_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (!configError && configData) {
        const raw = configData as any;
        this.config = {
          id: raw.id,
          storeName: raw.store_name || this.config.storeName,
          storeAddress: raw.store_address || this.config.storeAddress,
          storeLatitude: Number(raw.store_latitude) || this.config.storeLatitude,
          storeLongitude: Number(raw.store_longitude) || this.config.storeLongitude,
          maxDeliveryRadiusKm: Number(raw.max_delivery_radius_km) || this.config.maxDeliveryRadiusKm,
          minDeliveryFee: Number(raw.min_delivery_fee) || this.config.minDeliveryFee,
          pricingModel: (raw.pricing_model as PricingModel) || this.config.pricingModel,
          isDeliveryActive: raw.is_delivery_active !== undefined ? Boolean(raw.is_delivery_active) : true,
          isPickupActive: raw.is_pickup_active !== undefined ? Boolean(raw.is_pickup_active) : true,
          pickupFee: 0,
        };
      }

      // 2. Fetch active landmarks from database
      const { data: landmarkData, error: landmarkError } = await supabase
        .from('delivery_landmarks')
        .select('*')
        .order('display_order', { ascending: true });

      if (!landmarkError && landmarkData && landmarkData.length > 0) {
        this.landmarks = landmarkData.map((row: any) => ({
          id: row.id,
          zoneId: row.zone_id,
          name: row.name,
          fee: Number(row.delivery_fee || row.fee || 500),
          isCampus: Boolean(row.is_campus),
          displayOrder: Number(row.display_order || 0),
          isActive: Boolean(row.is_active),
        }));
      }

      this.isLoadedFromDb = true;
    } catch {
      // Offline fallback: retains verified default landmarks and configuration
      this.isLoadedFromDb = false;
    }
  }

  /**
   * Resets configuration and landmarks to default verified state (useful for tests and rollbacks).
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_DELIVERY_CONFIG };
    this.landmarks = [...PROVISIONAL_LANDMARKS];
    this.zones = [...VERIFIED_DELIVERY_ZONES];
  }

  /**
   * Returns current active delivery configuration.
   */
  getConfig(): DeliveryConfig {
    return { ...this.config };
  }

  /**
   * Returns all active delivery landmarks.
   */
  getActiveLandmarks(): DeliveryLandmark[] {
    return this.landmarks.filter((l) => l.isActive);
  }

  /**
   * Returns all delivery zones.
   */
  getZones(): DeliveryZone[] {
    return [...this.zones];
  }

  /**
   * Finds a landmark by ID or exact name.
   */
  findLandmark(idOrName?: string): DeliveryLandmark | null {
    if (!idOrName) return null;
    const query = idOrName.trim().toLowerCase();
    return (
      this.landmarks.find((l) => {
        if (l.id.toLowerCase() === query || l.name.toLowerCase() === query) {
          return true;
        }
        if (query.startsWith('lm-')) {
          const num = parseInt(query.replace('lm-', ''), 10);
          return l.displayOrder === num;
        }
        return false;
      }) || null
    );
  }

  /**
   * Computes an authoritative delivery quote for a fulfillment selection.
   */
  calculateQuote(options: DeliveryQuoteOptions): DeliveryQuote {
    // 1. Pickup Fulfillment (Strictly ₦0)
    if (options.fulfillmentType === 'pickup') {
      if (!this.config.isPickupActive) {
        return {
          fulfillmentType: 'pickup',
          isAvailable: false,
          deliveryFee: 0,
          estimatedMinutesMin: 0,
          estimatedMinutesMax: 0,
          reason: 'In-store pickup is temporarily unavailable.',
        };
      }

      return {
        fulfillmentType: 'pickup',
        isAvailable: true,
        deliveryFee: 0,
        estimatedMinutesMin: 15,
        estimatedMinutesMax: 25,
      };
    }

    // 2. Delivery Fulfillment Validation
    if (!this.config.isDeliveryActive) {
      return {
        fulfillmentType: 'delivery',
        isAvailable: false,
        deliveryFee: 0,
        estimatedMinutesMin: 0,
        estimatedMinutesMax: 0,
        reason: 'Delivery service is currently closed. Please choose in-store pickup.',
      };
    }

    // 3. Optional Distance Calculation & Boundary Validation
    let calculatedDistanceKm: number | undefined;
    if (options.customerCoordinates) {
      calculatedDistanceKm = locationService.calculateDistanceKm(
        { latitude: this.config.storeLatitude, longitude: this.config.storeLongitude },
        options.customerCoordinates
      );

      if (calculatedDistanceKm > this.config.maxDeliveryRadiusKm) {
        return {
          fulfillmentType: 'delivery',
          isAvailable: false,
          deliveryFee: 0,
          estimatedMinutesMin: 0,
          estimatedMinutesMax: 0,
          distanceKm: calculatedDistanceKm,
          reason: `Delivery is not available beyond ${this.config.maxDeliveryRadiusKm} km from UNILAG kitchen (${calculatedDistanceKm} km measured). Please choose in-store pickup.`,
        };
      }
    }

    // 4. Landmark Resolution
    const landmark = this.findLandmark(options.landmarkId || options.landmarkName);
    if (!landmark) {
      return {
        fulfillmentType: 'delivery',
        isAvailable: false,
        deliveryFee: 0,
        estimatedMinutesMin: 0,
        estimatedMinutesMax: 0,
        reason: 'A valid delivery landmark must be selected.',
      };
    }

    if (!landmark.isActive) {
      return {
        fulfillmentType: 'delivery',
        isAvailable: false,
        deliveryFee: 0,
        estimatedMinutesMin: 0,
        estimatedMinutesMax: 0,
        landmark,
        reason: `Delivery to "${landmark.name}" is temporarily suspended.`,
      };
    }

    // 5. Fee Determination by Pricing Model
    let fee = landmark.fee;
    if (this.config.pricingModel === 'distance_tiered' && calculatedDistanceKm !== undefined) {
      if (calculatedDistanceKm <= 1.5) {
        fee = 500;
      } else if (calculatedDistanceKm <= 4.0) {
        fee = 1000;
      } else if (calculatedDistanceKm <= 8.0) {
        fee = 2000;
      } else if (calculatedDistanceKm <= 12.0) {
        fee = 3500;
      } else {
        fee = 4000;
      }
    }

    // Ensure fee respects configured minimum
    const finalFee = Math.max(fee, this.config.minDeliveryFee);

    // 6. Time Estimation by Zone
    const zone = this.zones.find((z) => z.id === landmark.zoneId) || this.zones[0];
    const estimatedMinutesMin = landmark.isCampus ? 15 : zone.estimatedMinutesMin;
    const estimatedMinutesMax = landmark.isCampus ? 25 : zone.estimatedMinutesMax;

    return {
      fulfillmentType: 'delivery',
      isAvailable: true,
      deliveryFee: finalFee,
      estimatedMinutesMin,
      estimatedMinutesMax,
      distanceKm: calculatedDistanceKm,
      landmark,
      zone,
    };
  }

  /**
   * Updates configuration locally and persists to database if staff is authorized.
   */
  async updateConfig(
    updates: Partial<DeliveryConfig>,
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    this.config = { ...this.config, ...updates };

    if (userId) {
      try {
        const payload: Record<string, any> = {
          updated_at: new Date().toISOString(),
          updated_by: userId,
        };
        if (updates.storeName !== undefined) payload.store_name = updates.storeName;
        if (updates.storeAddress !== undefined) payload.store_address = updates.storeAddress;
        if (updates.maxDeliveryRadiusKm !== undefined) payload.max_delivery_radius_km = updates.maxDeliveryRadiusKm;
        if (updates.minDeliveryFee !== undefined) payload.min_delivery_fee = updates.minDeliveryFee;
        if (updates.pricingModel !== undefined) payload.pricing_model = updates.pricingModel;
        if (updates.isDeliveryActive !== undefined) payload.is_delivery_active = updates.isDeliveryActive;
        if (updates.isPickupActive !== undefined) payload.is_pickup_active = updates.isPickupActive;

        const { error } = await (supabase.from('delivery_config') as any)
          .update(payload)
          .match({ is_delivery_active: true });

        if (error) {
          return { success: false, error: error.message };
        }
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    return { success: true };
  }

  /**
   * Updates a landmark's fee or active status (Staff & Admin).
   */
  async updateLandmark(
    landmarkId: string,
    updates: { fee?: number; isActive?: boolean },
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const idx = this.landmarks.findIndex((l) => l.id === landmarkId);
    if (idx !== -1) {
      if (updates.fee !== undefined) this.landmarks[idx].fee = updates.fee;
      if (updates.isActive !== undefined) this.landmarks[idx].isActive = updates.isActive;
    }

    if (userId) {
      try {
        const payload: Record<string, any> = {};
        if (updates.fee !== undefined) payload.fee = updates.fee;
        if (updates.isActive !== undefined) payload.is_active = updates.isActive;

        const { error } = await (supabase.from('delivery_landmarks') as any)
          .update(payload)
          .eq('id', landmarkId);

        if (error) {
          return { success: false, error: error.message };
        }
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    return { success: true };
  }
}

export const deliveryPricingEngine = new DeliveryPricingEngine();

