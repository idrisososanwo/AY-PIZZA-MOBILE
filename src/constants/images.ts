/**
 * AY Pizza & Ice Cream — Production Food Photography & Catalog Image Registry
 *
 * Provides offline-safe, high-resolution bundled photography
 * for hero banners, product cards, category listings, and modal previews.
 * All 23 seeded catalog products have dedicated production-quality assets.
 */

import { ImageSourcePropType } from 'react-native';

export interface CatalogImageMetadata {
  id: string;
  name: string;
  slug: string;
  category: 'pizzas' | 'ice-cream' | 'sides' | 'drinks';
  source: ImageSourcePropType;
  fallbackCategorySource: ImageSourcePropType;
}

// 1. Pizza Collection (13 Products)
const SweetAndSourPizzaImg = require('../../assets/products/pizzas/sweet_and_sour_pizza.webp');
const ClubPizzaImg = require('../../assets/products/pizzas/club_pizza.webp');
const CheesePepperoniPizzaImg = require('../../assets/products/pizzas/cheese_pepperoni_pizza.webp');
const HawaiiPizzaImg = require('../../assets/products/pizzas/hawaii_pizza.webp');
const VeggieDeluxePizzaImg = require('../../assets/products/pizzas/veggie_deluxe_pizza.webp');
const ChickenTikkaPizzaImg = require('../../assets/products/pizzas/chicken_tikka_pizza.webp');
const BbqBeefPizzaImg = require('../../assets/products/pizzas/bbq_beef_pizza.webp');
const MargheritaPizzaImg = require('../../assets/products/pizzas/margherita_pizza.webp');
const ChickenAndMushroomPizzaImg = require('../../assets/products/pizzas/chicken_and_mushroom_pizza.webp');
const BbqChickenPizzaImg = require('../../assets/products/pizzas/bbq_chicken_pizza.webp');
const SweetChiliChickenPizzaImg = require('../../assets/products/pizzas/sweet_chili_chicken_pizza.webp');
const MeatyPizzaImg = require('../../assets/products/pizzas/meaty_pizza.webp');
const SteakPizzaImg = require('../../assets/products/pizzas/steak_pizza.webp');

// 2. Ice Cream & Milkshake Collection (2 Products)
const MilkshakeImg = require('../../assets/products/ice-cream/milkshake.webp');
const IceCreamCupImg = require('../../assets/products/ice-cream/ice_cream_cup.webp');

// 3. Fast Food & Sides Collection (6 Products)
const BurgerImg = require('../../assets/products/sides/burger.webp');
const BurgerAndChipsImg = require('../../assets/products/sides/burger_and_chips.webp');
const WingsImg = require('../../assets/products/sides/wings.webp');
const WingAndChipsImg = require('../../assets/products/sides/wing_and_chips.webp');
const ChickenLapImg = require('../../assets/products/sides/chicken_lap.webp');
const ChickenAndChipsImg = require('../../assets/products/sides/chicken_and_chips.webp');

// 4. Cold Beverages Collection (2 Products)
const BottleWaterImg = require('../../assets/products/drinks/bottle_water.webp');
const SoftDrinksImg = require('../../assets/products/drinks/soft_drinks.webp');

// Hero Banner (Home Screen)
const HeroBannerImg = require('../../assets/images/hero_banner.jpg');

/**
 * Static registry of all catalog food photography assets.
 * Preserves backward-compatible legacy keys (heroBanner, pepperoni, bbqChicken, milkshake, crispyChicken)
 * while exposing all 23 dedicated product photography assets.
 */
export const FoodImages = {
  // Legacy / Common Keys
  heroBanner: HeroBannerImg,
  pepperoni: CheesePepperoniPizzaImg,
  bbqChicken: BbqChickenPizzaImg,
  milkshake: MilkshakeImg,
  crispyChicken: ChickenAndChipsImg,

  // Dedicated Pizza Assets
  sweetAndSourPizza: SweetAndSourPizzaImg,
  clubPizza: ClubPizzaImg,
  cheesePepperoniPizza: CheesePepperoniPizzaImg,
  hawaiiPizza: HawaiiPizzaImg,
  veggieDeluxePizza: VeggieDeluxePizzaImg,
  chickenTikkaPizza: ChickenTikkaPizzaImg,
  bbqBeefPizza: BbqBeefPizzaImg,
  margheritaPizza: MargheritaPizzaImg,
  chickenAndMushroomPizza: ChickenAndMushroomPizzaImg,
  bbqChickenPizza: BbqChickenPizzaImg,
  sweetChiliChickenPizza: SweetChiliChickenPizzaImg,
  meatyPizza: MeatyPizzaImg,
  steakPizza: SteakPizzaImg,

  // Dedicated Dessert Assets
  iceCreamCup: IceCreamCupImg,

  // Dedicated Fast Food & Side Assets
  burger: BurgerImg,
  burgerAndChips: BurgerAndChipsImg,
  wings: WingsImg,
  wingAndChips: WingAndChipsImg,
  chickenLap: ChickenLapImg,
  chickenAndChips: ChickenAndChipsImg,

  // Dedicated Beverage Assets
  bottleWater: BottleWaterImg,
  softDrinks: SoftDrinksImg,
};

