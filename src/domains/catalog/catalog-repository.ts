/**
 * Supabase-backed Catalog Repository with Seamless Offline/Provisional Cache
 * CRITICAL RULE: All catalog data is database-driven. Prices are displayed as
 * database-provided provisional estimates pending restaurant owner sign-off.
 */

import { supabase } from '../../config/supabase';
import { Config } from '../../config/env';
import { ProductCategory, Product, ProductSize, CustomizationGroup, CustomizationOption, ProductCategorySlug } from '../../types/catalog';

/**
 * Seeded Fallback / In-Memory Cache (Matches Migrations 20261021000002 & 20261021000004)
 * Used as reliable cache / fallback when Supabase connection is offline or in test environments.
 */
export const SEEDED_CATEGORIES: ProductCategory[] = [
  {
    id: '11111111-1111-1111-1111-111111111101',
    name: 'Pizza Menu',
    slug: 'pizza',
    description: 'Freshly baked artisan pizzas made with perfectly proofed dough',
    displayOrder: 1,
    isActive: true,
    createdAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '11111111-1111-1111-1111-111111111102',
    name: 'Ice Cream & Shakes',
    slug: 'icecream',
    description: 'Creamy soft-serve cups and thick gourmet milkshakes',
    displayOrder: 2,
    isActive: true,
    createdAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '11111111-1111-1111-1111-111111111103',
    name: 'Fast Food & Sides',
    slug: 'fastfood',
    description: 'Crispy wings, juicy chicken, gourmet burgers and chips',
    displayOrder: 3,
    isActive: true,
    createdAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '11111111-1111-1111-1111-111111111104',
    name: 'Cold Beverages',
    slug: 'drinks',
    description: 'Refreshing cold soft drinks and chilled bottled water',
    displayOrder: 4,
    isActive: true,
    createdAt: '2026-10-21T00:00:00Z',
  },
];

export const PIZZA_SIZES: ProductSize[] = [
  { id: '33333333-3333-3333-3333-333333333301', name: 'Regular', sizeMultiplierPrice: 0, displayOrder: 1 },
  { id: '33333333-3333-3333-3333-333333333302', name: 'Standard', sizeMultiplierPrice: 1500, displayOrder: 2 },
  { id: '33333333-3333-3333-3333-333333333303', name: 'Large', sizeMultiplierPrice: 3000, displayOrder: 3 },
  { id: '33333333-3333-3333-3333-333333333304', name: 'Queen', sizeMultiplierPrice: 5000, displayOrder: 4 },
  { id: '33333333-3333-3333-3333-333333333305', name: 'King', sizeMultiplierPrice: 7000, displayOrder: 5 },
];

export const MILKSHAKE_SIZES: ProductSize[] = [
  { id: '33333333-3333-3333-3333-333333333310', name: 'Small Shake', sizeMultiplierPrice: 0, displayOrder: 1 },
  { id: '33333333-3333-3333-3333-333333333311', name: 'Big Shake', sizeMultiplierPrice: 1000, displayOrder: 2 },
];

export const ICE_CREAM_SIZES: ProductSize[] = [
  { id: '33333333-3333-3333-3333-333333333320', name: 'Small Cup', sizeMultiplierPrice: 0, displayOrder: 1 },
  { id: '33333333-3333-3333-3333-333333333321', name: 'Medium Cup', sizeMultiplierPrice: 1000, displayOrder: 2 },
  { id: '33333333-3333-3333-3333-333333333322', name: 'Big Cup', sizeMultiplierPrice: 2000, displayOrder: 3 },
];

export const EXTRA_PIZZA_TOPPINGS: CustomizationOption[] = [
  { id: '55555555-5555-5555-5555-555555555501', groupId: '44444444-4444-4444-4444-444444444401', name: 'Extra Beef', price: 1000, isAvailable: true, displayOrder: 1 },
  { id: '55555555-5555-5555-5555-555555555502', groupId: '44444444-4444-4444-4444-444444444401', name: 'Extra Cheese', price: 1000, isAvailable: true, displayOrder: 2 },
  { id: '55555555-5555-5555-5555-555555555503', groupId: '44444444-4444-4444-4444-444444444401', name: 'Extra Chicken', price: 1000, isAvailable: true, displayOrder: 3 },
  { id: '55555555-5555-5555-5555-555555555504', groupId: '44444444-4444-4444-4444-444444444401', name: 'Extra Pepperoni', price: 1000, isAvailable: true, displayOrder: 4 },
];

