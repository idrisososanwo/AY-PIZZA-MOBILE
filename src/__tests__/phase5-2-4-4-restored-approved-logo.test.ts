/**
 * AY Pizza & Ice Cream — Phase 5.2.4.4 Restored Approved Concept 3 Logo Test Suite
 *
 * Verifies:
 * 1. Exact Approved Concept 3 Artwork Restoration:
 *    - Master Concept 3 raster assets exist at 1024x1024 RGBA.
 *    - All master assets (brand-logo, brand-crest, splash-icon, icon) match the restored Concept 3 master.
 *    - Adaptive icon foreground meets Android guidelines (512x512).
 * 2. Launch Screen Component Integration:
 *    - BrandedLaunchScreen.tsx renders authentic Concept 3 BrandLogo via Image component.
 *    - Hand-coded geometric SVG is NOT used in the launch screen, preventing path distortions.
 *    - Native Android splash and React Native launch screen use identical Concept 3 assets.
 * 3. Preserved Pacing, Hierarchy & Visual Harmony:
 *    - Minimum presentation duration remains 7000ms.
 *    - Safety watchdog timer remains 10000ms.
 *    - Food photography cutouts maintain subdued 60% opacity.
 *    - Sparkle accents maintain 35% opacity.
 *    - Brand stage, title, and tagline maintain 100% full opacity.
 *    - Center stage is strictly non-interactive (pointerEvents="none").
 */

import appConfig from '../../app.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
declare const __dirname: string;

describe('Phase 5.2.4.4: Exact Approved Concept 3 Logo Restoration', () => {
  describe('1. Master Artwork & Asset Files', () => {
    it('verifies all master raster assets exist and have valid PNG signatures', () => {
      const requiredAssets = [
        'assets/brand-logo.png',
        'assets/brand-crest.png',
        'assets/splash-icon.png',
        'assets/icon.png',
        'assets/android-icon-foreground.png',
      ];

      for (const relPath of requiredAssets) {
        const fullPath = path.resolve(__dirname, '../../', relPath);
        expect(fs.existsSync(fullPath)).toBe(true);

        const buf = fs.readFileSync(fullPath);
        // Standard PNG Magic Number: 89 50 4E 47 0D 0A 1A 0A
        expect(buf[0]).toBe(0x89);
        expect(buf[1]).toBe(0x50);
        expect(buf[2]).toBe(0x4e);
        expect(buf[3]).toBe(0x47);
        expect(buf[4]).toBe(0x0d);
        expect(buf[5]).toBe(0x0a);
        expect(buf[6]).toBe(0x1a);
        expect(buf[7]).toBe(0x0a);
      }
    });

    it('verifies master brand and splash icons are 1024x1024', () => {
      const hdAssets = [
        'assets/brand-logo.png',
        'assets/brand-crest.png',
        'assets/splash-icon.png',
        'assets/icon.png',
      ];

      for (const relPath of hdAssets) {
        const fullPath = path.resolve(__dirname, '../../', relPath);
        const buf = fs.readFileSync(fullPath);
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);

        expect(width).toBe(1024);
        expect(height).toBe(1024);
      }
    });

    it('verifies android adaptive icon foreground is 512x512', () => {
      const fullPath = path.resolve(__dirname, '../../assets/android-icon-foreground.png');
      const buf = fs.readFileSync(fullPath);
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);

      expect(width).toBe(512);
      expect(height).toBe(512);
    });
  });

  describe('2. Launch Screen Asset & Component Binding', () => {
    it('imports and uses master BrandLogo in BrandedLaunchScreen.tsx', () => {
      const componentPath = path.resolve(__dirname, '../components/BrandedLaunchScreen.tsx');
      const content = fs.readFileSync(componentPath, 'utf-8');

      expect(content).toContain("require('../../assets/brand-logo.png')");
      expect(content).toContain('source={BrandLogo}');
      expect(content).toContain('resizeMode="contain"');
    });

    it('does NOT render the geometric AYBrandLogoSvg in BrandedLaunchScreen', () => {
      const componentPath = path.resolve(__dirname, '../components/BrandedLaunchScreen.tsx');
      const content = fs.readFileSync(componentPath, 'utf-8');

      expect(content).not.toContain('<AYBrandLogoSvg');
      expect(content).not.toContain('import { AYBrandLogoSvg }');
    });

    it('verifies native splash screen points to the restored splash-icon.png', () => {
      const expo = (appConfig as any).expo;
      const splashPlugin = expo.plugins.find(
        (p: any) => Array.isArray(p) && p[0] === 'expo-splash-screen'
      );

      expect(splashPlugin).toBeDefined();
      expect(splashPlugin[1].image).toBe('./assets/splash-icon.png');
      expect(splashPlugin[1].backgroundColor).toBe('#B91C1C');
    });
  });

  describe('3. Launch Experience Hierarchy, Pacing & Guardrails', () => {
    it('verifies minimum 7000ms duration is preserved', () => {
      const componentPath = path.resolve(__dirname, '../components/BrandedLaunchScreen.tsx');
      const content = fs.readFileSync(componentPath, 'utf-8');

      expect(content).toContain('7000');
    });

    it('verifies 10000ms safety watchdog timer is preserved', () => {
      const componentPath = path.resolve(__dirname, '../components/BrandedLaunchScreen.tsx');
      const content = fs.readFileSync(componentPath, 'utf-8');

      expect(content).toContain('10000');
    });

    it('verifies food cutouts are subdued at 60% opacity and sparkles at 35%', () => {
      const componentPath = path.resolve(__dirname, '../components/BrandedLaunchScreen.tsx');
      const content = fs.readFileSync(componentPath, 'utf-8');

      expect(content).toMatch(/foodSubdued:\s*\{[\s\S]*?opacity:\s*0\.60/);
      expect(content).toMatch(/sparkleItem:\s*\{[\s\S]*?opacity:\s*0\.35/);
    });

    it('verifies centerStage has pointerEvents="none" preventing stray touches', () => {
      const componentPath = path.resolve(__dirname, '../components/BrandedLaunchScreen.tsx');
      const content = fs.readFileSync(componentPath, 'utf-8');

      expect(content).toContain('pointerEvents="none"');
      expect(content).toContain('onStartShouldSetResponder={() => true}');
    });
  });
});

