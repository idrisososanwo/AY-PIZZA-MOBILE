import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Colors } from '../constants/colors';
import { GuestReceiptStore, GuestReceiptRecord } from '../domains/order/guest-receipt-store';
import { Order, OrderStatus } from '../types/order';
import { orderService } from '../domains/order/order-service';
import { cartStore } from '../domains/cart/cart-store';
import { Product } from '../types/catalog';
import { OrderTrackingModal } from './OrderTrackingModal';
import { OrderReceiptModal } from './OrderReceiptModal';
import { CancelOrderConfirmationModal } from './CancelOrderConfirmationModal';

interface OrdersScreenProps {
  userId?: string | null;
  catalogProducts: Product[];
  onExploreMenu: () => void;
  onNavigateToCart: () => void;
}

interface UnifiedOrderEntry {
  orderId: string;
  orderNumber: string;
  savedAt: string;
  receiptToken?: string;
}

export const OrdersScreen: React.FC<OrdersScreenProps> = ({
  userId,
  catalogProducts,
  onExploreMenu,
  onNavigateToCart,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'cancelled'>('active');
  const [loading, setLoading] = useState(true);
  const [orderEntries, setOrderEntries] = useState<UnifiedOrderEntry[]>([]);
  const [fetchedOrders, setFetchedOrders] = useState<Map<string, Order>>(new Map());
  const [selectedOrderForTracking, setSelectedOrderForTracking] = useState<{
    orderId: string;
    receiptToken: string;
  } | null>(null);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<{
    order: Order;
    receiptToken: string;
  } | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<{
    orderId: string;
    orderNumber: string;
    orderTotal: number;
    receiptToken: string;
  } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const guestReceipts: GuestReceiptRecord[] = await GuestReceiptStore.getAllReceipts();
      const orderMap = new Map<string, Order>();
      const entryMap = new Map<string, UnifiedOrderEntry>();

      // Register guest receipts
      for (const rec of guestReceipts) {
        entryMap.set(rec.orderId, {
          orderId: rec.orderId,
          orderNumber: rec.orderNumber,
          savedAt: rec.savedAt,
          receiptToken: rec.receiptToken,
        });
      }

      // If customer is authenticated, fetch their database orders scoped strictly by customer_id
      if (userId) {
        try {
          const custRes = await orderService.getCustomerOrders(userId);
          if (custRes.success && custRes.orders) {
            for (const order of custRes.orders) {
              orderMap.set(order.id, order);
              if (!entryMap.has(order.id)) {
                entryMap.set(order.id, {
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  savedAt: order.createdAt,
                  receiptToken: undefined,
                });
              }
            }
          }
        } catch {
          // Continue gracefully with local records
        }
      }

      // Fetch verified order details for up to 10 guest receipts not yet loaded
      const pendingGuestReceipts = guestReceipts
        .filter((rec) => !orderMap.has(rec.orderId))
        .slice(0, 10);

      const promises = pendingGuestReceipts.map(async (rec) => {
        try {
          const res = await orderService.getOrderReceipt(rec.orderId, rec.receiptToken);
          if (res.success && res.order) {
            orderMap.set(rec.orderId, res.order);
          }
        } catch {
          // Graceful fallback for offline / mock states
        }
      });

      await Promise.all(promises);

      // Sort unified entries by timestamp descending
      const sortedEntries = Array.from(entryMap.values()).sort(
        (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      );

      setOrderEntries(sortedEntries);
      setFetchedOrders(orderMap);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  }, [loadOrders]);

  // Group into Active, Completed, Cancelled
  const activeEntries = orderEntries.filter((rec) => {
    const order = fetchedOrders.get(rec.orderId);
    if (!order) return true; // Default to active if still loading
    return order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && order.status !== 'REFUNDED';
  });

  const completedEntries = orderEntries.filter((rec) => {
    const order = fetchedOrders.get(rec.orderId);
    return order?.status === 'DELIVERED';
  });

  const cancelledEntries = orderEntries.filter((rec) => {
    const order = fetchedOrders.get(rec.orderId);
    return order?.status === 'CANCELLED' || order?.status === 'REFUNDED';
  });

  const displayList =
    activeTab === 'active'
      ? activeEntries
      : activeTab === 'completed'
      ? completedEntries
      : cancelledEntries;

  const handleReorder = useCallback(
    async (order?: Order) => {
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
            sizeId: item.sizeName
              ? liveProduct.sizes?.find((s) => s.name === item.sizeName)?.id
              : undefined,
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
    },
    [catalogProducts, onNavigateToCart]
  );

  const handleViewReceipt = async (rec: UnifiedOrderEntry) => {
    const token = rec.receiptToken || '';
    const existing = fetchedOrders.get(rec.orderId);
    if (existing) {
      setSelectedReceiptOrder({ order: existing, receiptToken: token });
      return;
    }

    try {
      setLoading(true);
      const res = await orderService.getOrderReceipt(rec.orderId, token);
      if (res.success && res.order) {
        setFetchedOrders((prev) => new Map(prev).set(rec.orderId, res.order!));
        setSelectedReceiptOrder({ order: res.order, receiptToken: token });
      } else {
        Alert.alert('Notice', res.error || 'Could not retrieve digital receipt.');
      }
    } catch {
      Alert.alert('Notice', 'Network error retrieving digital receipt.');
    } finally {
      setLoading(false);
    }
  };

  // Keep reopened receipt order status synchronized with kitchen transitions in real-time
  useEffect(() => {
    if (!selectedReceiptOrder?.order?.id) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await orderService.getOrderReceipt(
          selectedReceiptOrder.order.id,
          selectedReceiptOrder.receiptToken
        );
        if (isMounted && res.success && res.order) {
          setSelectedReceiptOrder((prev) => {
            if (!prev || prev.order.id !== res.order!.id) return prev;
            if (prev.order.status !== res.order!.status || prev.order.refundStatus !== res.order!.refundStatus) {
              return { ...prev, order: res.order! };
            }
            return prev;
          });
          setFetchedOrders((prev) => new Map(prev).set(res.order!.id, res.order!));
        }
      } catch {
        // Ignored during background polling
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedReceiptOrder?.order?.id, selectedReceiptOrder?.receiptToken]);

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
      case 'REFUNDED':
        return { label: 'Refunded 💳', bg: '#EBF8F0', text: Colors.freshGreen };
      default:
        return { label: 'Processing ⏱️', bg: '#FFF3DD', text: Colors.charcoal };
    }
  };

  const getPaymentStatusText = (order?: Order) => {
    if (!order) return 'Verified Record';
    if (order.status === 'REFUNDED') return 'Refund Confirmed ✅';
    if (order.status === 'CANCELLED') {
      if (order.refundStatus === 'REFUNDED') return 'Refund Confirmed ✅';
      if (order.refundStatus === 'REFUND_REQUIRED' || order.refundStatus === 'REFUND_PENDING') {
        return 'Refund Pending Review ⏳';
      }
      return 'Payment Cancelled';
    }
    if (
      [
        'CONFIRMED',
        'ACCEPTED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'IN_TRANSIT',
        'DELIVERED',
      ].includes(order.status)
    ) {
      return 'Paid via Paystack ✅';
    }
    return 'Payment Pending ⏳';
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
            Active ({activeEntries.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'completed' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('completed')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, activeTab === 'completed' && styles.segmentTextActive]}>
            Completed ({completedEntries.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'cancelled' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('cancelled')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, activeTab === 'cancelled' && styles.segmentTextActive]}>
            Cancelled ({cancelledEntries.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[Colors.primaryRed]}
            tintColor={Colors.primaryRed}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryRed} />
            <Text style={styles.loadingText}>Fetching order receipts...</Text>
          </View>
        ) : displayList.length === 0 ? (
          /* EMPTY STATE */
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{activeTab === 'cancelled' ? '🚫' : '🍕'}</Text>
            <Text style={styles.emptyTitle}>
              {activeTab === 'active'
                ? 'No Active Orders'
                : activeTab === 'completed'
                ? 'No Completed Orders Yet'
                : 'No Cancelled Orders'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'active'
                ? 'When you order delicious pizza, you can track baking and delivery progression right here!'
                : activeTab === 'completed'
                ? 'Orders confirmed on this device or your account will be archived here for easy receipt viewing and reordering.'
                : 'Orders cancelled prior to kitchen acceptance or refunded appear here.'}
            </Text>
            {activeTab !== 'cancelled' && (
              <TouchableOpacity style={styles.exploreBtn} onPress={onExploreMenu} activeOpacity={0.85}>
                <Text style={styles.exploreBtnText}>Browse AY Pizza Menu 🍕</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          /* ORDERS LIST */
          displayList.map((rec) => {
            const order = fetchedOrders.get(rec.orderId);
            const badge = getStatusBadge(order?.status);
            const paymentStatusText = getPaymentStatusText(order);

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
                      <Text style={styles.totalPriceText}>₦{order.total.toLocaleString()}</Text>
                    </View>

                    {/* Payment Status Label */}
                    <View style={styles.paymentStatusRow}>
                      <Text style={styles.paymentStatusLabel}>Payment:</Text>
                      <Text style={styles.paymentStatusValue}>{paymentStatusText}</Text>
                    </View>

                    {/* Cancellation & Accurate Refund Details */}
                    {(order.status === 'CANCELLED' || order.status === 'REFUNDED') && (
                      <View style={styles.cancelledCallout}>
                        <Text style={styles.cancelledReasonText}>
                          Reason: {order.rejectionReason || 'Cancelled before kitchen acceptance'}
                        </Text>
                        {order.refundStatus &&
                          order.refundStatus !== 'NOT_APPLICABLE' && (
                            <Text style={styles.cancelledRefundText}>
                              💳{' '}
                              {order.refundStatus === 'REFUNDED'
                                ? 'Refund Confirmed to Original Payment Method ✅'
                                : 'Refund Processing — Manager Review in Progress ⏳'}
                            </Text>
                          )}
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.orderBody}>
                    <Text style={styles.loadingOrderNotice}>Verified Secure Order Record</Text>
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
                          receiptToken: rec.receiptToken || '',
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
                    onPress={() => handleViewReceipt(rec)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.detailsBtnText}>
                      {activeTab === 'cancelled' ? 'View Details 🧾' : 'View Receipt 🧾'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Cancel Order (Eligible strictly while in CONFIRMED pre-kitchen acceptance status) */}
                {activeTab === 'active' &&
                  order?.status === 'CONFIRMED' && (
                  <TouchableOpacity
                    style={styles.cancelOrderBtn}
                    onPress={() =>
                      setCancellingOrder({
                        orderId: rec.orderId,
                        orderNumber: rec.orderNumber,
                        orderTotal: order?.total ?? 0,
                        receiptToken: rec.receiptToken || '',
                      })
                    }
                    activeOpacity={0.8}
                    testID={`order-cancel-btn-${rec.orderId}`}
                  >
                    <Text style={styles.cancelOrderBtnText}>Cancel Order ✕</Text>
                  </TouchableOpacity>
                )}
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

      {/* Digital Order Receipt Modal */}
      {selectedReceiptOrder && (
        <OrderReceiptModal
          visible={Boolean(selectedReceiptOrder)}
          orderNumber={selectedReceiptOrder.order.orderNumber}
          paymentReference={selectedReceiptOrder.order.paymentReference || ''}
          receiptToken={selectedReceiptOrder.receiptToken}
          customerName={selectedReceiptOrder.order.guestName || ''}
          fulfillmentType={selectedReceiptOrder.order.fulfillmentType}
          landmarkName={selectedReceiptOrder.order.landmarkName || undefined}
          deliveryAddress={selectedReceiptOrder.order.deliveryAddress || undefined}
          items={selectedReceiptOrder.order.items || []}
          subtotal={selectedReceiptOrder.order.subtotal}
          deliveryFee={selectedReceiptOrder.order.deliveryFee}
          discountAmount={selectedReceiptOrder.order.discountAmount}
          total={selectedReceiptOrder.order.total}
          orderDate={selectedReceiptOrder.order.createdAt}
          orderStatus={selectedReceiptOrder.order.status}
          refundStatus={selectedReceiptOrder.order.refundStatus}
          acceptedAt={selectedReceiptOrder.order.acceptedAt}
          preparedAt={selectedReceiptOrder.order.preparedAt}
          readyAt={selectedReceiptOrder.order.readyAt}
          inTransitAt={selectedReceiptOrder.order.inTransitAt}
          completedAt={selectedReceiptOrder.order.completedAt}
          onDone={() => setSelectedReceiptOrder(null)}
          onTrackOrder={() => {
            const targetId = selectedReceiptOrder.order.id;
            const targetToken = selectedReceiptOrder.receiptToken;
            setSelectedReceiptOrder(null);
            setSelectedOrderForTracking({ orderId: targetId, receiptToken: targetToken });
          }}
          onCancelOrder={
            selectedReceiptOrder.order.status === 'CONFIRMED'
              ? () => {
                  const toCancel = {
                    orderId: selectedReceiptOrder.order.id,
                    orderNumber: selectedReceiptOrder.order.orderNumber,
                    orderTotal: selectedReceiptOrder.order.total,
                    receiptToken: selectedReceiptOrder.receiptToken,
                  };
                  setSelectedReceiptOrder(null);
                  setCancellingOrder(toCancel);
                }
              : undefined
          }
        />
      )}

      {/* Customer Cancellation Confirmation Modal */}
      {cancellingOrder && (
        <CancelOrderConfirmationModal
          visible={Boolean(cancellingOrder)}
          orderNumber={cancellingOrder.orderNumber}
          orderTotal={cancellingOrder.orderTotal}
          isCancelling={isCancelling}
          onClose={() => setCancellingOrder(null)}
          onConfirm={async (reason) => {
            try {
              setIsCancelling(true);
              const res = await orderService.cancelOrderByCustomer(
                cancellingOrder.orderId,
                cancellingOrder.receiptToken,
                reason
              );
              if (res.success) {
                setCancellingOrder(null);
                setSelectedReceiptOrder(null);
                await loadOrders();
                Alert.alert(
                  'Order Cancelled 🚫',
                  'Your order has been cancelled successfully. If payment was completed, a refund has been flagged for manager review.'
                );
              } else {
                Alert.alert('Cannot Cancel Order', res.error || 'The kitchen may have already accepted your order.');
                await loadOrders();
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to cancel order.');
            } finally {
              setIsCancelling(false);
            }
          }}
        />
      )}
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
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.primaryRed,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.charcoal,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
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
    lineHeight: 18,
    marginBottom: 20,
  },
  exploreBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
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
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderNumberText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  orderDateText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
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
    borderTopWidth: 1,
    borderTopColor: 'rgba(39, 33, 31, 0.06)',
    paddingTop: 10,
  },
  itemsSummaryBox: {
    marginBottom: 8,
  },
  itemLine: {
    fontSize: 13,
    color: Colors.charcoal,
    fontWeight: '600',
    marginBottom: 3,
  },
  fulfillmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(39, 33, 31, 0.06)',
  },
  fulfillmentText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  totalPriceText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  paymentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  paymentStatusLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginRight: 6,
    fontWeight: '600',
  },
  paymentStatusValue: {
    fontSize: 12,
    color: Colors.charcoal,
    fontWeight: '700',
  },
  cancelledCallout: {
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primaryRed,
  },
  cancelledReasonText: {
    fontSize: 11,
    color: Colors.primaryRed,
    fontWeight: '700',
  },
  cancelledRefundText: {
    fontSize: 11,
    color: '#991B1B',
    marginTop: 3,
    fontWeight: '600',
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
    minHeight: 44,
    justifyContent: 'center',
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
    minHeight: 44,
    justifyContent: 'center',
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
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  detailsBtnText: {
    color: Colors.charcoal,
    fontSize: 12,
    fontWeight: '700',
  },
  cancelOrderBtn: {
    marginTop: 8,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelOrderBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
});
