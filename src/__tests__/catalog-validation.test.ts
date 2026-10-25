import {
  validateHalalCompliance,
  validateProduct,
  validateCustomizationSelectionCount,
} from '../domains/catalog/catalog-service';
import { CustomizationGroup } from '../types/catalog';

describe('Catalog Validation & Dietary Compliance Service', () => {
  describe('Configurable Dietary Compliance', () => {
    it('accepts standard compliant items regardless of enforcement setting', () => {
      expect(validateHalalCompliance('Chicken Tikka Pizza').compliant).toBe(true);
      expect(validateHalalCompliance('BBQ Beef Pizza with extra cheese').compliant).toBe(true);
      expect(validateHalalCompliance('Spicy Chicken Wings and French Fries').compliant).toBe(true);
      expect(validateHalalCompliance('Strawberry Milkshake with Oreo').compliant).toBe(true);
    });

    it('does NOT block pork/bacon items when enforcement is disabled (unconfirmed default)', () => {
      // By default in Phase 1.1, Brand.dietaryPolicy.enforceRestrictions is false
      const result = validateHalalCompliance('Pork Sausage Supreme Pizza', { enforce: false });
      expect(result.compliant).toBe(true);
      expect(result.isEnforced).toBe(false);
      expect(result.violation).toMatch(/not enforced/);
    });

    it('strictly rejects prohibited items when enforcement is explicitly activated', () => {
      const porkResult = validateHalalCompliance('Pork Sausage Supreme Pizza', { enforce: true });
      expect(porkResult.compliant).toBe(false);
      expect(porkResult.isEnforced).toBe(true);
      expect(porkResult.violation).toMatch(/violates restaurant dietary policy/);

      const baconResult = validateHalalCompliance('Bacon & Cheese Delight', { enforce: true });
      expect(baconResult.compliant).toBe(false);

      const alcoholResult = validateHalalCompliance('Rum and Raisin Ice Cream with alcohol', { enforce: true });
      expect(alcoholResult.compliant).toBe(false);
    });
  });

  describe('Product Validation', () => {
    it('validates product name presence', () => {
      expect(validateProduct({ name: '', basePrice: 7000 }).valid).toBe(false);
      expect(validateProduct({ name: 'Meaty Pizza', basePrice: 7000 }).valid).toBe(true);
    });

    it('respects dietary enforcement option during product validation', () => {
      // When dietary enforcement is off, item with pork is not blocked
      expect(validateProduct({ name: 'Pork Ribs', basePrice: 5000 }, { enforceDietary: false }).valid).toBe(true);
      
      // When dietary enforcement is on, item is blocked
      expect(validateProduct({ name: 'Pork Ribs', basePrice: 5000 }, { enforceDietary: true }).valid).toBe(false);
    });

    it('rejects negative base prices', () => {
      const res = validateProduct({ name: 'Bottle Water', basePrice: -100 });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('Base price cannot be negative.');
    });
  });

  describe('Customization Selection Bounds', () => {
    const iceCreamFlavorGroup: CustomizationGroup = {
      id: 'grp-1',
      name: 'Flavors',
      minSelections: 1,
      maxSelections: 2,
      options: [],
    };

    it('validates when selected count is within bounds', () => {
      expect(validateCustomizationSelectionCount(iceCreamFlavorGroup, 1).valid).toBe(true);
      expect(validateCustomizationSelectionCount(iceCreamFlavorGroup, 2).valid).toBe(true);
    });

    it('rejects when selected count is below minSelections', () => {
      const res = validateCustomizationSelectionCount(iceCreamFlavorGroup, 0);
      expect(res.valid).toBe(false);
      expect(res.message).toMatch(/at least 1 option/);
    });

    it('rejects when selected count exceeds maxSelections', () => {
      const res = validateCustomizationSelectionCount(iceCreamFlavorGroup, 3);
      expect(res.valid).toBe(false);
      expect(res.message).toMatch(/at most 2 option/);
    });
  });
});
