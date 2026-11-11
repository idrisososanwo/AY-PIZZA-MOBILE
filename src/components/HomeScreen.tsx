import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Brand } from '../constants/brand';
import { FoodImages, getProductImage } from '../constants/images';
import {
  Product,
  ProductCategory,
  normalizeCategorySlug,
  isProductInCategory,
} from '../types/catalog';
import { CustomerProfile } from '../domains/customer/customer-types';
import { GuestReceiptRecord } from '../domains/order/guest-receipt-store';
import { DeliveryLandmark, FulfillmentType } from '../types/delivery';
import { Radius, Shadows, Typography } from '../constants/theme';

export interface PromoSlide {
  id: string;
  badge: string;
  secondaryBadge?: string;
  title: string;
  subtitle: string;
  image: any;
  actionText: string;
  actionType: 'menu' | 'category' | 'coupon';
  categorySlug?: string;
  couponCode?: string;
  pills: string[];
}

export const DEFAULT_PROMO_SLIDES: PromoSlide[] = [
  {
    id: 'artisan-oven-baked',
    badge: '⚡ STONE-OVEN BAKED',
    secondaryBadge: 'Opposite King Jaja',
    title: 'Artisan Oven-Baked Pizza',
    subtitle:
      'Proofed dough rolled daily, rich marinara sauce, and 100% melted mozzarella. Baked fresh right on campus.',
    image: FoodImages.heroBanner,
    actionText: 'Explore Full Menu 🍕',
    actionType: 'menu',
    pills: ['🍕 5 Crust Sizes', '•', '🛵 Hostel Delivery'],
  },
  {
    id: 'campus-delivery',
    badge: '🛵 UNILAG CAMPUS DELIVERY',
    secondaryBadge: 'Direct to Hostels',
    title: 'Fast Delivery Across Campus',
    subtitle:
      'Prompt hostel delivery to King Jaja, Moremi, Mariere, Madam Tinubu, Biobaku, El-Kanemi, and all UNILAG faculties.',
    image: FoodImages.bbqChicken,
    actionText: 'Order For Delivery 🛵',
    actionType: 'menu',
    pills: ['⚡ 25–35 Mins', '•', '📍 Realtime Tracking'],
  },
  {
    id: 'shakes-ice-cream',
    badge: '🍦 FRESH DESSERTS',
    secondaryBadge: 'Real Dairy',
    title: 'Creamy Soft-Serve & Shakes',
    subtitle:
      'Thick, creamy milkshakes crafted with fresh ingredients, plus swirl soft-serve cups with crunchy toppings.',
    image: FoodImages.milkshake,
    actionText: 'View Shakes & Cones 🍨',
    actionType: 'category',
    categorySlug: 'icecream',
    pills: ['🥛 100% Real Dairy', '•', '🍫 Oreo & Vanilla'],
  },
];

export const getCulinaryBadge = (
  product: Product
): { label: string; icon: string } | null => {
  const name = product.name.toLowerCase();
  const desc = product.description.toLowerCase();
  if (
    name.includes('tikka') ||
    name.includes('sweet chili') ||
    name.includes('chili') ||
    desc.includes('spicy')
  ) {
    return { label: 'Spicy', icon: '🌶️' };
  }
  if (name.includes('veggie') || name.includes('margherita')) {
    return { label: 'Vegetarian', icon: '🌱' };
  }
  if (product.categorySlug === 'icecream') {
    return { label: 'Real Dairy', icon: '🍨' };
  }
  return null;
};

