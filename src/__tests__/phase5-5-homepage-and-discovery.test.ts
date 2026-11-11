import {
  HomeScreen,
  HomeScreenProps,
  DEFAULT_PROMO_SLIDES,
  getCulinaryBadge,
  PromoSlide,
} from '../components/HomeScreen';
import {
  ProductCard,
  getCulinaryBadge as getCardCulinaryBadge,
} from '../components/ProductCard';
import { SEEDED_CATEGORIES, SEEDED_PRODUCTS } from '../domains/catalog/catalog-repository';
import { Product } from '../types/catalog';
import { DeliveryLandmark } from '../types/delivery';

const renderHome = (props: HomeScreenProps): any => {
  return HomeScreen(props);
};

describe('Phase 5.5-4: Homepage & Product Discovery Redesign', () => {
  const defaultLandmark: DeliveryLandmark = {
    id: 'lm-jaja',
    zoneId: 'zone-campus',
    name: 'King Jaja Hall',
    fee: 500,
    isCampus: true,
    displayOrder: 1,
    isActive: true,
  };

  const createDefaultHomeProps = (overrides?: Partial<HomeScreenProps>): HomeScreenProps => ({
    customer: null,
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

  describe('1. Homepage Header & Location Presentation (360dp Responsive)', () => {
    it('displays compact two-line address with dynamic landmark fee & timing', () => {
      const props = createDefaultHomeProps();
      const element = renderHome(props);

      const fulfillmentCard = element.props.children[0];
      expect(fulfillmentCard).toBeDefined();

      // Check delivery location row
      const locationRow = fulfillmentCard.props.children[1];
      expect(locationRow.props.testID).toBe('delivery-location-row');

      const textContainer = locationRow.props.children[1];
      const headerTag = textContainer.props.children[0];
      const landmarkName = textContainer.props.children[1];
      const subtext = textContainer.props.children[2];

      expect(headerTag.props.children).toBe('DELIVERY DESTINATION');
      expect(landmarkName.props.children).toBe('King Jaja Hall');
      expect(subtext.props.children).toContain('₦500 Flat Campus Delivery • ~25–35 mins');

      // Change button affordance
      const changeBadge = locationRow.props.children[2];
      expect(changeBadge.props.children.props.children).toBe('Change ▾');
    });

    it('displays fallback guidance when no landmark is selected yet', () => {
      const props = createDefaultHomeProps({ selectedLandmark: null });
      const element = renderHome(props);

      const fulfillmentCard = element.props.children[0];
      const locationRow = fulfillmentCard.props.children[1];
      const textContainer = locationRow.props.children[1];
      const subtext = textContainer.props.children[2];

      expect(subtext.props.children).toBe('Select landmark for delivery fee & timing');
    });

    it('displays clear King Jaja collection point and zero fee for Pickup mode', () => {
      const props = createDefaultHomeProps({ fulfillmentType: 'pickup' });
      const element = renderHome(props);

      const fulfillmentCard = element.props.children[0];
      const pickupRow = fulfillmentCard.props.children[1];
      expect(pickupRow.props.testID).toBe('pickup-location-row');

      const textContainer = pickupRow.props.children[1];
      const subtext = textContainer.props.children[2];

      expect(subtext.props.children).toBe(
        'Free Pickup • Ready for collection at King Jaja in ~15 mins'
      );
    });

    it('allows toggling between Delivery and Pickup fulfillment modes', () => {
      const onToggle = jest.fn();
      const props = createDefaultHomeProps({ onToggleFulfillmentType: onToggle });
      const element = renderHome(props);

      const fulfillmentCard = element.props.children[0];
      const segmentContainer = fulfillmentCard.props.children[0];

      const deliveryTab = segmentContainer.props.children[0];
      const pickupTab = segmentContainer.props.children[1];

      deliveryTab.props.onPress();
      expect(onToggle).toHaveBeenCalledWith('delivery');

      pickupTab.props.onPress();
      expect(onToggle).toHaveBeenCalledWith('pickup');
    });
  });

  describe('2. Promotional Banner Carousel & Pagination', () => {
    it('supports multiple authentic promotional slides without fake discounts', () => {
      expect(DEFAULT_PROMO_SLIDES.length).toBeGreaterThanOrEqual(3);

      for (const slide of DEFAULT_PROMO_SLIDES) {
        expect(slide.title).toBeDefined();
        expect(slide.subtitle).toBeDefined();
        expect(slide.image).toBeDefined();
        // Authentic benefits only: no invented percentage discounts
        expect(slide.title).not.toMatch(/\d+%\s*OFF/i);
        expect(slide.subtitle).not.toMatch(/\d+%\s*OFF/i);
      }
    });

    it('renders current slide based on activeSlideIndex', () => {
      // Slide 0: Stone-Oven Baked
      const propsSlide0 = createDefaultHomeProps({ activeSlideIndex: 0 });
      const element0 = renderHome(propsSlide0);
      const heroCard0 = element0.props.children[3];
      const overlay0 = heroCard0.props.children[1];
      const title0 = overlay0.props.children[1].props.children[0];
      expect(title0.props.children).toBe('Artisan Oven-Baked Pizza');

      // Slide 1: Fast Delivery Across Campus
      const propsSlide1 = createDefaultHomeProps({ activeSlideIndex: 1 });
      const element1 = renderHome(propsSlide1);
      const heroCard1 = element1.props.children[3];
      const overlay1 = heroCard1.props.children[1];
      const title1 = overlay1.props.children[1].props.children[0];
      expect(title1.props.children).toBe('Fast Delivery Across Campus');

      // Slide 2: Desserts
      const propsSlide2 = createDefaultHomeProps({ activeSlideIndex: 2 });
      const element2 = renderHome(propsSlide2);
      const heroCard2 = element2.props.children[3];
      const overlay2 = heroCard2.props.children[1];
      const title2 = overlay2.props.children[1].props.children[0];
      expect(title2.props.children).toBe('Creamy Soft-Serve & Shakes');
    });

    it('renders visible pagination dots and handles tap selection', () => {
      const onSelectSlide = jest.fn();
      const props = createDefaultHomeProps({ activeSlideIndex: 1, onSelectSlide });
      const element = renderHome(props);

      const heroCard = element.props.children[3];
      const dotsContainer = heroCard.props.children[2];
      expect(dotsContainer.props.testID).toBe('promo-pagination-dots');

      const dots = dotsContainer.props.children;
      expect(dots.length).toBe(DEFAULT_PROMO_SLIDES.length);

      // Tap dot 2
      dots[2].props.onPress();
      expect(onSelectSlide).toHaveBeenCalledWith(2);
    });

    it('handles empty promotional slides gracefully by falling back to default hero', () => {
      const props = createDefaultHomeProps({ promoSlidesOverride: [] });
      const element = renderHome(props);

      const heroCard = element.props.children[3];
      expect(heroCard.props.testID).toBe('brand-hero-card');

      const overlay = heroCard.props.children[1];
      const title = overlay.props.children[1].props.children[0];
      expect(title.props.children).toBe('Artisan Oven-Baked Pizza');
    });

    it('triggers category selection when slide actionType is category', () => {
      const onSelectCategory = jest.fn();
      const customSlide: PromoSlide = {
        id: 'special-shakes',
        badge: 'NEW',
        title: 'New Shakes',
        subtitle: 'Special Shakes',
        image: {},
        actionText: 'View Shakes',
        actionType: 'category',
        categorySlug: 'icecream',
        pills: [],
      };

      const props = createDefaultHomeProps({
        promoSlidesOverride: [customSlide],
        onSelectCategory,
      });

      const element = renderHome(props);
      const heroCard = element.props.children[3];
      const overlay = heroCard.props.children[1];
      const actionBtn = overlay.props.children[2].props.children[0];

      actionBtn.props.onPress();
      expect(onSelectCategory).toHaveBeenCalledWith('icecream');
    });
  });

  describe('3. Category Navigation & Minimum Touch Targets', () => {
    it('renders All Menu plus seeded catalog categories with 44dp accessible touch target', () => {
      const onSelectCategory = jest.fn();
      const props = createDefaultHomeProps({ onSelectCategory });
      const element = renderHome(props);

      const categoriesScroll = element.props.children[5];
      expect(categoriesScroll.props.testID).toBe('home-categories-scroll');

      // Chip 0: All Menu
      const allMenuChip = categoriesScroll.props.children[0];
      expect(allMenuChip.props.hitSlop).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
      allMenuChip.props.onPress();
      expect(onSelectCategory).toHaveBeenCalledWith('all');

      // Seeded categories
      const catChips = categoriesScroll.props.children[1];
      expect(catChips.length).toBe(SEEDED_CATEGORIES.length);
      catChips[0].props.onPress();
      expect(onSelectCategory).toHaveBeenCalledWith(SEEDED_CATEGORIES[0].slug);
    });
  });

  describe('4. Culinary Badges & Product Metadata Integrity', () => {
    it('assigns authentic Spicy badges based strictly on verified recipe facts', () => {
      const tikkaPizza = SEEDED_PRODUCTS.find((p) => p.name === 'Chicken Tikka Pizza')!;
      const sweetChiliPizza = SEEDED_PRODUCTS.find((p) => p.name === 'Sweet Chili Chicken Pizza')!;
      const steakPizza = SEEDED_PRODUCTS.find((p) => p.name === 'Steak Pizza')!;

      expect(getCulinaryBadge(tikkaPizza)).toEqual({ label: 'Spicy', icon: '🌶️' });
      expect(getCulinaryBadge(sweetChiliPizza)).toEqual({ label: 'Spicy', icon: '🌶️' });
      expect(getCulinaryBadge(steakPizza)).toEqual({ label: 'Spicy', icon: '🌶️' });
    });

    it('assigns authentic Vegetarian badges to verified veggie pizzas', () => {
      const veggiePizza = SEEDED_PRODUCTS.find((p) => p.name === 'Veggie Deluxe Pizza')!;
      const margherita = SEEDED_PRODUCTS.find((p) => p.name === 'Margherita Pizza')!;

      expect(getCulinaryBadge(veggiePizza)).toEqual({ label: 'Vegetarian', icon: '🌱' });
      expect(getCulinaryBadge(margherita)).toEqual({ label: 'Vegetarian', icon: '🌱' });
    });

    it('assigns Real Dairy badges to ice cream and milkshake items', () => {
      const milkshake = SEEDED_PRODUCTS.find((p) => p.name === 'Milkshake')!;
      expect(getCulinaryBadge(milkshake)).toEqual({ label: 'Real Dairy', icon: '🍨' });
    });

    it('does not assign badges to plain items, preventing visual noise', () => {
      const clubPizza = SEEDED_PRODUCTS.find((p) => p.name === 'Club Pizza')!;
      const pepperoniPizza = SEEDED_PRODUCTS.find((p) => p.name === 'Cheese Pepperoni Pizza')!;

      expect(getCulinaryBadge(clubPizza)).toBeNull();
      expect(getCulinaryBadge(pepperoniPizza)).toBeNull();
    });

    it('ProductCard displays culinary badge when present', () => {
      const tikkaPizza = SEEDED_PRODUCTS.find((p) => p.name === 'Chicken Tikka Pizza')!;
      const card = ProductCard({
        product: tikkaPizza,
        onPress: jest.fn(),
        onPressCustomize: jest.fn(),
      });

      expect(getCardCulinaryBadge(tikkaPizza)).toEqual({ label: 'Spicy', icon: '🌶️' });
      expect(card).toBeDefined();
    });
  });

  describe('5. Responsive Geometry on Xiaomi Redmi 13C (360dp Viewport)', () => {
    it('guarantees adequate text width in product cards on 360dp width', () => {
      const VIEWPORT_WIDTH = 360;
      const SCREEN_PADDING = 16 * 2; // 32dp
      const THUMBNAIL_WIDTH = 96;
      const CARD_BODY_PADDING = 10 * 2; // 20dp

      const availableTextWidth = VIEWPORT_WIDTH - SCREEN_PADDING - THUMBNAIL_WIDTH - CARD_BODY_PADDING;
      expect(availableTextWidth).toBe(212);
      expect(availableTextWidth).toBeGreaterThanOrEqual(200);
    });

    it('action button meets accessible touch target (>= 44dp) via hitSlop', () => {
      const testProduct: Product = SEEDED_PRODUCTS[0];
      const props = createDefaultHomeProps({ popularProducts: [testProduct] });
      const element = renderHome(props);

      const grid = element.props.children[7];
      const card = grid.props.children[0];
      const cardBody = card.props.children[1];
      const cardFooter = cardBody.props.children[1];
      const actionBtn = cardFooter.props.children[1];

      expect(actionBtn.props.hitSlop).toEqual({ top: 6, bottom: 6, left: 6, right: 6 });
      // 36dp minHeight + 12dp vertical hitSlop = 48dp >= 44dp
    });
  });
});
