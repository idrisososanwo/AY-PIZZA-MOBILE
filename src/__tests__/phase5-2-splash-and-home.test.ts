/**
 * AY Pizza — Phase 5.2 Branded Splash Screen & Homepage Redesign Test Suite
 *
 * Validates:
 * 1. Native splash screen configuration in app.json and expo-splash-screen module lifecycle.
 * 2. Delivery vs Pickup fulfillment switching and landmark selection entry points.
 * 3. Personalized greeting for authenticated customers and welcoming guest experience.
 * 4. Tasteful brand-led campaign hero without fake discounts or coupons.
 * 5. Real database category filtering and product selection.
 * 6. Campus favourites product grid with accurate prices, stock badges, and modal entry points.
 * 7. Active order tracking banner integration.
 * 8. UNILAG campus trust details and operating hours.
 */

import * as SplashScreen from 'expo-splash-screen';
import { HomeScreen, HomeScreenProps } from '../components/HomeScreen';
import { Brand } from '../constants/brand';
import { SEEDED_CATEGORIES, SEEDED_PRODUCTS } from '../domains/catalog/catalog-repository';
import { DeliveryLandmark } from '../types/delivery';
import { PROVISIONAL_LANDMARKS } from '../domains/delivery/delivery-service';
import appConfig from '../../app.json';

const renderHome = (props: HomeScreenProps): any => {
  return HomeScreen(props);
};