export interface HomeScreenProps {
  customer: CustomerProfile | null;
  categories: ProductCategory[];
  popularProducts: Product[];
  allProducts?: Product[];
  fulfillmentType: FulfillmentType;
  selectedLandmark: DeliveryLandmark | null;
  activeOrders: GuestReceiptRecord[];
  selectedCategorySlug?: string;
  onSelectCategory: (categorySlug: string) => void;
  onOpenSearch: () => void;
  onOpenProductDetail: (product: Product) => void;
  onOpenCustomizer: (product: Product) => void;
  onTrackOrder: (orderId: string, receiptToken: string) => void;
  onOpenFulfillmentPicker: () => void;
  onExploreMenu: () => void;
  onToggleFulfillmentType?: (type: FulfillmentType) => void;
  activeSlideIndex?: number;
  onSelectSlide?: (index: number) => void;
  promoSlidesOverride?: PromoSlide[];
  isKitchenOpenOverride?: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  customer,
  categories,
  popularProducts,
  allProducts,
  fulfillmentType,
  selectedLandmark,
  activeOrders,
  selectedCategorySlug = 'all',
  onSelectCategory,
  onOpenSearch,
  onOpenProductDetail,
  onOpenCustomizer,
  onTrackOrder,
  onOpenFulfillmentPicker,
  onExploreMenu,
  onToggleFulfillmentType,
  activeSlideIndex = 0,
  onSelectSlide,
  promoSlidesOverride,
  isKitchenOpenOverride,
}) => {
  const isDelivery = fulfillmentType === 'delivery';
  const latestActiveOrder = activeOrders && activeOrders.length > 0 ? activeOrders[0] : null;

  // Determine user first name for friendly greeting
  const firstName = customer?.fullName ? customer.fullName.trim().split(/\s+/)[0] || null : null;

  // Combined product pool (falls back to popularProducts if allProducts is not supplied)
  const productCatalog = allProducts && allProducts.length > 0 ? allProducts : popularProducts;

  // Filter products shown on Home based on the active category
  const displayedProducts =
    selectedCategorySlug && selectedCategorySlug !== 'all'
      ? productCatalog.filter((p) => isProductInCategory(p.categorySlug, selectedCategorySlug)).slice(0, 6)
      : popularProducts.length > 0
        ? popularProducts.slice(0, 6)
        : productCatalog.slice(0, 6);

  // Dedicated shelf for ice cream & shakes (when allProducts has items)
  const dessertProducts = (allProducts || []).filter(
    (p) => p.categorySlug === 'icecream' && p.isAvailable !== false
  );

  // Active promo slides with graceful fallback
  const promoSlides =
    promoSlidesOverride && promoSlidesOverride.length > 0
      ? promoSlidesOverride
      : DEFAULT_PROMO_SLIDES;

  const currentSlide =
    promoSlides[activeSlideIndex] || promoSlides[0] || DEFAULT_PROMO_SLIDES[0];

  const isKitchenOpen =
    typeof isKitchenOpenOverride === 'boolean' ? isKitchenOpenOverride : true;

  const handleSlideAction = (slide: PromoSlide) => {
    if (slide.actionType === 'category' && slide.categorySlug) {
      onSelectCategory(slide.categorySlug);
    } else {
      onExploreMenu();
    }
  };

  // 0. COMPACT FULFILLMENT SELECTOR CARD
  const fulfillmentCard = (
    <View key="fulfillment-card" style={styles.fulfillmentCard}>
      {/* Fulfillment Type Segmented Selector */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[
            styles.segmentTab,
            isDelivery && styles.segmentTabActiveDelivery,
          ]}
          onPress={() => onToggleFulfillmentType && onToggleFulfillmentType('delivery')}
          activeOpacity={0.8}
          testID="fulfillment-delivery-btn"
        >
          <Text style={styles.segmentIcon}>🛵</Text>
          <Text
            style={[
              styles.segmentLabel,
              isDelivery && styles.segmentLabelActiveDelivery,
            ]}
          >
            Delivery
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentTab,
            !isDelivery && styles.segmentTabActivePickup,
          ]}
          onPress={() => onToggleFulfillmentType && onToggleFulfillmentType('pickup')}
          activeOpacity={0.8}
          testID="fulfillment-pickup-btn"
        >
          <Text style={styles.segmentIcon}>🏬</Text>
          <Text
            style={[
              styles.segmentLabel,
              !isDelivery && styles.segmentLabelActivePickup,
            ]}
          >
            Pickup
          </Text>
        </TouchableOpacity>
      </View>

      {/* Fulfillment Location Context Bar */}
      {isDelivery ? (
        <TouchableOpacity
          style={styles.locationRow}
          onPress={onOpenFulfillmentPicker}
          activeOpacity={0.8}
          testID="delivery-location-row"
        >
          <View style={styles.locationPinCircle}>
            <Text style={styles.locationPinIcon}>📍</Text>
          </View>
          <View style={styles.locationTextContainer}>
            <Text style={styles.locationHeaderTag}>DELIVERY DESTINATION</Text>
            <Text style={styles.locationName} numberOfLines={1}>
              {selectedLandmark ? selectedLandmark.name : 'Select Delivery Landmark'}
            </Text>
            <Text style={styles.locationSubtext}>
              {selectedLandmark
                ? selectedLandmark.isCampus
                  ? `₦${selectedLandmark.fee.toLocaleString()} Flat Campus Delivery • ~25–35 mins`
                  : `₦${selectedLandmark.fee.toLocaleString()} (${selectedLandmark.name}) • ~35–50 mins`
                : 'Select landmark for delivery fee & timing'}
            </Text>
          </View>
          <View style={styles.changeActionBadge}>
            <Text style={styles.changeActionText}>Change ▾</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.locationRow} testID="pickup-location-row">
          <View style={[styles.locationPinCircle, styles.locationPinCirclePickup]}>
            <Text style={styles.locationPinIcon}>🏬</Text>
          </View>
          <View style={styles.locationTextContainer}>
            <Text style={[styles.locationHeaderTag, styles.locationHeaderTagPickup]}>
              PICKUP STAND
            </Text>
            <Text style={styles.locationName} numberOfLines={1}>
              {Brand.location.address}
            </Text>
            <Text style={styles.locationSubtext}>
              Free Pickup • Ready for collection at King Jaja in ~15 mins
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  // 1. BRAND GREETING & SLEEK SEARCH BAR
  const greetingSection = (
    <View key="greeting-section" style={styles.greetingSection}>
      <View style={styles.greetingHeaderRow}>
        <View style={styles.greetingTextColumn}>
          <Text style={styles.greetingSubtitle}>Fresh Oven-Baked • UNILAG</Text>
          <Text style={styles.greetingTitle}>
            {firstName ? `Hello, ${firstName} 👋` : 'Welcome to AY Pizza 🍕'}
          </Text>
        </View>
        <View style={styles.kitchenStatusBadge}>
          <View style={[styles.statusLiveDot, !isKitchenOpen && styles.statusClosedDot]} />
          <Text style={[styles.kitchenStatusText, !isKitchenOpen && styles.kitchenStatusClosedText]}>
            Kitchen Open
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.searchBarButton}
        onPress={onOpenSearch}
        activeOpacity={0.85}
        testID="home-search-button"
      >
        <Text style={styles.searchIcon}>🔍</Text>
        <Text style={styles.searchPlaceholder}>
          Search pizzas, shakes, toppings, burgers...
        </Text>
      </TouchableOpacity>
    </View>
  );

  // 2. ACTIVE ORDER LIVE TRACKING STRIP (IF ANY ACTIVE ORDER EXISTS)
  const activeOrderCard = latestActiveOrder ? (
    <TouchableOpacity
      key="active-order-card"
      style={styles.activeOrderCard}
      onPress={() => onTrackOrder(latestActiveOrder.orderId, latestActiveOrder.receiptToken)}
      activeOpacity={0.88}
      testID="active-order-card"
    >
      <View style={styles.activeOrderLeft}>
        <View style={styles.pulsingIndicator} />
        <View style={{ flex: 1 }}>
          <Text style={styles.activeOrderTitle}>
            Order #{latestActiveOrder.orderNumber} in Progress
          </Text>
          <Text style={styles.activeOrderSubtitle}>
            Baking fresh at King Jaja oven • Tap to track live
          </Text>
        </View>
      </View>
      <View style={styles.trackBtn}>
        <Text style={styles.trackBtnText}>Track Live 📡</Text>
      </View>
    </TouchableOpacity>
  ) : null;

  // 3. FOOD-FIRST HERO SECTION (NO DARK SCRIM, VIBRANT FOOD PHOTOGRAPHY)
  const heroCard = (
    <View key="brand-hero-card" style={styles.heroCard} testID="brand-hero-card">
      <Image
        source={currentSlide.image}
        style={styles.heroImage}
        resizeMode="cover"
      />

      <View style={styles.heroOverlay}>
        <View style={styles.heroBadgeRow}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{currentSlide.badge}</Text>
          </View>
          {currentSlide.secondaryBadge ? (
            <View style={styles.heroSecondaryBadge}>
              <Text style={styles.heroSecondaryBadgeText}>{currentSlide.secondaryBadge}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.heroCopyBlock}>
          <Text style={styles.heroTitle}>{currentSlide.title}</Text>
          <Text style={styles.heroSubtitle}>
            {currentSlide.subtitle}
          </Text>
        </View>

        <View style={styles.heroFooter}>
          <TouchableOpacity
            style={styles.heroActionBtn}
            onPress={() => handleSlideAction(currentSlide)}
            activeOpacity={0.85}
            testID="hero-explore-menu-btn"
          >
            <Text style={styles.heroActionText}>{currentSlide.actionText}</Text>
          </TouchableOpacity>

          <View style={styles.heroPillsRow}>
            {currentSlide.pills.map((pill, idx) => (
              <Text
                key={idx}
                style={pill === '•' ? styles.heroPillDot : styles.heroPillText}
              >
                {pill}
              </Text>
            ))}
          </View>
        </View>
      </View>

      {/* Carousel Pagination Dots */}
      {promoSlides.length > 1 && (
        <View style={styles.carouselPaginationDots} testID="promo-pagination-dots">
          {promoSlides.map((slide, idx) => (
            <TouchableOpacity
              key={slide.id}
              style={[
                styles.paginationDot,
                idx === activeSlideIndex ? styles.paginationDotActive : styles.paginationDotInactive,
              ]}
              onPress={() => onSelectSlide && onSelectSlide(idx)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              testID={`promo-dot-${idx}`}
            />
          ))}
        </View>
      )}
    </View>
  );

  // 4. FOOD CATEGORIES SECTION HEADER
  const categoriesHeader = (
    <View key="categories-header" style={styles.sectionHeaderRow}>
      <View>
        <Text style={styles.sectionTitle}>Explore Categories</Text>
        <Text style={styles.sectionSubtitle}>Select a section to view menu items</Text>
      </View>
      <TouchableOpacity onPress={onExploreMenu} activeOpacity={0.7}>
        <Text style={styles.viewAllText}>Full Menu →</Text>
      </TouchableOpacity>
    </View>
  );

  // 5. FOOD CATEGORIES SCROLLER
  const categoriesScroll = (
    <ScrollView
      key="categories-scroll"
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoriesScroll}
      testID="home-categories-scroll"
    >
      <TouchableOpacity
        style={[
          styles.categoryPill,
          normalizeCategorySlug(selectedCategorySlug) === 'all' ? styles.categoryPillActive : styles.categoryPillInactive,
        ]}
        onPress={() => onSelectCategory('all')}
        activeOpacity={0.8}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        <Text style={styles.categoryEmoji}>🍽️</Text>
        <Text
          style={[
            styles.categoryLabel,
            normalizeCategorySlug(selectedCategorySlug) === 'all' && styles.categoryLabelActive,
          ]}
        >
          All Menu
        </Text>
      </TouchableOpacity>

      {categories.map((cat) => {
        const isSelected = normalizeCategorySlug(selectedCategorySlug) === normalizeCategorySlug(cat.slug);
        let emoji = '🍕';
        const norm = normalizeCategorySlug(cat.slug);
        if (norm === 'icecream') emoji = '🍨';
        else if (norm === 'fastfood') emoji = '🍔';
        else if (norm === 'drinks') emoji = '🥤';

        return (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryPill,
              isSelected ? styles.categoryPillActive : styles.categoryPillInactive,
            ]}
            onPress={() => onSelectCategory(cat.slug)}
            activeOpacity={0.8}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Text style={styles.categoryEmoji}>{emoji}</Text>
            <Text
              style={[
                styles.categoryLabel,
                isSelected && styles.categoryLabelActive,
              ]}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // 6. FEATURED MENU / CAMPUS BESTSELLERS SECTION HEADER
  const featuredHeader = (
    <View key="featured-header" style={[styles.sectionHeaderRow, { marginTop: 14 }]}>
      <View>
        <Text style={styles.sectionTitle}>
          {selectedCategorySlug === 'all'
            ? 'Campus Bestsellers 🔥'
            : `${categories.find((c) => c.slug === selectedCategorySlug)?.name || 'Featured Items'} 🍕`}
        </Text>
        <Text style={styles.sectionSubtitle}>
          Freshly prepared to order right at King Jaja stand
        </Text>
      </View>
      <TouchableOpacity onPress={onExploreMenu} activeOpacity={0.7}>
        <Text style={styles.viewAllText}>View All →</Text>
      </TouchableOpacity>
    </View>
  );

  // 7. SHELF 1: CAMPUS BESTSELLERS (HORIZONTAL SWIPEABLE 230dp CARDS)
  const productGrid = (
    <ScrollView
      key="home-product-grid"
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.horizontalShelfContent}
      testID="home-product-grid"
    >
      {displayedProducts.map((prod) => {
        const foodImg = getProductImage(prod);
        const hasSizes = prod.sizes && prod.sizes.length > 0;
        const isAvailable = prod.isAvailable;
        const culinaryBadge = getCulinaryBadge(prod);

        return (
          <TouchableOpacity
            key={prod.id}
            style={[styles.shelfCard, !isAvailable && styles.shelfCardUnavailable]}
            onPress={() => onOpenProductDetail(prod)}
            activeOpacity={0.88}
            testID={`product-card-${prod.id}`}
          >
            <View style={styles.shelfImageContainer}>
              <Image source={foodImg} style={styles.shelfProductImage} resizeMode="cover" />
              {isAvailable ? (
                <View style={styles.stockBadge}>
                  <Text style={styles.stockBadgeText}>In Stock</Text>
                </View>
              ) : (
                <View style={styles.outOfStockBadge}>
                  <Text style={styles.outOfStockBadgeText}>Sold Out</Text>
                </View>
              )}
              {culinaryBadge && isAvailable && (
                <View style={styles.culinaryBadge}>
                  <Text style={styles.culinaryBadgeText}>
                    {culinaryBadge.icon} {culinaryBadge.label}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.shelfCardBody}>
              <View>
                <Text style={styles.shelfProductTitle} numberOfLines={1}>
                  {prod.name}
                </Text>
                <Text style={styles.shelfProductDesc} numberOfLines={1}>
                  {prod.description}
                </Text>
              </View>

              <View style={styles.shelfCardFooter}>
                <View style={styles.priceContainer}>
                  <Text style={styles.pricePrefix}>
                    {hasSizes ? 'From' : 'Price'}
                  </Text>
                  <Text style={styles.priceValue} numberOfLines={1}>
                    ₦{prod.basePrice.toLocaleString()}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.productActionBtn,
                    !isAvailable && styles.productActionBtnDisabled,
                    hasSizes ? styles.productActionBtnCustomize : styles.productActionBtnAdd,
                  ]}
                  onPress={() => onOpenCustomizer(prod)}
                  disabled={!isAvailable}
                  activeOpacity={0.8}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  testID={`add-btn-${prod.id}`}
                >
                  <Text
                    style={[
                      styles.productActionBtnText,
                      hasSizes ? styles.productActionBtnTextRed : styles.productActionBtnTextYellow,
                    ]}
                  >
                    {!isAvailable ? 'Unavailable' : hasSizes ? 'Customize ⚙️' : '+ Add'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // SHELF 2: CREAMY SHAKES & CONES (DEDICATED DESSERT SHELF)
  const hasDessertShelf = dessertProducts.length > 0 && selectedCategorySlug === 'all';
  const dessertShelf = hasDessertShelf ? (
    <View key="dessert-shelf-container" style={styles.dessertShelfContainer}>
      <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
        <View>
          <Text style={styles.sectionTitle}>Creamy Shakes & Cones 🍨</Text>
          <Text style={styles.sectionSubtitle}>
            Thick hand-spun milkshakes & 100% real dairy soft-serve
          </Text>
        </View>
        <TouchableOpacity onPress={() => onSelectCategory('icecream')} activeOpacity={0.7}>
          <Text style={styles.viewAllText}>View All 🍨 →</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalShelfContent}
        testID="home-shakes-shelf"
      >
        {dessertProducts.map((prod) => {
          const foodImg = getProductImage(prod);
          const hasSizes = prod.sizes && prod.sizes.length > 0;
          const isAvailable = prod.isAvailable;
          const culinaryBadge = getCulinaryBadge(prod);

          return (
            <TouchableOpacity
              key={`dessert-${prod.id}`}
              style={[styles.shelfCard, !isAvailable && styles.shelfCardUnavailable]}
              onPress={() => onOpenProductDetail(prod)}
              activeOpacity={0.88}
              testID={`shake-card-${prod.id}`}
            >
              <View style={styles.shelfImageContainer}>
                <Image source={foodImg} style={styles.shelfProductImage} resizeMode="cover" />
                {isAvailable ? (
                  <View style={styles.stockBadge}>
                    <Text style={styles.stockBadgeText}>In Stock</Text>
                  </View>
                ) : (
                  <View style={styles.outOfStockBadge}>
                    <Text style={styles.outOfStockBadgeText}>Sold Out</Text>
                  </View>
                )}
                {culinaryBadge && isAvailable && (
                  <View style={styles.culinaryBadge}>
                    <Text style={styles.culinaryBadgeText}>
                      {culinaryBadge.icon} {culinaryBadge.label}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.shelfCardBody}>
                <View>
                  <Text style={styles.shelfProductTitle} numberOfLines={1}>
                    {prod.name}
                  </Text>
                  <Text style={styles.shelfProductDesc} numberOfLines={1}>
                    {prod.description}
                  </Text>
                </View>

                <View style={styles.shelfCardFooter}>
                  <View style={styles.priceContainer}>
                    <Text style={styles.pricePrefix}>
                      {hasSizes ? 'From' : 'Price'}
                    </Text>
                    <Text style={styles.priceValue} numberOfLines={1}>
                      ₦{prod.basePrice.toLocaleString()}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.productActionBtn,
                      !isAvailable && styles.productActionBtnDisabled,
                      hasSizes ? styles.productActionBtnCustomize : styles.productActionBtnAdd,
                    ]}
                    onPress={() => onOpenCustomizer(prod)}
                    disabled={!isAvailable}
                    activeOpacity={0.8}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    testID={`add-shake-btn-${prod.id}`}
                  >
                    <Text
                      style={[
                        styles.productActionBtnText,
                        hasSizes ? styles.productActionBtnTextRed : styles.productActionBtnTextYellow,
                      ]}
                    >
                      {!isAvailable ? 'Unavailable' : hasSizes ? 'Customize ⚙️' : '+ Add'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  ) : null;

  // 8. UNILAG CAMPUS TRUST & OPERATIONAL INFO
  const campusTrustCard = (
    <View key="campus-trust-card" style={styles.campusTrustCard} testID="campus-trust-card">
      <View style={styles.campusTrustHeader}>
        <Text style={styles.campusTrustEmoji}>🏛️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.campusTrustTitle}>AY Pizza UNILAG Campus Stand</Text>
          <Text style={styles.campusTrustSubtitle}>
            Fresh oven-baked artisan pizza, thick shakes & fast hostel delivery
          </Text>
        </View>
      </View>

      <View style={styles.campusDivider} />

      <View style={styles.campusInfoGrid}>
        <View style={styles.campusInfoItem}>
          <Text style={styles.campusInfoIcon}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.campusInfoLabel}>Location</Text>
            <Text style={styles.campusInfoValue}>{Brand.location.address}</Text>
          </View>
        </View>

        <View style={styles.campusInfoItem}>
          <Text style={styles.campusInfoIcon}>⏰</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.campusInfoLabel}>Hours</Text>
            <Text style={styles.campusInfoValue}>10:00 AM – 9:00 PM WAT (Daily)</Text>
          </View>
        </View>

        <View style={styles.campusInfoItem}>
          <Text style={styles.campusInfoIcon}>📞</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.campusInfoLabel}>Direct Line / WhatsApp</Text>
            <Text style={styles.campusInfoValue}>{Brand.contact.phone}</Text>
          </View>
        </View>
      </View>

      <View style={styles.hostelNoticeBox}>
        <Text style={styles.hostelNoticeText}>
          🛵 Prompt hostel delivery across King Jaja, Mariere, Moremi, Madam Tinubu, Biobaku, El-Kanemi, and all UNILAG faculties.
        </Text>
      </View>
    </View>
  );

  // Bottom spacer
  const bottomSpacer = <View key="bottom-spacer" style={{ height: 28 }} />;

  // Assembling children array to preserve exact child indices for unit test suites:
  // indices 0..7 are fixed slots:
  // [0]: fulfillmentCard
  // [1]: greetingSection
  // [2]: activeOrderCard (or null)
  // [3]: heroCard
  // [4]: categoriesHeader
  // [5]: categoriesScroll
  // [6]: featuredHeader
  // [7]: productGrid (Shelf 1)
  // When no dessert shelf (e.g. in test suite where allProducts is []), [8] is campusTrustCard.
  // When dessert shelf is active, [8] is dessertShelf and [9] is campusTrustCard.
  const contentChildren = [
    fulfillmentCard,
    greetingSection,
    activeOrderCard,
    heroCard,
    categoriesHeader,
    categoriesScroll,
    featuredHeader,
    productGrid,
  ];

  if (dessertShelf) {
    contentChildren.push(dessertShelf);
  }
  contentChildren.push(campusTrustCard);
  contentChildren.push(bottomSpacer);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      testID="home-screen-scroll"
    >
      {contentChildren}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.warmCream,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 90,
  },

  // 1. COMPACT FULFILLMENT SELECTOR CARD
  fulfillmentCard: {
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.lg,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCream,
    borderRadius: Radius.pill,
    padding: 2,
    marginBottom: 8,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderRadius: Radius.pill,
    gap: 5,
  },
  segmentTabActiveDelivery: {
    backgroundColor: Colors.primaryRed,
    ...Shadows.card,
  },
  segmentTabActivePickup: {
    backgroundColor: Colors.freshGreen,
    ...Shadows.card,
  },
  segmentIcon: {
    fontSize: 13,
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  segmentLabelActiveDelivery: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  segmentLabelActivePickup: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  locationPinCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.softTomato,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  locationPinCirclePickup: {
    backgroundColor: 'rgba(40, 122, 75, 0.12)',
  },
  locationPinIcon: {
    fontSize: 14,
  },
  locationTextContainer: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  locationHeaderTag: {
    fontSize: 9,
    fontWeight: '900',
    color: Colors.primaryRed,
    letterSpacing: 0.5,
  },
  locationHeaderTagPickup: {
    color: Colors.freshGreen,
  },
  locationName: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
    marginTop: 1,
  },
  locationSubtext: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  changeActionBadge: {
    backgroundColor: Colors.warmCream,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  changeActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
  },

  // 2. GREETING & SEARCH
  greetingSection: {
    marginBottom: 10,
  },
  greetingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  greetingTextColumn: {
    flex: 1,
    marginRight: 8,
  },
  greetingSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryRed,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  greetingTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.charcoal,
    marginTop: 1,
    letterSpacing: -0.3,
  },
  kitchenStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(40, 122, 75, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(40, 122, 75, 0.25)',
  },
  statusLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.freshGreen,
    marginRight: 5,
  },
  statusClosedDot: {
    backgroundColor: Colors.textMuted,
  },
  kitchenStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.freshGreen,
  },
  kitchenStatusClosedText: {
    color: Colors.textMuted,
  },
  searchBarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchPlaceholder: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
    flex: 1,
  },

  // 3. ACTIVE ORDER BANNER
  activeOrderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryRed,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  activeOrderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  pulsingIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.freshGreen,
    marginRight: 8,
  },
  activeOrderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  activeOrderSubtitle: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  trackBtn: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
  },
  trackBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  // 4. FOOD-FIRST HERO SECTION (NO DARK SCRIM)
  heroCard: {
    height: 136,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: Colors.charcoal,
    position: 'relative',
    ...Shadows.card,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 1,
  },
  heroOverlay: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(20, 10, 5, 0.28)',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroBadge: {
    backgroundColor: Colors.goldenYellow,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  heroBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: Colors.charcoal,
    letterSpacing: 0.3,
  },
  heroSecondaryBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  heroSecondaryBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroCopyBlock: {
    marginTop: 2,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  heroSubtitle: {
    fontSize: 11,
    color: '#FFF8EC',
    lineHeight: 14,
    fontWeight: '500',
    marginTop: 2,
    maxWidth: '92%',
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  heroActionBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    ...Shadows.hover,
  },
  heroActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  heroPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFF3DD',
  },
  heroPillDot: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  carouselPaginationDots: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  paginationDot: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  paginationDotActive: {
    width: 14,
    backgroundColor: Colors.goldenYellow,
    opacity: 1,
  },
  paginationDotInactive: {
    width: 4,
    opacity: 0.45,
  },

  // 5. CATEGORIES
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryRed,
  },
  categoriesScroll: {
    paddingRight: 8,
    gap: 8,
    paddingVertical: 2,
    marginBottom: 10,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    minHeight: 40,
    borderRadius: Radius.pill,
    ...Shadows.card,
  },
  categoryPillInactive: {
    backgroundColor: Colors.cardWhite,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  categoryPillActive: {
    backgroundColor: Colors.primaryRed,
    borderWidth: 1,
    borderColor: Colors.primaryRed,
  },
  categoryEmoji: {
    fontSize: 14,
    marginRight: 5,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  categoryLabelActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // 6. HORIZONTAL PRODUCT DISCOVERY SHELVES
  horizontalShelfContent: {
    gap: 12,
    paddingVertical: 2,
    paddingRight: 10,
  },
  shelfCard: {
    width: 230,
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  shelfCardUnavailable: {
    opacity: 0.6,
  },
  shelfImageContainer: {
    width: '100%',
    height: 124,
    position: 'relative',
    backgroundColor: Colors.surfaceCream,
  },
  shelfProductImage: {
    width: '100%',
    height: '100%',
  },
  stockBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(40, 122, 75, 0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  stockBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  outOfStockBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  outOfStockBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  culinaryBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(39, 33, 31, 0.88)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  culinaryBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFF8EC',
  },
  shelfCardBody: {
    padding: 10,
    justifyContent: 'space-between',
    minHeight: 88,
  },
  shelfProductTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  shelfProductDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 14,
    marginTop: 2,
  },
  shelfCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  priceContainer: {
    flexShrink: 1,
    minWidth: 0,
  },
  pricePrefix: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  priceValue: {
    ...Typography.pricePrimary,
    fontSize: 14,
  },
  productActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 36,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productActionBtnCustomize: {
    backgroundColor: Colors.softTomato,
    borderWidth: 1,
    borderColor: 'rgba(201, 35, 43, 0.25)',
  },
  productActionBtnAdd: {
    backgroundColor: Colors.goldenYellow,
  },
  productActionBtnDisabled: {
    backgroundColor: Colors.borderMedium,
  },
  productActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  productActionBtnTextRed: {
    color: Colors.primaryRed,
  },
  productActionBtnTextYellow: {
    color: Colors.charcoal,
  },

  // 7. DESSERT SHELF CONTAINER
  dessertShelfContainer: {
    marginBottom: 8,
  },

  // 8. CAMPUS TRUST CARD
  campusTrustCard: {
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.lg,
    padding: 12,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  campusTrustHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  campusTrustEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  campusTrustTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  campusTrustSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  campusDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 8,
  },
  campusInfoGrid: {
    gap: 6,
  },
  campusInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  campusInfoIcon: {
    fontSize: 13,
    marginRight: 8,
    width: 18,
    textAlign: 'center',
  },
  campusInfoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  campusInfoValue: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.charcoal,
    marginTop: 1,
  },
  hostelNoticeBox: {
    backgroundColor: Colors.warmCream,
    borderRadius: Radius.sm,
    padding: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  hostelNoticeText: {
    fontSize: 10,
    color: Colors.chocolateBrown,
    lineHeight: 14,
    fontWeight: '600',
  },
});
