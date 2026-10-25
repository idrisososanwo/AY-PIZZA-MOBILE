/**
 * Product Catalog, Variant and Customization Domain Types
 */

export type ProductCategorySlug = 'pizza' | 'icecream' | 'fastfood' | 'drinks';

export interface ProductCategory {
  id: string;
  name: string;
  slug: ProductCategorySlug;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface ProductSize {
  id: string;
  name: string;             // e.g. "Regular", "Standard", "Large", "Queen", "King"
  sizeMultiplierPrice: number; // e.g. +0, +1500, +3000, +5000, +7000
  isAvailable?: boolean;
  displayOrder: number;
}

export interface CustomizationOption {
  id: string;
  groupId: string;
  name: string;             // e.g. "Extra Beef", "Oreo", "Half & Half"
  price: number;            // e.g. 1000
  isAvailable: boolean;
  displayOrder: number;
}

export interface CustomizationGroup {
  id: string;
  name: string;             // e.g. "Extra Toppings", "Flavors", "Half & Half Secondary Flavor"
  categorySlug?: string | null;
  minSelections: number;    // e.g. 0 for optional extras, 1 for required size
  maxSelections: number;    // e.g. 2 for ice cream flavors, 1 for half2 flavor
  options: CustomizationOption[];
}

export interface Product {
  id: string;
  categoryId: string;
  categorySlug: ProductCategorySlug;
  name: string;
  description: string;
  basePrice: number;        // e.g. 7000 for pizza, 300 for water
  imageUrl: string | null;
  isAvailable: boolean;     // 1-tap out-of-stock toggle
  displayOrder: number;
  sizes?: ProductSize[];
  customizationGroups?: CustomizationGroup[];
  isProvisional?: boolean;  // Flags reverse-engineered estimates pending owner sign-off
  createdAt: string;
  updatedAt: string;
}