export const HALF_AND_HALF_OPTION: CustomizationOption = {
  id: '55555555-5555-5555-5555-555555555505',
  groupId: '44444444-4444-4444-4444-444444444402',
  name: 'Half & Half Pizza',
  price: 1000, // Base surcharge for Regular/Standard; +₦1500 for Large/Queen/King
  isAvailable: true,
  displayOrder: 1,
};

export const MILKSHAKE_FLAVORS: CustomizationOption[] = [
  { id: '55555555-5555-5555-5555-555555555510', groupId: '44444444-4444-4444-4444-444444444410', name: 'Vanilla Blast', price: 0, isAvailable: true, displayOrder: 1 },
  { id: '55555555-5555-5555-5555-555555555511', groupId: '44444444-4444-4444-4444-444444444410', name: 'Strawberry Lovers', price: 0, isAvailable: true, displayOrder: 2 },
  { id: '55555555-5555-5555-5555-555555555512', groupId: '44444444-4444-4444-4444-444444444410', name: 'Milk and Cookies', price: 0, isAvailable: true, displayOrder: 3 },
  { id: '55555555-5555-5555-5555-555555555513', groupId: '44444444-4444-4444-4444-444444444410', name: 'Oh Fudge', price: 0, isAvailable: true, displayOrder: 4 },
];

export const ICE_CREAM_FLAVORS: CustomizationOption[] = [
  { id: '55555555-5555-5555-5555-555555555520', groupId: '44444444-4444-4444-4444-444444444411', name: 'Vanilla', price: 0, isAvailable: true, displayOrder: 1 },
  { id: '55555555-5555-5555-5555-555555555521', groupId: '44444444-4444-4444-4444-444444444411', name: 'Strawberry', price: 0, isAvailable: true, displayOrder: 2 },
  { id: '55555555-5555-5555-5555-555555555522', groupId: '44444444-4444-4444-4444-444444444411', name: 'Chocolate', price: 0, isAvailable: true, displayOrder: 3 },
  { id: '55555555-5555-5555-5555-555555555523', groupId: '44444444-4444-4444-4444-444444444411', name: 'Sweet Malt', price: 0, isAvailable: true, displayOrder: 4 },
  { id: '55555555-5555-5555-5555-555555555524', groupId: '44444444-4444-4444-4444-444444444411', name: 'Bailey', price: 0, isAvailable: true, displayOrder: 5 },
  { id: '55555555-5555-5555-5555-555555555525', groupId: '44444444-4444-4444-4444-444444444411', name: 'Sweet Cream', price: 0, isAvailable: true, displayOrder: 6 },
];

export const DESSERT_TOPPINGS: CustomizationOption[] = [
  { id: '55555555-5555-5555-5555-555555555530', groupId: '44444444-4444-4444-4444-444444444412', name: 'Oreo', price: 1000, isAvailable: true, displayOrder: 1 },
  { id: '55555555-5555-5555-5555-555555555531', groupId: '44444444-4444-4444-4444-444444444412', name: 'M & M', price: 1000, isAvailable: true, displayOrder: 2 },
  { id: '55555555-5555-5555-5555-555555555532', groupId: '44444444-4444-4444-4444-444444444412', name: 'Brown Coconut', price: 1000, isAvailable: true, displayOrder: 3 },
  { id: '55555555-5555-5555-5555-555555555533', groupId: '44444444-4444-4444-4444-444444444412', name: 'Cashew Nut', price: 1000, isAvailable: true, displayOrder: 4 },
  { id: '55555555-5555-5555-5555-555555555534', groupId: '44444444-4444-4444-4444-444444444412', name: 'Chocolate Syrup', price: 1000, isAvailable: true, displayOrder: 5 },
  { id: '55555555-5555-5555-5555-555555555535', groupId: '44444444-4444-4444-4444-444444444412', name: 'Caramel Syrup', price: 1000, isAvailable: true, displayOrder: 6 },
  { id: '55555555-5555-5555-5555-555555555536', groupId: '44444444-4444-4444-4444-444444444412', name: 'Waffle Cone', price: 1000, isAvailable: true, displayOrder: 7 },
  { id: '55555555-5555-5555-5555-555555555537', groupId: '44444444-4444-4444-4444-444444444412', name: 'Waffle Bowl', price: 1000, isAvailable: true, displayOrder: 8 },
];