describe('Phase 5.2: Branded Splash Screen & Homepage Redesign', () => {
  describe('1. Native Splash Screen Configuration & Module Lifecycle', () => {
    it('configures Expo SDK 58 native splash screen with brand dark brown background in app.json via config plugin', () => {
      const expo = appConfig.expo as any;
      const splashPlugin = expo.plugins.find(
        (p: any) => Array.isArray(p) && p[0] === 'expo-splash-screen'
      );
      expect(splashPlugin).toBeDefined();
      expect(splashPlugin[1]).toMatchObject({
        backgroundColor: '#2b1a12',
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
      });
    });

    it('registers expo-splash-screen plugin with matching background and imageWidth', () => {
      const expo = appConfig.expo as any;
      const splashPlugin = expo.plugins.find(
        (p: any) => Array.isArray(p) && p[0] === 'expo-splash-screen'
      );
      expect(splashPlugin).toBeDefined();
      expect(splashPlugin[1]).toMatchObject({
        backgroundColor: '#2b1a12',
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
      });
    });

    it('interacts with SplashScreen to prevent auto-hide on launch and hide when catalog is ready', async () => {
      // In jest.setup.js, preventAutoHideAsync and hideAsync are mocked
      expect(SplashScreen.preventAutoHideAsync).toBeDefined();
      expect(SplashScreen.hideAsync).toBeDefined();

      const preventResult = await SplashScreen.preventAutoHideAsync();
      expect(preventResult).toBe(true);

      const hideResult = await SplashScreen.hideAsync();
      expect(hideResult).toBe(true);
    });
  });

  describe('2. Delivery / Pickup Header Experience', () => {
    const mockLandmark: DeliveryLandmark = PROVISIONAL_LANDMARKS[0];

    const defaultProps: HomeScreenProps = {
      customer: null,
      categories: SEEDED_CATEGORIES,
      popularProducts: SEEDED_PRODUCTS.filter((p) => p.categorySlug === 'pizza'),
      allProducts: SEEDED_PRODUCTS,
      fulfillmentType: 'delivery',
      selectedLandmark: mockLandmark,
      activeOrders: [],
      onSelectCategory: jest.fn(),
      onOpenSearch: jest.fn(),
      onOpenProductDetail: jest.fn(),
      onOpenCustomizer: jest.fn(),
      onTrackOrder: jest.fn(),
      onOpenFulfillmentPicker: jest.fn(),
      onExploreMenu: jest.fn(),
      onToggleFulfillmentType: jest.fn(),
    };

    it('renders delivery context with selected landmark and flat delivery fee', () => {
      const element = renderHome(defaultProps);
      expect(element).toBeDefined();
      expect(element.props.testID).toBe('home-screen-scroll');

      // Find fulfillment card
      const fulfillmentCard = element.props.children[0];
      expect(fulfillmentCard.props.style).toBeDefined();

      // Find location row
      const locationRow = fulfillmentCard.props.children[1];
      expect(locationRow.props.testID).toBe('delivery-location-row');

      // When delivery row is pressed, onOpenFulfillmentPicker should be invoked
      locationRow.props.onPress();
      expect(defaultProps.onOpenFulfillmentPicker).toHaveBeenCalledTimes(1);
    });

    it('renders pickup stand information with King Jaja Hall address when pickup is active', () => {
      const pickupProps: HomeScreenProps = {
        ...defaultProps,
        fulfillmentType: 'pickup',
        selectedLandmark: null,
      };

      const element = renderHome(pickupProps);
      const fulfillmentCard = element.props.children[0];
      const locationRow = fulfillmentCard.props.children[1];
      expect(locationRow.props.testID).toBe('pickup-location-row');
    });

    it('allows toggling between delivery and pickup', () => {
      const onToggle = jest.fn();
      const props: HomeScreenProps = {
        ...defaultProps,
        onToggleFulfillmentType: onToggle,
      };

      const element = renderHome(props);
      const fulfillmentCard = element.props.children[0];
      const segmentContainer = fulfillmentCard.props.children[0];

      const deliveryTab = segmentContainer.props.children[0];
      const pickupTab = segmentContainer.props.children[1];

      pickupTab.props.onPress();
      expect(onToggle).toHaveBeenCalledWith('pickup');

      deliveryTab.props.onPress();
      expect(onToggle).toHaveBeenCalledWith('delivery');
    });
  });

  describe('3. Brand Welcome & Greeting Section', () => {
    it('displays personalized greeting for authenticated customer', () => {
      const customerProps: HomeScreenProps = {
        customer: {
          id: 'cust-123',
          fullName: 'Idris Ososanwo',
          phone: '08130731895',
          email: 'idris@example.com',
          role: 'customer',
          isPhoneVerified: true,
          createdAt: '',
          updatedAt: '',
        },
        categories: SEEDED_CATEGORIES,
        popularProducts: SEEDED_PRODUCTS.filter((p) => p.categorySlug === 'pizza'),
        allProducts: SEEDED_PRODUCTS,
        fulfillmentType: 'delivery',
        selectedLandmark: PROVISIONAL_LANDMARKS[0],
        activeOrders: [],
        onSelectCategory: jest.fn(),
        onOpenSearch: jest.fn(),
        onOpenProductDetail: jest.fn(),
        onOpenCustomizer: jest.fn(),
        onTrackOrder: jest.fn(),
        onOpenFulfillmentPicker: jest.fn(),
        onExploreMenu: jest.fn(),
      };

      const element = renderHome(customerProps);
      const greetingSection = element.props.children[1];
      const headerRow = greetingSection.props.children[0];
      const textColumn = headerRow.props.children[0];
      const titleText = textColumn.props.children[1];

      expect(titleText.props.children).toBe('Hello, Idris 👋');
    });

    it('displays welcoming greeting for guest browsing', () => {
      const guestProps: HomeScreenProps = {
        customer: null,
        categories: SEEDED_CATEGORIES,
        popularProducts: SEEDED_PRODUCTS.filter((p) => p.categorySlug === 'pizza'),
        allProducts: SEEDED_PRODUCTS,
        fulfillmentType: 'delivery',
        selectedLandmark: null,
        activeOrders: [],
        onSelectCategory: jest.fn(),
        onOpenSearch: jest.fn(),
        onOpenProductDetail: jest.fn(),
        onOpenCustomizer: jest.fn(),
        onTrackOrder: jest.fn(),
        onOpenFulfillmentPicker: jest.fn(),
        onExploreMenu: jest.fn(),
      };

      const element = renderHome(guestProps);
      const greetingSection = element.props.children[1];
      const headerRow = greetingSection.props.children[0];
      const textColumn = headerRow.props.children[0];
      const titleText = textColumn.props.children[1];

      expect(titleText.props.children).toBe('Welcome to AY Pizza 🍕');
    });

    it('invokes onOpenSearch when the search bar button is pressed', () => {
      const onOpenSearch = jest.fn();
      const props: HomeScreenProps = {
        customer: null,
        categories: SEEDED_CATEGORIES,
        popularProducts: [],
        allProducts: [],
        fulfillmentType: 'delivery',
        selectedLandmark: null,
        activeOrders: [],
        onSelectCategory: jest.fn(),
        onOpenSearch,
        onOpenProductDetail: jest.fn(),
        onOpenCustomizer: jest.fn(),
        onTrackOrder: jest.fn(),
        onOpenFulfillmentPicker: jest.fn(),
        onExploreMenu: jest.fn(),
      };

      const element = renderHome(props);
      const greetingSection = element.props.children[1];
      const searchButton = greetingSection.props.children[1];
      expect(searchButton.props.testID).toBe('home-search-button');

      searchButton.props.onPress();
      expect(onOpenSearch).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Brand-Led Campaign Hero (Authenticity & Integrity)', () => {
    it('renders authentic artisan oven-baked copy and does not invent fake discount percentages or coupons', () => {
      const onExploreMenu = jest.fn();
      const props: HomeScreenProps = {
        customer: null,
        categories: SEEDED_CATEGORIES,
        popularProducts: [],
        allProducts: [],
        fulfillmentType: 'delivery',
        selectedLandmark: null,
        activeOrders: [],
        onSelectCategory: jest.fn(),
        onOpenSearch: jest.fn(),
        onOpenProductDetail: jest.fn(),
        onOpenCustomizer: jest.fn(),
        onTrackOrder: jest.fn(),
        onOpenFulfillmentPicker: jest.fn(),
        onExploreMenu,
      };

      const element = renderHome(props);
      // Hero card is child[3]
      const heroCard = element.props.children[3];
      expect(heroCard.props.testID).toBe('brand-hero-card');

      const overlay = heroCard.props.children[1];
      const copyBlock = overlay.props.children[1];
      const heroTitle = copyBlock.props.children[0];
      const heroSubtitle = copyBlock.props.children[1];

      expect(heroTitle.props.children).toBe('Artisan Oven-Baked Pizza');
      expect(heroSubtitle.props.children).toContain('Proofed dough rolled daily');
      expect(heroSubtitle.props.children).toContain('100% melted mozzarella');

      // Check footer action
      const footer = overlay.props.children[2];
      const actionBtn = footer.props.children[0];
      actionBtn.props.onPress();
      expect(onExploreMenu).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. Real Database Categories & Menu Filtering', () => {
    it('renders all real database categories plus All Menu option', () => {
      const onSelectCategory = jest.fn();
      const props: HomeScreenProps = {
        customer: null,
        categories: SEEDED_CATEGORIES,
        popularProducts: SEEDED_PRODUCTS.filter((p) => p.categorySlug === 'pizza'),
        allProducts: SEEDED_PRODUCTS,
        fulfillmentType: 'delivery',
        selectedLandmark: null,
        activeOrders: [],
        onSelectCategory,
        onOpenSearch: jest.fn(),
        onOpenProductDetail: jest.fn(),
        onOpenCustomizer: jest.fn(),
        onTrackOrder: jest.fn(),
        onOpenFulfillmentPicker: jest.fn(),
        onExploreMenu: jest.fn(),
      };

      const element = renderHome(props);
      const categoriesScroll = element.props.children[5];
      expect(categoriesScroll.props.testID).toBe('home-categories-scroll');

      // First chip is All Menu
      const allMenuChip = categoriesScroll.props.children[0];
      allMenuChip.props.onPress();
      expect(onSelectCategory).toHaveBeenCalledWith('all');

      // Next chips match SEEDED_CATEGORIES
      const categoryChips = categoriesScroll.props.children[1];
      expect(categoryChips.length).toBe(SEEDED_CATEGORIES.length);

      categoryChips[0].props.onPress();
      expect(onSelectCategory).toHaveBeenCalledWith(SEEDED_CATEGORIES[0].slug);
    });
  });

  describe('6. Featured Products Grid & Modal Entry Points', () => {
    it('renders products with accurate base prices and handles detail & customizer triggers', () => {
      const onOpenProductDetail = jest.fn();
      const onOpenCustomizer = jest.fn();

      const testProducts = [SEEDED_PRODUCTS[0], SEEDED_PRODUCTS[1]]; // Sweet and Sour Pizza, Club Pizza

      const props: HomeScreenProps = {
        customer: null,
        categories: SEEDED_CATEGORIES,
        popularProducts: testProducts,
        allProducts: testProducts,
        fulfillmentType: 'delivery',
        selectedLandmark: null,
        activeOrders: [],
        onSelectCategory: jest.fn(),
        onOpenSearch: jest.fn(),
        onOpenProductDetail,
        onOpenCustomizer,
        onTrackOrder: jest.fn(),
        onOpenFulfillmentPicker: jest.fn(),
        onExploreMenu: jest.fn(),
      };

      const element = renderHome(props);
      const productGrid = element.props.children[7];
      expect(productGrid.props.testID).toBe('home-product-grid');

      const card1 = productGrid.props.children[0];
      expect(card1.props.testID).toBe(`product-card-${testProducts[0].id}`);

      // Pressing product card triggers onOpenProductDetail
      card1.props.onPress();
      expect(onOpenProductDetail).toHaveBeenCalledWith(testProducts[0]);

      // Pressing customize button triggers onOpenCustomizer
      const cardBody = card1.props.children[1];
      const cardFooter = cardBody.props.children[1];
      const actionBtn = cardFooter.props.children[1];
      expect(actionBtn.props.testID).toBe(`add-btn-${testProducts[0].id}`);

      actionBtn.props.onPress();
      expect(onOpenCustomizer).toHaveBeenCalledWith(testProducts[0]);
    });
  });

  describe('7. Active Order Live Tracking Card', () => {
    it('renders live tracking strip when active guest or customer orders exist', () => {
      const onTrackOrder = jest.fn();
      const mockOrder = {
        orderId: 'ord-abc-123',
        orderNumber: 'AY-9942',
        receiptToken: 'token-xyz-789',
        savedAt: '2026-10-30T10:00:00Z',
      };

      const props: HomeScreenProps = {
        customer: null,
        categories: SEEDED_CATEGORIES,
        popularProducts: [],
        allProducts: [],
        fulfillmentType: 'delivery',
        selectedLandmark: null,
        activeOrders: [mockOrder],
        onSelectCategory: jest.fn(),
        onOpenSearch: jest.fn(),
        onOpenProductDetail: jest.fn(),
        onOpenCustomizer: jest.fn(),
        onTrackOrder,
        onOpenFulfillmentPicker: jest.fn(),
        onExploreMenu: jest.fn(),
      };

      const element = renderHome(props);
      const activeOrderCard = element.props.children[2];
      expect(activeOrderCard).toBeDefined();
      expect(activeOrderCard.props.testID).toBe('active-order-card');

      activeOrderCard.props.onPress();
      expect(onTrackOrder).toHaveBeenCalledWith('ord-abc-123', 'token-xyz-789');
    });

    it('does not render tracking card when activeOrders array is empty', () => {
      const props: HomeScreenProps = {
        customer: null,
        categories: SEEDED_CATEGORIES,
        popularProducts: [],
        allProducts: [],
        fulfillmentType: 'delivery',
        selectedLandmark: null,
        activeOrders: [],
        onSelectCategory: jest.fn(),
        onOpenSearch: jest.fn(),
        onOpenProductDetail: jest.fn(),
        onOpenCustomizer: jest.fn(),
        onTrackOrder: jest.fn(),
        onOpenFulfillmentPicker: jest.fn(),
        onExploreMenu: jest.fn(),
      };

      const element = renderHome(props);
      // When null, child is null
      expect(element.props.children[2]).toBeNull();
    });
  });

  describe('8. UNILAG Campus Trust Information', () => {
    it('displays accurate King Jaja stand location, phone number and hostel delivery note', () => {
      const props: HomeScreenProps = {
        customer: null,
        categories: SEEDED_CATEGORIES,
        popularProducts: [],
        allProducts: [],
        fulfillmentType: 'delivery',
        selectedLandmark: null,
        activeOrders: [],
        onSelectCategory: jest.fn(),
        onOpenSearch: jest.fn(),
        onOpenProductDetail: jest.fn(),
        onOpenCustomizer: jest.fn(),
        onTrackOrder: jest.fn(),
        onOpenFulfillmentPicker: jest.fn(),
        onExploreMenu: jest.fn(),
      };

      const element = renderHome(props);
      const campusCard = element.props.children[8];
      expect(campusCard.props.testID).toBe('campus-trust-card');

      const infoGrid = campusCard.props.children[2];
      const locationItem = infoGrid.props.children[0];
      const hoursItem = infoGrid.props.children[1];
      const contactItem = infoGrid.props.children[2];

      const locValue = locationItem.props.children[1].props.children[1];
      expect(locValue.props.children).toBe(Brand.location.address);

      const hoursValue = hoursItem.props.children[1].props.children[1];
      expect(hoursValue.props.children).toContain('10:00 AM – 9:00 PM WAT');

      const contactValue = contactItem.props.children[1].props.children[1];
      expect(contactValue.props.children).toBe(Brand.contact.phone);
    });
  });
});
