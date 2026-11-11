/**
 * AY Pizza & Ice Cream — Location Services & Geolocation Engine
 * Handles GPS coordinate acquisition, Haversine distance calculation,
 * reverse geocoding, and nearest landmark recommendation.
 */

import * as Location from 'expo-location';
import { DeliveryLandmark } from '../../types/delivery';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodedAddress {
  street?: string;
  estateOrBuilding?: string;
  district?: string;
  city?: string;
  region?: string;
  country?: string;
  formattedAddress?: string;
}

export interface LocationAssistResult {
  success: boolean;
  coordinates?: Coordinates;
  geocoded?: GeocodedAddress;
  suggestedLandmark?: DeliveryLandmark;
  distanceFromStoreKm?: number;
  isWithinDeliveryRange?: boolean;
  error?: string;
}

/**
 * Authoritative AY Pizza Store Coordinates:
 * Opposite King Jaja Hall, UNILAG Main Campus, Akoka, Lagos, Nigeria
 */
export const STORE_COORDINATES: Coordinates = {
  latitude: 6.5186,
  longitude: 3.3983,
};

/**
 * Standard Maximum Delivery Radius in Kilometers from UNILAG Kitchen
 * (Configurable by management; default 15.0 km covers UNILAG + Mainland)
 */
export const DEFAULT_MAX_DELIVERY_RADIUS_KM = 15.0;

/**
 * Known Reference Coordinates for Key AY Pizza Delivery Landmarks
 * Used for distance estimation, geo-fencing, and nearest landmark suggestion.
 */
export const LANDMARK_COORDINATES: Record<string, Coordinates> = {
  // UNILAG Campus (Inside School)
  'Inside School (UNILAG Campus)': { latitude: 6.5186, longitude: 3.3983 },
  'King Jaja Hall': { latitude: 6.5186, longitude: 3.3983 },
  'Moremi Hall': { latitude: 6.5175, longitude: 3.3942 },
  'New Hall': { latitude: 6.5205, longitude: 3.3965 },
  'Faculty of Arts': { latitude: 6.5168, longitude: 3.3951 },
  'Faculty of Engineering': { latitude: 6.5218, longitude: 3.3992 },
  // Mainland Environs
  'Abule Oja': { latitude: 6.5170, longitude: 3.3850 },
  'Akoka': { latitude: 6.5245, longitude: 3.3880 },
  'Onike': { latitude: 6.5110, longitude: 3.3820 },
  'Iwaya': { latitude: 6.5050, longitude: 3.3860 },
  'Abule Ijesha': { latitude: 6.5220, longitude: 3.3760 },
  'Bariga': { latitude: 6.5360, longitude: 3.3890 },
  'Makoko': { latitude: 6.4980, longitude: 3.3890 },
  'Alagomeji': { latitude: 6.5020, longitude: 3.3770 },
  'Bajuliaye': { latitude: 6.5380, longitude: 3.3750 },
  'Shomolu': { latitude: 6.5390, longitude: 3.3720 },
  'Yaba': { latitude: 6.5100, longitude: 3.3710 },
  'Palmgroove': { latitude: 6.5410, longitude: 3.3630 },
  'Luth (Idi-Araba)': { latitude: 6.5220, longitude: 3.3550 },
  'Onipanu': { latitude: 6.5450, longitude: 3.3640 },
  'Surulere': { latitude: 6.5000, longitude: 3.3580 },
  'Gbagada': { latitude: 6.5580, longitude: 3.3840 },
  'Ebute Meta': { latitude: 6.4880, longitude: 3.3820 },
  'Oworo': { latitude: 6.5620, longitude: 3.3950 },
};

export class LocationService {
  /**
   * Calculates the Great-Circle (Haversine) distance between two GPS coordinates in kilometers.
   */
  calculateDistanceKm(coord1: Coordinates, coord2: Coordinates): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // Earth's mean radius in km

    const dLat = toRad(coord2.latitude - coord1.latitude);
    const dLon = toRad(coord2.longitude - coord1.longitude);

    const lat1 = toRad(coord1.latitude);
    const lat2 = toRad(coord2.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // 2 decimal places
  }

