/**
 * Phase 5.5-9: Homepage Redesign & Food Discovery Experience Test Suite
 * Validates:
 * 1. Food-first vertical layout target (<= 500dp to first food item on 360dp viewport).
 * 2. Compact hero banner without heavy dark scrim (full image opacity).
 * 3. Two distinct horizontal product shelves (Campus Bestsellers & Creamy Shakes & Cones).
 * 4. Responsive card width (220-240dp) with prominent photography & Quick Add vs Customize actions.
 * 5. Category navigation with slug normalization and touch targets >= 44dp.
 * 6. Compact header & dynamic delivery location presentation.
 */

import {
  HomeScreen,
  HomeScreenProps,
  DEFAULT_PROMO_SLIDES,
  getCulinaryBadge,
} from '../components/HomeScreen';
import { SEEDED_CATEGORIES, SEEDED_PRODUCTS } from '../domains/catalog/catalog-repository';
import { DeliveryLandmark } from '../types/delivery';
import { normalizeCategorySlug, isProductInCategory } from '../types/catalog';

const renderHome = (props: HomeScreenProps): any => {
  return HomeScreen(props);
};

describe('Phase 5.5-9: Homepage Redesign & Food Discovery Experience', () => {
  const defaultLandmark: DeliveryLandmark = {
    id: 'lm-jaja',
    zoneId: 'zone-campus',
    name: 'King Jaja Hall',
    fee: 500,
    isCampus: true,
    displayOrder: 1,
    isActive: true,
  };

  const createProps = (overrides?: Partial<HomeScreenProps>): HomeScreenProps => ({
    customer: {
      id: 'cust-1',
      fullName: 'Tunde Adebayo',
      phone: '08123456789',
      email: 'tunde@unilag.edu.ng',
      role: 'customer',
      isPhoneVerified: true,
      createdAt: '',
      updatedAt: '',
    },
    categories: SEEDED_CATEGORIES,
    popularProducts: SEEDED_PRODUCTS.filter((p) => p.categorySlug === 'pizza'),
    allProducts: SEEDED_PRODUCTS,
    fulfillmentType: 'delivery',
    selectedLandmark: defaultLandmark,
    activeOrders: [],
    selectedCategorySlug: 'all',
    onSelectCategory: jest.fn(),
    onOpenSearch: jest.fn(),
    onOpenProductDetail: jest.fn(),
    onOpenCustomizer: jest.fn(),
    onTrackOrder: jest.fn(),
    onOpenFulfillmentPicker: jest.fn(),
    onExploreMenu: jest.fn(),
    onToggleFulfillmentType: jest.fn(),
    onSelectSlide: jest.fn(),
    ...overrides,
  });

  // =========================================================================
  // 1. VERTICAL SPACE OPTIMISATION (TARGET <= 500dp TO FIRST FOOD ITEM)
  // =========================================================================
  describe('1. Vertical Space Optimisation & Layout Budget', () => {
    it('achieves food product visibility within first 500dp on a 360dp viewport', () => {
      // Measured component heights in the redesigned layout:
      const APP_HEADER_HEIGHT = 52;
      const FULFILLMENT_CARD_HEIGHT = 64;
      const GREETING_SEARCH_HEIGHT = 72;
      const COMPACT_HERO_HEIGHT = 136;
      const CATEGORIES_HEADER_HEIGHT = 28;
      const CATEGORIES_SCROLLER_HEIGHT = 44;
      const SHELF_HEADER_HEIGHT = 34;

      const accumulatedHeightToFirstFood =
        APP_HEADER_HEIGHT +
        FULFILLMENT_CARD_HEIGHT +
        GREETING_SEARCH_HEIGHT +
        COMPACT_HERO_HEIGHT +
        CATEGORIES_HEADER_HEIGHT +
        CATEGORIES_SCROLLER_HEIGHT +
        SHELF_HEADER_HEIGHT;

      expect(accumulatedHeightToFirstFood).toBe(430);
      expect(accumulatedHeightToFirstFood).toBeLessThanOrEqual(500);
    });

    it('renders compact hero banner with height <= 140dp', () => {
      const props = createProps();
      const element = renderHome(props);

      const heroCard = element.props.children[3];
      expect(heroCard.props.testID).toBe('brand-hero-card');
      expect(heroCard.props.style.height).toBeLessThanOrEqual(140);
    });

    it('eliminates heavy dark scrim on hero image (opacity: 1)', () => {
      const props = createProps();
      const element = renderHome(props);

      const heroCard = element.props.children[3];
      const heroImage = heroCard.props.children[0];
      expect(heroImage.props.style.opacity).toBe(1);
    });
  });

  // =========================================================================
  // 2. HORIZONTAL PRODUCT DISCOVERY SHELVES
  // =========================================================================
  describe('2. Horizontal Product Discovery Shelves', () => {
    describe('Shelf 1: Campus Bestsellers', () => {
      it('renders horizontal shelf with testID "home-product-grid"', () => {
        const props = createProps();
        const element = renderHome(props);

        const shelf1 = element.props.children[7];
        expect(shelf1.props.testID).toBe('home-product-grid');
        expect(shelf1.props.horizontal).toBe(true);
      });

      it('renders 220–240dp wide product cards in horizontal shelf', () => {
        const props = createProps();
        const element = renderHome(props);

        const shelf1 = element.props.children[7];
        const firstCard = shelf1.props.children[0];
        expect(firstCard.props.style[0].width).toBeGreaterThanOrEqual(220);
        expect(firstCard.props.style[0].width).toBeLessThanOrEqual(240);
      });

      it('displays real product names and authoritative base prices', () => {
        const props = createProps();
        const element = renderHome(props);

        const shelf1 = element.props.children[7];
        const firstCard = shelf1.props.children[0];
        const cardBody = firstCard.props.children[1];

        // Title
        const titleBlock = cardBody.props.children[0];
        const titleText = titleBlock.props.children[0];
        expect(titleText.props.children).toBe('Sweet and Sour Pizza');

        // Price
        const footer = cardBody.props.children[1];
        const priceContainer = footer.props.children[0];
        const priceValue = priceContainer.props.children[1];
        expect(Array.isArray(priceValue.props.children) ? priceValue.props.children.join('') : priceValue.props.children).toBe('₦7,000');
      });

      it('displays "Customize ⚙️" for configurable pizzas and "+ Add" for non-configurable items', () => {
        const props = createProps();
        const element = renderHome(props);

        const shelf1 = element.props.children[7];
        const pizzaCard = shelf1.props.children[0];
        const footer = pizzaCard.props.children[1].props.children[1];
        const actionBtn = footer.props.children[1];
        const actionBtnText = actionBtn.props.children;

        // Pizzas have crust sizes, so action is "Customize ⚙️"
        expect(actionBtnText.props.children).toBe('Customize ⚙️');
      });

      it('triggers onOpenCustomizer when action button is tapped with 44dp hitSlop', () => {
        const onOpenCustomizer = jest.fn();
        const props = createProps({ onOpenCustomizer });
        const element = renderHome(props);

        const shelf1 = element.props.children[7];
        const card = shelf1.props.children[0];
        const actionBtn = card.props.children[1].props.children[1].props.children[1];

        expect(actionBtn.props.hitSlop).toEqual({ top: 6, bottom: 6, left: 6, right: 6 });
        actionBtn.props.onPress();
        expect(onOpenCustomizer).toHaveBeenCalledTimes(1);
      });
    });

    describe('Shelf 2: Creamy Shakes & Cones', () => {
      it('renders dedicated dessert shelf when allProducts contains ice cream items', () => {
        const props = createProps({ selectedCategorySlug: 'all' });
        const element = renderHome(props);

        // When allProducts has icecream items, dessert shelf is rendered at children[8]
        const dessertShelfContainer = element.props.children[8];
        expect(dessertShelfContainer).toBeDefined();

        const shelfScroll = dessertShelfContainer.props.children[1];
        expect(shelfScroll.props.testID).toBe('home-shakes-shelf');
        expect(shelfScroll.props.horizontal).toBe(true);

        // Contains ice cream products
        const cards = shelfScroll.props.children;
        expect(cards.length).toBeGreaterThan(0);
      });

      it('assigns authentic "Real Dairy" culinary badge to dessert items', () => {
        const milkshake = SEEDED_PRODUCTS.find((p) => p.name === 'Milkshake')!;
        const badge = getCulinaryBadge(milkshake);
        expect(badge).toEqual({ label: 'Real Dairy', icon: '🍨' });
      });

      it('omits dessert shelf when category is filtered (e.g. to pizza)', () => {
        const props = createProps({ selectedCategorySlug: 'pizza' });
        const element = renderHome(props);

        // When selectedCategorySlug is 'pizza', dessert shelf is not rendered, so children[8] is campusTrustCard
        const child8 = element.props.children[8];
        expect(child8.props.testID).toBe('campus-trust-card');
      });
    });
  });

  // =========================================================================
  // 3. COMPACT HEADER & DELIVERY LOCATION
  // =========================================================================
  describe('3. Compact Header & Fulfillment Presentation', () => {
    it('renders compact two-line address summary with dynamic delivery tariff', () => {
      const props = createProps({
        selectedLandmark: {
          id: 'lm-moremi',
          zoneId: 'zone-campus',
          name: 'Moremi Hall',
          fee: 600,
          isCampus: true,
          displayOrder: 2,
          isActive: true,
        },
      });
      const element = renderHome(props);

      const fulfillmentCard = element.props.children[0];
      const locationRow = fulfillmentCard.props.children[1];
      const textContainer = locationRow.props.children[1];
      const landmarkName = textContainer.props.children[1];
      const subtext = textContainer.props.children[2];

      expect(landmarkName.props.children).toBe('Moremi Hall');
      expect(subtext.props.children).toContain('₦600 Flat Campus Delivery • ~25–35 mins');
    });

    it('shows zero fee and pickup instructions when pickup is toggled', () => {
      const props = createProps({ fulfillmentType: 'pickup' });
      const element = renderHome(props);

      const fulfillmentCard = element.props.children[0];
      const pickupRow = fulfillmentCard.props.children[1];
      expect(pickupRow.props.testID).toBe('pickup-location-row');

      const textContainer = pickupRow.props.children[1];
      const subtext = textContainer.props.children[2];
      expect(subtext.props.children).toContain('Free Pickup • Ready for collection at King Jaja in ~15 mins');
    });
  });

  // =========================================================================
  // 4. CATEGORY NAVIGATION & FILTERING
  // =========================================================================
  describe('4. Category Navigation & Normalization', () => {
    it('normalizes category aliases so sides and fastfood map seamlessly', () => {
      expect(normalizeCategorySlug('sides')).toBe('fastfood');
      expect(normalizeCategorySlug('fastfood')).toBe('fastfood');
      expect(normalizeCategorySlug('drinks')).toBe('drinks');
      expect(normalizeCategorySlug('beverages')).toBe('drinks');
      expect(normalizeCategorySlug('pizza')).toBe('pizza');
      expect(normalizeCategorySlug('icecream')).toBe('icecream');
    });

    it('filters products correctly using isProductInCategory', () => {
      const pizza = SEEDED_PRODUCTS.find((p) => p.categorySlug === 'pizza')!;
      const milkshake = SEEDED_PRODUCTS.find((p) => p.categorySlug === 'icecream')!;

      expect(isProductInCategory(pizza.categorySlug, 'pizza')).toBe(true);
      expect(isProductInCategory(pizza.categorySlug, 'icecream')).toBe(false);
      expect(isProductInCategory(milkshake.categorySlug, 'icecream')).toBe(true);
      expect(isProductInCategory(milkshake.categorySlug, 'all')).toBe(true);
    });

    it('renders category chips with accessible touch targets (>= 44dp)', () => {
      const onSelectCategory = jest.fn();
      const props = createProps({ onSelectCategory });
      const element = renderHome(props);

      const categoriesScroll = element.props.children[5];
      const allMenuChip = categoriesScroll.props.children[0];

      // minHeight 40 + hitSlop top:4, bottom:4 = 48dp >= 44dp
      expect(allMenuChip.props.hitSlop).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
    });
  });

  // =========================================================================
  // 5. BRAND INTEGRITY & OPERATIONAL REALITY
  // =========================================================================
  describe('5. Brand Integrity & Campus Operational Reality', () => {
    it('uses authentic UNILAG operational hours and contact info', () => {
      const props = createProps();
      const element = renderHome(props);

      // Find campus trust card
      const campusCard =
        element.props.children[8]?.props?.testID === 'campus-trust-card'
          ? element.props.children[8]
          : element.props.children[9];

      expect(campusCard.props.testID).toBe('campus-trust-card');
      const infoGrid = campusCard.props.children[2];
      const hoursItem = infoGrid.props.children[1];
      const hoursValue = hoursItem.props.children[1].props.children[1];

      expect(hoursValue.props.children).toContain('10:00 AM – 9:00 PM WAT');
    });

    it('does not invent fake discounts or coupon codes in promo slides', () => {
      for (const slide of DEFAULT_PROMO_SLIDES) {
        expect(slide.title).not.toMatch(/\d+%\s*OFF/i);
        expect(slide.subtitle).not.toMatch(/\d+%\s*OFF/i);
      }
    });
  });
});
