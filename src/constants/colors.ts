/**
 * AY Pizza — Visual Identity & Design Tokens (Redesign Edition)
 * 
 * Bold, youthful, energetic, and appetite-focused visual system:
 * - Primary Red (#C9232B): Brand crest, primary action buttons, active navigation, key highlights
 * - Golden Yellow (#F4B323): Value badges, hot promotions, rating accents, cheese highlights
 * - Warm Cream (#FFF8EC): Appetizing spacious background
 * - Charcoal (#27211F): High-contrast readable typography and icons
 * - Fresh Green (#287A4B): Genuine availability badges, in-stock indicators, verified success
 * - Soft Tomato (#FCE5E2): Subtle badge backgrounds, light card accents, soft highlights
 * - Card White (#FFFFFF): Elevated, crisp cards on warm cream canvas
 */

export const Colors = {
  // Core Brand Palette
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