  /**
   * Formats distance in kilometers into a user-friendly metric string (m or km).
   */
  formatDistance(distanceKm: number): string {
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)} m`;
    }
    return `${distanceKm.toFixed(1)} km`;
  }

  /**
   * Estimates transit delivery time (in minutes) based on distance heuristics.
   */
  estimateDeliveryTime(distanceKm: number): { min: number; max: number } {
    if (distanceKm <= 1.5) {
      return { min: 10, max: 15 };
    } else if (distanceKm <= 5.0) {
      return { min: 20, max: 30 };
    } else {
      return { min: 40, max: 55 };
    }
  }

  /**
   * Checks foreground location permission status without prompting.
   */
  async checkPermissionStatus(): Promise<Location.PermissionStatus> {
    try {
      const response = await Location.getForegroundPermissionsAsync();
      return response.status;
    } catch {
      return Location.PermissionStatus.UNDETERMINED;
    }
  }

  /**
   * Prompts the user for foreground location permission if needed.
   */
  async requestPermission(): Promise<boolean> {
    try {
      const response = await Location.requestForegroundPermissionsAsync();
      return response.status === Location.PermissionStatus.GRANTED;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves the current device GPS coordinates.
   * Returns null if permissions are denied or GPS is disabled.
   */
  async getCurrentPosition(): Promise<Coordinates | null> {
    try {
      const isGranted = await this.requestPermission();
      if (!isGranted) return null;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch {
      return null;
    }
  }

  /**
   * Reverse geocodes GPS coordinates into human-readable address parts.
   */
  async reverseGeocode(coords: Coordinates): Promise<GeocodedAddress | null> {
    try {
      const results = await Location.reverseGeocodeAsync(coords);
      if (!results || results.length === 0) return null;

      const item = results[0];
      const parts: string[] = [];

      if (item.name) parts.push(item.name);
      if (item.street && item.street !== item.name) parts.push(item.street);
      if (item.district) parts.push(item.district);
      if (item.subregion && item.subregion !== item.district) parts.push(item.subregion);
      if (item.city) parts.push(item.city);

      return {
        street: item.street || item.name || undefined,
        estateOrBuilding: item.name || undefined,
        district: item.district || item.subregion || undefined,
        city: item.city || 'Lagos',
        region: item.region || 'Lagos State',
        country: item.country || 'Nigeria',
        formattedAddress: parts.join(', '),
      };
    } catch {
      return null;
    }
  }

  /**
   * Finds the closest delivery landmark to the given coordinates.
   */
  findNearestLandmark(
    coords: Coordinates,
    landmarks: DeliveryLandmark[]
  ): { landmark: DeliveryLandmark; distanceKm: number } | null {
    if (!landmarks || landmarks.length === 0) return null;

    let nearest: DeliveryLandmark | null = null;
    let minDistance = Infinity;

    for (const lm of landmarks) {
      if (!lm.isActive) continue;

      // Look up landmark coordinate in reference map or default to campus if campus landmark
      const refCoord =
        LANDMARK_COORDINATES[lm.name] ||
        (lm.isCampus ? STORE_COORDINATES : null);

      if (refCoord) {
        const dist = this.calculateDistanceKm(coords, refCoord);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = lm;
        }
      }
    }

    if (!nearest) {
      // Default to first active landmark if none had direct coordinates
      nearest = landmarks.find((l) => l.isActive) || landmarks[0];
      minDistance = this.calculateDistanceKm(coords, STORE_COORDINATES);
    }

    return {
      landmark: nearest,
      distanceKm: Math.round(minDistance * 100) / 100,
    };
  }

  /**
   * Executes full location assistance:
   * 1. Acquires device coordinates.
   * 2. Reverse geocodes to get street/district.
   * 3. Calculates distance from AY Pizza kitchen.
   * 4. Suggests the best-matching landmark.
   * 5. Checks if inside service radius.
   */
  async assistAddressSelection(
    landmarks: DeliveryLandmark[],
    maxRadiusKm: number = DEFAULT_MAX_DELIVERY_RADIUS_KM
  ): Promise<LocationAssistResult> {
    const coords = await this.getCurrentPosition();
    if (!coords) {
      return {
        success: false,
        error: 'Location access unavailable or permission not granted. You can still enter your address manually.',
      };
    }

    const distanceFromStore = this.calculateDistanceKm(coords, STORE_COORDINATES);
    const isWithinRange = distanceFromStore <= maxRadiusKm;
    const geocoded = await this.reverseGeocode(coords);
    const nearest = this.findNearestLandmark(coords, landmarks);

    return {
      success: true,
      coordinates: coords,
      geocoded: geocoded || undefined,
      suggestedLandmark: nearest?.landmark,
      distanceFromStoreKm: distanceFromStore,
      isWithinDeliveryRange: isWithinRange,
    };
  }
}

export const locationService = new LocationService();

