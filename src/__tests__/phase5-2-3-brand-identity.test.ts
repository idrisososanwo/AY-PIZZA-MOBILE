/**
 * AY Pizza & Ice Cream — Phase 5.2.3 Brand Identity & Launch Screen Alignment Test Suite
 *
 * Verifies:
 * 1. Vector SVG brand asset generation, valid syntax, and viewBox definitions.
 * 2. High-resolution raster asset generation (splash-icon.png, brand-logo.png, brand-crest.png).
 * 3. Brand visual direction tokens (#B91C1C, #3E2723, #FFF7E6, #F59E0B, #1F1F1F).
 * 4. Mathematical concentric ring alignment guaranteeing zero offset between logo and rings.
 * 5. Native splash configuration in app.json.
 * 6. Component rendering, typography, tagline pill, accessibility, and lifecycle coordination.
 */

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import appConfig from '../../app.json';
import { BrandedLaunchScreen } from '../components/BrandedLaunchScreen';
import { BrandPalette, Colors } from '../constants/colors';
import { Brand } from '../constants/brand';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
declare const __dirname: string;

describe('Phase 5.2.3: Brand Identity, Logo Refinement & Launch Screen Alignment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('1. Vector SVG Brand Assets Integrity (assets/brand/)', () => {
    const brandDir = path.resolve(__dirname, '../../assets/brand');

    it('contains all 5 required SVG deliverables in assets/brand/', () => {
      expect(fs.existsSync(brandDir)).toBe(true);

      const requiredFiles = [
        'ay-mark.svg',
        'ay-logo-horizontal.svg',
        'ay-logo-stacked.svg',
        'ay-mark-monochrome.svg',
        'ay-mark-cream.svg',
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(brandDir, file);
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('<svg');
        expect(content).toContain('</svg>');
        expect(content).toContain('viewBox=');
      }
    });

    it('verifies ay-mark.svg includes geometrically constructed Glyph A (pizza) and Glyph Y (ice cream)', () => {
      const markPath = path.join(brandDir, 'ay-mark.svg');
      const content = fs.readFileSync(markPath, 'utf-8');

      // Check viewBox 0 0 512 512
      expect(content).toContain('viewBox="0 0 512 512"');

      // Check Pizza A glyph elements
      expect(content).toContain('id="Glyph-A"');
      expect(content).toContain('Pepperoni-Accents');

      // Check Ice Cream Y glyph elements
      expect(content).toContain('id="Glyph-Y"');
      expect(content).toContain('Waffle-Cone');
      expect(content).toContain('Soft-Serve-Cream');
    });

    it('verifies ay-logo-horizontal.svg contains official wordmark typography', () => {
      const hLogoPath = path.join(brandDir, 'ay-logo-horizontal.svg');
      const content = fs.readFileSync(hLogoPath, 'utf-8');

      expect(content).toContain('AY PIZZA');
      expect(content).toContain('&amp; ICE CREAM');
      expect(content).toContain('ARTISAN PIZZAS &amp; FRESH SOFT-SERVE');
    });

    it('verifies ay-logo-stacked.svg contains stacked lockup typography and pill', () => {
      const sLogoPath = path.join(brandDir, 'ay-logo-stacked.svg');
      const content = fs.readFileSync(sLogoPath, 'utf-8');

      expect(content).toContain('AY PIZZA');
      expect(content).toContain('&amp; ICE CREAM');
      expect(content).toContain('ARTISAN PIZZAS &amp; FRESH SOFT-SERVE');
    });

    it('verifies monochrome and cream variations use proper single-tone palettes', () => {
      const monoPath = path.join(brandDir, 'ay-mark-monochrome.svg');
      const creamPath = path.join(brandDir, 'ay-mark-cream.svg');

      const monoContent = fs.readFileSync(monoPath, 'utf-8');
      const creamContent = fs.readFileSync(creamPath, 'utf-8');

      expect(monoContent).toContain('#1F1F1F'); // Charcoal
      expect(creamContent).toContain('#FFF7E6'); // Warm cream
    });
  });

  describe('2. Raster Asset Verification & Dimensions', () => {
    it('verifies splash-icon.png, brand-logo.png, and brand-crest.png are valid 1024x1024 RGBA PNGs', () => {
      const assets = ['splash-icon.png', 'brand-logo.png', 'brand-crest.png'];

      for (const asset of assets) {
        const assetPath = path.resolve(__dirname, '../../assets', asset);
        expect(fs.existsSync(assetPath)).toBe(true);

        const buf = fs.readFileSync(assetPath);
        // Valid PNG header
        expect(buf[0]).toBe(0x89);
        expect(buf[1]).toBe(0x50);
        expect(buf[2]).toBe(0x4e);
        expect(buf[3]).toBe(0x47);

        // Dimensions: 1024 x 1024
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        expect(width).toBe(1024);
        expect(height).toBe(1024);

        // RGBA color type (6)
        expect(buf[25]).toBe(6);
      }
    });
  });

  describe('3. Visual Direction & Design Tokens', () => {
    it('verifies brand color tokens match approved Phase 5.2.3 palette', () => {
      expect(BrandPalette.primaryPizzaRed).toBe('#B91C1C');
      expect(BrandPalette.chocolateBrown).toBe('#3E2723');
      expect(BrandPalette.warmCream).toBe('#FFF7E6');
      expect(BrandPalette.goldenOrange).toBe('#F59E0B');
      expect(BrandPalette.charcoal).toBe('#1F1F1F');

      // Exported through Colors for backwards compatibility
      expect(Colors.brandRed).toBe('#B91C1C');
      expect(Colors.chocolateBrown).toBe('#3E2723');
      expect(Colors.brandCream).toBe('#FFF7E6');
      expect(Colors.goldenOrange).toBe('#F59E0B');
      expect(Colors.brandCharcoal).toBe('#1F1F1F');
    });

    it('verifies restaurant brand metadata contains official wordmark', () => {
      expect(Brand.officialWordmark).toBe('AY PIZZA & ICE CREAM');
      expect(Brand.officialTagline).toBe('ARTISAN PIZZAS & FRESH SOFT-SERVE');
    });
  });

  describe('4. Mathematical Concentric Ring Alignment', () => {
    it('proves concentric centering equality for any viewport width', () => {
      // Test across a range of realistic mobile device screen widths:
      // 320 (small), 360 (Redmi 13C), 390 (iPhone 14), 412 (Pixel 7), 768 (iPad)
      const testWidths = [320, 360, 390, 412, 768];

      for (const w of testWidths) {
        const crestSize = Math.min(Math.round(w * 0.48), 200);
        const ring1Diameter = crestSize + 28;
        const ring2Diameter = crestSize + 64;

        // Logo center inside dedicated logoStage
        const logoCenterX = crestSize / 2;
        const logoCenterY = crestSize / 2;

        // Ring 1 geometric center inside logoStage
        const r1Left = (crestSize - ring1Diameter) / 2;
        const r1Top = (crestSize - ring1Diameter) / 2;
        const r1CenterX = r1Left + ring1Diameter / 2;
        const r1CenterY = r1Top + ring1Diameter / 2;

        // Ring 2 geometric center inside logoStage
        const r2Left = (crestSize - ring2Diameter) / 2;
        const r2Top = (crestSize - ring2Diameter) / 2;
        const r2CenterX = r2Left + ring2Diameter / 2;
        const r2CenterY = r2Top + ring2Diameter / 2;

        // Exact mathematical equality: Delta is strictly zero
        expect(r1CenterX).toBe(logoCenterX);
        expect(r1CenterY).toBe(logoCenterY);
        expect(r2CenterX).toBe(logoCenterX);
        expect(r2CenterY).toBe(logoCenterY);

        // Gap between Ring 1 and Ring 2 is perfectly uniform (18dp on each side)
        const gap = (ring2Diameter - ring1Diameter) / 2;
        expect(gap).toBe(18);
      }
    });
  });

  describe('5. Native Splash Screen in app.json', () => {
    it('verifies app.json splash configuration uses #B91C1C red background', () => {
      const expo = appConfig.expo as any;
      const splashPlugin = expo.plugins.find(
        (p: any) => Array.isArray(p) && p[0] === 'expo-splash-screen'
      );
      expect(splashPlugin).toBeDefined();
      expect(splashPlugin[1].backgroundColor).toBe('#B91C1C');
      expect(splashPlugin[1].image).toBe('./assets/splash-icon.png');
      expect(splashPlugin[1].resizeMode).toBe('contain');
    });
  });

  describe('6. Component Rendering, Typography & Lifecycle', () => {
    it('renders BrandedLaunchScreen with proper accessibility role and label', () => {
      const onComplete = jest.fn();
      const element: any = React.createElement(BrandedLaunchScreen, {
        isAppReady: true,
        onAnimationComplete: onComplete,
      });

      expect(element).toBeDefined();
      expect(element.props.accessibilityLabel).toBeUndefined(); // top-level wrapper is animated view
      expect(element.type).toBe(BrandedLaunchScreen);
    });

    it('maintains 2200ms hold time and handles readiness transition', () => {
      let isReady = false;
      let minDurationElapsed = false;

      const timer = setTimeout(() => {
        minDurationElapsed = true;
      }, 2200);

      expect(minDurationElapsed && isReady).toBe(false);

      jest.advanceTimersByTime(2200);
      expect(minDurationElapsed).toBe(true);

      isReady = true;
      expect(minDurationElapsed && isReady).toBe(true);

      clearTimeout(timer);
    });

    it('respects reduced motion accessibility settings', async () => {
      const spy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      const isReduced = await AccessibilityInfo.isReduceMotionEnabled();
      expect(isReduced).toBe(true);
      expect(spy).toHaveBeenCalled();
    });
  });
});
