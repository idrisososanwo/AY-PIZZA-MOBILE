/**
 * Product Catalog Validation & Dietary Compliance Service
 */

import { Product, CustomizationGroup } from '../../types/catalog';
import { Brand } from '../../constants/brand';

/**
 * Evaluates dietary compliance based on provisional or confirmed restrictions.
 * If enforcement is disabled (default until owner confirms), returns compliant=true with an advisory flag.
 */
export function validateHalalCompliance(
  text: string,
  options?: { enforce?: boolean }
): { compliant: boolean; violation?: string; isEnforced: boolean } {
  const shouldEnforce = options?.enforce ?? Brand.dietaryPolicy.enforceRestrictions;
  const normalized = text.toLowerCase();

  for (const prohibited of Brand.dietaryPolicy.provisionalRestrictions) {
    // Check whole-word boundary
    const regex = new RegExp(`\\b${prohibited}\\b`, 'i');
    if (regex.test(normalized)) {
      if (shouldEnforce) {
        return {
          compliant: false,
          violation: `Ingredient or term "${prohibited}" violates restaurant dietary policy.`,
          isEnforced: true,
        };
      } else {
        return {
          compliant: true, // Not blocked because policy is unconfirmed
          violation: `Note: Ingredient or term "${prohibited}" matches provisional dietary filter (not enforced).`,
          isEnforced: false,
        };
      }
    }
  }
  return { compliant: true, isEnforced: shouldEnforce };
}

/**
 * Validates that a product definition satisfies business and safety rules.
 */
export function validateProduct(
  product: Partial<Product>,
  options?: { enforceDietary?: boolean }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!product.name || product.name.trim().length === 0) {
    errors.push('Product name is required.');
  } else {
    const compliance = validateHalalCompliance(product.name, { enforce: options?.enforceDietary });
    if (!compliance.compliant && compliance.violation) {
      errors.push(compliance.violation);
    }
  }

  if (product.description) {
    const compliance = validateHalalCompliance(product.description, { enforce: options?.enforceDietary });
    if (!compliance.compliant && compliance.violation) {
      errors.push(compliance.violation);
    }
  }

  if (product.basePrice !== undefined && product.basePrice < 0) {
    errors.push('Base price cannot be negative.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates customization group selection bounds.
 */
export function validateCustomizationSelectionCount(
  group: CustomizationGroup,
  selectedCount: number
): { valid: boolean; message?: string } {
  if (selectedCount < group.minSelections) {
    return {
      valid: false,
      message: `Please select at least ${group.minSelections} option(s) for ${group.name}.`,
    };
  }
  if (selectedCount > group.maxSelections) {
    return {
      valid: false,
      message: `You can select at most ${group.maxSelections} option(s) for ${group.name}.`,
    };
  }
  return { valid: true };
}