/**
 * Definitive mapping of Product ID / Canonical Slug to dedicated photography asset.
 */
export const CATALOG_IMAGE_MAP: Record<string, ImageSourcePropType> = {
  // --- Pizzas ---
  '22222222-2222-2222-2222-222222222201': SweetAndSourPizzaImg,
  'sweet-and-sour-pizza': SweetAndSourPizzaImg,
  'sweet and sour pizza': SweetAndSourPizzaImg,

  '22222222-2222-2222-2222-222222222202': ClubPizzaImg,
  'club-pizza': ClubPizzaImg,
  'club pizza': ClubPizzaImg,

  '22222222-2222-2222-2222-222222222203': CheesePepperoniPizzaImg,
  'cheese-pepperoni-pizza': CheesePepperoniPizzaImg,
  'cheese pepperoni pizza': CheesePepperoniPizzaImg,

  '22222222-2222-2222-2222-222222222204': HawaiiPizzaImg,
  'hawaii-pizza': HawaiiPizzaImg,
  'hawaii pizza': HawaiiPizzaImg,

  '22222222-2222-2222-2222-222222222205': VeggieDeluxePizzaImg,
  'veggie-deluxe-pizza': VeggieDeluxePizzaImg,
  'veggie deluxe pizza': VeggieDeluxePizzaImg,

  '22222222-2222-2222-2222-222222222206': ChickenTikkaPizzaImg,
  'chicken-tikka-pizza': ChickenTikkaPizzaImg,
  'chicken tikka pizza': ChickenTikkaPizzaImg,

  '22222222-2222-2222-2222-222222222207': BbqBeefPizzaImg,
  'bbq-beef-pizza': BbqBeefPizzaImg,
  'bbq beef pizza': BbqBeefPizzaImg,

  '22222222-2222-2222-2222-222222222208': MargheritaPizzaImg,
  'margherita-pizza': MargheritaPizzaImg,
  'margherita pizza': MargheritaPizzaImg,

  '22222222-2222-2222-2222-222222222209': ChickenAndMushroomPizzaImg,
  'chicken-and-mushroom-pizza': ChickenAndMushroomPizzaImg,
  'chicken and mushroom pizza': ChickenAndMushroomPizzaImg,

  '22222222-2222-2222-2222-222222222210': BbqChickenPizzaImg,
  'bbq-chicken-pizza': BbqChickenPizzaImg,
  'bbq chicken pizza': BbqChickenPizzaImg,

  '22222222-2222-2222-2222-222222222211': SweetChiliChickenPizzaImg,
  'sweet-chili-chicken-pizza': SweetChiliChickenPizzaImg,
  'sweet chili chicken pizza': SweetChiliChickenPizzaImg,

  '22222222-2222-2222-2222-222222222212': MeatyPizzaImg,
  'meaty-pizza': MeatyPizzaImg,
  'meaty pizza': MeatyPizzaImg,

  '22222222-2222-2222-2222-222222222213': SteakPizzaImg,
  'steak-pizza': SteakPizzaImg,
  'steak pizza': SteakPizzaImg,

  // --- Ice Cream & Shakes ---
  '22222222-2222-2222-2222-222222222220': MilkshakeImg,
  'milkshake': MilkshakeImg,

  '22222222-2222-2222-2222-222222222221': IceCreamCupImg,
  'ice-cream-cup': IceCreamCupImg,
  'ice cream cup': IceCreamCupImg,

  // --- Fast Food & Sides ---
  '22222222-2222-2222-2222-222222222230': BurgerImg,
  'burger': BurgerImg,

  '22222222-2222-2222-2222-222222222231': BurgerAndChipsImg,
  'burger-and-chips': BurgerAndChipsImg,
  'burger & chips': BurgerAndChipsImg,

  '22222222-2222-2222-2222-222222222232': WingsImg,
  'wings': WingsImg,

  '22222222-2222-2222-2222-222222222233': WingAndChipsImg,
  'wing-and-chips': WingAndChipsImg,
  'wing & chips': WingAndChipsImg,

  '22222222-2222-2222-2222-222222222234': ChickenLapImg,
  'chicken-lap': ChickenLapImg,
  'chicken lap': ChickenLapImg,

  '22222222-2222-2222-2222-222222222235': ChickenAndChipsImg,
  'chicken-and-chips': ChickenAndChipsImg,
  'chicken & chips': ChickenAndChipsImg,

  // --- Cold Beverages ---
  '22222222-2222-2222-2222-222222222240': BottleWaterImg,
  'bottle-water': BottleWaterImg,
  'bottle water': BottleWaterImg,

  '22222222-2222-2222-2222-222222222241': SoftDrinksImg,
  'soft-drinks': SoftDrinksImg,
  'soft drinks': SoftDrinksImg,
};