export const PIZZA_CUSTOMIZATION_GROUPS: CustomizationGroup[] = [
  {
    id: '44444444-4444-4444-4444-444444444401',
    name: 'Extra Pizza Toppings',
    categorySlug: 'pizza',
    minSelections: 0,
    maxSelections: 5,
    options: EXTRA_PIZZA_TOPPINGS,
  },
  {
    id: '44444444-4444-4444-4444-444444444402',
    name: 'Half and Half Selection',
    categorySlug: 'pizza',
    minSelections: 0,
    maxSelections: 1,
    options: [HALF_AND_HALF_OPTION],
  },
];

export const MILKSHAKE_CUSTOMIZATION_GROUPS: CustomizationGroup[] = [
  {
    id: '44444444-4444-4444-4444-444444444410',
    name: 'Milkshake Flavors',
    categorySlug: 'icecream',
    minSelections: 1,
    maxSelections: 2,
    options: MILKSHAKE_FLAVORS,
  },
  {
    id: '44444444-4444-4444-4444-444444444412',
    name: 'Dessert Toppings',
    categorySlug: 'icecream',
    minSelections: 0,
    maxSelections: 8,
    options: DESSERT_TOPPINGS,
  },
];

export const ICE_CREAM_CUSTOMIZATION_GROUPS: CustomizationGroup[] = [
  {
    id: '44444444-4444-4444-4444-444444444411',
    name: 'Ice Cream Flavors',
    categorySlug: 'icecream',
    minSelections: 1,
    maxSelections: 2,
    options: ICE_CREAM_FLAVORS,
  },
  {
    id: '44444444-4444-4444-4444-444444444412',
    name: 'Dessert Toppings',
    categorySlug: 'icecream',
    minSelections: 0,
    maxSelections: 8,
    options: DESSERT_TOPPINGS,
  },
];

export const SEEDED_PRODUCTS: Product[] = [
  // Pizzas
  {
    id: '22222222-2222-2222-2222-222222222201',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Sweet and Sour Pizza',
    description: 'Delicious sweet and sour sauce with tender chicken and melted cheese',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 1,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222202',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Club Pizza',
    description: 'Layered club pizza with sausage, chicken, peppers, and savory toppings',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 2,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222203',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Cheese Pepperoni Pizza',
    description: 'Classic beef pepperoni slices over rich mozzarella cheese and marinara',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 3,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222204',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Hawaii Pizza',
    description: 'Sweet pineapple chunks paired with savory chicken and premium cheese',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 4,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222205',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Veggie Deluxe Pizza',
    description: 'Fresh bell peppers, onions, sweetcorn, olives, and signature herb blend',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 5,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222206',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Chicken Tikka Pizza',
    description: 'Tender tikka spiced chicken pieces with roasted onions and peppers',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 6,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222207',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'BBQ Beef Pizza',
    description: 'Seasoned minced beef drizzled with smoky BBQ sauce and crisp onions',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 7,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222208',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Margherita Pizza',
    description: 'Traditional tomato sauce, double mozzarella cheese, and fragrant basil herbs',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 8,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222209',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Chicken and Mushroom Pizza',
    description: 'Succulent roasted chicken with sliced button mushrooms in herb cheese',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 9,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222210',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'BBQ Chicken Pizza',
    description: 'Tender shredded chicken glazed with tangy sweet BBQ sauce and herbs',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 10,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222211',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Sweet Chili Chicken Pizza',
    description: 'Sweet and spicy chili-glazed chicken baked with sweet peppers',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 11,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222212',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Meaty Pizza',
    description: 'Loaded with shredded beef, spicy chicken bits, and sausage toppings',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 12,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222213',
    categoryId: '11111111-1111-1111-1111-111111111101',
    categorySlug: 'pizza',
    name: 'Steak Pizza',
    description: 'Marinated spicy steak strips with caramelized onions and peppers',
    basePrice: 7000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 13,
    sizes: PIZZA_SIZES,
    customizationGroups: PIZZA_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },

  // Desserts
  {
    id: '22222222-2222-2222-2222-222222222220',
    categoryId: '11111111-1111-1111-1111-111111111102',
    categorySlug: 'icecream',
    name: 'Milkshake',
    description: 'Thick, creamy, and delicious milkshakes crafted with fresh ingredients (choose up to 2 flavors)',
    basePrice: 4500,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 1,
    sizes: MILKSHAKE_SIZES,
    customizationGroups: MILKSHAKE_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222221',
    categoryId: '11111111-1111-1111-1111-111111111102',
    categorySlug: 'icecream',
    name: 'Ice Cream Cup',
    description: 'Creamy, flavorful soft-serve ice creams in various cup sizes (choose up to 2 flavors)',
    basePrice: 3500,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 2,
    sizes: ICE_CREAM_SIZES,
    customizationGroups: ICE_CREAM_CUSTOMIZATION_GROUPS,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },

  // Fast Food & Sides
  {
    id: '22222222-2222-2222-2222-222222222230',
    categoryId: '11111111-1111-1111-1111-111111111103',
    categorySlug: 'fastfood',
    name: 'Burger',
    description: 'Juicy grilled beef patty with fresh lettuce, tomatoes, and house sauce',
    basePrice: 3500,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 1,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222231',
    categoryId: '11111111-1111-1111-1111-111111111103',
    categorySlug: 'fastfood',
    name: 'Burger & Chips',
    description: 'Gourmet burger served with golden seasoned french fries',
    basePrice: 5000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 2,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222232',
    categoryId: '11111111-1111-1111-1111-111111111103',
    categorySlug: 'fastfood',
    name: 'Wings',
    description: 'Spicy glazed chicken wings baked until crispy and tender',
    basePrice: 3500,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 3,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222233',
    categoryId: '11111111-1111-1111-1111-111111111103',
    categorySlug: 'fastfood',
    name: 'Wing & Chips',
    description: 'Spicy chicken wings served with hot crispy potato chips',
    basePrice: 5000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 4,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222234',
    categoryId: '11111111-1111-1111-1111-111111111103',
    categorySlug: 'fastfood',
    name: 'Chicken Lap',
    description: 'Well-seasoned fried or roasted chicken drumstick portion',
    basePrice: 3500,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 5,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222235',
    categoryId: '11111111-1111-1111-1111-111111111103',
    categorySlug: 'fastfood',
    name: 'Chicken & Chips',
    description: 'Crispy spiced chicken quarter with golden french fries',
    basePrice: 5000,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 6,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },

  // Cold Beverages
  {
    id: '22222222-2222-2222-2222-222222222240',
    categoryId: '11111111-1111-1111-1111-111111111104',
    categorySlug: 'drinks',
    name: 'Bottle Water',
    description: 'Chilled purified natural spring water (75cl)',
    basePrice: 300,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 1,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222241',
    categoryId: '11111111-1111-1111-1111-111111111104',
    categorySlug: 'drinks',
    name: 'Soft Drinks',
    description: 'Chilled Coca-Cola, Fanta, Sprite, or Pepsi (50cl PET)',
    basePrice: 600,
    imageUrl: null,
    isAvailable: true,
    displayOrder: 2,
    isProvisional: true,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  },
];

