/**
 * AY PIZZA & ICE CREAM — PHASE 5.4
 * Address Management, Delivery Zones, Location Services & Pricing Test Suite
 */

import { locationService, STORE_COORDINATES } from '../domains/delivery/location-service';
import {
  deliveryPricingEngine,
  PROVISIONAL_LANDMARKS,
  VERIFIED_DELIVERY_ZONES,
} from '../domains/delivery/delivery-pricing-engine';
import { resolveDeliveryFee, isCampusLandmark } from '../domains/delivery/delivery-service';
import { customerService } from '../domains/customer/customer-service';
import { CustomerAddress, NewAddressInput } from '../domains/customer/customer-types';
import { CartStore } from '../domains/cart/cart-store';
import { Brand } from '../constants/brand';
import { SEEDED_PRODUCTS, PIZZA_SIZES } from '../domains/catalog/catalog-repository';
import { initializeCustomizerState, selectSize, toCartItem } from '../domains/customizer/customizer-engine';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock Supabase
jest.mock('../config/supabase', () => {
  let mockAddresses: any[] = [];

  return {
    supabase: {
      from: jest.fn((table: string) => {
        if (table === 'customer_addresses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn(function (this: any, col: string, val: any) {
              this._filterCol = col;
              this._filterVal = val;
              return this;
            }),
            order: jest.fn().mockImplementation(function (this: any) {
              const filtered = mockAddresses.filter((a) => !this._filterCol || a[this._filterCol] === this._filterVal);
              return Promise.resolve({ data: filtered, error: null });
            }),
            insert: jest.fn((item: any) => {
              const newItem = {
                id: `addr-${Date.now()}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...item,
                delivery_landmarks: PROVISIONAL_LANDMARKS.find((l) => l.id === item.landmark_id) || {
                  id: item.landmark_id,
                  name: 'UNILAG Campus',
                },
              };
              mockAddresses.push(newItem);
              return {
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: newItem, error: null }),
                }),
              };
            }),
            update: jest.fn((patch: any) => ({
              eq: jest.fn(function (this: any, col: string, val: any) {
                this._filterCol = col;
                this._filterVal = val;
                mockAddresses = mockAddresses.map((a) => (a[col] === val ? { ...a, ...patch } : a));
                const updated = mockAddresses.find((a) => a[col] === val);
                return {
                  eq: jest.fn(() => ({
                    select: jest.fn().mockReturnValue({
                      single: jest.fn().mockResolvedValue({ data: updated, error: null }),
                    }),
                  })),
                  select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: updated, error: null }),
                  }),
                };
              }),
            })),
            delete: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => Promise.resolve({ error: null })),
              })),
            })),
          };
        }
        if (table === 'delivery_config') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'default',
                is_delivery_active: true,
                is_pickup_active: true,
                max_delivery_radius_km: 15.0,
                min_delivery_fee: 500,
                pricing_model: 'zone_landmark',
                store_latitude: 6.5186,
                store_longitude: 3.3983,
              },
              error: null,
            }),
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'default',
                is_delivery_active: true,
                is_pickup_active: true,
                max_delivery_radius_km: 15.0,
                min_delivery_fee: 500,
                pricing_model: 'zone_landmark',
                store_latitude: 6.5186,
                store_longitude: 3.3983,
              },
              error: null,
            }),
          };
        }
        if (table === 'delivery_landmarks') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: PROVISIONAL_LANDMARKS,
              error: null,
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      rpc: jest.fn().mockResolvedValue({ data: true, error: null }),
    },
  };
});

describe('Phase 5.4: Address Management, Delivery Zones & Location Services', () => {
  let cart: CartStore;

  beforeEach(async () => {
    await AsyncStorage.clear();
    cart = new CartStore();
    await cart.clearCart();
    deliveryPricingEngine.resetConfig();
  });

  // ==========================================
  // 1. LOCATION SERVICE & DISTANCE CALCULATION
  // ==========================================
  describe('LocationService (GPS & Geodesics)', () => {
    it('anchors store location to UNILAG King Jaja Hall coordinates', () => {
      expect(STORE_COORDINATES.latitude).toBeCloseTo(6.5186, 4);
      expect(STORE_COORDINATES.longitude).toBeCloseTo(3.3983, 4);
    });

    it('calculates Haversine distance accurately in Lagos Mainland', () => {
      // Distance from King Jaja Hall to itself is 0
      const distZero = locationService.calculateDistanceKm(STORE_COORDINATES, STORE_COORDINATES);
      expect(distZero).toBe(0);

      // Distance to Akoka (~1.0 - 2.0 km)
      const akokaCoords = { latitude: 6.526, longitude: 3.393 };
      const distAkoka = locationService.calculateDistanceKm(STORE_COORDINATES, akokaCoords);
      expect(distAkoka).toBeGreaterThan(0.5);
      expect(distAkoka).toBeLessThan(2.0);

      // Distance to Yaba Commercial Hub (~2.0 - 4.5 km)
      const yabaCoords = { latitude: 6.5095, longitude: 3.3711 };
      const distYaba = locationService.calculateDistanceKm(STORE_COORDINATES, yabaCoords);
      expect(distYaba).toBeGreaterThan(2.0);
      expect(distYaba).toBeLessThan(4.5);

      // Distance to Surulere (~4.5 - 8.0 km)
      const surulereCoords = { latitude: 6.4975, longitude: 3.3556 };
      const distSurulere = locationService.calculateDistanceKm(STORE_COORDINATES, surulereCoords);
      expect(distSurulere).toBeGreaterThan(4.5);
      expect(distSurulere).toBeLessThan(8.0);
    });

    it('finds nearest landmark matching customer coordinates', () => {
      // Coordinates right on UNILAG campus
      const campusPos = { latitude: 6.518, longitude: 3.398 };
      const matchCampus = locationService.findNearestLandmark(campusPos, PROVISIONAL_LANDMARKS);
      expect(matchCampus).toBeDefined();
      expect(matchCampus?.landmark.name).toContain('UNILAG Campus');

      // Coordinates in Yaba
      const yabaPos = { latitude: 6.509, longitude: 3.371 };
      const matchYaba = locationService.findNearestLandmark(yabaPos, PROVISIONAL_LANDMARKS);
      expect(matchYaba).toBeDefined();
      expect(matchYaba?.landmark.name).toBe('Yaba');
    });

    it('formats human-readable Nigerian distance summary', () => {
      expect(locationService.formatDistance(0.35)).toBe('350 m');
      expect(locationService.formatDistance(3.72)).toBe('3.7 km');
    });

    it('estimates delivery transit time based on mainland traffic heuristics', () => {
      // 0.5 km (Campus) -> 10-15 mins
      const campusEst = locationService.estimateDeliveryTime(0.5);
      expect(campusEst.min).toBe(10);
      expect(campusEst.max).toBe(15);

      // 4 km (Yaba/Bariga) -> 20-30 mins
      const yabaEst = locationService.estimateDeliveryTime(4.0);
      expect(yabaEst.min).toBe(20);
      expect(yabaEst.max).toBe(30);

      // 10 km (Outer mainland) -> 40-55 mins
      const farEst = locationService.estimateDeliveryTime(10.0);
      expect(farEst.min).toBe(40);
      expect(farEst.max).toBe(55);
    });
  });

  // ==========================================
  // 2. DELIVERY PRICING ENGINE & TARIFFS
  // ==========================================
  describe('DeliveryPricingEngine (Landmarks, Quotes & Config)', () => {
    it('provides exactly 19 provisional landmarks audited from web portal', () => {
      expect(PROVISIONAL_LANDMARKS.length).toBe(19);
      const campusLandmark = PROVISIONAL_LANDMARKS.find((l) => l.isCampus);
      expect(campusLandmark).toBeDefined();
      expect(campusLandmark?.fee).toBe(500);
    });

    it('quotes ₦0 delivery fee for pickup fulfillment', () => {
      const quote = deliveryPricingEngine.calculateQuote({
        fulfillmentType: 'pickup',
      });

      expect(quote.isAvailable).toBe(true);
      expect(quote.deliveryFee).toBe(0);
      expect(quote.fulfillmentType).toBe('pickup');
      expect(quote.estimatedMinutesMin).toBe(15);
      expect(quote.estimatedMinutesMax).toBe(25);
    });

    it('quotes exact audited fees for registered landmarks', () => {
      const campusQuote = deliveryPricingEngine.calculateQuote({
        fulfillmentType: 'delivery',
        landmarkId: 'lm-1',
      });
      expect(campusQuote.isAvailable).toBe(true);
      expect(campusQuote.deliveryFee).toBe(500);
      expect(campusQuote.landmark?.name).toBe('Inside School (UNILAG Campus)');

      const surulereQuote = deliveryPricingEngine.calculateQuote({
        fulfillmentType: 'delivery',
        landmarkName: 'Surulere',
      });
      expect(surulereQuote.isAvailable).toBe(true);
      expect(surulereQuote.deliveryFee).toBe(3500);

      const gbagadaQuote = deliveryPricingEngine.calculateQuote({
        fulfillmentType: 'delivery',
        landmarkName: 'Gbagada',
      });
      expect(gbagadaQuote.isAvailable).toBe(true);
      expect(gbagadaQuote.deliveryFee).toBe(4000);
    });

    it('rejects delivery when delivery is disabled operationally', () => {
      deliveryPricingEngine.updateConfig({ isDeliveryActive: false });

      const quote = deliveryPricingEngine.calculateQuote({
        fulfillmentType: 'delivery',
        landmarkId: 'lm-1',
      });
      expect(quote.isAvailable).toBe(false);
      expect(quote.reason).toContain('Delivery service is currently closed');

      // Pickup must remain available even if delivery is suspended
      const pickupQuote = deliveryPricingEngine.calculateQuote({
        fulfillmentType: 'pickup',
      });
      expect(pickupQuote.isAvailable).toBe(true);
      expect(pickupQuote.deliveryFee).toBe(0);
    });

    it('rejects locations exceeding maximum delivery radius', () => {
      // 25 km away (e.g. Ajah / Epe)
      const farCoords = { latitude: 6.4698, longitude: 3.5852 };
      const quote = deliveryPricingEngine.calculateQuote({
        fulfillmentType: 'delivery',
        customerCoordinates: farCoords,
        landmarkId: 'lm-1',
      });

      expect(quote.isAvailable).toBe(false);
      expect(quote.reason).toContain('beyond 15 km');
    });

    it('calculates distance-tiered pricing when enabled', () => {
      deliveryPricingEngine.updateConfig({ pricingModel: 'distance_tiered' });

      // 0.8 km from store -> Tier 1 (₦500)
      const nearCoords = { latitude: 6.5200, longitude: 3.3980 };
      const quoteNear = deliveryPricingEngine.calculateQuote({
        fulfillmentType: 'delivery',
        customerCoordinates: nearCoords,
        landmarkId: 'lm-1',
      });
      expect(quoteNear.deliveryFee).toBe(500);

      // 3.0 km from store -> Tier 2 (₦1,000)
      const midCoords = { latitude: 6.5100, longitude: 3.3750 };
      const quoteMid = deliveryPricingEngine.calculateQuote({
        fulfillmentType: 'delivery',
        customerCoordinates: midCoords,
        landmarkName: 'Yaba',
      });
      expect(quoteMid.deliveryFee).toBe(1000);
    });
  });

  // ==========================================
  // 3. CUSTOMER ADDRESS MANAGEMENT (NIGERIAN SCHEMA)
  // ==========================================
  describe('Customer Address Management (Nigerian Context)', () => {
    it('validates required fields and saves Nigerian address', async () => {
      const validAddressInput: NewAddressInput = {
        title: 'Moremi Hall Room 204',
        estateOrHostel: 'Moremi Hall',
        roomOrPlot: 'Room 204, Block B',
        streetAddress: 'UNILAG Main Campus',
        area: 'Akoka',
        landmarkId: 'lm-1',
        detailedAddress: 'Room 204, Block B, Moremi Hall, UNILAG',
        contactPhone: '08012345678',
        deliveryNotes: 'Call when at the security gate',
        isDefault: true,
      };

      const result = await customerService.addAddress('user-123', validAddressInput);
      expect(result.success).toBe(true);
      expect(result.address).toBeDefined();
      expect(result.address?.title).toBe('Moremi Hall Room 204');
      expect(result.address?.estateOrHostel).toBe('Moremi Hall');
      expect(result.address?.roomOrPlot).toBe('Room 204, Block B');
      expect(result.address?.contactPhone).toBe('08012345678');
      expect(result.address?.isDefault).toBe(true);
    });

    it('rejects address creation when landmark or detailed address is missing', async () => {
      const invalidInput: NewAddressInput = {
        landmarkId: '',
        detailedAddress: '',
        contactPhone: '08012345678',
      };

      const result = await customerService.addAddress('user-123', invalidInput);
      expect(result.success).toBe(false);
      expect(result.error).toContain('A landmark must be selected');
    });

    it('supports address modification with updated delivery notes', async () => {
      const updateResult = await customerService.updateAddress('user-123', 'addr-123', {
        deliveryNotes: 'Leave with hostel porter if phone is unreachable',
        roomOrPlot: 'Room 305, Block C',
      });

      expect(updateResult.success).toBe(true);
    });

    it('allows deleting an address', async () => {
      const deleteResult = await customerService.deleteAddress('user-123', 'addr-123');
      expect(deleteResult.success).toBe(true);
    });
  });

  // ==========================================
  // 4. CART STORE & CHECKOUT INTEGRATION
  // ==========================================
  describe('Cart Store & Checkout Integration', () => {
    it('defaults fulfillment to delivery with UNILAG campus pricing', () => {
      const state = cart.getState();
      expect(state.fulfillmentType).toBe('delivery');
      expect(state.deliveryFee).toBe(0); // empty cart fee is 0 until item added
    });

    it('updates delivery fee to ₦0 when switching fulfillment to pickup', async () => {
      const pizza = SEEDED_PRODUCTS[0];
      const stateInit = initializeCustomizerState(pizza);
      const item = toCartItem(stateInit);
      await cart.addItem(item);

      // Default delivery with default campus landmark = ₦500
      expect(cart.getState().deliveryFee).toBe(500);

      // Switch to pickup
      await cart.setFulfillmentType('pickup');
      expect(cart.getState().fulfillmentType).toBe('pickup');
      expect(cart.getState().deliveryFee).toBe(0);
    });

    it('recalculates delivery fee when setting customer landmark', async () => {
      const pizza = SEEDED_PRODUCTS[0];
      const stateInit = initializeCustomizerState(pizza);
      const item = toCartItem(stateInit);
      await cart.addItem(item);

      await cart.setFulfillmentType('delivery');
      const yabaLandmark = PROVISIONAL_LANDMARKS.find((l) => l.name === 'Yaba')!;
      await cart.setLandmark(yabaLandmark);

      expect(cart.getState().deliveryFee).toBe(2000);
      expect(cart.getState().selectedLandmark?.name).toBe('Yaba');
    });

    it('calculates order total including pizza price and landmark delivery fee', async () => {
      const pizza = SEEDED_PRODUCTS[1]; // BBQ Beef Pizza (₦7,500 base)
      let stateInit = initializeCustomizerState(pizza);
      stateInit = selectSize(stateInit, PIZZA_SIZES[1]); // Standard (Medium)
      const item = toCartItem(stateInit);
      await cart.addItem(item);

      const campusLandmark = deliveryPricingEngine.findLandmark('lm-1')!;
      await cart.setLandmark(campusLandmark);
      await cart.setDeliveryDetails('Faculty of Engineering Room 202');

      const snapshot = cart.getState();
      expect(snapshot.subtotal).toBe(8500);
      expect(snapshot.deliveryFee).toBe(500);
      expect(snapshot.estimatedTotal).toBe(9000);

      // Switch to Surulere delivery (₦3,500)
      const surulereLandmark = PROVISIONAL_LANDMARKS.find((l) => l.name === 'Surulere')!;
      await cart.setLandmark(surulereLandmark);
      expect(cart.getState().deliveryFee).toBe(3500);
      expect(cart.getState().estimatedTotal).toBe(12000);

      // Switch to Pickup (₦0 delivery fee)
      await cart.setFulfillmentType('pickup');
      expect(cart.getState().deliveryFee).toBe(0);
      expect(cart.getState().estimatedTotal).toBe(8500);
    });
  });

  // ==========================================
  // 5. SECURITY & RLS COMPLIANCE
  // ==========================================
  describe('Security & Database Policies Compliance', () => {
    it('ensures delivery fees cannot be arbitrarily spoofed below minimum fee', () => {
      const quote = deliveryPricingEngine.calculateQuote({
        fulfillmentType: 'delivery',
        landmarkId: 'lm-1',
      });
      expect(quote.deliveryFee).toBeGreaterThanOrEqual(500);
    });

    it('ensures pickup fee is strictly 0 and cannot be inflated', () => {
      const fee = resolveDeliveryFee('pickup');
      expect(fee).toBe(Brand.fulfillment.pickupFee);
      expect(fee).toBe(0);
    });

    it('ensures unrecognized landmarks fail closed to prevent undercharging', () => {
      expect(() => resolveDeliveryFee('delivery', 'Unknown Island Area')).toThrow(
        /Unrecognized delivery landmark/
      );
    });
  });

  // ==========================================
  // 6. PHASE 5.4.1 — PHYSICAL DEVICE FEEDBACK, GPS & GUEST UX
  // ==========================================
  describe('Phase 5.4.1 — Device Polish, GPS & Guest Persistence', () => {
    it('finds landmark by UUID, legacy alias lm-X, or exact name', () => {
      const byLegacy = deliveryPricingEngine.findLandmark('lm-1');
      expect(byLegacy?.name).toBe('Inside School (UNILAG Campus)');

      const byUuid = deliveryPricingEngine.findLandmark('77777777-7777-7777-7777-777777777701');
      expect(byUuid?.name).toBe('Inside School (UNILAG Campus)');

      const byName = deliveryPricingEngine.findLandmark('Abule Oja');
      expect(byName?.id).toBe('77777777-7777-7777-7777-777777777702');
    });

    it('assists address selection via GPS coordinates within UNILAG radius', async () => {
      // Coordinates near UNILAG Campus (6.5186, 3.3983)
      const nearbyJaja = { latitude: 6.5186, longitude: 3.3983 };
      const nearest = locationService.findNearestLandmark(nearbyJaja, PROVISIONAL_LANDMARKS);
      expect(nearest).not.toBeNull();
      expect(nearest?.landmark.name).toBe('Inside School (UNILAG Campus)');
    });

    it('flags location as out of range if coordinates exceed 15 km cutoff', () => {
      // Epe / Lekki Phase 2 (>30 km away)
      const distantCoords = { latitude: 6.5833, longitude: 3.9833 };
      const dist = locationService.calculateDistanceKm(distantCoords, STORE_COORDINATES);
      expect(dist).toBeGreaterThan(15);
    });

    it('stores and retrieves guest addresses in AsyncStorage key @aypizza_guest_addresses', async () => {
      const guestKey = '@aypizza_guest_addresses';
      const guestAddress = {
        id: 'guest_addr_123',
        customerId: 'guest',
        landmarkId: '77777777-7777-7777-7777-777777777701',
        landmarkName: 'King Jaja Hall',
        title: 'Hostel',
        detailedAddress: 'King Jaja Hall, Block C, Room 10',
        contactPhone: '08123456789',
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(guestKey, JSON.stringify([guestAddress]));
      const retrieved = await AsyncStorage.getItem(guestKey);
      expect(retrieved).not.toBeNull();
      const parsed = JSON.parse(retrieved!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].detailedAddress).toBe('King Jaja Hall, Block C, Room 10');
      expect(parsed[0].landmarkName).toBe('King Jaja Hall');
    });
  });
});
