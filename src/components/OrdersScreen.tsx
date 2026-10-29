import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors } from '../constants/colors';
import { GuestReceiptStore, GuestReceiptRecord } from '../domains/order/guest-receipt-store';
import { Order, OrderStatus } from '../types/order';
import { orderService } from '../domains/order/order-service';
import { cartStore } from '../domains/cart/cart-store';
import { Product } from '../types/catalog';
import { OrderTrackingModal } from './OrderTrackingModal';

interface OrdersScreenProps {
  userId?: string | null;
  catalogProducts: Product[];
  onExploreMenu: () => void;
  onNavigateToCart: () => void;
}

export const OrdersScreen: React.FC<OrdersScreenProps> = ({
  userId,
  catalogProducts,
  onExploreMenu,
  onNavigateToCart,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [loading, setLoading] = useState(true);
  const [guestReceipts, setGuestReceipts] = useState<GuestReceiptRecord[]>([]);
  const [fetchedOrders, setFetchedOrders] = useState<Map<string, Order>>(new Map());
  const [selectedOrderForTracking, setSelectedOrderForTracking] = useState<{
    orderId: string;
    receiptToken: string;
  } | null>(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const receipts = await GuestReceiptStore.getAllReceipts();
      setGuestReceipts(receipts);

      // Fetch verified order details for up to 10 most recent receipts
      const orderMap = new Map<string, Order>();
      const promises = receipts.slice(0, 10).map(async (rec) => {
        try {
          const res = await orderService.getOrderReceipt(rec.orderId, rec.receiptToken);
          if (res.success && res.order) {
            orderMap.set(rec.orderId, res.order);
          }
        } catch {
          // Fallback to minimal placeholder if offline
        }
      });

      await Promise.all(promises);
      setFetchedOrders(orderMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [userId]);

  const isOrderTerminal = (status?: OrderStatus): boolean => {
    return status === 'DELIVERED' || status === 'CANCELLED';
  };

  // Group into Active vs History
  const activeReceipts = guestReceipts.filter((rec) => {
    const order = fetchedOrders.get(rec.orderId);
    if (!order) return true; // Default to active if unknown
    return !isOrderTerminal(order.status);
  });

  const historyReceipts = guestReceipts.filter((rec) => {
    const order = fetchedOrders.get(rec.orderId);
    if (!order) return false;
    return isOrderTerminal(order.status);
  });

  const displayList = activeTab === 'active' ? activeReceipts : historyReceipts;

  const handleReorder = useCallback(async (order?: Order) => {
    if (!order || !order.items || order.items.length === 0) {
      Alert.alert('Reorder', 'Could not retrieve items from this past order.');
      return;
    }

    let addedCount = 0;
    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      const liveProduct = catalogProducts.find((p) => p.id === item.productId);
      if (liveProduct && liveProduct.isAvailable) {
        await cartStore.addItem({
          id: `reorder_${order.id}_${item.productId}_${i}`,
          productId: liveProduct.id,
          productName: liveProduct.name,
          categorySlug: liveProduct.categorySlug,
          imageUrl: liveProduct.imageUrl || null,
          sizeId: item.sizeName ? liveProduct.sizes?.find((s) => s.name === item.sizeName)?.id : undefined,
          sizeName: item.sizeName || undefined,
          sizePrice: item.sizePrice || 0,
          quantity: item.quantity,
          basePrice: item.basePrice,
          unitPrice: item.basePrice + (item.sizePrice || 0),
          lineTotal: (item.basePrice + (item.sizePrice || 0)) * item.quantity,
          customizations: item.customizations || [],
          halfSecondaryFlavor: item.halfSecondaryFlavor || undefined,
          specialInstructions: item.specialInstructions || undefined,
          itemHash: `reorder_${order.id}_${liveProduct.id}_${i}`,
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      Alert.alert(
        'Added to Cart! 🛒',
        `Reordered ${addedCount} available item(s) from Order #${order.orderNumber}.`,
        [
          { text: 'View Cart', onPress: onNavigateToCart },
          { text: 'OK', style: 'cancel' },
        ]
      );
    } else {
      Alert.alert('Notice', 'The items in this order are currently out of stock in today’s catalog.');
    }
  }, [catalogProducts, onNavigateToCart]);

  const getStatusBadge = (status?: OrderStatus) => {
    switch (status) {
      case 'CONFIRMED':
        return { label: 'Confirmed 💳', bg: '#FFF3DD', text: Colors.charcoal };
      case 'ACCEPTED':
        return { label: 'Kitchen Accepted 👨‍🍳', bg: '#FFF1EF', text: Colors.primaryRed };
      case 'PREPARING':
        return { label: 'In Pizza Oven 🔥', bg: '#FFF1EF', text: Colors.primaryRed };
      case 'READY_FOR_PICKUP':
        return { label: 'Ready for Pickup 📦', bg: '#EBF8F0', text: Colors.freshGreen };
      case 'IN_TRANSIT':
        return { label: 'Courier On Way 🛵', bg: '#F3E8FF', text: '#7C3AED' };
      case 'DELIVERED':
        return { label: 'Completed ✅', bg: '#EBF8F0', text: Colors.freshGreen };
      case 'CANCELLED':
        return { label: 'Cancelled 🚫', bg: Colors.softTomato, text: Colors.primaryRed };
      default:
        return { label: 'Processing ⏱️', bg: '#FFF3DD', text: Colors.charcoal };
    }
  };

  return (
    <View style={styles.container}>
      {/* Tab Segment Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'active' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('active')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, activeTab === 'active' && styles.segmentTextActive]}>
            Active Orders ({activeReceipts.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'history' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, activeTab === 'history' && styles.segmentTextActive]}>
            Order History ({historyReceipts.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryRed} />
            <Text style={styles.loadingText}>Fetching order receipts...</Text>
          </View>
        ) : displayList.length === 0 ? (
          /* EMPTY STATE */
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🍕</Text>
            <Text style={styles.emptyTitle}>
              {activeTab === 'active' ? 'No Active Orders' : 'No Order History Yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'active'
                ? 'When you order delicious pizza, you can track baking and delivery progression right here!'
                : 'Orders confirmed on this device or your account will be archived here for easy reordering.'}
            </Text>
            <TouchableOpacity style={styles.exploreBtn} onPress={onExploreMenu} activeOpacity={0.85}>
              <Text style={styles.exploreBtnText}>Browse AY Pizza Menu 🍕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ORDERS LIST */
          displayList.map((rec) => {
            const order = fetchedOrders.get(rec.orderId);
            const badge = getStatusBadge(order?.status);

            return (
              <View key={rec.orderId} style={styles.orderCard}>
                {/* Header */}
                <View style={styles.orderHeaderRow}>
                  <View>
                    <Text style={styles.orderNumberText}>Order #{rec.orderNumber}</Text>
                    <Text style={styles.orderDateText}>
                      {new Date(rec.savedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                      {badge.label}
                    </Text>
                  </View>
                </View>

                {/* Items & Details */}
                {order ? (
                  <View style={styles.orderBody}>
                    <View style={styles.itemsSummaryBox}>
                      {order.items?.map((item, idx) => (
                        <Text key={idx} style={styles.itemLine}>
                          {item.quantity}x {item.productName}
                          {item.sizeName ? ` (${item.sizeName})` : ''}
                        </Text>
                      ))}
                    </View>

                    <View style={styles.fulfillmentRow}>
                      <Text style={styles.fulfillmentText}>
                        {order.fulfillmentType === 'delivery'
                          ? `🛵 Campus Delivery to ${order.landmarkName || 'UNILAG'}`
                          : '🏬 Pickup at King Jaja Hall'}
                      </Text>
                      <Text style={styles.totalPriceText}>
                        ₦{order.total.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.orderBody}>
                    <Text style={styles.loadingOrderNotice}>
                      Verified Secure Order Record
                    </Text>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.orderFooterActions}>
                  {activeTab === 'active' ? (
                    <TouchableOpacity
                      style={styles.trackLiveBtn}
                      onPress={() =>
                        setSelectedOrderForTracking({
                          orderId: rec.orderId,
                          receiptToken: rec.receiptToken,
                        })
                      }
                      activeOpacity={0.85}
                    >
                      <Text style={styles.trackLiveBtnText}>Track Order Live 📡</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.reorderBtn}
                      onPress={() => handleReorder(order)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.reorderBtnText}>Reorder Items 🔄</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.detailsBtn}
                    onPress={() =>
                      setSelectedOrderForTracking({
                        orderId: rec.orderId,
                        receiptToken: rec.receiptToken,
                      })
                    }
                    activeOpacity={0.8}
                  >
                    <Text style={styles.detailsBtnText}>View Receipt 🧾</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Tracking Modal */}
      <OrderTrackingModal
        visible={Boolean(selectedOrderForTracking)}
        orderId={selectedOrderForTracking?.orderId || ''}
        receiptToken={selectedOrderForTracking?.receiptToken || ''}
        onClose={() => {
          setSelectedOrderForTracking(null);
          loadOrders();
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
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.08)',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: Colors.warmCream,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  segmentTextActive: {
    color: Colors.primaryRed,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 54,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
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
    maxWidth: 290,
  },
  exploreBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  exploreBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderNumberText: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  orderDateText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  orderBody: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.06)',
  },
  itemsSummaryBox: {
    marginBottom: 8,
  },
  itemLine: {
    fontSize: 13,
    color: Colors.charcoal,
    fontWeight: '600',
    marginBottom: 2,
  },
  fulfillmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  fulfillmentText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  totalPriceText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  loadingOrderNotice: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  orderFooterActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  trackLiveBtn: {
    flex: 1,
    backgroundColor: Colors.primaryRed,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  trackLiveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  reorderBtn: {
    flex: 1,
    backgroundColor: Colors.warmCream,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primaryRed,
  },
  reorderBtnText: {
    color: Colors.primaryRed,
    fontSize: 13,
    fontWeight: '800',
  },
  detailsBtn: {
    backgroundColor: Colors.warmCream,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  detailsBtnText: {
    color: Colors.charcoal,
    fontSize: 12,
    fontWeight: '700',
  },
});