export class CatalogRepository {
  private lastFetchUsedFallback = false;

  /**
   * Reports whether the last catalog fetch used offline demo fallback.
   */
  isOfflineFallbackActive(): boolean {
    return this.lastFetchUsedFallback;
  }

  /**
   * Fetches active product categories, ordered by display_order.
   */
  async getCategories(): Promise<ProductCategory[]> {
    const isLiveEnv = Config.isProduction || Config.appEnv === 'staging';
    if (isLiveEnv) {
      if (!Config.supabaseUrl || Config.supabaseUrl.includes('placeholder')) {
        throw new Error(
          `FATAL CONFIGURATION ERROR: Live Supabase database credentials must be configured in ${Config.appEnv}. Fallback demo catalog is disabled in ${Config.appEnv}.`
        );
      }
    } else {
      if (!Config.supabaseUrl || Config.supabaseUrl.includes('placeholder')) {
        this.lastFetchUsedFallback = true;
        return SEEDED_CATEGORIES;
      }
    }

    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        if (Config.isProduction) {
          throw new Error(`Database error fetching categories: ${error.message}`);
        }
        this.lastFetchUsedFallback = true;
        return SEEDED_CATEGORIES;
      }

      if (!data || data.length === 0) {
        if (Config.isProduction) {
          throw new Error('No categories found in production database.');
        }
        this.lastFetchUsedFallback = true;
        return SEEDED_CATEGORIES;
      }

