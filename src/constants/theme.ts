/**
 * AY Pizza — Unified Theme & Design System
 * Defines typography scale, spacing, border radii, and visual elevations
 * adhering to the bold, modern, appetizing fast-food identity.
 */

import { StyleSheet, Platform } from 'react-native';
import { Colors } from './colors';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 9999,
};

export const Shadows = StyleSheet.create({
  card: {
    ...Platform.select({
      ios: {
        shadowColor: '#27211F',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 16px rgba(39, 33, 31, 0.08)',
      } as any,
    }),
  },
  hover: {
    ...Platform.select({
      ios: {
        shadowColor: '#C9232B',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0 6px 20px rgba(201, 35, 43, 0.15)',
      } as any,
    }),
  },
  modal: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.18)',
      } as any,
    }),
  },
});

export const Typography = StyleSheet.create({
  display: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.charcoal,
    letterSpacing: -0.5,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.charcoal,
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  productName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  pricePrimary: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  priceLarge: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  body: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  caption: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
  },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  button: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#FFFFFF',
  },
});
