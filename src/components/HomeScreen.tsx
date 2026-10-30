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

interface HomeScreenProps {
  customer: CustomerProfile | null;
  categories: ProductCategory[];
  popularProducts: Product[];
  fulfillmentType: FulfillmentType;
  selectedLandmark: DeliveryLandmark | null;
  activeOrders: GuestReceiptRecord[];
  onSelectCategory: (categorySlug: string) => void;
  onOpenSearch: () => void;
  onOpenProductDetail: (product: Product) => void;
  onOpenCustomizer: (product: Product) => void;
  onTrackOrder: (orderId: string, receiptToken: string) => void;
  onOpenFulfillmentPicker: () => void;
  onExploreMenu: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  customer,
  categories,
  popularProducts,
  fulfillmentType,
  selectedLandmark,
  activeOrders,
  onSelectCategory,
  onOpenSearch,
  onOpenProductDetail,
  onOpenCustomizer,
  onTrackOrder,
  onOpenFulfillmentPicker,
  onExploreMenu,
}) => {
  const isDelivery = fulfillmentType === 'delivery';
  const latestActiveOrder = activeOrders.length > 0 ? activeOrders[0] : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. GREETING & FULFILLMENT BAR */}
      <View style={styles.topContextBar}>
        <View style={styles.greetingContainer}>
          <Text style={styles.greetingSubtext}>Welcome to AY Pizza</Text>
          <Text style={styles.greetingTitle}>
            {customer?.fullName ? `Hello, ${customer.fullName.split(' ')[0]} 👋` : 'Craving Fresh Pizza? 🍕'}
          </Text>
        </View>

        {/* Fulfillment context selector button */}
        <TouchableOpacity
          style={styles.fulfillmentPill}
          onPress={onOpenFulfillmentPicker}
          activeOpacity={0.8}
        >
          <Text style={styles.fulfillmentEmoji}>{isDelivery ? '🛵' : '🏬'}</Text>
          <View style={styles.fulfillmentTextContainer}>
            <Text style={styles.fulfillmentLabel}>
              {isDelivery ? 'Delivery' : 'Pickup'}
            </Text>
            <Text style={styles.fulfillmentTarget} numberOfLines={1}>
              {isDelivery ? (selectedLandmark ? selectedLandmark.name : 'Select Landmark') : 'King Jaja Hall'}
            </Text>
          </View>
          <Text style={styles.fulfillmentCaret}>▾</Text>
        </TouchableOpacity>
      </View>

      {/* 2. SEARCH BAR ENTRY POINT */}
      <TouchableOpacity
        style={styles.searchBarButton}
        onPress={onOpenSearch}
        activeOpacity={0.85}
      >
        <Text style={styles.searchIcon}>🔍</Text>
        <Text style={styles.searchPlaceholder}>Search pizzas, shakes, toppings, burgers...</Text>
      </TouchableOpacity>

      {/* 3. ACTIVE ORDER BANNER (IF ANY ACTIVE ORDER EXISTS) */}
      {latestActiveOrder && (
        <TouchableOpacity
          style={styles.activeOrderCard}
          onPress={() => onTrackOrder(latestActiveOrder.orderId, latestActiveOrder.receiptToken)}
          activeOpacity={0.85}
        >
          <View style={styles.activeOrderLeft}>
            <View style={styles.pulsingDot} />
            <View>
              <Text style={styles.activeOrderTitle}>
                Active Order #{latestActiveOrder.orderNumber}
              </Text>
              <Text style={styles.activeOrderSubtitle}>
                Baking hot & fresh at King Jaja oven
              </Text>
            </View>
          </View>
          <View style={styles.trackBtn}>
            <Text style={styles.trackBtnText}>Track Live 📡</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* 4. HERO PROMOTIONAL BANNER */}
      <View style={styles.heroCard}>
        <Image
          source={FoodImages.heroBanner}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <View style={styles.heroOverlay}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>⚡ HOT FROM JAX OVEN</Text>
          </View>
          <Text style={styles.heroTitle}>Authentic Artisan Pizza</Text>
          <Text style={styles.heroSubtitle}>
            Hand-tossed daily with 100% mozzarella, baked right on UNILAG campus opposite King Jaja Hall.
          </Text>
          <TouchableOpacity
            style={styles.heroActionBtn}
            onPress={onExploreMenu}
            activeOpacity={0.85}
          >
            <Text style={styles.heroActionText}>Order Fresh Pizza 🍕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 5. QUICK MENU CATEGORIES */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Explore Menu</Text>
        <TouchableOpacity onPress={onExploreMenu} activeOpacity={0.7}>
          <Text style={styles.viewAllText}>View All →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesScroll}
      >
        <TouchableOpacity
          style={styles.categoryChip}
          onPress={() => onSelectCategory('all')}
          activeOpacity={0.8}
        >
          <Text style={styles.categoryEmoji}>🍽️</Text>
          <Text style={styles.categoryLabel}>All Items</Text>
        </TouchableOpacity>
        {categories.map((cat) => {
          let emoji = '🍕';
          if (cat.slug.includes('shake') || cat.slug.includes('icecream')) emoji = '🍨';
          else if (cat.slug.includes('burger')) emoji = '🍔';
          else if (cat.slug.includes('shawarma')) emoji = '🌯';
          else if (cat.slug.includes('drink')) emoji = '🥤';
          else if (cat.slug.includes('side')) emoji = '🍟';

          return (
            <TouchableOpacity
              key={cat.id}
              style={styles.categoryChip}
              onPress={() => onSelectCategory(cat.slug)}
              activeOpacity={0.8}
            >
              <Text style={styles.categoryEmoji}>{emoji}</Text>
              <Text style={styles.categoryLabel}>{cat.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 6. POPULAR AT UNILAG (FEATURED PIZZAS) */}
      <View style={[styles.sectionHeader, { marginTop: 22 }]}>
        <Text style={styles.sectionTitle}>Popular at UNILAG 🔥</Text>
        <TouchableOpacity onPress={onExploreMenu} activeOpacity={0.7}>
          <Text style={styles.viewAllText}>See Menu →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.popularGrid}>
        {popularProducts.slice(0, 6).map((prod) => {
          const foodImg = getProductImage(prod.name);
          const hasSizes = prod.sizes && prod.sizes.length > 0;

          return (
            <TouchableOpacity
              key={prod.id}
              style={styles.popularCard}
              onPress={() => onOpenProductDetail(prod)}
              activeOpacity={0.85}
            >
              <View style={styles.popularImageContainer}>
                <Image source={foodImg} style={styles.popularImage} resizeMode="cover" />
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>TOP PICK</Text>
                </View>
              </View>

              <View style={styles.popularCardBody}>
                <Text style={styles.popularTitle} numberOfLines={1}>
                  {prod.name}
                </Text>
                <Text style={styles.popularDesc} numberOfLines={2}>
                  {prod.description}
                </Text>

                <View style={styles.popularCardFooter}>
                  <View style={styles.popularPriceContainer}>
                    <Text style={styles.popularFromText}>From</Text>
                    <Text style={styles.popularPrice} numberOfLines={1}>
                      ₦{prod.basePrice.toLocaleString()}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.popularAddBtn}
                    onPress={() => onOpenCustomizer(prod)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.popularAddBtnText}>
                      {hasSizes ? 'Customize ⚙️' : '+ Add'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 7. CAMPUS ASSURANCE FOOTER */}
      <View style={styles.campusAssuranceCard}>
        <Text style={styles.assuranceEmoji}>🏛️</Text>
        <Text style={styles.assuranceTitle}>AY Pizza UNILAG Campus Promise</Text>
        <Text style={styles.assuranceText}>
          Fresh dough rolled daily, 100% real cheese, and fast hostel delivery across King Jaja, Mariere, Moremi, Madam Tinubu, Biobaku, and all UNILAG faculties.
        </Text>
        <View style={styles.locationPill}>
          <Text style={styles.locationPillText}>📍 Stand: {Brand.location.address}</Text>
        </View>
      </View>

      <View style={{ height: 28 }} />
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
    paddingBottom: 24,
  },
  topContextBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  greetingContainer: {
    flex: 1,
    marginRight: 10,
  },
  greetingSubtext: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  greetingTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.charcoal,
    marginTop: 2,
  },
  fulfillmentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.1)',
    maxWidth: 160,
    flexShrink: 1,
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  fulfillmentEmoji: {
    fontSize: 14,
    marginRight: 6,
  },
  fulfillmentTextContainer: {
    flex: 1,
  },
  fulfillmentLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.primaryRed,
    textTransform: 'uppercase',
  },
  fulfillmentTarget: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  fulfillmentCaret: {
    fontSize: 10,
    color: Colors.textMuted,
    marginLeft: 4,
  },
  searchBarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchPlaceholder: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  activeOrderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryRed,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  activeOrderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  pulsingDot: {
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
    borderRadius: 8,
  },
  trackBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  heroCard: {
    height: 190,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#27211F',
    position: 'relative',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0.72,
  },
  heroOverlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.45)',
    padding: 16,
    justifyContent: 'space-between',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.goldenYellow,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#27211F',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#FFF8EC',
    lineHeight: 16,
    fontWeight: '500',
    maxWidth: '92%',
  },
  heroActionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  heroActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  categoriesScroll: {
    paddingRight: 10,
    gap: 8,
    marginBottom: 14,
  },
  categoryChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    minWidth: 80,
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  categoryEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  popularGrid: {
    gap: 12,
  },
  popularCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    flexDirection: 'row',
  },
  popularImageContainer: {
    width: 100,
    height: 100,
    position: 'relative',
    backgroundColor: '#FFF3DD',
  },
  popularImage: {
    width: '100%',
    height: '100%',
  },
  popularBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: Colors.goldenYellow,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  popularBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#27211F',
  },
  popularCardBody: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  popularTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  popularDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  popularCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  popularPriceContainer: {
    flexShrink: 1,
    minWidth: 0,
  },
  popularFromText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  popularPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  popularAddBtn: {
    backgroundColor: Colors.softTomato,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(201, 35, 43, 0.2)',
  },
  popularAddBtnText: {
    color: Colors.primaryRed,
    fontSize: 11,
    fontWeight: '800',
  },
  campusAssuranceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    alignItems: 'center',
  },
  assuranceEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  assuranceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
    textAlign: 'center',
    marginBottom: 6,
  },
  assuranceText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 10,
  },
  locationPill: {
    backgroundColor: Colors.warmCream,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  locationPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.charcoal,
  },
});

