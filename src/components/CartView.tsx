import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Brand } from '../constants/brand';
import { CartState, CartItem } from '../domains/cart/cart-types';
import { cartStore } from '../domains/cart/cart-store';
import { DeliveryLandmark } from '../types/delivery';
import { LandmarkPickerModal } from './LandmarkPickerModal';

interface CartViewProps {
  cartState: CartState;
  onExploreMenu: () => void;
  onEditItem: (item: CartItem) => void;
  onProceedToCheckout?: () => void;
}

export const CartView: React.FC<CartViewProps> = ({
  cartState,
  onExploreMenu,
  onEditItem,
  onProceedToCheckout,
}) => {
  const [landmarkPickerVisible, setLandmarkPickerVisible] = useState(false);

  const hasItems = cartState.items.length > 0;
  const isDelivery = cartState.fulfillmentType === 'delivery';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🛒</Text>
            <Text style={styles.emptyTitle}>Your cart is currently empty</Text>
            <Text style={styles.emptySubtitle}>
              Explore our freshly baked artisan pizzas, rich thick shakes, and soft-serve ice cream!
            </Text>
            <TouchableOpacity style={styles.exploreBtn} onPress={onExploreMenu} activeOpacity={0.8}>
              <Text style={styles.exploreBtnText}>Browse AY Pizza Menu 🍕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Active Cart State */
          <>
            {/* Fulfillment Selector */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>1. Fulfillment Method</Text>
              <View style={styles.segmentedRow}>
                <TouchableOpacity
                  style={[styles.segmentBtn, isDelivery && styles.segmentBtnActive]}
                  onPress={() => cartStore.setFulfillmentType('delivery')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, isDelivery && styles.segmentTextActive]}>
                    🛵 Campus Delivery
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentBtn, !isDelivery && styles.segmentBtnActive]}
                  onPress={() => cartStore.setFulfillmentType('pickup')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, !isDelivery && styles.segmentTextActive]}>
                    🏬 King Jaja Pickup
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

                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Room / Detailed Address:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. King Jaja Hall, Block A, Room 14"
                    placeholderTextColor="rgba(255, 232, 214, 0.4)"
                    value={cartState.deliveryAddress}
                    onChangeText={(val) => cartStore.setDeliveryDetails(val, cartState.deliveryNotes)}
                  />

                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Delivery Instructions:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Call when outside the hall gate"
                    placeholderTextColor="rgba(255, 232, 214, 0.4)"
                    value={cartState.deliveryNotes}
                    onChangeText={(val) => cartStore.setDeliveryDetails(cartState.deliveryAddress, val)}
                  />
                </View>
              ) : (
                <View style={styles.pickupNotice}>
                  <Text style={styles.pickupNoticeTitle}>🏬 Free Pickup at AY Pizza</Text>
                  <Text style={styles.pickupNoticeBody}>
                    Pick up directly from the kitchen at {Brand.location.address}. Delivery fee is ₦0.
                  </Text>
                </View>
              )}
            </View>

            {/* Cart Items List */}
            <View style={styles.card}>
              <View style={styles.cartItemsHeader}>
                <Text style={styles.cardTitle}>2. Order Items</Text>
                <TouchableOpacity onPress={() => cartStore.clearCart()}>
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </TouchableOpacity>
              </View>

              {cartState.items.map((item) => (
                <View key={item.id} style={styles.cartItemRow}>
                  <View style={styles.itemMainInfo}>
                    <View style={styles.itemNameRow}>
                      <Text style={styles.itemTitle}>{item.productName}</Text>
                      {item.sizeName && (
                        <View style={styles.sizePill}>
                          <Text style={styles.sizePillText}>{item.sizeName}</Text>
                        </View>
                      )}
                    </View>

                    {/* Invalid / Unavailable warning */}
                    {(item.isUnavailable || item.hasInvalidConfiguration) && (
                      <View style={styles.itemErrorBadge}>
                        <Text style={styles.itemErrorText}>
                          ⚠️ {item.validationError || 'Unavailable / Needs Reconfiguration'}
                        </Text>
                      </View>
                    )}

                    {/* Customizations tags */}
                    {item.halfSecondaryFlavor && (
                      <Text style={styles.customizationTag}>
                        🍕 Half & Half: {item.halfSecondaryFlavor}
                      </Text>
                    )}

                    {item.flavors && item.flavors.length > 0 && (
                      <Text style={styles.customizationTag}>
                        🍨 Flavors: {item.flavors.join(', ')}
                      </Text>
                    )}

                    {item.customizations
                      .filter((c) => !c.optionId.includes('half-and-half'))
                      .map((c, i) => (
                        <Text key={i} style={styles.customizationTag}>
                          + {c.optionName} (₦{c.price.toLocaleString()})
                        </Text>
                      ))}

                    {item.specialInstructions && (
                      <Text style={styles.instructionsText}>
                        📝 "{item.specialInstructions}"
                      </Text>
                    )}

                    {/* Stepper & Actions */}
                    <View style={styles.itemActionsRow}>
                      <View style={styles.stepper}>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => cartStore.updateQuantity(item.id, item.quantity - 1)}
                        >
                          <Text style={styles.stepperBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepperQty}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => cartStore.updateQuantity(item.id, item.quantity + 1)}
                        >
                          <Text style={styles.stepperBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => onEditItem(item)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.editBtnText}>Edit ⚙️</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => cartStore.removeItem(item.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.deleteBtnText}>Remove 🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.itemPriceColumn}>
                    <Text style={styles.itemPriceTotal}>
                      ₦{item.lineTotal.toLocaleString()}
                    </Text>
                    <Text style={styles.itemPriceUnit}>
                      ₦{item.unitPrice.toLocaleString()} each
                    </Text>
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

              {/* Provisional Notice */}
              <View style={styles.provisionalDisclaimer}>
                <Text style={styles.disclaimerTitle}>ℹ️ Provisional Price Notice</Text>
                <Text style={styles.disclaimerText}>
                  All displayed item totals and delivery fees are database-provided provisional estimates.
                  Final payment amounts will be validated authoritatively server-side via Supabase at checkout.
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  exploreBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
  },
  exploreBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  card: {
    backgroundColor: Colors.cardWhite,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
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
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: Colors.warmCream,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primaryRed,
    borderColor: Colors.primaryRed,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  segmentTextActive: {
    color: '#ffffff',
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
  textInput: {
    backgroundColor: Colors.warmCream,
    borderRadius: 10,
    padding: 10,
    color: Colors.charcoal,
    fontSize: 13,
    borderWidth: 1,
    borderColor: Colors.borderLight,
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
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  itemMainInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
    marginRight: 8,
  },
  sizePill: {
    backgroundColor: '#FFF1EF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(201, 35, 43, 0.2)',
  },
  sizePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primaryRed,
  },
  customizationTag: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  instructionsText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: Colors.textMuted,
    marginTop: 3,
  },
  itemActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warmCream,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  stepperQty: {
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  editBtn: {
    backgroundColor: Colors.warmCream,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  editBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  deleteBtn: {
    backgroundColor: Colors.softTomato,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  itemPriceColumn: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  itemPriceTotal: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  itemPriceUnit: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
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
    marginTop: 6,
    paddingTop: 10,
  },
  summaryTotalLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  summaryTotalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  provisionalDisclaimer: {
    backgroundColor: Colors.surfaceCream,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginTop: 14,
  },
  disclaimerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 4,
  },
  disclaimerText: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  phase2Notice: {
    backgroundColor: 'rgba(40, 122, 75, 0.08)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(40, 122, 75, 0.2)',
    marginTop: 12,
  },
  phase2NoticeText: {
    fontSize: 11,
    color: Colors.freshGreen,
    fontWeight: '700',
    textAlign: 'center',
  },
  priceChangeBanner: {
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: Colors.goldenYellow,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  priceChangeInfo: {
    marginBottom: 10,
  },
  priceChangeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#996500',
    marginBottom: 4,
  },
  priceChangeText: {
    fontSize: 12,
    color: Colors.charcoal,
    lineHeight: 18,
  },
  acceptPriceBtn: {
    backgroundColor: Colors.goldenYellow,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  acceptPriceBtnText: {
    color: Colors.charcoal,
    fontSize: 12,
    fontWeight: '800',
  },
  itemErrorBadge: {
    backgroundColor: Colors.softTomato,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  itemErrorText: {
    fontSize: 11,
    color: Colors.primaryRed,
    fontWeight: '800',
  },
  readyCard: {
    backgroundColor: 'rgba(40, 122, 75, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(40, 122, 75, 0.3)',
    padding: 12,
    marginTop: 12,
  },
  readyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.freshGreen,
    marginBottom: 4,
  },
  readyText: {
    fontSize: 12,
    color: Colors.charcoal,
  },
  blockerCard: {
    backgroundColor: Colors.softTomato,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(201, 35, 43, 0.3)',
    padding: 12,
    marginTop: 12,
  },
  blockerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primaryRed,
    marginBottom: 6,
  },
  blockersList: {
    gap: 4,
  },
  blockerItem: {
    fontSize: 11,
    color: Colors.primaryRed,
    lineHeight: 16,
  },
  checkoutBtn: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  checkoutBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});
