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
import { Product, ProductCategory } from '../types/catalog';
import { CustomerProfile } from '../domains/customer/customer-types';
import { GuestReceiptRecord } from '../domains/order/guest-receipt-store';
import { DeliveryLandmark, FulfillmentType } from '../types/delivery';
import { Radius, Shadows, Typography } from '../constants/theme';

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
      ? productCatalog.filter((p) => p.categorySlug === selectedCategorySlug).slice(0, 6)
      : popularProducts.length > 0
      ? popularProducts.slice(0, 6)
      : productCatalog.slice(0, 6);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      testID="home-screen-scroll"
    >
      {/* 1. DELIVERY / PICKUP SEGMENTED HEADER */}
      <View style={styles.fulfillmentCard}>
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
                ₦{Brand.fulfillment.campusDeliveryFee} Flat Campus Delivery • ~25–35 mins
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
                Free Pickup • Ready for collection in ~15 mins
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* 2. BRAND GREETING & SEARCH BAR */}
      <View style={styles.greetingSection}>
        <View style={styles.greetingHeaderRow}>
          <View style={styles.greetingTextColumn}>
            <Text style={styles.greetingSubtitle}>Fresh Oven-Baked • UNILAG</Text>
            <Text style={styles.greetingTitle}>
              {firstName ? `Hello, ${firstName} 👋` : 'Welcome to AY Pizza 🍕'}
            </Text>
          </View>
          <View style={styles.kitchenStatusBadge}>
            <View style={styles.statusLiveDot} />
            <Text style={styles.kitchenStatusText}>Kitchen Open</Text>
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

      {/* 3. ACTIVE ORDER LIVE TRACKING STRIP (IF ANY ACTIVE ORDER EXISTS) */}
      {latestActiveOrder && (
        <TouchableOpacity
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
      )}

      {/* 4. TASTEFUL BRAND-LED HERO CAMPAIGN (NO FAKE DISCOUNTS) */}
      <View style={styles.heroCard} testID="brand-hero-card">
        <Image
          source={FoodImages.heroBanner}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <View style={styles.heroOverlay}>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>⚡ STONE-OVEN BAKED</Text>
            </View>
            <View style={styles.heroSecondaryBadge}>
              <Text style={styles.heroSecondaryBadgeText}>Opposite King Jaja</Text>
            </View>
          </View>

          <View style={styles.heroCopyBlock}>
            <Text style={styles.heroTitle}>Artisan Oven-Baked Pizza</Text>
            <Text style={styles.heroSubtitle}>
              Proofed dough rolled daily, rich marinara sauce, and 100% melted mozzarella. Baked fresh right on campus.
            </Text>
          </View>

          <View style={styles.heroFooter}>
            <TouchableOpacity
              style={styles.heroActionBtn}
              onPress={onExploreMenu}
              activeOpacity={0.85}
              testID="hero-explore-menu-btn"
            >
              <Text style={styles.heroActionText}>Explore Full Menu 🍕</Text>
            </TouchableOpacity>

            <View style={styles.heroPillsRow}>
              <Text style={styles.heroPillText}>🍕 5 Crust Sizes</Text>
              <Text style={styles.heroPillDot}>•</Text>
              <Text style={styles.heroPillText}>🛵 Hostel Delivery</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 5. FOOD CATEGORIES SCROLLER */}
      <View style={styles.sectionHeaderRow}>
        <View>
          <Text style={styles.sectionTitle}>Explore Categories</Text>
          <Text style={styles.sectionSubtitle}>Select a section to view menu items</Text>
        </View>
        <TouchableOpacity onPress={onExploreMenu} activeOpacity={0.7}>
          <Text style={styles.viewAllText}>Full Menu →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesScroll}
        testID="home-categories-scroll"
      >
        <TouchableOpacity
          style={[
            styles.categoryPill,
            selectedCategorySlug === 'all' ? styles.categoryPillActive : styles.categoryPillInactive,
          ]}
          onPress={() => onSelectCategory('all')}
          activeOpacity={0.8}
        >
          <Text style={styles.categoryEmoji}>🍽️</Text>
          <Text
            style={[
              styles.categoryLabel,
              selectedCategorySlug === 'all' && styles.categoryLabelActive,
            ]}
          >
            All Menu
          </Text>
        </TouchableOpacity>

        {categories.map((cat) => {
          const isSelected = selectedCategorySlug === cat.slug;
          let emoji = '🍕';
          if (cat.slug.includes('shake') || cat.slug.includes('icecream')) emoji = '🍨';
          else if (cat.slug.includes('fast') || cat.slug.includes('burger')) emoji = '🍔';
          else if (cat.slug.includes('drink')) emoji = '🥤';

          return (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryPill,
                isSelected ? styles.categoryPillActive : styles.categoryPillInactive,
              ]}
              onPress={() => onSelectCategory(cat.slug)}
              activeOpacity={0.8}
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

      {/* 6. FEATURED MENU / CAMPUS FAVOURITES */}
      <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
        <View>
          <Text style={styles.sectionTitle}>
            {selectedCategorySlug === 'all'
              ? 'Campus Favourites 🔥'
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

      <View style={styles.productGrid} testID="home-product-grid">
        {displayedProducts.map((prod) => {
          const foodImg = getProductImage(prod.name);
          const hasSizes = prod.sizes && prod.sizes.length > 0;
          const isAvailable = prod.isAvailable;

          return (
            <TouchableOpacity
              key={prod.id}
              style={[styles.productCard, !isAvailable && styles.productCardUnavailable]}
              onPress={() => onOpenProductDetail(prod)}
              activeOpacity={0.88}
              testID={`product-card-${prod.id}`}
            >
              <View style={styles.productImageContainer}>
                <Image source={foodImg} style={styles.productImage} resizeMode="cover" />
                {isAvailable ? (
                  <View style={styles.stockBadge}>
                    <Text style={styles.stockBadgeText}>In Stock</Text>
                  </View>
                ) : (
                  <View style={styles.outOfStockBadge}>
                    <Text style={styles.outOfStockBadgeText}>Sold Out</Text>
                  </View>
                )}
              </View>

              <View style={styles.productCardBody}>
                <View>
                  <Text style={styles.productTitle} numberOfLines={1}>
                    {prod.name}
                  </Text>
                  <Text style={styles.productDesc} numberOfLines={2}>
                    {prod.description}
                  </Text>
                </View>

                <View style={styles.productCardFooter}>
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
      </View>

      {/* 7. UNILAG CAMPUS TRUST & OPERATIONAL INFO */}
      <View style={styles.campusTrustCard} testID="campus-trust-card">
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

      {/* Bottom spacer ensuring clearance over bottom tab bar */}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.warmCream,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },

  // 1. FULFILLMENT SELECTOR CARD
  fulfillmentCard: {
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCream,
    borderRadius: Radius.pill,
    padding: 3,
    marginBottom: 10,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: Radius.pill,
    gap: 6,
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
    fontSize: 14,
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
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  locationPinCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.softTomato,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  locationPinCirclePickup: {
    backgroundColor: 'rgba(40, 122, 75, 0.12)',
  },
  locationPinIcon: {
    fontSize: 16,
  },
  locationTextContainer: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    marginBottom: 14,
  },
  greetingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  greetingTextColumn: {
    flex: 1,
    marginRight: 10,
  },
  greetingSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  greetingTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.charcoal,
    marginTop: 2,
    letterSpacing: -0.3,
  },
  kitchenStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(40, 122, 75, 0.1)',
    paddingHorizontal: 9,
    paddingVertical: 5,
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
  kitchenStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.freshGreen,
  },
  searchBarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchPlaceholder: {
    fontSize: 13,
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
    padding: 12,
    marginBottom: 14,
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
    marginRight: 10,
  },
  pulsingIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.freshGreen,
    marginRight: 10,
  },
  activeOrderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  activeOrderSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  trackBtn: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
  },
  trackBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  // 4. BRAND CAMPAIGN HERO
  heroCard: {
    height: 200,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: 18,
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
    opacity: 0.65,
  },
  heroOverlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.48)',
    padding: 16,
    justifyContent: 'space-between',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroBadge: {
    backgroundColor: Colors.goldenYellow,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.xs,
  },
  heroBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: Colors.charcoal,
    letterSpacing: 0.4,
  },
  heroSecondaryBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.xs,
  },
  heroSecondaryBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroCopyBlock: {
    marginTop: 4,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#FFF8EC',
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 4,
    maxWidth: '95%',
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  heroActionBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    ...Shadows.hover,
  },
  heroActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  heroPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF3DD',
  },
  heroPillDot: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
  },

  // 5. CATEGORIES
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryRed,
  },
  categoriesScroll: {
    paddingRight: 10,
    gap: 8,
    paddingVertical: 2,
    marginBottom: 14,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
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
    fontSize: 16,
    marginRight: 6,
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

  // 6. FEATURED MENU GRID
  productGrid: {
    gap: 12,
  },
  productCard: {
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
    flexDirection: 'row',
  },
  productCardUnavailable: {
    opacity: 0.6,
  },
  productImageContainer: {
    width: 96,
    height: 96,
    position: 'relative',
    backgroundColor: Colors.surfaceCream,
  },
  productImage: {
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
  productCardBody: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  productDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 15,
    marginTop: 2,
  },
  productCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
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
    fontSize: 15,
  },
  productActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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

  // 7. CAMPUS TRUST CARD
  campusTrustCard: {
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.lg,
    padding: 16,
    marginTop: 22,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  campusTrustHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  campusTrustEmoji: {
    fontSize: 28,
    marginRight: 10,
  },
  campusTrustTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  campusTrustSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  campusDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 12,
  },
  campusInfoGrid: {
    gap: 8,
  },
  campusInfoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  campusInfoIcon: {
    fontSize: 14,
    marginRight: 8,
    marginTop: 1,
  },
  campusInfoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  campusInfoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.charcoal,
    marginTop: 1,
  },
  hostelNoticeBox: {
    backgroundColor: Colors.surfaceCream,
    borderRadius: Radius.sm,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(244, 179, 35, 0.3)',
  },
  hostelNoticeText: {
    fontSize: 11,
    color: Colors.charcoal,
    lineHeight: 16,
    fontWeight: '600',
  },
});