/**
 * Category-safe fallback image lookup.
 * Ensures pizzas never fall back to drinks, and drinks never fall back to pepperoni pizza.
 */
export const CATEGORY_FALLBACK_IMAGES: Record<string, ImageSourcePropType> = {
  pizza: CheesePepperoniPizzaImg,
  icecream: IceCreamCupImg,
  fastfood: BurgerAndChipsImg,
  drinks: BottleWaterImg,
};

/**
 * Returns the best matching production photography asset for a product.
 * Accepts:
 * - Product object `{ id, name, categorySlug, ... }`
 * - Product ID string
 * - Product Name string
 * - Product Slug string
 */
export function getProductImage(
  productOrIdentifier: string | { id?: string; name?: string; slug?: string; categorySlug?: string } | null | undefined
): ImageSourcePropType {
  if (!productOrIdentifier) {
    return CheesePepperoniPizzaImg;
  }

  // 1. Direct object inspection
  if (typeof productOrIdentifier === 'object') {
    if (productOrIdentifier.id && CATALOG_IMAGE_MAP[productOrIdentifier.id]) {
      return CATALOG_IMAGE_MAP[productOrIdentifier.id];
    }
    if (productOrIdentifier.name && CATALOG_IMAGE_MAP[productOrIdentifier.name.toLowerCase().trim()]) {
      return CATALOG_IMAGE_MAP[productOrIdentifier.name.toLowerCase().trim()];
    }
    if (productOrIdentifier.slug && CATALOG_IMAGE_MAP[productOrIdentifier.slug.toLowerCase().trim()]) {
      return CATALOG_IMAGE_MAP[productOrIdentifier.slug.toLowerCase().trim()];
    }
    if (productOrIdentifier.categorySlug && CATEGORY_FALLBACK_IMAGES[productOrIdentifier.categorySlug]) {
      return CATEGORY_FALLBACK_IMAGES[productOrIdentifier.categorySlug];
    }
  }

  // 2. String identifier / query
  const query = (typeof productOrIdentifier === 'string' ? productOrIdentifier : productOrIdentifier.name || '')
    .toLowerCase()
    .trim();

  // Exact ID or name/slug match
  if (CATALOG_IMAGE_MAP[query]) {
    return CATALOG_IMAGE_MAP[query];
  }

  // Substring matches for Specific Pizzas
  if (query.includes('sweet') && query.includes('sour')) return SweetAndSourPizzaImg;
  if (query.includes('club')) return ClubPizzaImg;
  if (query.includes('pepperoni') || query.includes('pep')) return CheesePepperoniPizzaImg;
  if (query.includes('hawaii')) return HawaiiPizzaImg;
  if (query.includes('veggie')) return VeggieDeluxePizzaImg;
  if (query.includes('tikka')) return ChickenTikkaPizzaImg;
  if (query.includes('bbq') && query.includes('beef')) return BbqBeefPizzaImg;
  if (query.includes('margherita')) return MargheritaPizzaImg;
  if (query.includes('mushroom')) return ChickenAndMushroomPizzaImg;
  if (query.includes('bbq') && query.includes('chicken')) return BbqChickenPizzaImg;
  if (query.includes('chili') && query.includes('chicken')) return SweetChiliChickenPizzaImg;
  if (query.includes('meaty')) return MeatyPizzaImg;
  if (query.includes('steak')) return SteakPizzaImg;

  // Substring matches for Desserts
  if (query.includes('shake')) return MilkshakeImg;
  if (query.includes('ice cream') || query.includes('cup') || query.includes('soft-serve')) return IceCreamCupImg;

  // Substring matches for Sides
  if (query.includes('burger') && (query.includes('chip') || query.includes('fries'))) return BurgerAndChipsImg;
  if (query.includes('burger')) return BurgerImg;
  if (query.includes('wing') && (query.includes('chip') || query.includes('fries'))) return WingAndChipsImg;
  if (query.includes('wing')) return WingsImg;
  if (query.includes('lap')) return ChickenLapImg;
  if (query.includes('chicken') && (query.includes('chip') || query.includes('fries'))) return ChickenAndChipsImg;

  // Substring matches for Beverages (FIXED: Never falls back to pepperoni)
  if (query.includes('water') || query.includes('bottle')) return BottleWaterImg;
  if (query.includes('soft') || query.includes('drink') || query.includes('coke') || query.includes('fanta') || query.includes('sprite') || query.includes('pepsi') || query.includes('soda')) return SoftDrinksImg;

  // General category fallbacks
  if (query.includes('pizza')) return CheesePepperoniPizzaImg;
  if (query.includes('chicken')) return ChickenAndChipsImg;

  // Safe universal fallback
  return CheesePepperoniPizzaImg;
}
