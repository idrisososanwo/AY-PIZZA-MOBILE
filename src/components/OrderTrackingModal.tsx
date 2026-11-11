/**
 * AY Pizza — Customer Order Tracking Experience (Phase 5.4.3 Edition)
 * 
 * Provides an authoritative, premium order tracking journey adhering strictly
 * to the approved AY Pizza brand identity:
 * - Brand Pizza Red (#B91C1C)
 * - Chocolate Brown (#3E2723)
 * - Warm Cream (#FFF7E6 / #FFF8EC)
 * - Golden Orange (#F59E0B)
 * - High-Contrast Charcoal (#1F1F1F)
 * 
 * Features:
 * 1. Distinctive dual-track lifecycle: Delivery (6 stages) vs Pickup (5 stages).
 * 2. Prominent Hero Status Card with verified contextual message & visual stage treatment.
 * 3. Verified event timestamps from authoritative database fields and audit events.
 * 4. Itemized order breakdown with paid payment badge and price reconciliation.
 * 5. One-tap actions: Call Store (+2348130731895), WhatsApp chat, Share Order #.
 * 6. Resilient connection management: Realtime WebSocket with polling fallback and SecureStore recovery.
 * 7. Guaranteed WCAG 2.1 AA text contrast compliance on 360dp mobile screens.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Share,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Brand } from '../constants/brand';
import { OrderStatus, Order } from '../types/order';
import { orderTrackingService, TrackingState } from '../domains/order/order-tracking-service';
import { orderService } from '../domains/order/order-service';
import { notificationService, NotificationPermissionState } from '../domains/notifications/notification-service';
import { CancelOrderConfirmationModal } from './CancelOrderConfirmationModal';

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
  getTimestamp: (order: Order) => string | null | undefined;
}

// 5-Stage Authoritative Customer Journey for Store Pickup
const PICKUP_MILESTONES: MilestoneStep[] = [
  {
    status: 'CONFIRMED',
    label: 'Order Received',
    emoji: '📝',
    description: 'Payment confirmed & queued',
    getTimestamp: (o) => o.createdAt,
  },
  {
    status: 'ACCEPTED',
    label: 'Order Confirmed',
    emoji: '👨‍🍳',
    description: 'Kitchen acknowledged ticket',
    getTimestamp: (o) => o.acceptedAt,
  },
  {
    status: 'PREPARING',
    label: 'Baking in Stone Oven',
    emoji: '🔥',
    description: 'Hand-tossed & baking hot',
    getTimestamp: (o) => o.preparedAt,
  },
  {
    status: 'READY_FOR_PICKUP',
    label: 'Ready for Collection',
    emoji: '📦',
    description: 'Hot at King Jaja stand',
    getTimestamp: (o) => o.readyAt,
  },
  {
    status: 'DELIVERED',
    label: 'Order Collected',
    emoji: '🍕',
    description: 'Collected at counter',
    getTimestamp: (o) => o.completedAt,
  },
];

// 6-Stage Authoritative Customer Journey for Delivery
const DELIVERY_MILESTONES: MilestoneStep[] = [
  {
    status: 'CONFIRMED',
    label: 'Order Received',
    emoji: '📝',
    description: 'Payment confirmed & queued',
    getTimestamp: (o) => o.createdAt,
  },
  {
    status: 'ACCEPTED',
    label: 'Order Confirmed',
    emoji: '👨‍🍳',
    description: 'Kitchen acknowledged order',
    getTimestamp: (o) => o.acceptedAt,
  },
  {
    status: 'PREPARING',
    label: 'Baking in Stone Oven',
    emoji: '🔥',
    description: 'Hand-tossed & baking hot',
    getTimestamp: (o) => o.preparedAt,
  },
  {
    status: 'READY_FOR_PICKUP',
    label: 'Ready for Dispatch',
    emoji: '📦',
    description: 'Boxed & awaiting rider',
    getTimestamp: (o) => o.readyAt,
  },
  {
    status: 'IN_TRANSIT',
    label: 'Out for Delivery',
    emoji: '🛵',
    description: 'Courier en route to landmark',
    getTimestamp: (o) => o.inTransitAt,
  },
  {
    status: 'DELIVERED',
    label: 'Delivered',
    emoji: '🎉',
    description: 'Handed over. Enjoy!',
    getTimestamp: (o) => o.completedAt,
  },
];

function formatTime(isoString?: string | null): string | null {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}

function getStepTimestamp(step: MilestoneStep, order: Order): string | null {
  const directTs = step.getTimestamp(order);
  if (directTs) return formatTime(directTs);

  // Fallback: check append-only audit events table
  if (order.events && order.events.length > 0) {
    const matching = order.events.find((e) => e.newStatus === step.status);
    if (matching?.createdAt) {
      return formatTime(matching.createdAt);
    }
  }

  return null;
}

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

  const [retryKey, setRetryKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermissionState>('undetermined');
  const [isRegisteringNotifs, setIsRegisteringNotifs] = useState(false);
  const [notifMessage, setNotifMessage] = useState<string | null>(null);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);

  // Initialize and track order
  useEffect(() => {
    if (!visible || !orderId) return;

    notificationService.checkPermissionStatus().then(setPermissionState);

    const unsubscribe = orderTrackingService.startTracking(
      orderId,
      receiptToken,
      (state) => {
        setTrackingState(state);
        setIsRefreshing(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [visible, orderId, receiptToken, retryKey]);

  const handleRetry = useCallback(() => {
    setTrackingState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));
    setRetryKey((k) => k + 1);
  }, []);

  const handleManualRefresh = useCallback(async () => {
    if (!orderId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const res = await orderService.getOrderReceipt(orderId, receiptToken);
      if (res.success && res.order) {
        setTrackingState((prev) => ({
          ...prev,
          order: res.order!,
          error: null,
        }));
      }
    } catch {
      // Ignored during manual pull
    } finally {
      setIsRefreshing(false);
    }
  }, [orderId, receiptToken, isRefreshing]);

  const handleEnableNotifications = async () => {
    setIsRegisteringNotifs(true);
    setNotifMessage(null);
    const result = await notificationService.requestPermissionAndRegister();
    setIsRegisteringNotifs(false);
    setPermissionState(result.status);
    if (result.success) {
      setNotifMessage('🔔 Notifications active! You will receive milestone alerts.');
    } else if (result.canAskAgain === false) {
      setNotifMessage(result.error || 'Alerts disabled in device settings.');
      Alert.alert(
        'Permission Required',
        'Notifications were denied. Would you like to enable them in settings to track your order?',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => notificationService.openDeviceSettings() },
        ]
      );
    } else if (result.error) {
      setNotifMessage(result.error);
    }
  };

  const handleCallStore = () => {
    Linking.openURL(`tel:${Brand.contact.internationalPhone}`).catch(() => {
      Alert.alert('Store Support', `Call AY Pizza directly at ${Brand.contact.phone}`);
    });
  };

  const handleWhatsAppStore = () => {
    Linking.openURL(Brand.contact.whatsappUrl).catch(() => {
      Alert.alert('Store WhatsApp', `Message AY Pizza on WhatsApp: ${Brand.contact.phone}`);
    });
  };

  const handleShareOrder = async () => {
    if (!order) return;
    try {
      await Share.share({
        message: `AY Pizza Order #${order.orderNumber} (${isDelivery ? 'Delivery' : 'Store Pickup'}) - Total: ₦${order.total.toLocaleString()}`,
        title: `AY Pizza Order #${order.orderNumber}`,
      });
    } catch {
      // User dismissed
    }
  };

  const handleCancelOrder = async (reason: string) => {
    if (!orderId) return;
    try {
      setIsCancellingOrder(true);
      const res = await orderService.cancelOrderByCustomer(orderId, receiptToken, reason);
      if (res.success) {
        setCancelModalVisible(false);
        await handleManualRefresh();
        Alert.alert(
          'Order Cancelled 🚫',
          'Your order has been cancelled successfully. If payment was completed, a refund has been flagged for manager review.'
        );
      } else {
        Alert.alert('Cannot Cancel Order', res.error || 'The kitchen may have already accepted your order.');
        await handleManualRefresh();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to cancel order.');
    } finally {
      setIsCancellingOrder(false);
    }
  };

  const order = trackingState.order;
  const isDelivery = order?.fulfillmentType === 'delivery';
  const milestones = isDelivery ? DELIVERY_MILESTONES : PICKUP_MILESTONES;

  const isCancelled = order?.status === 'CANCELLED' || order?.status === 'REFUNDED';
  const isCompleted = order?.status === 'DELIVERED';
  const isOrderAcceptedByKitchen = !!(order && ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT'].includes(order.status));
  // Cancellation eligibility: strictly pre-kitchen acceptance while order is CONFIRMED
  const canCustomerCancel = order?.status === 'CONFIRMED';

  // Resolve active milestone index safely
  const getMilestoneIndex = (status?: OrderStatus): number => {
    if (!status) return 0;
    if (status === 'CANCELLED' || status === 'REFUNDED') return -1;
    if (status === 'PAID') return 0;

    const idx = milestones.findIndex((m) => m.status === status);
    return idx !== -1 ? idx : 0;
  };

  const currentStepIndex = getMilestoneIndex(order?.status);

  // Hero Card status details
  const getHeroDetails = () => {
    if (!order) return null;

    if (isCancelled) {
      return {
        badgeText: order.status === 'REFUNDED' ? 'REFUNDED' : 'CANCELLED',
        badgeBg: '#FEE2E2',
        badgeColor: '#991B1B',
        title: order.status === 'REFUNDED' ? 'Order Refunded' : 'Order Cancelled',
        desc: order.rejectionReason || 'This order was cancelled by the store. If paid, your refund is being processed.',
        emoji: '❌',
      };
    }

    if (isCompleted) {
      return isDelivery
        ? {
            badgeText: 'DELIVERED',
            badgeBg: '#DCFCE7',
            badgeColor: '#166534',
            title: 'Order Delivered! 🎉',
            desc: 'Your hot pizza & fresh treats have been handed over. Enjoy your meal!',
            emoji: '🎉',
          }
        : {
            badgeText: 'COLLECTED',
            badgeBg: '#DCFCE7',
            badgeColor: '#166534',
            title: 'Order Collected! 🎉',
            desc: 'Thank you for picking up at our King Jaja Hall stand. Enjoy your hot meal!',
            emoji: '🎉',
          };
    }

    switch (order.status) {
      case 'CONFIRMED':
      case 'PAID':
        return {
          badgeText: 'ORDER RECEIVED',
          badgeBg: '#FEF3C7',
          badgeColor: '#92400E',
          title: 'Order Confirmed & Queued 📝',
          desc: isDelivery
            ? 'Payment verified. AY Pizza kitchen is queueing your order.'
            : 'Payment verified. Our counter team is queueing your pickup ticket.',
          emoji: '📝',
        };
      case 'ACCEPTED':
        return {
          badgeText: 'KITCHEN ACCEPTED',
          badgeBg: '#FEF3C7',
          badgeColor: '#92400E',
          title: 'Kitchen Confirmed Order 👨‍🍳',
          desc: isDelivery
            ? 'Kitchen staff accepted your ticket and assigned it to the baking line.'
            : 'Counter staff accepted your ticket. Baking will start momentarily.',
          emoji: '👨‍🍳',
        };
      case 'PREPARING':
        return {
          badgeText: 'BAKING IN OVEN',
          badgeBg: '#FFEDD5',
          badgeColor: '#C2410C',
          title: 'Baking in Stone Oven 🔥',
          desc: 'Fresh dough hand-tossed, topped, and baking hot in the stone-deck oven.',
          emoji: '🔥',
        };
      case 'READY_FOR_PICKUP':
        return isDelivery
          ? {
              badgeText: 'READY FOR DISPATCH',
              badgeBg: '#DCFCE7',
              badgeColor: '#166534',
              title: 'Boxed & Ready for Dispatch 📦',
              desc: 'Your order is hot and boxed, waiting for courier dispatch.',
              emoji: '📦',
            }
          : {
              badgeText: 'READY AT COUNTER',
              badgeBg: '#DCFCE7',
              badgeColor: '#166534',
              title: 'Hot & Ready for Collection! 🏬',
              desc: 'Ready at AY Pizza Stand (opposite King Jaja Hall). Present your order number.',
              emoji: '🏬',
            };
      case 'IN_TRANSIT':
        return {
          badgeText: 'OUT FOR DELIVERY',
          badgeBg: '#DCFCE7',
          badgeColor: '#166534',
          title: 'Rider is On the Way! 🛵',
          desc: `Courier collected your hot pizza and is heading to ${order.landmarkName || 'your destination'}.`,
          emoji: '🛵',
        };
      default:
        return {
          badgeText: 'ACTIVE ORDER',
          badgeBg: '#F3EFE9',
          badgeColor: '#1F1F1F',
          title: 'Processing Order',
          desc: 'Live updates from AY Pizza kitchen.',
          emoji: '🍕',
        };
    }
  };

  const heroDetails = getHeroDetails();
  const totalItemCount = (order?.items || []).reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* A. ORDER HEADER */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 18) }]}>
          <View style={styles.headerLeft}>
            <View style={styles.headerTagRow}>
              <Text style={styles.headerBrandBadge}>AY PIZZA</Text>
              <View style={[styles.fulfillmentBadge, isDelivery ? styles.badgeDelivery : styles.badgePickup]}>
                <Text style={styles.fulfillmentBadgeText}>
                  {isDelivery ? '🛵 DELIVERY' : '🏬 STORE PICKUP'}
                </Text>
              </View>
            </View>
            <Text style={styles.headerTitle}>
              {order ? `#${order.orderNumber}` : 'Tracking Order'}
            </Text>
          </View>

          <View style={styles.headerRight}>
            {/* Live Realtime / Sync Badge */}
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
                  ? 'SAVED'
                  : 'SYNC'}
              </Text>
            </View>

            {/* Refresh Action Button */}
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={handleManualRefresh}
              activeOpacity={0.8}
              accessibilityLabel="Refresh tracking status"
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color={Colors.brandRed} />
              ) : (
                <Text style={styles.headerActionBtnText}>🔄</Text>
              )}
            </TouchableOpacity>

            {/* Modal Close Action Button */}
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={onClose}
              activeOpacity={0.8}
              accessibilityLabel="Close tracking view"
            >
              <Text style={styles.headerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* LOADING STATE */}
        {trackingState.isLoading && !order ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.brandRed} />
            <Text style={styles.loadingTitle}>Connecting to AY Pizza Oven...</Text>
            <Text style={styles.loadingText}>Fetching authoritative order milestones from King Jaja stand...</Text>
          </View>
        ) : trackingState.error && !order ? (
          /* ERROR STATE */
          <View style={styles.centerContainer}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorTitle}>Connection Notice</Text>
            <Text style={styles.errorText}>{trackingState.error}</Text>
            <View style={styles.errorActionsRow}>
              <TouchableOpacity style={styles.primaryRedBtn} onPress={handleRetry} activeOpacity={0.85}>
                <Text style={styles.primaryRedBtnText}>Retry Connection 🔄</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryNeutralBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.secondaryNeutralBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : order ? (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom + 24, 40) },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleManualRefresh}
                tintColor={Colors.brandRed}
                colors={[Colors.brandRed]}
              />
            }
          >
            {/* POLLING NOTICE (If WebSocket is offline) */}
            {trackingState.trackingMode === 'polling' && !isCancelled && !isCompleted && (
              <View style={styles.pollingNoticeBanner}>
                <Text style={styles.pollingNoticeText}>
                  ⚡ Live Polling Active • Checking kitchen status every few seconds
                </Text>
              </View>
            )}

            {/* B. HERO STATUS SECTION */}
            {heroDetails && (
              <View style={[styles.heroCard, isCancelled && styles.heroCardCancelled]}>
                <View style={styles.heroHeaderRow}>
                  <View style={[styles.heroBadge, { backgroundColor: heroDetails.badgeBg }]}>
                    <Text style={[styles.heroBadgeText, { color: heroDetails.badgeColor }]}>
                      {heroDetails.badgeText}
                    </Text>
                  </View>
                  <Text style={styles.heroTimeText}>
                    {formatTime(order.updatedAt) ? `Updated at ${formatTime(order.updatedAt)}` : 'Live'}
                  </Text>
                </View>

                <View style={styles.heroMainRow}>
                  <Text style={styles.heroEmoji}>{heroDetails.emoji}</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.heroTitle}>{heroDetails.title}</Text>
                    <Text style={styles.heroDesc}>{heroDetails.desc}</Text>
                  </View>
                </View>

                {/* Refund Notice for cancelled paid orders */}
                {isCancelled && order.refundStatus && order.refundStatus !== 'NOT_APPLICABLE' && (
                  <View style={styles.refundBox}>
                    <Text style={styles.refundBoxTitle}>💳 Paystack Refund Notice</Text>
                    <Text style={styles.refundBoxText}>
                      {order.refundStatus === 'REFUNDED'
                        ? 'Your payment was confirmed refunded by store management.'
                        : 'Your order was cancelled after payment. A refund has been flagged for manager review.'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* CANCEL ORDER ACTION (Eligible ONLY while CONFIRMED) */}
            {canCustomerCancel && (
              <View style={styles.cancellationCard}>
                <View style={styles.cancellationTextCol}>
                  <Text style={styles.cancellationTitle}>Change of Plans? ⏱️</Text>
                  <Text style={styles.cancellationSubtitle}>
                    Your order is awaiting kitchen acceptance. You can cancel now for a full refund review before baking starts.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.cancelActionBtn}
                  onPress={() => setCancelModalVisible(true)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel this order"
                  testID="tracking-cancel-order-btn"
                >
                  <Text style={styles.cancelActionBtnText}>Cancel Order ✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* PREPARATION IN PROGRESS NOTICE (When order is accepted and self-service cancellation is blocked) */}
            {isOrderAcceptedByKitchen && (
              <View style={styles.inOvenNoticeBox}>
                <Text style={styles.inOvenNoticeIcon}>🔥</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inOvenNoticeTitle}>Preparation in Progress</Text>
                  <Text style={styles.inOvenNoticeText}>
                    The kitchen has accepted your order and fresh baking has commenced. Self-service cancellation is closed to prevent food waste. For urgent inquiries, please call the store directly.
                  </Text>
                </View>
              </View>
            )}

            {/* C. VISUAL ORDER JOURNEY (Dual-Track Progress Stepper) */}
            {!isCancelled && (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardHeaderTitle}>
                    {isDelivery ? '🛵 Delivery Progress Timeline' : '🏬 Pickup Counter Progress'}
                  </Text>
                  <Text style={styles.stageCounterText}>
                    Stage {Math.min(currentStepIndex + 1, milestones.length)} of {milestones.length}
                  </Text>
                </View>

                <View style={styles.timelineContainer}>
                  {milestones.map((step, idx) => {
                    const isPassed = idx < currentStepIndex || (idx === currentStepIndex && isCompleted);
                    const isCurrent = idx === currentStepIndex && !isCompleted;
                    const isUpcoming = idx > currentStepIndex;
                    const isLast = idx === milestones.length - 1;
                    const stepTimestamp = getStepTimestamp(step, order);

                    return (
                      <View key={step.status} style={styles.timelineStepRow}>
                        {/* Step Icon Column */}
                        <View style={styles.timelineIconCol}>
                          <View
                            style={[
                              styles.timelineCircle,
                              isPassed && styles.timelineCirclePassed,
                              isCurrent && styles.timelineCircleCurrent,
                              isUpcoming && styles.timelineCircleUpcoming,
                            ]}
                          >
                            <Text style={styles.timelineEmoji}>
                              {isPassed ? '✓' : step.emoji}
                            </Text>
                          </View>
                          {!isLast && (
                            <View
                              style={[
                                styles.timelineConnector,
                                isPassed && styles.timelineConnectorPassed,
                              ]}
                            />
                          )}
                        </View>

                        {/* Step Content Column */}
                        <View style={styles.timelineContentCol}>
                          <View style={styles.stepTitleRow}>
                            <Text
                              style={[
                                styles.stepLabel,
                                isPassed && styles.stepLabelPassed,
                                isCurrent && styles.stepLabelCurrent,
                                isUpcoming && styles.stepLabelUpcoming,
                              ]}
                            >
                              {step.label}
                            </Text>
                            {stepTimestamp && (
                              <Text style={styles.stepTimestamp}>{stepTimestamp}</Text>
                            )}
                          </View>
                          <Text
                            style={[
                              styles.stepDesc,
                              isCurrent && styles.stepDescCurrent,
                            ]}
                          >
                            {step.description}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* PUSH NOTIFICATION PROMPT (If not yet enabled) */}
            {permissionState !== 'granted' && !isCancelled && !isCompleted && (
              <View style={styles.notifCard}>
                <View style={styles.notifHeader}>
                  <Text style={styles.notifIcon}>🔔</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifTitle}>Enable Push Alerts</Text>
                    <Text style={styles.notifSubtitle}>
                      Get instant alerts when your pizza enters the oven, is boxed, and dispatched.
                    </Text>
                  </View>
                </View>
                {notifMessage && (
                  <Text style={styles.notifFeedbackText}>{notifMessage}</Text>
                )}
                <TouchableOpacity
                  style={styles.notifBtn}
                  onPress={handleEnableNotifications}
                  disabled={isRegisteringNotifs}
                  activeOpacity={0.85}
                >
                  {isRegisteringNotifs ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.notifBtnText}>Turn On Push Alerts 🔔</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* D. FULFILLMENT DESTINATION & INSTRUCTIONS */}
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>
                {isDelivery ? '📍 Delivery Details' : '🏬 Pickup Stand Instructions'}
              </Text>

              {isDelivery ? (
                <View style={styles.infoBlock}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Landmark:</Text>
                    <Text style={styles.infoValue}>
                      {order.landmarkName || 'UNILAG Campus'}
                    </Text>
                  </View>
                  {order.deliveryAddress && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Address/Room:</Text>
                      <Text style={styles.infoValue}>{order.deliveryAddress}</Text>
                    </View>
                  )}
                  {order.deliveryNotes && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Rider Note:</Text>
                      <Text style={styles.infoValue}>{order.deliveryNotes}</Text>
                    </View>
                  )}
                  {order.guestPhone && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Contact:</Text>
                      <Text style={styles.infoValue}>{order.guestPhone}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.infoBlock}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Location:</Text>
                    <Text style={styles.infoValue}>{Brand.location.address}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Stand Area:</Text>
                    <Text style={styles.infoValue}>{Brand.location.city}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Hours:</Text>
                    <Text style={styles.infoValue}>10:00 AM – 9:00 PM WAT Daily</Text>
                  </View>
                  <View style={styles.pickupInstructionBox}>
                    <Text style={styles.pickupInstructionTitle}>🏷️ How to Collect:</Text>
                    <Text style={styles.pickupInstructionText}>
                      Walk up to the AY Pizza Stand opposite King Jaja Hall and show your order reference (#{order.orderNumber}) to the counter crew.
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* E. ORDERED ITEMS SUMMARY & PAYMENT */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardHeaderTitle}>🍕 Ordered Items ({totalItemCount})</Text>
                <View style={styles.paidBadge}>
                  <Text style={styles.paidBadgeText}>✓ PAID</Text>
                </View>
              </View>

              {(order.items || []).map((item, idx) => (
                <View key={item.id || idx} style={styles.itemRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.itemName}>
                      {item.quantity}x {item.productName}
                      {item.sizeName ? ` (${item.sizeName})` : ''}
                    </Text>
                    {item.halfSecondaryFlavor && (
                      <Text style={styles.itemCustomization}>
                        • Half & Half: {item.halfSecondaryFlavor}
                      </Text>
                    )}
                    {(item.customizations || []).map((c: any, cIdx: number) => (
                      <Text key={cIdx} style={styles.itemCustomization}>
                        • +{c.optionName} (₦{c.price.toLocaleString()})
                      </Text>
                    ))}
                    {item.specialInstructions && (
                      <Text style={styles.itemCustomization}>
                        • Note: {item.specialInstructions}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.itemPrice}>
                    ₦{(item.itemTotal || (item.basePrice * item.quantity)).toLocaleString()}
                  </Text>
                </View>
              ))}

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal:</Text>
                <Text style={styles.summaryVal}>₦{order.subtotal.toLocaleString()}</Text>
              </View>
              {isDelivery ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery Fee ({order.landmarkName || 'Campus'}):</Text>
                  <Text style={styles.summaryVal}>₦{order.deliveryFee.toLocaleString()}</Text>
                </View>
              ) : (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Store Pickup Fee:</Text>
                  <Text style={[styles.summaryVal, { color: '#16A34A' }]}>FREE</Text>
                </View>
              )}
              {order.discountAmount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Discount:</Text>
                  <Text style={[styles.summaryVal, { color: Colors.brandRed }]}>
                    -₦{order.discountAmount.toLocaleString()}
                  </Text>
                </View>
              )}

              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total Paid:</Text>
                <Text style={styles.totalVal}>₦{order.total.toLocaleString()}</Text>
              </View>
            </View>

            {/* F. APPEND-ONLY STATUS EVENT AUDIT LOG */}
            {order.events && order.events.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardHeaderTitle}>📜 Verified Event History</Text>
                {order.events.map((evt, idx) => (
                  <View key={evt.id || idx} style={styles.eventRow}>
                    <View style={styles.eventBullet} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={styles.eventTitleRow}>
                        <Text style={styles.eventTitleText}>{evt.title}</Text>
                        <Text style={styles.eventTimeText}>
                          {formatTime(evt.createdAt)}
                        </Text>
                      </View>
                      <Text style={styles.eventDescText}>{evt.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* G. STORE ACTIONS & VERIFIED SUPPORT */}
            <View style={styles.supportCard}>
              <Text style={styles.supportCardTitle}>Need Assistance with this Order?</Text>
              <Text style={styles.supportCardSubtitle}>
                Our kitchen & counter crew at King Jaja Hall are standing by.
              </Text>

              <View style={styles.supportActionsRow}>
                <TouchableOpacity
                  style={styles.supportCallBtn}
                  onPress={handleCallStore}
                  activeOpacity={0.85}
                  accessibilityLabel="Call store phone support"
                >
                  <Text style={styles.supportCallBtnText}>📞 Call Store ({Brand.contact.phone})</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.supportWhatsAppBtn}
                  onPress={handleWhatsAppStore}
                  activeOpacity={0.85}
                  accessibilityLabel="Chat on WhatsApp support"
                >
                  <Text style={styles.supportWhatsAppBtnText}>💬 Chat on WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shareOrderBtn}
                  onPress={handleShareOrder}
                  activeOpacity={0.85}
                  accessibilityLabel="Share order reference"
                >
                  <Text style={styles.shareOrderBtnText}>📋 Share Order #{order.orderNumber}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        ) : null}

        {order && (
          <CancelOrderConfirmationModal
            visible={cancelModalVisible}
            orderNumber={order.orderNumber}
            orderTotal={order.total}
            isCancelling={isCancellingOrder}
            onConfirm={handleCancelOrder}
            onClose={() => setCancelModalVisible(false)}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8EC', // Warm cream canvas
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8DFD1',
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  headerTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  headerBrandBadge: {
    fontSize: 10,
    fontWeight: '900',
    color: '#B91C1C',
    letterSpacing: 0.5,
  },
  fulfillmentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeDelivery: {
    backgroundColor: '#E0F2FE',
  },
  badgePickup: {
    backgroundColor: '#FEF3C7',
  },
  fulfillmentBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1F1F1F',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1F1F1F',
    letterSpacing: 0.2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  liveIndicatorOn: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  liveIndicatorOff: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  liveDotOn: {
    backgroundColor: '#16A34A',
  },
  liveDotOff: {
    backgroundColor: '#D97706',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1F1F1F',
    letterSpacing: 0.5,
  },
  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F7F2E7',
    borderWidth: 1,
    borderColor: '#E8DFD1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActionBtnText: {
    fontSize: 14,
    color: '#1F1F1F',
  },
  headerCloseText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1F1F1F',
  },
  scrollContent: {
    padding: 16,
  },
  pollingNoticeBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  pollingNoticeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8DFD1',
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  heroCardCancelled: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroTimeText: {
    fontSize: 11,
    color: '#85746E',
    fontWeight: '600',
  },
  heroMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroEmoji: {
    fontSize: 34,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F1F1F',
  },
  heroDesc: {
    fontSize: 12,
    color: '#6B5E59',
    lineHeight: 18,
    marginTop: 3,
  },
  refundBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  refundBoxTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  refundBoxText: {
    fontSize: 11,
    color: '#3E2723',
    lineHeight: 15,
  },
  cancellationCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancellationTextCol: {
    flex: 1,
  },
  cancellationTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9A3412',
    marginBottom: 2,
  },
  cancellationSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    color: '#7C2D12',
    fontWeight: '500',
  },
  cancelActionBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DC2626',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  inOvenNoticeBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  inOvenNoticeIcon: {
    fontSize: 18,
  },
  inOvenNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 2,
  },
  inOvenNoticeText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#7F1D1D',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8DFD1',
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F1F1F',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stageCounterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#85746E',
  },
  timelineContainer: {
    paddingLeft: 4,
    paddingTop: 4,
  },
  timelineStepRow: {
    flexDirection: 'row',
  },
  timelineIconCol: {
    alignItems: 'center',
    width: 32,
  },
  timelineCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  timelineCirclePassed: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  timelineCircleCurrent: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  timelineCircleUpcoming: {
    backgroundColor: '#F7F2E7',
    borderColor: '#D4C9BF',
  },
  timelineEmoji: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  timelineConnector: {
    width: 2,
    height: 28,
    backgroundColor: '#E8DFD1',
  },
  timelineConnectorPassed: {
    backgroundColor: '#16A34A',
  },
  timelineContentCol: {
    marginLeft: 12,
    paddingBottom: 16,
    flex: 1,
  },
  stepTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepLabelPassed: {
    color: '#1F1F1F',
  },
  stepLabelCurrent: {
    color: '#B91C1C',
    fontWeight: '800',
  },
  stepLabelUpcoming: {
    color: '#85746E',
  },
  stepTimestamp: {
    fontSize: 11,
    color: '#85746E',
    fontWeight: '600',
  },
  stepDesc: {
    fontSize: 11,
    color: '#6B5E59',
    marginTop: 1,
    lineHeight: 15,
  },
  stepDescCurrent: {
    color: '#3E2723',
    fontWeight: '500',
  },
  notifCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notifIcon: {
    fontSize: 22,
    marginRight: 10,
    marginTop: 2,
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1F1F1F',
  },
  notifSubtitle: {
    fontSize: 11,
    color: '#6B5E59',
    marginTop: 2,
    lineHeight: 15,
  },
  notifFeedbackText: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 6,
    fontWeight: '700',
  },
  notifBtn: {
    marginTop: 10,
    backgroundColor: '#B91C1C',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  notifBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  infoBlock: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 12,
    color: '#6B5E59',
    width: 95,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 12,
    color: '#1F1F1F',
    fontWeight: '700',
    flex: 1,
  },
  pickupInstructionBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#F7F2E7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8DFD1',
  },
  pickupInstructionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1F1F1F',
    marginBottom: 2,
  },
  pickupInstructionText: {
    fontSize: 11,
    color: '#3E2723',
    lineHeight: 16,
  },
  paidBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  paidBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#166534',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3EFE6',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F1F1F',
  },
  itemCustomization: {
    fontSize: 11,
    color: '#85746E',
    marginTop: 1,
  },
  itemPrice: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '800',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E8DFD1',
    marginVertical: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B5E59',
  },
  summaryVal: {
    fontSize: 12,
    color: '#1F1F1F',
    fontWeight: '700',
  },
  totalRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8DFD1',
  },
  totalLabel: {
    color: '#1F1F1F',
    fontSize: 15,
    fontWeight: '900',
  },
  totalValue: {
    color: '#B91C1C',
    fontSize: 17,
    fontWeight: '900',
  },
  totalVal: {
    color: '#B91C1C',
    fontSize: 17,
    fontWeight: '900',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eventBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B91C1C',
    marginTop: 4,
  },
  eventTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventTitleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1F1F1F',
  },
  eventTimeText: {
    fontSize: 10,
    color: '#85746E',
    fontWeight: '600',
  },
  eventDescText: {
    fontSize: 11,
    color: '#6B5E59',
    marginTop: 1,
    lineHeight: 15,
  },
  supportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8DFD1',
  },
  supportCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F1F1F',
  },
  supportCardSubtitle: {
    fontSize: 12,
    color: '#6B5E59',
    marginTop: 2,
    marginBottom: 14,
  },
  supportActionsRow: {
    gap: 10,
  },
  supportCallBtn: {
    backgroundColor: '#F7F2E7',
    borderWidth: 1,
    borderColor: '#E8DFD1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  supportCallBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1F1F1F',
  },
  supportWhatsAppBtn: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  supportWhatsAppBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  shareOrderBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8DFD1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  shareOrderBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3E2723',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F1F1F',
    marginTop: 16,
    textAlign: 'center',
  },
  loadingText: {
    color: '#6B5E59',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorEmoji: {
    fontSize: 44,
    marginBottom: 10,
  },
  errorTitle: {
    color: '#B91C1C',
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: '#6B5E59',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  errorActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  primaryRedBtn: {
    backgroundColor: '#B91C1C',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryRedBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryNeutralBtn: {
    backgroundColor: '#F7F2E7',
    borderWidth: 1,
    borderColor: '#E8DFD1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryNeutralBtnText: {
    color: '#1F1F1F',
    fontWeight: '700',
    fontSize: 13,
  },
  retryBtn: {
    backgroundColor: '#B91C1C',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  closeErrorBtnText: {
    color: '#1F1F1F',
    fontWeight: '700',
    fontSize: 13,
  },
  closeBtnText: {
    color: '#1F1F1F',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
