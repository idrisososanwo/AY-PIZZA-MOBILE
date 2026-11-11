import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Brand } from '../constants/brand';
import { getProductImage } from '../constants/images';
import { CartState, CartItem } from '../domains/cart/cart-types';
import { cartStore } from '../domains/cart/cart-store';
import { DeliveryLandmark } from '../types/delivery';
import { Product } from '../types/catalog';
import { SEEDED_PRODUCTS } from '../domains/catalog/catalog-repository';
import { LandmarkPickerModal } from './LandmarkPickerModal';
import { SavedAddressesModal } from './SavedAddressesModal';
import { deliveryPricingEngine } from '../domains/delivery/delivery-pricing-engine';
import { Radius, Shadows } from '../constants/theme';

export interface CartViewProps {
  cartState: CartState;
  userId?: string;
  onExploreMenu: () => void;
  onEditItem: (item: CartItem) => void;
  onProceedToCheckout?: () => void;
  suggestedProducts?: Product[];
  onOpenCustomizer?: (product: Product) => void;
}

export const CartView: React.FC<CartViewProps> = ({
  cartState,
  userId,
  onExploreMenu,
  onEditItem,
  onProceedToCheckout,
  suggestedProducts,
  onOpenCustomizer,
}) => {
  const insets = useSafeAreaInsets();
  const [landmarkPickerVisible, setLandmarkPickerVisible] = useState(false);
  const [savedAddressesVisible, setSavedAddressesVisible] = useState(false);
  const [isThrottled, setIsThrottled] = useState(false);

  const hasItems = cartState.items.length > 0;
  const isDelivery = cartState.fulfillmentType === 'delivery';

  // Fallback suggested items for empty cart
  const suggestedList =
    suggestedProducts && suggestedProducts.length > 0
      ? suggestedProducts
      : SEEDED_PRODUCTS.slice(0, 3);

  const handleClearCart = () => {
    Alert.alert(
      'Clear Shopping Cart',
      'Are you sure you want to remove all items from your cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cart',
          style: 'destructive',
          onPress: () => cartStore.clearCart(),
        },
      ]
    );
  };

  const handleQuantityUpdate = async (itemId: string, newQuantity: number) => {
    if (isThrottled) return;
    setIsThrottled(true);
    try {
      await cartStore.updateQuantity(itemId, newQuantity);
    } finally {
      setTimeout(() => setIsThrottled(false), 200);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (isThrottled) return;
    setIsThrottled(true);
    try {
      await cartStore.removeItem(itemId);
    } finally {
      setTimeout(() => setIsThrottled(false), 200);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 24, 48) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Summary */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Shopping Cart</Text>
          <Text style={styles.headerSubtitle}>
            {cartState.itemCount} item{cartState.itemCount === 1 ? '' : 's'} selected
          </Text>
        </View>

        {/* Storage Error Banner */}
        {cartState.storageError && (
          <View style={styles.staleBanner}>
            <Text style={styles.staleText}>⚠️ Storage Notice: {cartState.storageError}</Text>
          </View>
        )}

        {/* Stale / Availability Warning */}
        {cartState.isStale && cartState.staleReason && (
          <View style={styles.staleBanner}>
            <Text style={styles.staleText}>⚠️ {cartState.staleReason}</Text>
          </View>
        )}

        {/* Price Change Protection Banner */}
        {cartState.priceChangeNotice && (
          <View style={styles.priceChangeBanner}>
            <View style={styles.priceChangeInfo}>
              <Text style={styles.priceChangeTitle}>🔔 Menu Price Update</Text>
              <Text style={styles.priceChangeText}>
                Catalog prices have been updated. Previous subtotal: ₦
                {cartState.priceChangeNotice.previousSubtotal.toLocaleString()}, New subtotal: ₦
                {cartState.priceChangeNotice.newSubtotal.toLocaleString()} (
                {cartState.priceChangeNotice.difference > 0 ? '+' : ''}₦
                {cartState.priceChangeNotice.difference.toLocaleString()}).
              </Text>
            </View>
            <TouchableOpacity
              style={styles.acceptPriceBtn}
              onPress={() => cartStore.acceptPriceAdjustment()}
              activeOpacity={0.8}
            >
              <Text style={styles.acceptPriceBtnText}>Accept & Update</Text>
            </TouchableOpacity>
          </View>
        )}

        {!hasItems ? (
          /* Empty Cart State */
          <View style={styles.emptyContainer} testID="cart-empty-state">
            <View style={styles.emptyIconCircle}>
              <Text style={styles.emptyIcon}>🛒</Text>
            </View>
            <Text style={styles.emptyTitle}>Your Cart is Empty</Text>
            <Text style={styles.emptySubtitle}>
              Hand-tossed pizzas proofed daily, thick shakes & soft-serve ice cream baked fresh at King Jaja stand.
            </Text>
            <TouchableOpacity
              style={styles.exploreBtn}
              onPress={onExploreMenu}
              activeOpacity={0.8}
              testID="empty-cart-explore-btn"
            >
              <Text style={styles.exploreBtnText}>Explore Full Menu 🍕</Text>
            </TouchableOpacity>

            {/* CAMPUS POPULAR SUGGESTIONS SHELF */}
            {suggestedList.length > 0 && (
              <View style={styles.suggestionsContainer} testID="empty-cart-suggestions">
                <View style={styles.suggestionsHeaderRow}>
                  <Text style={styles.suggestionsTitle}>Popular on Campus 🔥</Text>
                  <Text style={styles.suggestionsSubtitle}>Quick additions to get started</Text>
                </View>

                <View style={styles.suggestionsGrid}>
                  {suggestedList.map((prod) => (
                    <TouchableOpacity
                      key={prod.id}
                      style={styles.suggestionCard}
                      onPress={() => (onOpenCustomizer ? onOpenCustomizer(prod) : onExploreMenu())}
                      activeOpacity={0.85}
                      testID={`suggested-product-${prod.id}`}
                    >
                      <Image
                        source={getProductImage(prod)}
                        style={styles.suggestionThumb}
                        resizeMode="cover"
                      />
                      <View style={styles.suggestionBody}>
                        <Text style={styles.suggestionName} numberOfLines={1}>
                          {prod.name}
                        </Text>
                        <Text style={styles.suggestionPrice}>
                          ₦{prod.basePrice.toLocaleString()}
                        </Text>
                      </View>
                      <View style={styles.suggestionAddBtn}>
                        <Text style={styles.suggestionAddBtnText}>+ Add</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        ) : (
          /* Active Cart State */
          <>
            {/* Fulfillment Selector */}
            <View style={styles.card} testID="cart-fulfillment-card">
              <Text style={styles.cardTitle}>1. Fulfillment Method</Text>
              <View style={styles.segmentedRow}>
                <TouchableOpacity
                  style={[styles.segmentBtn, isDelivery && styles.segmentBtnActive]}
                  onPress={() => cartStore.setFulfillmentType('delivery')}
                  activeOpacity={0.8}
                  testID="cart-fulfillment-delivery-btn"
                >
                  <Text style={[styles.segmentText, isDelivery && styles.segmentTextActive]}>
                    🛵 Campus Delivery
                  </Text>
                  <Text style={[styles.segmentBadge, isDelivery && styles.segmentBadgeActive]}>
                    {cartState.deliveryFee > 0
                      ? `₦${cartState.deliveryFee.toLocaleString()}`
                      : 'Flat ₦500'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentBtn, !isDelivery && styles.segmentBtnActive]}
                  onPress={() => cartStore.setFulfillmentType('pickup')}
                  activeOpacity={0.8}
                  testID="cart-fulfillment-pickup-btn"
                >
                  <Text style={[styles.segmentText, !isDelivery && styles.segmentTextActive]}>
                    🏬 King Jaja Pickup
                  </Text>
                  <Text style={[styles.segmentBadge, !isDelivery && styles.segmentBadgeActive]}>
                    FREE
                  </Text>
                </TouchableOpacity>
              </View>

              {isDelivery ? (
                <View style={styles.deliveryDetailsSection}>
                  <Text style={styles.fieldLabel}>Delivery Landmark:</Text>
                  <TouchableOpacity
                    style={styles.landmarkSelectorBtn}
                    onPress={() => setLandmarkPickerVisible(true)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.landmarkBtnTextContainer}>
                      <Text style={styles.selectedLandmarkName}>
                        📍 {cartState.selectedLandmark ? cartState.selectedLandmark.name : 'Select Landmark'}
                      </Text>
                      <Text style={styles.selectedLandmarkFee}>
                        ₦{cartState.deliveryFee.toLocaleString()} (est.)
                      </Text>
                    </View>
                    <Text style={styles.changeTag}>Change ▾</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.savedAddressesTriggerBtn}
                    onPress={() => setSavedAddressesVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.savedAddressesTriggerText}>
                      🏷️ Choose from Saved Addresses
                    </Text>
                  </TouchableOpacity>

                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Room / Detailed Address:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. King Jaja Hall, Block A, Room 14"
                    placeholderTextColor={Colors.textSecondary}
                    selectionColor={Colors.primaryRed}
                    value={cartState.deliveryAddress}
                    onChangeText={(val) => cartStore.setDeliveryDetails(val, cartState.deliveryNotes)}
                  />

                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Delivery Instructions:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Call when outside the hall gate"
                    placeholderTextColor={Colors.textSecondary}
                    selectionColor={Colors.primaryRed}
                    value={cartState.deliveryNotes}
                    onChangeText={(val) => cartStore.setDeliveryDetails(cartState.deliveryAddress, val)}
                  />
                </View>
              ) : (
                <View style={styles.pickupNotice}>
                  <Text style={styles.pickupNoticeTitle}>🏬 Free Pickup at AY Pizza Stand</Text>
                  <Text style={styles.pickupNoticeBody}>
                    Pick up directly from the kitchen opposite King Jaja Hall ({Brand.location.address}). Ready in ~15 mins. Delivery fee is strictly ₦0.
                  </Text>
                </View>
              )}
            </View>

            {/* Cart Items List */}
            <View style={styles.card}>
              <View style={styles.cartItemsHeader}>
                <Text style={styles.cardTitle}>2. Order Items</Text>
                <TouchableOpacity onPress={handleClearCart}>
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </TouchableOpacity>
              </View>

              {cartState.items.map((item) => (
                <View key={item.id} style={styles.cartItemRow} testID={`cart-item-${item.id}`}>
                  <View style={styles.itemThumbContainer}>
                    <Image
                      source={getProductImage(item.productName)}
                      style={styles.itemThumb}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={styles.itemMainInfo}>
                    {/* Header Row: Title & Size on left, Price on right */}
                    <View style={styles.itemHeaderRow}>
                      <View style={styles.itemNameBlock}>
                        <Text style={styles.itemTitle} numberOfLines={2}>
                          {item.productName}
                        </Text>
                        {item.sizeName && (
                          <View style={styles.sizePill}>
                            <Text style={styles.sizePillText}>{item.sizeName}</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.itemPriceColumn}>
                        <Text style={styles.itemPriceTotal}>
                          ₦{item.lineTotal.toLocaleString()}
                        </Text>
                        {item.quantity > 1 && (
                          <Text style={styles.itemPriceUnit}>
                            ₦{item.unitPrice.toLocaleString()} ea
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Invalid / Unavailable warning */}
                    {(item.isUnavailable || item.hasInvalidConfiguration) && (
                      <View style={styles.itemErrorBadge}>
                        <Text style={styles.itemErrorText}>
                          ⚠️ {item.validationError || 'Unavailable / Needs Reconfiguration'}
                        </Text>
                      </View>
                    )}

                    {/* Half & Half Breakdown */}
                    {item.halfSecondaryFlavor && (
                      <View style={styles.halfAndHalfTagContainer}>
                        <Text style={styles.halfAndHalfTagText}>
                          🍕 Half & Half: {item.productName} + {item.halfSecondaryFlavor}
                        </Text>
                      </View>
                    )}

                    {/* Flavors */}
                    {item.flavors && item.flavors.length > 0 && (
                      <Text style={styles.customizationTag}>
                        🍨 Flavors: {item.flavors.join(', ')}
                      </Text>
                    )}

                    {/* Toppings */}
                    {item.customizations
                      .filter((c) => !c.optionId.includes('half-and-half'))
                      .map((c, i) => (
                        <Text key={i} style={styles.customizationTag}>
                          + {c.optionName} (₦{c.price.toLocaleString()})
                        </Text>
                      ))}

                    {/* Special Instructions */}
                    {item.specialInstructions && (
                      <Text style={styles.instructionsText}>
                        {`📝 "${item.specialInstructions}"`}
                      </Text>
                    )}

                    {/* Stepper & Actions */}
                    <View style={styles.itemActionsRow}>
                      <View style={styles.stepper}>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => handleQuantityUpdate(item.id, item.quantity - 1)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Decrease quantity"
                          testID={`qty-minus-${item.id}`}
                        >
                          <Text style={styles.stepperBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepperQty} testID={`qty-value-${item.id}`}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => handleQuantityUpdate(item.id, item.quantity + 1)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Increase quantity"
                          testID={`qty-plus-${item.id}`}
                        >
                          <Text style={styles.stepperBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.itemActionButtons}>
                        <TouchableOpacity
                          style={styles.editBtn}
                          onPress={() => onEditItem(item)}
                          activeOpacity={0.8}
                          accessibilityLabel={`Edit ${item.productName}`}
                          testID={`edit-item-${item.id}`}
                        >
                          <Text style={styles.editBtnText}>Edit ⚙️</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleRemoveItem(item.id)}
                          activeOpacity={0.8}
                          accessibilityLabel={`Remove ${item.productName}`}
                          testID={`remove-item-${item.id}`}
                        >
                          <Text style={styles.deleteBtnText}>Remove 🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Estimated Financial Summary */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>3. Cost Estimation</Text>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Items Subtotal (est.):</Text>
                <Text style={styles.summaryValue}>₦{cartState.subtotal.toLocaleString()}</Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {isDelivery ? 'Delivery Fee (est.):' : 'Pickup Fee:'}
                </Text>
                <Text style={styles.summaryValue}>
                  {cartState.deliveryFee > 0
                    ? `₦${cartState.deliveryFee.toLocaleString()}`
                    : 'FREE'}
                </Text>
              </View>

              <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                <Text style={styles.summaryTotalLabel}>Estimated Order Total:</Text>
                <Text style={styles.summaryTotalValue}>
                  ₦{cartState.estimatedTotal.toLocaleString()}
                </Text>
              </View>

              {/* Campus Quality Notice */}
              <View style={styles.provisionalDisclaimer}>
                <Text style={styles.disclaimerTitle}>ℹ️ Freshly Baked on Campus</Text>
                <Text style={styles.disclaimerText}>
                  Every pizza is hand-stretched and baked hot opposite King Jaja Hall. Campus delivery fee is applied based on your selected UNILAG landmark.
                </Text>
              </View>

              {/* Checkout Readiness Status Card */}
              <View style={cartState.isReadyForCheckout ? styles.readyCard : styles.blockerCard}>
                <Text style={cartState.isReadyForCheckout ? styles.readyTitle : styles.blockerTitle}>
                  {cartState.isReadyForCheckout ? '✅ Ready for Checkout' : '⚠️ Checkout Requirements'}
                </Text>
                {cartState.isReadyForCheckout ? (
                  <Text style={styles.readyText}>
                    All items and fulfillment details are verified. Ready to proceed to payment.
                  </Text>
                ) : (
                  <View style={styles.blockersList}>
                    {cartState.checkoutBlockers.map((b, idx) => (
                      <Text key={idx} style={styles.blockerItem}>• {b}</Text>
                    ))}
                  </View>
                )}
              </View>

              {/* Proceed to Checkout CTA */}
              {cartState.isReadyForCheckout && (
                <TouchableOpacity
                  style={styles.checkoutBtn}
                  onPress={onProceedToCheckout}
                  activeOpacity={0.8}
                >
                  <Text style={styles.checkoutBtnText}>
                    Proceed to Checkout (₦{cartState.estimatedTotal.toLocaleString()}) 🛍️
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Landmark Selector Modal */}
      <LandmarkPickerModal
        visible={landmarkPickerVisible}
        selectedLandmark={cartState.selectedLandmark}
        onSelectLandmark={(landmark: DeliveryLandmark) => cartStore.setLandmark(landmark)}
        onClose={() => setLandmarkPickerVisible(false)}
      />

      {/* Saved Addresses Modal */}
      <SavedAddressesModal
        visible={savedAddressesVisible}
        userId={userId}
        onClose={() => setSavedAddressesVisible(false)}
        onSelectAddress={(addr) => {
          const lm = deliveryPricingEngine.findLandmark(addr.landmarkId);
          if (lm) {
            cartStore.setLandmark(lm);
          }
          cartStore.setDeliveryDetails(addr.detailedAddress, addr.deliveryNotes || '');
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.warmCream,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  staleBanner: {
    backgroundColor: Colors.softTomato,
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryRed,
    marginBottom: 16,
  },
  staleText: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '700',
  },
  priceChangeBanner: {
    backgroundColor: '#FFF7E6',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.goldenYellow,
    marginBottom: 16,
  },
  priceChangeInfo: {
    marginBottom: 8,
  },
  priceChangeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 4,
  },
  priceChangeText: {
    fontSize: 12,
    color: Colors.charcoal,
    lineHeight: 16,
  },
  acceptPriceBtn: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  acceptPriceBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // EMPTY CART SCREEN
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceCream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.charcoal,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    maxWidth: 300,
  },
  exploreBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    ...Shadows.card,
    marginBottom: 32,
  },
  exploreBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  suggestionsContainer: {
    width: '100%',
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  suggestionsHeaderRow: {
    marginBottom: 12,
  },
  suggestionsTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  suggestionsSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  suggestionsGrid: {
    gap: 10,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceCream,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  suggestionThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 10,
  },
  suggestionBody: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  suggestionName: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  suggestionPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryRed,
    marginTop: 2,
  },
  suggestionAddBtn: {
    backgroundColor: Colors.goldenYellow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  suggestionAddBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.charcoal,
  },

  // ACTIVE CART
  card: {
    backgroundColor: Colors.cardWhite,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 12,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.warmCream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primaryRed,
    borderColor: Colors.primaryRed,
    ...Shadows.card,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  segmentTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  segmentBadge: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '700',
    marginTop: 2,
  },
  segmentBadgeActive: {
    color: '#FFE2DE',
    fontWeight: '800',
  },
  deliveryDetailsSection: {
    marginTop: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.charcoal,
    marginBottom: 6,
  },
  landmarkSelectorBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.warmCream,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  landmarkBtnTextContainer: {
    flex: 1,
  },
  selectedLandmarkName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  selectedLandmarkFee: {
    fontSize: 11,
    color: Colors.primaryRed,
    fontWeight: '700',
    marginTop: 2,
  },
  changeTag: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryRed,
  },
  savedAddressesTriggerBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4C9BF',
    alignSelf: 'flex-start',
  },
  savedAddressesTriggerText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.chocolateBrown,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 11,
    minHeight: 44,
    color: '#1F1F1F',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#D4C9BF',
  },
  pickupNotice: {
    backgroundColor: Colors.surfaceCream,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  pickupNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 4,
  },
  pickupNoticeBody: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  cartItemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearBtnText: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '700',
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  itemThumbContainer: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceCream,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexShrink: 0,
  },
  itemThumb: {
    width: '100%',
    height: '100%',
  },
  itemMainInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  itemNameBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginRight: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
    flexShrink: 1,
  },
  sizePill: {
    backgroundColor: '#FFF1EF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(201, 35, 43, 0.2)',
    flexShrink: 0,
  },
  sizePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primaryRed,
  },
  itemPriceColumn: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    flexShrink: 0,
    paddingLeft: 4,
  },
  itemPriceTotal: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.primaryRed,
    textAlign: 'right',
  },
  itemPriceUnit: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
    textAlign: 'right',
  },
  itemErrorBadge: {
    backgroundColor: Colors.softTomato,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 4,
  },
  itemErrorText: {
    fontSize: 11,
    color: Colors.primaryRed,
    fontWeight: '700',
  },
  halfAndHalfTagContainer: {
    backgroundColor: '#FFF8EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(244, 179, 35, 0.3)',
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  halfAndHalfTagText: {
    fontSize: 11,
    color: Colors.charcoal,
    fontWeight: '700',
  },
  customizationTag: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 15,
  },
  instructionsText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: Colors.textMuted,
    marginTop: 3,
    lineHeight: 15,
  },
  itemActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginTop: 10,
    rowGap: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warmCream,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    height: 32,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.charcoal,
    lineHeight: 18,
  },
  stepperQty: {
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  itemActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editBtn: {
    backgroundColor: Colors.warmCream,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  deleteBtn: {
    backgroundColor: Colors.softTomato,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  summaryRowTotal: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 10,
    marginTop: 6,
  },
  summaryTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  summaryTotalValue: {
    fontSize: 19,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  provisionalDisclaimer: {
    backgroundColor: Colors.surfaceCream,
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  disclaimerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 2,
  },
  disclaimerText: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  readyCard: {
    backgroundColor: '#F0FFF4',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C6F6D5',
    marginTop: 10,
  },
  readyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#22543D',
    marginBottom: 2,
  },
  readyText: {
    fontSize: 11,
    color: '#276749',
  },
  blockerCard: {
    backgroundColor: Colors.softTomato,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(201, 35, 43, 0.25)',
    marginTop: 10,
  },
  blockerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryRed,
    marginBottom: 4,
  },
  blockersList: {
    gap: 2,
  },
  blockerItem: {
    fontSize: 11,
    color: Colors.primaryRed,
    fontWeight: '600',
  },
  checkoutBtn: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 14,
    borderRadius: Radius.pill,
    alignItems: 'center',
    marginTop: 14,
    ...Shadows.card,
  },
  checkoutBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
