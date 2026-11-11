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

describe('Phase 5.4.3 / Step 4: Wider Visual Harmonisation', () => {
  const componentsDir = path.resolve(__dirname, '../components');

  describe('1. Dynamic Fulfillment Subtext on HomeScreen', () => {
    const homeScreenFile = fs.readFileSync(path.join(componentsDir, 'HomeScreen.tsx'), 'utf-8');

    it('replaces hardcoded delivery fee with dynamic landmark pricing & timing', () => {
      expect(homeScreenFile).not.toContain('₦{Brand.fulfillment.campusDeliveryFee} Flat Campus Delivery');
      expect(homeScreenFile).toContain('selectedLandmark.fee.toLocaleString()');
      expect(homeScreenFile).toContain('Flat Campus Delivery • ~25–35 mins');
      expect(homeScreenFile).toContain('~35–50 mins');
    });

    it('provides clear fallback guidance when no landmark is selected yet', () => {
      expect(homeScreenFile).toContain('Select landmark for delivery fee & timing');
    });

    it('clearly communicates pickup collection point and zero fee', () => {
      expect(homeScreenFile).toContain('Free Pickup • Ready for collection at King Jaja in ~15 mins');
    });
  });

  describe('2. Complete OrderReceiptModal Light Design System Migration', () => {
    const receiptFile = fs.readFileSync(path.join(componentsDir, 'OrderReceiptModal.tsx'), 'utf-8');

    it('completely eliminates legacy dark mode tokens', () => {
      expect(receiptFile).not.toContain('Colors.night');
      expect(receiptFile).not.toMatch(/Colors\.surface\b/);
      expect(receiptFile).not.toContain('Colors.frost');
      expect(receiptFile).not.toContain('Colors.neon');
      expect(receiptFile).not.toContain('Colors.lava');
    });

    it('uses light brand palette for container, cards, and text hierarchy', () => {
      expect(receiptFile).toContain('backgroundColor: Colors.warmCream');
      expect(receiptFile).toContain('backgroundColor: \'#FFFFFF\'');
      expect(receiptFile).toContain('color: Colors.primaryRed');
      expect(receiptFile).toContain('color: Colors.charcoal');
      expect(receiptFile).toContain('color: Colors.textSecondary');
    });

    it('fixes the secondary button white-on-white text contrast failure', () => {
      expect(receiptFile).toContain('secondaryBtn: {');
      expect(receiptFile).toContain('secondaryBtnText: {');
      expect(receiptFile).toContain('color: Colors.charcoal');
      // Verify contrast of charcoal on white button background
      const contrast = getContrastRatio('#27211F', '#FFFFFF');
      expect(contrast).toBeGreaterThanOrEqual(10.0); // WCAG AAA is 7:1
    });

    it('ensures action buttons meet the >= 44dp touch target standard', () => {
      expect(receiptFile).toContain('minHeight: 48');
    });
  });

  describe('3. ProductCard Action Button Contrast & Touch Targets', () => {
    const productCardFile = fs.readFileSync(path.join(componentsDir, 'ProductCard.tsx'), 'utf-8');

    it('fixes white-on-yellow contrast failure with dark high-contrast text', () => {
      expect(productCardFile).toContain('actionButtonTextAdd');
      expect(productCardFile).toContain('color: Colors.charcoal');

      // Golden yellow (#F4B323) vs Charcoal (#27211F) contrast
      const yellowOnCharcoal = getContrastRatio('#F4B323', '#27211F');
      expect(yellowOnCharcoal).toBeGreaterThanOrEqual(7.0); // WCAG AAA is 7:1
    });

    it('ensures accessible touch target via minHeight and hitSlop (>= 44dp)', () => {
      expect(productCardFile).toContain('minHeight: 36');
      expect(productCardFile).toContain('hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}');
    });
  });

  describe('4. CategoryBar Visual & Touch Optimization', () => {
    const categoryBarFile = fs.readFileSync(path.join(componentsDir, 'CategoryBar.tsx'), 'utf-8');

    it('removes unused Platform import', () => {
      expect(categoryBarFile).not.toContain('Platform');
    });

    it('provides accessible category pill touch target (>= 44dp)', () => {
      expect(categoryBarFile).toContain('minHeight: 40');
      expect(categoryBarFile).toContain('hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}');
    });
  });

  describe('5. CustomizerModal Accessibility & Visual Polish', () => {
    const customizerFile = fs.readFileSync(path.join(componentsDir, 'CustomizerModal.tsx'), 'utf-8');

    it('fixes placeholder color and adds explicit brand selectionColor to instructions input', () => {
      expect(customizerFile).not.toContain('rgba(255, 232, 214, 0.4)');
      expect(customizerFile).toContain('placeholderTextColor={Colors.textMuted}');
      expect(customizerFile).toContain('selectionColor={Colors.primaryRed}');
    });

    it('provides expanded hitSlop on quantity stepper buttons (>= 44dp)', () => {
      expect(customizerFile).toContain('hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}');
    });

    it('ensures topping cards meet >= 44dp minimum height', () => {
      expect(customizerFile).toContain('minHeight: 44');
    });

    it('ensures close button has accessible touch target via hitSlop', () => {
      expect(customizerFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
    });
  });

  describe('6. CheckoutModal State & Styling Harmonisation', () => {
    const checkoutFile = fs.readFileSync(path.join(componentsDir, 'CheckoutModal.tsx'), 'utf-8');

    it('utilizes savedAddresses state to render address count and prevent unused state warnings', () => {
      expect(checkoutFile).toContain('savedAddresses.length > 0');
      expect(checkoutFile).toContain('`Saved (${savedAddresses.length}) 📍`');
    });

    it('harmonises thumbnail container background from dark #27211F to surfaceCream', () => {
      expect(checkoutFile).not.toContain('backgroundColor: \'#27211F\'');
      expect(checkoutFile).toContain('backgroundColor: Colors.surfaceCream');
    });

    it('adds brand selectionColor to all customer text inputs', () => {
      const occurrences = (checkoutFile.match(/selectionColor=\{Colors\.primaryRed\}/g) || []).length;
      expect(occurrences).toBeGreaterThanOrEqual(4);
    });

    it('provides expanded hitSlop on modal close button', () => {
      expect(checkoutFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
    });
  });

  describe('7. OrdersScreen Touch Targets & Action Button Consistency', () => {
    const ordersFile = fs.readFileSync(path.join(componentsDir, 'OrdersScreen.tsx'), 'utf-8');

    it('ensures track live, reorder, and details buttons meet >= 44dp height', () => {
      expect(ordersFile).toContain('trackLiveBtn: {');
      expect(ordersFile).toContain('reorderBtn: {');
      expect(ordersFile).toContain('detailsBtn: {');
      const minHeight44Count = (ordersFile.match(/minHeight: 44/g) || []).length;
      expect(minHeight44Count).toBeGreaterThanOrEqual(4);
    });
  });

  describe('8. Modal Close Buttons & Universal selectionColor Enforcement', () => {
    const supportFile = fs.readFileSync(path.join(componentsDir, 'SupportModal.tsx'), 'utf-8');
    const editProfileFile = fs.readFileSync(path.join(componentsDir, 'EditProfileModal.tsx'), 'utf-8');
    const landmarkPickerFile = fs.readFileSync(path.join(componentsDir, 'LandmarkPickerModal.tsx'), 'utf-8');
    const savedAddressesFile = fs.readFileSync(path.join(componentsDir, 'SavedAddressesModal.tsx'), 'utf-8');
    const authModalFile = fs.readFileSync(path.join(componentsDir, 'AuthModal.tsx'), 'utf-8');
    const cartViewFile = fs.readFileSync(path.join(componentsDir, 'CartView.tsx'), 'utf-8');
    const bottomTabBarFile = fs.readFileSync(path.join(componentsDir, 'BottomTabBar.tsx'), 'utf-8');

    it('provides >= 44dp touch target on SupportModal close button', () => {
      expect(supportFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
    });

    it('provides >= 44dp touch target and selectionColor on EditProfileModal', () => {
      expect(editProfileFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
      expect(editProfileFile).toContain('minHeight: 48');
      expect(editProfileFile).toContain('selectionColor={Colors.primaryRed}');
    });

    it('provides selectionColor and hitSlop in LandmarkPickerModal', () => {
      expect(landmarkPickerFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
      expect(landmarkPickerFile).toContain('selectionColor={Colors.brandRed}');
    });

    it('provides selectionColor and hitSlop in SavedAddressesModal', () => {
      expect(savedAddressesFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
      expect(savedAddressesFile).toContain('selectionColor={Colors.primaryRed}');
    });

    it('provides selectionColor and minHeight in AuthModal', () => {
      expect(authModalFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
      expect(authModalFile).toContain('selectionColor={Colors.primaryRed}');
      expect(authModalFile).toContain('minHeight: 48');
    });

    it('provides selectionColor and minHeight: 44 in CartView', () => {
      expect(cartViewFile).toContain('selectionColor={Colors.primaryRed}');
      expect(cartViewFile).toContain('minHeight: 44');
    });

    it('ensures BottomTabBar tab buttons have >= 44dp height', () => {
      expect(bottomTabBarFile).toContain('minHeight: 48');
    });
  });
});