      this.lastFetchUsedFallback = false;
      return data.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug as ProductCategorySlug,
        description: c.description,
        displayOrder: c.display_order,
        isActive: c.is_active,
        createdAt: c.created_at,
      }));
    } catch (err) {
      if (Config.isProduction) {
        throw err;
      }
      this.lastFetchUsedFallback = true;
      return SEEDED_CATEGORIES;
    }
  }

  /**
   * Fetches products optionally filtered by category and/or query string.
   */
  async getProducts(options?: {
    categorySlug?: string;
    searchQuery?: string;
    includeUnavailable?: boolean;
  }): Promise<Product[]> {
    const isLiveEnv = Config.isProduction || Config.appEnv === 'staging';
    if (isLiveEnv) {
      if (!Config.supabaseUrl || Config.supabaseUrl.includes('placeholder')) {
        throw new Error(
          `FATAL CONFIGURATION ERROR: Live Supabase database credentials must be configured in ${Config.appEnv}. Fallback demo catalog is disabled in ${Config.appEnv}.`
        );
      }
    } else {
      if (!Config.supabaseUrl || Config.supabaseUrl.includes('placeholder')) {
        this.lastFetchUsedFallback = true;
        return this.filterLocalProducts(SEEDED_PRODUCTS, options);
      }
    }

    try {
      let query = supabase
        .from('products')
        .select(`
          id, category_id, name, description, base_price, image_url, is_available, display_order, created_at, updated_at,
          categories (slug)
        `)
        .order('display_order', { ascending: true });

      if (!options?.includeUnavailable) {
        query = query.eq('is_available', true);
      }

      const { data, error } = await query;

      if (error) {
        if (Config.isProduction) {
          throw new Error(`Database error fetching products: ${error.message}`);
        }
        this.lastFetchUsedFallback = true;
        return this.filterLocalProducts(SEEDED_PRODUCTS, options);
      }

      if (!data || data.length === 0) {
        if (Config.isProduction) {
          throw new Error('No products found in production database.');
        }
        this.lastFetchUsedFallback = true;
        return this.filterLocalProducts(SEEDED_PRODUCTS, options);
      }

      this.lastFetchUsedFallback = false;
      // Map Supabase rows and enrich with sizes and customizations
      const products: Product[] = data.map((row: any) => {
        const categorySlug = (row.categories?.slug || 'pizza') as ProductCategorySlug;
        return {
          id: row.id,
          categoryId: row.category_id,
          categorySlug,
          name: row.name,
          description: row.description,
          basePrice: Number(row.base_price),
          imageUrl: row.image_url,
          isAvailable: row.is_available,
          displayOrder: row.display_order,
          isProvisional: true, // Marked provisional pending restaurant owner sign-off
          sizes: this.resolveSizesForProduct(row.id, categorySlug),
          customizationGroups: this.resolveCustomizationsForProduct(row.id, categorySlug),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });

      return this.filterLocalProducts(products, options);
    } catch {
      return this.filterLocalProducts(SEEDED_PRODUCTS, options);
    }
  }

  /**
   * Fetches a single product by ID with all sizes and customization rules.
   */
  async getProductById(productId: string): Promise<Product | null> {
    const products = await this.getProducts({ includeUnavailable: true });
    return products.find((p) => p.id === productId) || null;
  }

  /**
   * Resolves sizes for a given product or category.
   */
  private resolveSizesForProduct(productId: string, categorySlug: ProductCategorySlug): ProductSize[] | undefined {
    if (categorySlug === 'pizza') {
      return PIZZA_SIZES;
    }
    if (productId === '22222222-2222-2222-2222-222222222220') {
      return MILKSHAKE_SIZES;
    }
    if (productId === '22222222-2222-2222-2222-222222222221') {
      return ICE_CREAM_SIZES;
    }
    return undefined;
  }

  /**
   * Resolves customization groups for a given product or category.
   */
  private resolveCustomizationsForProduct(productId: string, categorySlug: ProductCategorySlug): CustomizationGroup[] | undefined {
    if (categorySlug === 'pizza') {
      return PIZZA_CUSTOMIZATION_GROUPS;
    }
    if (productId === '22222222-2222-2222-2222-222222222220') {
      return MILKSHAKE_CUSTOMIZATION_GROUPS;
    }
    if (productId === '22222222-2222-2222-2222-222222222221') {
      return ICE_CREAM_CUSTOMIZATION_GROUPS;
    }
    return undefined;
  }

  /**
   * Filters local product array by categorySlug and search term.
   */
  private filterLocalProducts(
    products: Product[],
    options?: { categorySlug?: string; searchQuery?: string; includeUnavailable?: boolean }
  ): Product[] {
    let result = [...products];

    if (!options?.includeUnavailable) {
      result = result.filter((p) => p.isAvailable);
    }

    if (options?.categorySlug && options.categorySlug !== 'all') {
      result = result.filter((p) => p.categorySlug === options.categorySlug);
    }

    if (options?.searchQuery && options.searchQuery.trim().length > 0) {
      const q = options.searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => a.displayOrder - b.displayOrder);
  }
}

export const catalogRepository = new CatalogRepository();
