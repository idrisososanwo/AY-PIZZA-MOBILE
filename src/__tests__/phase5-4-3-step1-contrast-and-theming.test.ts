import appConfig from '../../app.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
declare const __dirname: string;

/**
 * Calculates relative luminance according to WCAG 2.1 definition.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const sRGB = [r, g, b].map((c) => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/**
 * Calculates contrast ratio between two hex colors according to WCAG 2.1.
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

describe('Phase 5.4.3 / Step 1: Critical Contrast & Theming Remediation', () => {
  describe('1. Android Application-Wide Theme Configuration', () => {
    it('configures userInterfaceStyle strictly as "light" in app.json', () => {
      const expo = appConfig.expo as any;
      expect(expo.userInterfaceStyle).toBe('light');
    });

    it('preserves native splash screen configuration with approved brand red (#B91C1C)', () => {
      const expo = appConfig.expo as any;
      const splashPlugin = expo.plugins.find(
        (p: any) => Array.isArray(p) && p[0] === 'expo-splash-screen'
      );
      expect(splashPlugin).toBeDefined();
      expect(splashPlugin[1].backgroundColor).toBe('#B91C1C');
    });
  });

  describe('2. Order Tracking Modal Contrast Remediation (OrderTrackingModal.tsx)', () => {
    const modalPath = path.resolve(__dirname, '../components/OrderTrackingModal.tsx');
    const modalSource = fs.readFileSync(modalPath, 'utf8');

    it('eliminates all low-contrast legacy rgba(255, 232, 214, ...) occurrences', () => {
      expect(modalSource).not.toMatch(/rgba\(\s*255\s*,\s*232\s*,\s*214/i);
    });

    it('ensures status and error text use high-contrast dark semantic colors', () => {
      expect(modalSource).toContain("loadingText: {\n    color: '#6B5E59'");
      expect(modalSource).toContain("errorTitle: {\n    color: '#B91C1C'");
      expect(modalSource).toContain("errorText: {\n    color: '#6B5E59'");
    });

    it('ensures stepper timeline active stage uses high-contrast brand red (#B91C1C)', () => {
      expect(modalSource).toContain("stepLabelCurrent: {\n    color: '#B91C1C'");
    });

    it('ensures tracking modal buttons have readable high-contrast foregrounds', () => {
      expect(modalSource).toContain("retryBtn: {\n    backgroundColor: '#B91C1C'");
      expect(modalSource).toContain("retryBtnText: {\n    color: '#FFFFFF'");
      expect(modalSource).toContain("closeErrorBtnText: {\n    color: '#1F1F1F'");
      expect(modalSource).toContain("closeBtnText: {\n    color: '#1F1F1F'");
    });

    it('ensures ordered items and totals render with readable brand red and charcoal text', () => {
      expect(modalSource).toContain("itemPrice: {\n    color: '#B91C1C'");
      expect(modalSource).toContain("totalValue: {\n    color: '#B91C1C'");
      expect(modalSource).toContain("totalLabel: {\n    color: '#1F1F1F'");
    });
  });

  describe('3. Paystack Payment Modal Remediation (PaystackPaymentModal.tsx)', () => {
    const paystackPath = path.resolve(__dirname, '../components/PaystackPaymentModal.tsx');
    const paystackSource = fs.readFileSync(paystackPath, 'utf8');

    it('fixes the yellow-on-yellow button bug with #B91C1C background and #FFFFFF text', () => {
      expect(paystackSource).toContain("successBtn: {\n    backgroundColor: '#B91C1C'");
      expect(paystackSource).toContain("successBtnText: {\n    color: '#FFFFFF'");
      expect(paystackSource).not.toMatch(/successBtn:\s*\{[\s\S]*?backgroundColor:\s*Colors\.neon[\s\S]*?successBtnText:\s*\{[\s\S]*?color:\s*Colors\.crust/);
    });

    it('ensures total payment amount has high contrast against warm cream background', () => {
      expect(paystackSource).toContain("amountValue: {\n    color: '#B91C1C'");
      expect(paystackSource).toContain("amountBox: {\n    backgroundColor: '#FFF7E6'");
    });

    it('ensures sandbox warning and instructions use high-contrast dark amber and chocolate', () => {
      expect(paystackSource).toContain("sandboxNotice: {\n    backgroundColor: '#FEF3C7'");
      expect(paystackSource).toContain("sandboxTitle: {\n    color: '#92400E'");
      expect(paystackSource).toContain("sandboxSubtitle: {\n    color: '#3E2723'");
    });

    it('ensures cancel button uses distinct surface and high-contrast chocolate text', () => {
      expect(paystackSource).toContain("cancelBtn: {\n    backgroundColor: '#F7F2E7'");
      expect(paystackSource).toContain("cancelBtnText: {\n    color: '#3E2723'");
    });
  });

  describe('4. Landmark & Saved Address Modal Inputs Explicit Styling', () => {
    const landmarkPath = path.resolve(__dirname, '../components/LandmarkPickerModal.tsx');
    const landmarkSource = fs.readFileSync(landmarkPath, 'utf8');
    const addressesPath = path.resolve(__dirname, '../components/SavedAddressesModal.tsx');
    const addressesSource = fs.readFileSync(addressesPath, 'utf8');

    it('ensures LandmarkPickerModal search input has explicit foreground, background, and placeholder', () => {
      expect(landmarkSource).toContain('placeholderTextColor="#85746E"');
      expect(landmarkSource).toContain("color: '#1F1F1F'");
      expect(landmarkSource).toContain("backgroundColor: '#FFFFFF'");
    });

    it('ensures SavedAddressesModal form inputs have explicit foreground, background, and placeholder', () => {
      expect(addressesSource).toContain("color: '#1F1F1F'");
      expect(addressesSource).toContain("backgroundColor: '#FFFFFF'");
      expect(addressesSource).toContain("borderColor: '#D4C9BF'");
      // All inputs use explicit #85746E placeholder
      const placeholderMatches = addressesSource.match(/placeholderTextColor="#85746E"/g);
      expect(placeholderMatches).not.toBeNull();
      expect(placeholderMatches!.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('5. WCAG 2.1 AA Mathematical Contrast Ratio Verification', () => {
    it('verifies Primary Charcoal (#1F1F1F) on Pure White (#FFFFFF) passes WCAG AAA (>= 7.0:1)', () => {
      const ratio = getContrastRatio('#1F1F1F', '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(13.0);
    });

    it('verifies Primary Charcoal (#1F1F1F) on Warm Cream (#FFF8EC) passes WCAG AAA (>= 7.0:1)', () => {
      const ratio = getContrastRatio('#1F1F1F', '#FFF8EC');
      expect(ratio).toBeGreaterThanOrEqual(13.0);
    });

    it('verifies Secondary Body (#6B5E59) on Pure White (#FFFFFF) passes WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio('#6B5E59', '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('verifies Brand Pizza Red (#B91C1C) on Pure White (#FFFFFF) passes WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio('#B91C1C', '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('verifies White Text (#FFFFFF) on Brand Red Button (#B91C1C) passes WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio('#FFFFFF', '#B91C1C');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('verifies Brand Pizza Red (#B91C1C) on Warm Cream Box (#FFF7E6) passes WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio('#B91C1C', '#FFF7E6');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('verifies Warning Dark Amber (#92400E) on Amber Light Fill (#FEF3C7) passes WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio('#92400E', '#FEF3C7');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('verifies Status Dark Green (#166534) on Green Light Fill (#DCFCE7) passes WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio('#166534', '#DCFCE7');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('verifies Chocolate Brown (#3E2723) on Subtle Fill (#F7F2E7) passes WCAG AAA (>= 7.0:1)', () => {
      const ratio = getContrastRatio('#3E2723', '#F7F2E7');
      expect(ratio).toBeGreaterThanOrEqual(7.0);
    });

    it('confirms the previous yellow-on-yellow button combination was a WCAG failure (1.0:1)', () => {
      const ratio = getContrastRatio('#F4B323', '#F4B323');
      expect(ratio).toBeCloseTo(1.0, 1);
    });
  });
});
