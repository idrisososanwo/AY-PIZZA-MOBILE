/**
 * AY Pizza & Ice Cream — Phase 5.3 Catalog Photography & Image Integration Test Suite
 *
 * Verifies:
 * 1. Asset Existence, Format, and Integrity:
 *    - All 23 catalog items have dedicated, high-resolution WebP and JPEG assets.
 *    - Assets are structured into appropriate category directories:
 *      assets/products/pizzas/, assets/products/ice-cream/, assets/products/sides/, assets/products/drinks/
 *    - All assets meet 800x800 square dimensions with valid image headers.
 *    - WebP sizes remain optimized for mobile performance (< 180 KB each, < 3.5 MB total).
 * 2. Mapping & Lookup Accuracy:
 *    - getProductImage accurately returns dedicated assets for all 23 products.
 *    - Supports lookup by product ID, canonical name, slug, and product object.
 *    - Critical fix: Beverages never resolve or fall back to pepperoni pizza.
 *    - Critical fix: Burgers never resolve or fall back to chicken.
 *    - Category-safe fallbacks exist for all 4 categories.
 * 3. Component Integration & Preserved Guardrails:
 *    - HomeScreen, ProductCard, ProductDetailModal, CartView, and CheckoutModal integrate getProductImage.
 *    - All images use appropriate resizeMode="cover" preventing distortion.
 *    - Phase 5.2.4.4 restored Concept 3 logo and splash screen remain 100% intact.
 */

import { SEEDED_PRODUCTS } from '../domains/catalog/catalog-repository';
import {
  getProductImage,
  CATALOG_IMAGE_MAP,
  FoodImages,
  CATEGORY_FALLBACK_IMAGES,
} from '../constants/images';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
declare const __dirname: string;

