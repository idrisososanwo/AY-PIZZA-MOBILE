/**
 * AY Pizza & Ice Cream — Visual Identity & Design Tokens (Phase 5.2.3 Edition)
 * 
 * Approved Brand Palette:
 * - Primary Pizza Red (#B91C1C): Launch screen, brand signature, primary highlights
 * - Chocolate Brown (#3E2723): Rich dessert accents, typography contrast, waffle fluting
 * - Warm Cream (#FFF7E6): Premium appetising canvas, high-contrast brand glyphs
 * - Golden Orange (#F59E0B): Baked crust, waffle cone, aura rings, accents
 * - Charcoal (#1F1F1F): High-contrast readable typography
 */

export const BrandPalette = {
  primaryPizzaRed: '#B91C1C',
  chocolateBrown: '#3E2723',
  warmCream: '#FFF7E6',
  goldenOrange: '#F59E0B',
  charcoal: '#1F1F1F',
} as const;

export const Colors = {
  // Phase 5.2.3 Visual Direction Tokens
  brandRed: BrandPalette.primaryPizzaRed,
  chocolateBrown: BrandPalette.chocolateBrown,
  brandCream: BrandPalette.warmCream,
  goldenOrange: BrandPalette.goldenOrange,
  brandCharcoal: BrandPalette.charcoal,

  // Core Brand Palette (with backwards compatibility)
  primaryRed: '#C9232B',
  goldenYellow: '#F4B323',
  warmCream: '#FFF8EC',
  charcoal: '#27211F',
  freshGreen: '#287A4B',
  softTomato: '#FCE5E2',

  // Surfaces & Cards
  cardWhite: '#FFFFFF',
  cardBackground: '#FFFFFF',
  surfaceCream: '#FFF3DD',
  surfaceCard: '#FFFFFF',
  surfaceDark: '#27211F',
  surfaceBorder: 'rgba(39, 33, 31, 0.08)',
  borderLight: 'rgba(39, 33, 31, 0.08)',
  borderMedium: 'rgba(39, 33, 31, 0.16)',
  borderAccent: 'rgba(201, 35, 43, 0.25)',

  // Typography
  textPrimary: '#27211F',
  textSecondary: '#6B5E59',
  textMuted: '#9E918B',
  textLight: '#FFFFFF',
  textGold: '#996500',
  textGreen: '#287A4B',
  textRed: '#C9232B',

  // Functional & Utility
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  // Backward-compatibility aliases for legacy components
  night: '#FFF8EC',           // Root background
  royal: '#FFFFFF',           // Card surface
  frost: '#27211F',           // High-contrast primary text
  lava: '#C9232B',            // Primary CTA red
  neon: '#F4B323',            // Golden yellow highlight
  muted: '#6B5E59',
  surface: '#FFFFFF',
  crust: '#F4B323',
  crimson: '#C9232B',
  gold: '#F4B323',
  green: '#287A4B',
  accentYellow: '#F4B323',

  // Lifecycle & Status Indicators
  status: {
    pending: '#F4B323',
    paid: '#287A4B',
    preparing: '#E05A1B',
    ready: '#C9232B',
    delivering: '#7C3AED',
    completed: '#287A4B',
    cancelled: '#C9232B',
  },
} as const;

export type ColorName = keyof typeof Colors;
