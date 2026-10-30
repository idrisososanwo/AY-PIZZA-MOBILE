/**
 * AY Pizza — Customer Order Tracking Modal
 * 
 * Provides live, authoritative order status tracking, progression timelines,
 * fulfillment guidance (pickup vs delivery), itemized summaries, and append-only
 * event history with Supabase Realtime synchronization.
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { OrderStatus } from '../types/order';
import { orderTrackingService, TrackingState } from '../domains/order/order-tracking-service';
import { notificationService, NotificationPermissionState } from '../domains/notifications/notification-service';

interface OrderTrackingModalProps {
  visible: boolean;
  orderId: string;
  receiptToken: string;
  onClose: () => void;
}

interface MilestoneStep {
  status: OrderStatus;
  label: string;
  emoji: string;
  description: string;
}

const PICKUP_MILESTONES: MilestoneStep[] = [
  { status: 'CONFIRMED', label: 'Confirmed', emoji: '💳', description: 'Payment verified' },
  { status: 'ACCEPTED', label: 'Accepted', emoji: '👨‍🍳', description: 'Kitchen accepted' },
  { status: 'PREPARING', label: 'Baking', emoji: '🔥', description: 'In the pizza oven' },
  { status: 'READY_FOR_PICKUP', label: 'Ready', emoji: '📦', description: 'Hot at counter' },
  { status: 'DELIVERED', label: 'Collected', emoji: '🍕', description: 'Picked up' },
];

const DELIVERY_MILESTONES: MilestoneStep[] = [
  { status: 'CONFIRMED', label: 'Confirmed', emoji: '💳', description: 'Payment verified' },
  { status: 'ACCEPTED', label: 'Accepted', emoji: '👨‍🍳', description: 'Kitchen accepted' },
  { status: 'PREPARING', label: 'Baking', emoji: '🔥', description: 'In the pizza oven' },
  { status: 'READY_FOR_PICKUP', label: 'Packed', emoji: '📦', description: 'Awaiting dispatch' },
  { status: 'IN_TRANSIT', label: 'On Way', emoji: '🛵', description: 'Courier in transit' },
  { status: 'DELIVERED', label: 'Delivered', emoji: '🍕', description: 'Arrived at landmark' },
];

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  visible,
  orderId,
  receiptToken,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [trackingState, setTrackingState] = useState<TrackingState>({
    order: null,
    isLoading: true,
    isRealtimeConnected: false,
    error: null,
  });

  const [permissionState, setPermissionState] = useState<NotificationPermissionState>('undetermined');
  const [isRegisteringNotifs, setIsRegisteringNotifs] = useState(false);
  const [notifMessage, setNotifMessage] = useState<string | null>(null);

  // Subscribe to order tracking when modal is visible
  useEffect(() => {
    if (!visible || !orderId) return;

    // Check notification permission status
    notificationService.checkPermissionStatus().then(setPermissionState);

    const unsubscribe = orderTrackingService.startTracking(
      orderId,
      receiptToken,
      (state) => {
        setTrackingState(state);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [visible, orderId, receiptToken]);

  const handleEnableNotifications = async () => {
    setIsRegisteringNotifs(true);
    setNotifMessage(null);
    const result = await notificationService.requestPermissionAndRegister();
    setIsRegisteringNotifs(false);
    setPermissionState(result.status);
    if (result.success) {
      setNotifMessage('🔔 Notifications enabled! You will be alerted at every milestone.');
    } else if (result.error) {
      setNotifMessage(result.error);
    }
  };

  const order = trackingState.order;
  const isDelivery = order?.fulfillmentType === 'delivery';
  const milestones = isDelivery ? DELIVERY_MILESTONES : PICKUP_MILESTONES;

  // Determine current milestone index
  const getMilestoneIndex = (status?: OrderStatus): number => {
    if (!status) return 0;
    const idx = milestones.findIndex((m) => m.status === status);
    if (idx !== -1) return idx;

    // Fallback logic for intermediate states
    if (status === 'CANCELLED') return -1;
    if (status === 'PAID') return 0;
    return 0;
  };

  const currentStepIndex = getMilestoneIndex(order?.status);
  const isCancelled = order?.status === 'CANCELLED';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
          <View>
            <Text style={styles.headerTitle}>Order Tracking</Text>
            {order ? (
              <Text style={styles.headerSubtitle}>#{order.orderNumber}</Text>
            ) : (
              <Text style={styles.headerSubtitle}>Connecting to AY Pizza...</Text>
            )}
          </View>

          <View style={styles.headerRight}>
            {/* Realtime Live Pulse */}
            <View
              style={[
                styles.liveIndicator,
                trackingState.isRealtimeConnected ? styles.liveIndicatorOn : styles.liveIndicatorOff,
              ]}
            >
              <View
                style={[
                  styles.liveDot,
                  trackingState.isRealtimeConnected ? styles.liveDotOn : styles.liveDotOff,
                ]}
              />
              <Text style={styles.liveText}>
                {trackingState.isRealtimeConnected
                  ? 'LIVE'
                  : trackingState.trackingMode === 'terminal'
                  ? 'FINAL'
                  : 'SYNC'}
              </Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {trackingState.isLoading && !order ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.neon} />
            <Text style={styles.loadingText}>Loading authoritative order status...</Text>
          </View>
        ) : trackingState.error && !order ? (
          <View style={styles.centerContainer}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorTitle}>Order Not Found</Text>
            <Text style={styles.errorText}>{trackingState.error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={onClose}>
              <Text style={styles.retryBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : order ? (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom + 20, 36) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* CANCELLED BANNER */}
            {isCancelled && (
              <View style={styles.cancelledCard}>
                <Text style={styles.cancelledEmoji}>🚫</Text>
                <Text style={styles.cancelledTitle}>Order Cancelled</Text>
                <Text style={styles.cancelledReason}>
                  Reason: {order.rejectionReason || 'Order was cancelled by store management.'}
                </Text>
                {order.refundStatus === 'REFUND_REQUIRED' && (
                  <View style={styles.refundNoticeBox}>
                    <Text style={styles.refundNoticeText}>
                      💰 Refund Status: Flagged for merchant refund review via Paystack.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* STATUS HIGHLIGHT BANNER */}
            {!isCancelled && (
              <View style={styles.statusHighlightCard}>
                <View style={styles.statusHeaderRow}>
                  <Text style={styles.statusEmoji}>
                    {order.status === 'CONFIRMED' && '💳'}
                    {order.status === 'ACCEPTED' && '👨‍🍳'}
                    {order.status === 'PREPARING' && '🔥'}
                    {order.status === 'READY_FOR_PICKUP' && (isDelivery ? '📦' : '🍕')}
                    {order.status === 'IN_TRANSIT' && '🛵'}
                    {order.status === 'DELIVERED' && '✅'}
                  </Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.statusTitleText}>
                      {order.status === 'CONFIRMED' && 'Order Confirmed'}
                      {order.status === 'ACCEPTED' && 'Kitchen Accepted Order'}
                      {order.status === 'PREPARING' && 'Pizza Baking in Oven'}
                      {order.status === 'READY_FOR_PICKUP' && (isDelivery ? 'Order Packed for Courier' : 'Ready for Counter Pickup!')}
                      {order.status === 'IN_TRANSIT' && 'Dispatched & On the Way!'}
                      {order.status === 'DELIVERED' && (isDelivery ? 'Delivered' : 'Order Collected')}
                    </Text>
                    <Text style={styles.statusDescText}>
                      {order.status === 'CONFIRMED' && 'Your payment was verified. Ready for kitchen team.'}
                      {order.status === 'ACCEPTED' && 'The kitchen at King Jaja Hall has accepted your ticket.'}
                      {order.status === 'PREPARING' && 'Fresh dough stretched and baking right now.'}
                      {order.status === 'READY_FOR_PICKUP' && (isDelivery ? 'Packed and awaiting courier dispatch.' : 'Head to the counter at King Jaja Hall!')}
                      {order.status === 'IN_TRANSIT' && `Heading to ${order.landmarkName || 'your landmark'}.`}
                      {order.status === 'DELIVERED' && 'Order complete. Enjoy your meal!'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.lastUpdatedText}>
                  Version #{order.version} • Updated {new Date(order.updatedAt).toLocaleTimeString()}
                </Text>
              </View>
            )}

            {/* PROGRESS STEPPER (OMITS IN_TRANSIT FOR PICKUP) */}
            {!isCancelled && (
              <View style={styles.stepperCard}>
                <Text style={styles.cardHeaderTitle}>Fulfillment Progression</Text>
                <View style={styles.stepperContainer}>
                  {milestones.map((step, index) => {
                    const isCompleted = index <= currentStepIndex;
                    const isCurrent = index === currentStepIndex;

                    return (
                      <View key={step.status} style={styles.stepRow}>
                        <View style={styles.stepIndicatorColumn}>
                          <View
                            style={[
                              styles.stepCircle,
                              isCompleted && styles.stepCircleCompleted,
                              isCurrent && styles.stepCircleCurrent,
                            ]}
                          >
                            <Text style={styles.stepCircleEmoji}>
                              {isCompleted ? step.emoji : '○'}
                            </Text>
                          </View>
                          {index < milestones.length - 1 && (
                            <View
                              style={[
                                styles.stepLine,
                                index < currentStepIndex && styles.stepLineCompleted,
                              ]}
                            />
                          )}
                        </View>

                        <View style={styles.stepTextContent}>
                          <Text
                            style={[
                              styles.stepLabel,
                              isCompleted && styles.stepLabelCompleted,
                              isCurrent && styles.stepLabelCurrent,
                            ]}
                          >
                            {step.label}
                          </Text>
                          <Text style={styles.stepDescription}>{step.description}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* NOTIFICATION PROMPT BANNER (Only for authenticated customer orders) */}
            {Boolean(order.customerId) && permissionState !== 'granted' && (
              <View style={styles.notificationPromptCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, marginRight: 10 }}>🔔</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifPromptTitle}>Get Live Order Alerts</Text>
                    <Text style={styles.notifPromptDesc}>
                      Receive an instant push notification when your pizza is in the oven or ready at the counter.
                    </Text>
                  </View>
                </View>
                {notifMessage && (
                  <Text style={styles.notifFeedbackText}>{notifMessage}</Text>
                )}
                <TouchableOpacity
                  style={styles.enableNotifBtn}
                  onPress={handleEnableNotifications}
                  disabled={isRegisteringNotifs}
                  activeOpacity={0.8}
                >
                  {isRegisteringNotifs ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.enableNotifBtnText}>Enable Push Alerts</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* FULFILLMENT DESTINATION / COUNTER DETAILS */}
            <View style={styles.detailsCard}>
              <Text style={styles.cardHeaderTitle}>
                {isDelivery ? '📍 Delivery Details' : '🏬 Pickup Counter'}
              </Text>
              {isDelivery ? (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Landmark:</Text>
                    <Text style={styles.infoValue}>{order.landmarkName || 'UNILAG Campus'}</Text>
                  </View>
                  {order.deliveryAddress && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Address/Room:</Text>
                      <Text style={styles.infoValue}>{order.deliveryAddress}</Text>
                    </View>
                  )}
                  {order.deliveryNotes && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Notes:</Text>
                      <Text style={styles.infoValue}>{order.deliveryNotes}</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Location:</Text>
                    <Text style={styles.infoValue}>AY Pizza Stand</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Address:</Text>
                    <Text style={styles.infoValue}>Opposite King Jaja Hall, UNILAG</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Instructions:</Text>
                    <Text style={styles.infoValue}>Show your Order #{order.orderNumber} at the counter.</Text>
                  </View>
                </>
              )}
            </View>

            {/* ORDER ITEMS SUMMARY */}
            <View style={styles.detailsCard}>
              <Text style={styles.cardHeaderTitle}>🍕 Ordered Items</Text>
              {(order.items || []).map((item, idx) => (
                <View key={item.id || idx} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>
                      {item.quantity}x {item.productName}
                      {item.sizeName ? ` (${item.sizeName})` : ''}
                    </Text>
                    {item.halfSecondaryFlavor && (
                      <Text style={styles.customizationText}>
                        • Half & Half: {item.halfSecondaryFlavor}
                      </Text>
                    )}
                    {(item.customizations || []).map((c: any, cIdx: number) => (
                      <Text key={cIdx} style={styles.customizationText}>
                        • +{c.optionName} (₦{c.price.toLocaleString()})
                      </Text>
                    ))}
                  </View>
                  <Text style={styles.itemPrice}>
                    ₦{(item.itemTotal || (item.basePrice * item.quantity)).toLocaleString()}
                  </Text>
                </View>
              ))}

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal:</Text>
                <Text style={styles.summaryValue}>₦{order.subtotal.toLocaleString()}</Text>
              </View>
              {isDelivery && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery Fee:</Text>
                  <Text style={styles.summaryValue}>₦{order.deliveryFee.toLocaleString()}</Text>
                </View>
              )}
              <View style={[styles.summaryRow, { marginTop: 6 }]}>
                <Text style={styles.totalLabel}>Total Paid:</Text>
                <Text style={styles.totalValue}>₦{order.total.toLocaleString()}</Text>
              </View>
            </View>

            {/* APPEND-ONLY ORDER EVENT TIMELINE */}
            {order.events && order.events.length > 0 && (
              <View style={styles.detailsCard}>
                <Text style={styles.cardHeaderTitle}>📜 Status Event History</Text>
                {order.events.map((evt, idx) => (
                  <View key={evt.id || idx} style={styles.eventRow}>
                    <View style={styles.eventDot} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.eventTitle}>{evt.title}</Text>
                      <Text style={styles.eventDesc}>{evt.description}</Text>
                      <Text style={styles.eventTime}>
                        {new Date(evt.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.night,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.charcoal,
  },
  headerTitle: {
    color: Colors.frost,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: Colors.lava,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  liveIndicatorOn: {
    backgroundColor: 'rgba(40, 122, 75, 0.15)',
  },
  liveIndicatorOff: {
    backgroundColor: 'rgba(244, 179, 35, 0.15)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  liveDotOn: {
    backgroundColor: Colors.green,
  },
  liveDotOff: {
    backgroundColor: Colors.gold,
  },
  liveText: {
    color: Colors.frost,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.charcoal,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: Colors.frost,
    fontSize: 14,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: 'rgba(255, 232, 214, 0.7)',
    fontSize: 14,
    marginTop: 12,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    color: Colors.crimson,
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    color: 'rgba(255, 232, 214, 0.6)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: Colors.neon,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelledCard: {
    backgroundColor: 'rgba(230, 57, 70, 0.15)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.crimson,
    alignItems: 'center',
  },
  cancelledEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  cancelledTitle: {
    color: Colors.crimson,
    fontSize: 18,
    fontWeight: '900',
  },
  cancelledReason: {
    color: Colors.frost,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  refundNoticeBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
  },
  refundNoticeText: {
    color: '#ffc107',
    fontSize: 12,
    fontWeight: '600',
  },
  statusHighlightCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 119, 0, 0.3)',
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusEmoji: {
    fontSize: 36,
  },
  statusTitleText: {
    color: Colors.frost,
    fontSize: 16,
    fontWeight: '800',
  },
  statusDescText: {
    color: 'rgba(255, 232, 214, 0.7)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  lastUpdatedText: {
    color: 'rgba(255, 232, 214, 0.4)',
    fontSize: 11,
    marginTop: 12,
    textAlign: 'right',
  },
  stepperCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.charcoal,
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeaderTitle: {
    color: Colors.frost,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepperContainer: {
    paddingLeft: 4,
  },
  stepRow: {
    flexDirection: 'row',
  },
  stepIndicatorColumn: {
    alignItems: 'center',
    width: 32,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 232, 214, 0.2)',
  },
  stepCircleCompleted: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderColor: '#4caf50',
  },
  stepCircleCurrent: {
    backgroundColor: 'rgba(255, 119, 0, 0.3)',
    borderColor: Colors.neon,
  },
  stepCircleEmoji: {
    fontSize: 13,
  },
  stepLine: {
    width: 2,
    height: 26,
    backgroundColor: 'rgba(255, 232, 214, 0.1)',
  },
  stepLineCompleted: {
    backgroundColor: '#4caf50',
  },
  stepTextContent: {
    marginLeft: 12,
    paddingBottom: 16,
    justifyContent: 'center',
  },
  stepLabel: {
    color: 'rgba(255, 232, 214, 0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  stepLabelCompleted: {
    color: Colors.frost,
  },
  stepLabelCurrent: {
    color: Colors.neon,
    fontWeight: '800',
  },
  stepDescription: {
    color: 'rgba(255, 232, 214, 0.4)',
    fontSize: 11,
    marginTop: 1,
  },
  notificationPromptCard: {
    backgroundColor: 'rgba(255, 119, 0, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 119, 0, 0.3)',
  },
  notifPromptTitle: {
    color: Colors.frost,
    fontSize: 14,
    fontWeight: 'bold',
  },
  notifPromptDesc: {
    color: 'rgba(255, 232, 214, 0.7)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  notifFeedbackText: {
    color: Colors.neon,
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  enableNotifBtn: {
    marginTop: 10,
    backgroundColor: Colors.neon,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  enableNotifBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  detailsCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 232, 214, 0.08)',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoLabel: {
    color: 'rgba(255, 232, 214, 0.5)',
    fontSize: 12,
    width: 90,
  },
  infoValue: {
    color: Colors.frost,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 232, 214, 0.05)',
  },
  itemName: {
    color: Colors.frost,
    fontSize: 13,
    fontWeight: '600',
  },
  customizationText: {
    color: 'rgba(255, 232, 214, 0.5)',
    fontSize: 11,
    marginTop: 1,
  },
  itemPrice: {
    color: Colors.neon,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 232, 214, 0.1)',
    marginVertical: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    color: 'rgba(255, 232, 214, 0.6)',
    fontSize: 12,
  },
  summaryValue: {
    color: Colors.frost,
    fontSize: 12,
    fontWeight: '600',
  },
  totalLabel: {
    color: Colors.frost,
    fontSize: 14,
    fontWeight: '800',
  },
  totalValue: {
    color: Colors.neon,
    fontSize: 15,
    fontWeight: '900',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.neon,
    marginTop: 4,
  },
  eventTitle: {
    color: Colors.frost,
    fontSize: 12,
    fontWeight: '700',
  },
  eventDesc: {
    color: 'rgba(255, 232, 214, 0.6)',
    fontSize: 11,
    marginTop: 1,
  },
  eventTime: {
    color: 'rgba(255, 232, 214, 0.4)',
    fontSize: 10,
    marginTop: 2,
  },
});