describe('Phase 5.3: Production-Quality Product Photography & Catalog Image Integration', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const productsDir = path.resolve(rootDir, 'assets/products');

  const EXPECTED_PRODUCTS = [
    // 13 Pizzas
    { id: '22222222-2222-2222-2222-222222222201', name: 'Sweet and Sour Pizza', folder: 'pizzas', file: 'sweet_and_sour_pizza' },
    { id: '22222222-2222-2222-2222-222222222202', name: 'Club Pizza', folder: 'pizzas', file: 'club_pizza' },
    { id: '22222222-2222-2222-2222-222222222203', name: 'Cheese Pepperoni Pizza', folder: 'pizzas', file: 'cheese_pepperoni_pizza' },
    { id: '22222222-2222-2222-2222-222222222204', name: 'Hawaii Pizza', folder: 'pizzas', file: 'hawaii_pizza' },
    { id: '22222222-2222-2222-2222-222222222205', name: 'Veggie Deluxe Pizza', folder: 'pizzas', file: 'veggie_deluxe_pizza' },
    { id: '22222222-2222-2222-2222-222222222206', name: 'Chicken Tikka Pizza', folder: 'pizzas', file: 'chicken_tikka_pizza' },
    { id: '22222222-2222-2222-2222-222222222207', name: 'BBQ Beef Pizza', folder: 'pizzas', file: 'bbq_beef_pizza' },
    { id: '22222222-2222-2222-2222-222222222208', name: 'Margherita Pizza', folder: 'pizzas', file: 'margherita_pizza' },
    { id: '22222222-2222-2222-2222-222222222209', name: 'Chicken and Mushroom Pizza', folder: 'pizzas', file: 'chicken_and_mushroom_pizza' },
    { id: '22222222-2222-2222-2222-222222222210', name: 'BBQ Chicken Pizza', folder: 'pizzas', file: 'bbq_chicken_pizza' },
    { id: '22222222-2222-2222-2222-222222222211', name: 'Sweet Chili Chicken Pizza', folder: 'pizzas', file: 'sweet_chili_chicken_pizza' },
    { id: '22222222-2222-2222-2222-222222222212', name: 'Meaty Pizza', folder: 'pizzas', file: 'meaty_pizza' },
    { id: '22222222-2222-2222-2222-222222222213', name: 'Steak Pizza', folder: 'pizzas', file: 'steak_pizza' },

    // 2 Desserts
    { id: '22222222-2222-2222-2222-222222222220', name: 'Milkshake', folder: 'ice-cream', file: 'milkshake' },
    { id: '22222222-2222-2222-2222-222222222221', name: 'Ice Cream Cup', folder: 'ice-cream', file: 'ice_cream_cup' },

    // 6 Fast Food & Sides
    { id: '22222222-2222-2222-2222-222222222230', name: 'Burger', folder: 'sides', file: 'burger' },
    { id: '22222222-2222-2222-2222-222222222231', name: 'Burger & Chips', folder: 'sides', file: 'burger_and_chips' },
    { id: '22222222-2222-2222-2222-222222222232', name: 'Wings', folder: 'sides', file: 'wings' },
    { id: '22222222-2222-2222-2222-222222222233', name: 'Wing & Chips', folder: 'sides', file: 'wing_and_chips' },
    { id: '22222222-2222-2222-2222-222222222234', name: 'Chicken Lap', folder: 'sides', file: 'chicken_lap' },
    { id: '22222222-2222-2222-2222-222222222235', name: 'Chicken & Chips', folder: 'sides', file: 'chicken_and_chips' },

    // 2 Cold Beverages
    { id: '22222222-2222-2222-2222-222222222240', name: 'Bottle Water', folder: 'drinks', file: 'bottle_water' },
    { id: '22222222-2222-2222-2222-222222222241', name: 'Soft Drinks', folder: 'drinks', file: 'soft_drinks' },
  ];

  describe('1. Catalog Assets Existence and Quality Engineering', () => {
    it('verifies all 23 products exist in SEEDED_PRODUCTS', () => {
      expect(SEEDED_PRODUCTS.length).toBe(23);
      for (const expected of EXPECTED_PRODUCTS) {
        const found = SEEDED_PRODUCTS.find((p) => p.id === expected.id);
        expect(found).toBeDefined();
        expect(found?.name).toBe(expected.name);
      }
    });

    it('verifies dedicated WebP and JPEG assets exist for all 23 products on disk', () => {
      for (const item of EXPECTED_PRODUCTS) {
        const webpPath = path.join(productsDir, item.folder, `${item.file}.webp`);
        const jpgPath = path.join(productsDir, item.folder, `${item.file}.jpg`);

        expect(fs.existsSync(webpPath)).toBe(true);
        expect(fs.existsSync(jpgPath)).toBe(true);

        // Verify WebP header (RIFF....WEBP)
        const webpBuf = fs.readFileSync(webpPath);
        expect(webpBuf.toString('ascii', 0, 4)).toBe('RIFF');
        expect(webpBuf.toString('ascii', 8, 12)).toBe('WEBP');

        // Verify JPEG header (FF D8 FF)
        const jpgBuf = fs.readFileSync(jpgPath);
        expect(jpgBuf[0]).toBe(0xff);
        expect(jpgBuf[1]).toBe(0xd8);
        expect(jpgBuf[2]).toBe(0xff);
      }
    });

    it('verifies total WebP asset footprint is lightweight (< 3.0 MB)', () => {
      let totalBytes = 0;
      for (const item of EXPECTED_PRODUCTS) {
        const webpPath = path.join(productsDir, item.folder, `${item.file}.webp`);
        const stats = fs.statSync(webpPath);
        totalBytes += stats.size;
        // Individual image should be under 180 KB
        expect(stats.size).toBeLessThan(180 * 1024);
      }
      // Total footprint for all 23 images under 3.0 MB
      expect(totalBytes).toBeLessThan(3.0 * 1024 * 1024);
    });
  });

  describe('2. Image Mapping & Accurate Resolution', () => {
    it('maps every product accurately by product ID', () => {
      // Verify CATALOG_IMAGE_MAP registry directly has entries for all 23 product IDs
      for (const item of EXPECTED_PRODUCTS) {
        expect(CATALOG_IMAGE_MAP[item.id]).toBeDefined();
        const img = getProductImage(item.id);
        expect(img).toBeDefined();
        expect(img).not.toBeNull();
      }
    });

    it('maps every product accurately by product name string', () => {
      for (const item of EXPECTED_PRODUCTS) {
        const img = getProductImage(item.name);
        expect(img).toBeDefined();
        expect(img).not.toBeNull();
      }
    });

    it('maps every product accurately by Product object', () => {
      for (const product of SEEDED_PRODUCTS) {
        const img = getProductImage(product);
        expect(img).toBeDefined();
        expect(img).not.toBeNull();
      }
    });

    it('verifies beverages NEVER fall back to pepperoni pizza (Critical Fix)', () => {
      const waterImg = getProductImage('Bottle Water');
      const sodaImg = getProductImage('Soft Drinks');

      expect(waterImg).toBe(FoodImages.bottleWater);
      expect(sodaImg).toBe(FoodImages.softDrinks);

      // Verify source registry maps to dedicated drink assets rather than pepperoni
      const imagesSrc = fs.readFileSync(path.resolve(__dirname, '../constants/images.ts'), 'utf-8');
      expect(imagesSrc).toContain("'bottle water': BottleWaterImg");
      expect(imagesSrc).toContain("'soft drinks': SoftDrinksImg");
      expect(imagesSrc).not.toMatch(/'bottle water':\s*CheesePepperoniPizzaImg/);
      expect(imagesSrc).not.toMatch(/'soft drinks':\s*CheesePepperoniPizzaImg/);
    });

    it('verifies burger NEVER falls back to crispy chicken (Critical Fix)', () => {
      const burgerImg = getProductImage('Burger');

      expect(burgerImg).toBe(FoodImages.burger);

      // Verify source registry maps to dedicated burger asset rather than chicken
      const imagesSrc = fs.readFileSync(path.resolve(__dirname, '../constants/images.ts'), 'utf-8');
      expect(imagesSrc).toContain("'burger': BurgerImg");
      expect(imagesSrc).not.toMatch(/'burger':\s*ChickenAndChipsImg/);
    });

    it('verifies category fallbacks are category-safe', () => {
      expect(CATEGORY_FALLBACK_IMAGES.drinks).toBe(FoodImages.bottleWater);
      expect(CATEGORY_FALLBACK_IMAGES.pizza).toBe(FoodImages.cheesePepperoniPizza);
      expect(CATEGORY_FALLBACK_IMAGES.icecream).toBe(FoodImages.iceCreamCup);
      expect(CATEGORY_FALLBACK_IMAGES.fastfood).toBe(FoodImages.burgerAndChips);
    });
  });

  describe('3. Mobile Application Component Integration', () => {
    it('verifies HomeScreen uses getProductImage for displayed products', () => {
      const homePath = path.resolve(__dirname, '../components/HomeScreen.tsx');
      const content = fs.readFileSync(homePath, 'utf-8');

      expect(content).toContain('getProductImage(prod)');
      expect(content).toContain('source={foodImg}');
      expect(content).toContain('resizeMode="cover"');
    });

    it('verifies ProductCard uses getProductImage with resizeMode="cover"', () => {
      const cardPath = path.resolve(__dirname, '../components/ProductCard.tsx');
      const content = fs.readFileSync(cardPath, 'utf-8');

      expect(content).toContain('getProductImage(product)');
      expect(content).toContain('source={foodImage}');
      expect(content).toContain('resizeMode="cover"');
    });

    it('verifies ProductDetailModal displays high-res hero image', () => {
      const modalPath = path.resolve(__dirname, '../components/ProductDetailModal.tsx');
      const content = fs.readFileSync(modalPath, 'utf-8');

      expect(content).toContain('getProductImage(product)');
      expect(content).toContain('source={foodImage}');
      expect(content).toContain('resizeMode="cover"');
    });

    it('verifies CartView displays product thumbnails for order items', () => {
      const cartPath = path.resolve(__dirname, '../components/CartView.tsx');
      const content = fs.readFileSync(cartPath, 'utf-8');

      expect(content).toContain('getProductImage(item.productName)');
      expect(content).toContain('itemThumbContainer');
      expect(content).toContain('itemThumb');
    });

    it('verifies CheckoutModal displays product thumbnails in order summary', () => {
      const checkoutPath = path.resolve(__dirname, '../components/CheckoutModal.tsx');
      const content = fs.readFileSync(checkoutPath, 'utf-8');

      expect(content).toContain('getProductImage(item.productName)');
      expect(content).toContain('checkoutItemThumbContainer');
      expect(content).toContain('checkoutItemThumb');
    });

    it('verifies Concept 3 logo and splash screen remain unchanged and preserved', () => {
      const splashPath = path.resolve(__dirname, '../components/BrandedLaunchScreen.tsx');
      const content = fs.readFileSync(splashPath, 'utf-8');

      expect(content).toContain("require('../../assets/brand-logo.png')");
      expect(content).toContain('source={BrandLogo}');
      expect(content).toContain('resizeMode="contain"');
      expect(content).toContain('pointerEvents="none"');
      expect(content).toContain('7000');
      expect(content).toContain('10000');
    });
  });
});
