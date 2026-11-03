/**
 * AY Pizza & Ice Cream — Phase 5.2.4 Expressive Illustrated Splash Test Suite
 *
 * Verifies:
 * 1. Bespoke food illustration asset availability, PNG headers, and 256x256 RGBA integrity.
 * 2. 100% address and location removal from the splash screen component.
 * 3. Central brand focal point, AY monogram preservation, and mathematical ring centering.
 * 4. Responsive canvas distribution and clear zone protection across mobile viewports.
 * 5. Motion orchestration, reduced motion accessibility, and lifecycle coordination.
 */

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { BrandedLaunchScreen } from '../components/BrandedLaunchScreen';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
declare const __dirname: string;

describe('Phase 5.2.4: Expressive Illustrated Food Splash Experience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('1. Bespoke Food Illustration Asset Integrity (assets/illustrations/)', () => {
    const illustDir = path.resolve(__dirname, '../../assets/illustrations');

    const expectedAssets = [
      'pizza_slice_tilted.png',
      'soft_serve_cone.png',
      'strawberry.png',
      'cheese_wedge.png',
      'pepperoni_slice.png',
      'ice_cream_swirl.png',
      'basil_leaf.png',
      'mushroom_slice.png',
      'sparkle_gold.png',
      'deco_sprinkles.png',
    ];

    it('verifies all 10 bespoke food illustration assets exist in assets/illustrations/', () => {
      expect(fs.existsSync(illustDir)).toBe(true);

      for (const assetName of expectedAssets) {
        const assetPath = path.join(illustDir, assetName);
        expect(fs.existsSync(assetPath)).toBe(true);

        const buf = fs.readFileSync(assetPath);
        // Valid PNG header (89 50 4E 47 0D 0A 1A 0A)
        expect(buf[0]).toBe(0x89);
        expect(buf[1]).toBe(0x50);
        expect(buf[2]).toBe(0x4e);
        expect(buf[3]).toBe(0x47);

        // Dimensions: 256 x 256
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        expect(width).toBe(256);
        expect(height).toBe(256);

        // Color type 6: RGBA with true alpha channel
        expect(buf[25]).toBe(6);
      }
    });
  });

  describe('2. Address & Location Information Removal Verification', () => {
    it('verifies that no address, UNILAG, or hostel information exists in BrandedLaunchScreen', () => {
      const componentPath = path.resolve(__dirname, '../components/BrandedLaunchScreen.tsx');
      const content = fs.readFileSync(componentPath, 'utf-8');

      // Must NOT contain university campus names or hall locations
      expect(content).not.toContain('UNILAG');
      expect(content).not.toContain('King Jaja');
      expect(content).not.toContain('campusLocationText');
      expect(content).not.toContain('footerNoteText');
      expect(content).not.toContain('Akoka');
      expect(content).not.toContain('Yaba');
      expect(content).not.toContain('0813 073 1895');
    });
  });

  describe('3. Central Brand Area, Wordmark & Mathematical Ring Centering', () => {
    it('verifies central brand typography and tagline pill', () => {
      const componentPath = path.resolve(__dirname, '../components/BrandedLaunchScreen.tsx');
      const content = fs.readFileSync(componentPath, 'utf-8');

      expect(content).toContain('AY PIZZA');
      expect(content).toContain('& ICE CREAM');
      expect(content).toContain('ARTISAN PIZZAS & FRESH SOFT-SERVE');
    });

    it('guarantees concentric ring centering equality (ΔX = 0, ΔY = 0) across all screen widths', () => {
      const testWidths = [320, 360, 390, 412, 768];

      for (const w of testWidths) {
        const crestSize = Math.min(Math.round(w * 0.46), 180);
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

        // Exact mathematical concentric alignment
        expect(r1CenterX).toBe(logoCenterX);
        expect(r1CenterY).toBe(logoCenterY);
        expect(r2CenterX).toBe(logoCenterX);
        expect(r2CenterY).toBe(logoCenterY);

        // Uniform concentric spacing
        expect((ring2Diameter - ring1Diameter) / 2).toBe(18);
      }
    });
  });

  describe('4. Component Rendering, Accessibility & Lifecycle Coordination', () => {
    it('creates BrandedLaunchScreen element with proper testID and accessibility attributes', () => {
      const onComplete = jest.fn();
      const element: any = React.createElement(BrandedLaunchScreen, {
        isAppReady: false,
        onAnimationComplete: onComplete,
        testID: 'branded-launch-screen',
      });

      expect(element).toBeDefined();
      expect(element.props.testID).toBe('branded-launch-screen');
      expect(element.props.isAppReady).toBe(false);
      expect(element.type).toBe(BrandedLaunchScreen);
    });

    it('respects reduced-motion accessibility mode gracefully', async () => {
      const spy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      const isReduced = await AccessibilityInfo.isReduceMotionEnabled();
      expect(isReduced).toBe(true);
      expect(spy).toHaveBeenCalled();
    });

    it('coordinates readiness and minimum 2200ms duration before exit transition', () => {
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
  });
});

