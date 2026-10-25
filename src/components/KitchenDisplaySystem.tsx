/**
 * Kitchen Display System (KDS) & Staff Order Management Interface
 * AY Pizza, Opposite King Jaja Hall, UNILAG, Lagos, Nigeria.
 * Responsive for kitchen tablet, counter monitor, and mobile staff view.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
  Vibration,
} from 'react-native';
import { Colors } from '../constants/colors';
import { OrderStatus } from '../types/order';
import { UserRole } from '../types/auth';
import { KdsOrder, KdsLane } from '../domains/kds/kds-types';
import { kdsService, KdsConnectionState } from '../domains/kds/kds-service';
import { hasPermission } from '../domains/auth/auth-service';

interface Props {
  currentRole?: UserRole;
  onClose?: () => void;
}

export function KitchenDisplaySystem({ currentRole = 'kitchen', onClose }: Props) {
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [connectionState, setConnectionState] = useState<KdsConnectionState>('DISCONNECTED');
  const [isLoading, setIsLoading] = useState(true);
  const [activeLane, setActiveLane] = useState<KdsLane>('incoming');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [simulatedRole, setSimulatedRole] = useState<UserRole>(currentRole);

  // Rejection modal state
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
  const [orderToReject, setOrderToReject] = useState<KdsOrder | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  // Staff notes modal state
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [orderForNotes, setOrderForNotes] = useState<KdsOrder | null>(null);
  const [staffNotesText, setStaffNotesText] = useState('');

  // Audio chime generator using Web Audio API (when running in web/browser)
  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.45);
        }
      } else {
        // Native tablet / mobile alert fallback
        Vibration.vibrate([0, 200, 80, 200]);
      }
    } catch {
      // Audio/vibration policy fallback
    }
  }, [soundEnabled]);

  // Initial load and Realtime setup
  useEffect(() => {
    let isMounted = true;

    async function initKds() {
      setIsLoading(true);
      await kdsService.fetchActiveOrders([
        'CONFIRMED',
        'ACCEPTED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'IN_TRANSIT',
        'DELIVERED',
        'CANCELLED',
      ]);
      if (isMounted) setIsLoading(false);
    }

    initKds();

    // Subscribe to order store updates
    const unsubOrders = kdsService.subscribe((list) => {
      if (isMounted) setOrders(list);
    });

    // Subscribe to connection state
    const unsubConnection = kdsService.subscribeConnection((state) => {
      if (isMounted) setConnectionState(state);
    });

    // Subscribe to Realtime events with audio chime
    const unsubRealtime = kdsService.subscribeToRealtime((newOrder) => {
      if (isMounted) {
        playChime();
      }
    });

    // Timer tick to update elapsed times every 30 seconds
    const interval = setInterval(() => {
      if (isMounted) setCurrentTime(Date.now());
    }, 30000);

    return () => {
      isMounted = false;
      unsubOrders();
      unsubConnection();
      unsubRealtime();
      clearInterval(interval);
    };
  }, [playChime]);

  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
  const activeRole: UserRole = isDev ? simulatedRole : currentRole;

  // Group orders into KDS lanes
  const laneOrders = useMemo(() => {
    const incoming: KdsOrder[] = [];
    const accepted: KdsOrder[] = [];
    const preparing: KdsOrder[] = [];
    const ready: KdsOrder[] = [];
    const transit: KdsOrder[] = [];
    const completed: KdsOrder[] = [];
    const cancelled: KdsOrder[] = [];

    for (const order of orders) {
      switch (order.status) {
        case 'CONFIRMED':
          incoming.push(order);
          break;
        case 'ACCEPTED':
          accepted.push(order);
          break;
        case 'PREPARING':
          preparing.push(order);
          break;
        case 'READY_FOR_PICKUP':
          ready.push(order);
          break;
        case 'IN_TRANSIT':
          transit.push(order);
          break;
        case 'DELIVERED':
          completed.push(order);
          break;
        case 'CANCELLED':
          cancelled.push(order);
          break;
      }
    }

    // Sort by created_at ascending (oldest orders first for priority)
    const sorter = (a: KdsOrder, b: KdsOrder) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

    incoming.sort(sorter);
    accepted.sort(sorter);
    preparing.sort(sorter);
    ready.sort(sorter);
    transit.sort(sorter);

    // Completed & Cancelled show most recent first
    const recentSorter = (a: KdsOrder, b: KdsOrder) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    completed.sort(recentSorter);
    cancelled.sort(recentSorter);

    return { incoming, accepted, preparing, ready, transit, completed, cancelled };
  }, [orders]);

  // Calculate elapsed time formatted and urgency
  const getElapsedInfo = (createdAtIso: string) => {
    const elapsedMinutes = Math.floor(
      (currentTime - new Date(createdAtIso).getTime()) / 60000
    );

    let badgeColor: string = Colors.status.paid; // Normal green
    let urgencyLabel = 'On Track';

    if (elapsedMinutes >= 25) {
      badgeColor = Colors.status.cancelled; // Urgent red
      urgencyLabel = 'URGENT';
    } else if (elapsedMinutes >= 15) {
      badgeColor = Colors.status.preparing; // Warning orange
      urgencyLabel = 'Delayed';
    }

    return {
      text: elapsedMinutes < 1 ? 'Just now' : `${elapsedMinutes}m ago`,
      badgeColor,
      urgencyLabel,
      elapsedMinutes,
    };
  };

  // Staff Transition Handler
  const handleTransition = async (
    order: KdsOrder,
    targetStatus: OrderStatus,
    reason?: string,
    notes?: string
  ) => {
    setActionLoadingId(order.id);
    try {
      const res = await kdsService.transitionOrderStatus({
        orderId: order.id,
        targetStatus,
        reason,
        notes,
        expectedCurrentStatus: order.status,
      });

      if (!res.success) {
        Alert.alert('Action Failed', res.message || 'Could not update order.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Network error occurred.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Rejection modal handlers
  const handleOpenRejection = (order: KdsOrder) => {
    setOrderToReject(order);
    setRejectionReason('');
    setRejectionError(null);
    setRejectionModalVisible(true);
  };

  const handleConfirmRejection = async () => {
    if (!orderToReject) return;
    if (!rejectionReason.trim()) {
      setRejectionError('Please provide a specific reason for rejection.');
      return;
    }

    await handleTransition(orderToReject, 'CANCELLED', rejectionReason.trim());
    setRejectionModalVisible(false);
    setOrderToReject(null);
  };

  // Staff notes modal handlers
  const handleOpenNotes = (order: KdsOrder) => {
    setOrderForNotes(order);
    setStaffNotesText(order.staffNotes || '');
    setNotesModalVisible(true);
  };

  const handleSaveNotes = async () => {
    if (!orderForNotes) return;
    await handleTransition(
      orderForNotes,
      orderForNotes.status,
      undefined,
      staffNotesText.trim()
    );
    setNotesModalVisible(false);
    setOrderForNotes(null);
  };

  const currentLaneOrders = laneOrders[activeLane] || [];

  return (
    <View style={styles.container}>
      {/* KDS Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>AY PIZZA KDS</Text>
          <Text style={styles.headerSubtitle}>Opposite King Jaja Hall, UNILAG</Text>
        </View>

        {/* Realtime Status Pill & Role Selector */}
        <View style={styles.headerRight}>
          <View
            style={[
              styles.connectionPill,
              connectionState === 'CONNECTED'
                ? styles.pillConnected
                : styles.pillReconnecting,
            ]}
          >
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    connectionState === 'CONNECTED'
                      ? Colors.status.paid
                      : Colors.status.preparing,
                },
              ]}
            />
            <Text style={styles.connectionText}>{connectionState}</Text>
          </View>

          {/* Sound Toggle */}
          <TouchableOpacity
            style={[styles.iconButton, soundEnabled && styles.iconButtonActive]}
            onPress={() => setSoundEnabled(!soundEnabled)}
          >
            <Text style={styles.iconButtonText}>{soundEnabled ? '🔔 Sound ON' : '🔕 Muted'}</Text>
          </TouchableOpacity>

          {/* Role Display: In dev allow switcher, in production display authenticated role badge */}
          {isDev ? (
            <View style={styles.rolePicker}>
              <Text style={styles.roleLabel}>[DEV] Role:</Text>
              {(['kitchen', 'counter', 'manager', 'admin'] as UserRole[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setSimulatedRole(r)}
                  style={[styles.roleChip, simulatedRole === r && styles.roleChipActive]}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      simulatedRole === r && styles.roleChipTextActive,
                    ]}
                  >
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.roleBadgeContainer}>
              <Text style={styles.roleBadgeText}>ROLE: {currentRole.toUpperCase()}</Text>
            </View>
          )}

          {/* Refresh Button */}
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() =>
              kdsService.fetchActiveOrders([
                'CONFIRMED',
                'ACCEPTED',
                'PREPARING',
                'READY_FOR_PICKUP',
                'IN_TRANSIT',
                'DELIVERED',
                'CANCELLED',
              ])
            }
          >
            <Text style={styles.refreshText}>↻ Sync</Text>
          </TouchableOpacity>

          {onClose && (
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>✕ Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Lanes Navigation Bar */}
      <View style={styles.laneBar}>
        <TouchableOpacity
          style={[styles.laneTab, activeLane === 'incoming' && styles.laneTabActive]}
          onPress={() => setActiveLane('incoming')}
        >
          <Text style={[styles.laneTabText, activeLane === 'incoming' && styles.laneTabTextActive]}>
            1. Incoming ({laneOrders.incoming.length})
          </Text>
          {laneOrders.incoming.length > 0 && <View style={styles.incomingBadge} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.laneTab, activeLane === 'accepted' && styles.laneTabActive]}
          onPress={() => setActiveLane('accepted')}
        >
          <Text style={[styles.laneTabText, activeLane === 'accepted' && styles.laneTabTextActive]}>
            2. Accepted ({laneOrders.accepted.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.laneTab, activeLane === 'preparing' && styles.laneTabActive]}
          onPress={() => setActiveLane('preparing')}
        >
          <Text
            style={[styles.laneTabText, activeLane === 'preparing' && styles.laneTabTextActive]}
          >
            3. In Oven ({laneOrders.preparing.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.laneTab, activeLane === 'ready' && styles.laneTabActive]}
          onPress={() => setActiveLane('ready')}
        >
          <Text style={[styles.laneTabText, activeLane === 'ready' && styles.laneTabTextActive]}>
            4. Ready / Dispatch ({laneOrders.ready.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.laneTab, activeLane === 'transit' && styles.laneTabActive]}
          onPress={() => setActiveLane('transit')}
        >
          <Text style={[styles.laneTabText, activeLane === 'transit' && styles.laneTabTextActive]}>
            5. In Transit ({laneOrders.transit.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.laneTab, activeLane === 'completed' && styles.laneTabActive]}
          onPress={() => setActiveLane('completed')}
        >
          <Text
            style={[styles.laneTabText, activeLane === 'completed' && styles.laneTabTextActive]}
          >
            6. Handed Over ({laneOrders.completed.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.laneTab, activeLane === 'cancelled' && styles.laneTabActive]}
          onPress={() => setActiveLane('cancelled')}
        >
          <Text
            style={[styles.laneTabText, activeLane === 'cancelled' && styles.laneTabTextActive]}
          >
            7. Cancelled ({laneOrders.cancelled.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Lane Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.neon} />
          <Text style={styles.loadingText}>Connecting to AY Pizza Live Kitchen Queue...</Text>
        </View>
      ) : currentLaneOrders.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyLaneTitle}>No orders in this lane</Text>
          <Text style={styles.emptyLaneSubtitle}>
            {activeLane === 'incoming'
              ? 'New confirmed orders from mobile customers will appear here in real time.'
              : 'All caught up! Orders move here as kitchen staff transitions them.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.ordersGrid}>
          {currentLaneOrders.map((order) => {
            const elapsed = getElapsedInfo(order.createdAt);
            const isActionLoading = actionLoadingId === order.id;

            return (
              <View key={order.id} style={styles.orderCard}>
                {/* Order Header */}
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                    <Text style={styles.customerName}>
                      {order.guestName || 'Customer'}{' '}
                      {order.guestPhone ? `(${order.guestPhone})` : ''}
                    </Text>
                  </View>

                  <View style={styles.timerContainer}>
                    <View
                      style={[
                        styles.timerBadge,
                        { borderColor: elapsed.badgeColor },
                      ]}
                    >
                      <Text style={[styles.timerText, { color: elapsed.badgeColor }]}>
                        ⏱ {elapsed.text}
                      </Text>
                    </View>
                    {elapsed.urgencyLabel === 'URGENT' && (
                      <Text style={styles.urgentLabel}>PRIORITY</Text>
                    )}
                  </View>
                </View>

                {/* Fulfillment and Payment Info */}
                <View style={styles.infoRow}>
                  <View
                    style={[
                      styles.fulfillmentBadge,
                      order.fulfillmentType === 'delivery'
                        ? styles.badgeDelivery
                        : styles.badgePickup,
                    ]}
                  >
                    <Text style={styles.fulfillmentBadgeText}>
                      {order.fulfillmentType === 'delivery'
                        ? '🛵 DELIVERY'
                        : '🏪 COUNTER PICKUP'}
                    </Text>
                  </View>

                  <View style={styles.paymentBadge}>
                    <Text style={styles.paymentBadgeText}>✓ PAID ₦{order.total.toLocaleString()}</Text>
                  </View>
                </View>

                {/* Delivery destination if delivery */}
                {order.fulfillmentType === 'delivery' && (
                  <View style={styles.destinationBox}>
                    <Text style={styles.destinationTitle}>Deliver to:</Text>
                    <Text style={styles.destinationAddress}>
                      {order.landmarkName || 'UNILAG Campus'} — {order.deliveryAddress || ''}
                    </Text>
                    {order.deliveryNotes ? (
                      <Text style={styles.destinationNotes}>
                        Notes: {order.deliveryNotes}
                      </Text>
                    ) : null}
                  </View>
                )}

                {/* Order Items */}
                <View style={styles.itemsSection}>
                  <Text style={styles.sectionHeader}>ITEMS ({order.items.length})</Text>
                  {order.items.map((item, idx) => (
                    <View key={item.id || idx} style={styles.itemRow}>
                      <View style={styles.itemQuantityBadge}>
                        <Text style={styles.itemQuantityText}>{item.quantity}x</Text>
                      </View>

                      <View style={styles.itemDetails}>
                        <Text style={styles.itemName}>
                          {item.productName}
                          {item.sizeName ? ` (${item.sizeName})` : ''}
                        </Text>

                        {/* Secondary Half & Half Flavor */}
                        {item.halfSecondaryFlavor ? (
                          <View style={styles.halfHalfBox}>
                            <Text style={styles.halfHalfText}>
                              🍕 Half: {item.halfSecondaryFlavor}
                            </Text>
                          </View>
                        ) : null}

                        {/* Customizations / Toppings */}
                        {item.customizations && item.customizations.length > 0 && (
                          <Text style={styles.customizationsText}>
                            + {item.customizations.map((c) => c.optionName).join(', ')}
                          </Text>
                        )}

                        {/* Special Instructions */}
                        {item.specialInstructions ? (
                          <Text style={styles.instructionsText}>
                            Note: &quot;{item.specialInstructions}&quot;
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>

                {/* Staff Notes if any */}
                {order.staffNotes ? (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesTitle}>Kitchen Notes:</Text>
                    <Text style={styles.notesContent}>{order.staffNotes}</Text>
                  </View>
                ) : null}

                {/* Rejection Reason if cancelled */}
                {order.rejectionReason ? (
                  <View style={styles.rejectionBox}>
                    <Text style={styles.rejectionTitle}>Cancellation Reason:</Text>
                    <Text style={styles.rejectionContent}>{order.rejectionReason}</Text>
                  </View>
                ) : null}

                {/* Refund Required Alert on Cancelled Paid Order */}
                {order.status === 'CANCELLED' && order.refundStatus === 'REFUND_REQUIRED' && (
                  <View style={styles.refundRequiredBox}>
                    <Text style={styles.refundRequiredTitle}>⚠️ REFUND REQUIRED (Manager Review)</Text>
                    <Text style={styles.refundRequiredContent}>
                      Customer was charged ₦{order.total.toLocaleString()} via Paystack. Admin/Manager must process refund via financial console.
                    </Text>
                  </View>
                )}

                {/* Staff Actions Bar */}
                <View style={styles.actionRow}>
                  {/* Action 1: Incoming (CONFIRMED) */}
                  {order.status === 'CONFIRMED' && (
                    <>
                      <TouchableOpacity
                        style={[
                          styles.actionButton,
                          styles.actionButtonAccept,
                          !hasPermission(activeRole, 'ACCEPT_ORDER') && styles.buttonDisabled,
                        ]}
                        disabled={isActionLoading || !hasPermission(activeRole, 'ACCEPT_ORDER')}
                        onPress={() => handleTransition(order, 'ACCEPTED')}
                      >
                        {isActionLoading ? (
                          <ActivityIndicator color={Colors.white} />
                        ) : (
                          <Text style={styles.actionButtonText}>✓ Accept Order</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.actionButton,
                          styles.actionButtonReject,
                          !hasPermission(activeRole, 'REJECT_ORDER') && styles.buttonDisabled,
                        ]}
                        disabled={isActionLoading || !hasPermission(activeRole, 'REJECT_ORDER')}
                        onPress={() => handleOpenRejection(order)}
                      >
                        <Text style={styles.actionButtonRejectText}>
                          {hasPermission(activeRole, 'REJECT_ORDER') ? '✕ Reject' : '✕ Reject (Mgr Only)'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Action 2: Accepted (ACCEPTED) */}
                  {order.status === 'ACCEPTED' && (
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.actionButtonPreparing,
                        !hasPermission(activeRole, 'UPDATE_ORDER_PREPARATION_STATUS') &&
                          styles.buttonDisabled,
                      ]}
                      disabled={
                        isActionLoading ||
                        !hasPermission(activeRole, 'UPDATE_ORDER_PREPARATION_STATUS')
                      }
                      onPress={() => handleTransition(order, 'PREPARING')}
                    >
                      {isActionLoading ? (
                        <ActivityIndicator color={Colors.white} />
                      ) : (
                        <Text style={styles.actionButtonText}>🔥 Start In Oven</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Action 3: In Oven (PREPARING) */}
                  {order.status === 'PREPARING' && (
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.actionButtonReady,
                        !hasPermission(activeRole, 'MARK_ORDER_READY') && styles.buttonDisabled,
                      ]}
                      disabled={
                        isActionLoading || !hasPermission(activeRole, 'MARK_ORDER_READY')
                      }
                      onPress={() => handleTransition(order, 'READY_FOR_PICKUP')}
                    >
                      {isActionLoading ? (
                        <ActivityIndicator color={Colors.night} />
                      ) : (
                        <Text style={styles.actionButtonReadyText}>
                          {order.fulfillmentType === 'delivery'
                            ? '📦 Boxed — Awaiting Dispatch'
                            : '📦 Ready for Counter Pickup'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Action 4: Ready for Pickup / Awaiting Dispatch (READY_FOR_PICKUP) */}
                  {order.status === 'READY_FOR_PICKUP' && (
                    order.fulfillmentType === 'pickup' ? (
                      <TouchableOpacity
                        style={[
                          styles.actionButton,
                          styles.actionButtonComplete,
                          !hasPermission(activeRole, 'COMPLETE_ORDER_HANDOVER') &&
                            styles.buttonDisabled,
                        ]}
                        disabled={
                          isActionLoading ||
                          !hasPermission(activeRole, 'COMPLETE_ORDER_HANDOVER')
                        }
                        onPress={() => handleTransition(order, 'DELIVERED')}
                      >
                        {isActionLoading ? (
                          <ActivityIndicator color={Colors.white} />
                        ) : (
                          <Text style={styles.actionButtonText}>✓ Hand Over to Customer</Text>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.actionButton,
                          styles.actionButtonTransit,
                          !hasPermission(activeRole, 'COMPLETE_ORDER_HANDOVER') &&
                            styles.buttonDisabled,
                        ]}
                        disabled={
                          isActionLoading ||
                          !hasPermission(activeRole, 'COMPLETE_ORDER_HANDOVER')
                        }
                        onPress={() => handleTransition(order, 'IN_TRANSIT')}
                      >
                        {isActionLoading ? (
                          <ActivityIndicator color={Colors.white} />
                        ) : (
                          <Text style={styles.actionButtonText}>🛵 Dispatch with Rider</Text>
                        )}
                      </TouchableOpacity>
                    )
                  )}

                  {/* Action 5: Out for Delivery (IN_TRANSIT) */}
                  {order.status === 'IN_TRANSIT' && (
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.actionButtonComplete,
                        !hasPermission(activeRole, 'UPDATE_DELIVERY_STATUS') &&
                          styles.buttonDisabled,
                      ]}
                      disabled={
                        isActionLoading ||
                        !hasPermission(activeRole, 'UPDATE_DELIVERY_STATUS')
                      }
                      onPress={() => handleTransition(order, 'DELIVERED')}
                    >
                      {isActionLoading ? (
                        <ActivityIndicator color={Colors.white} />
                      ) : (
                        <Text style={styles.actionButtonText}>✓ Confirm Delivered to Customer</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Staff Notes Button */}
                  <TouchableOpacity
                    style={styles.actionNotesButton}
                    onPress={() => handleOpenNotes(order)}
                  >
                    <Text style={styles.actionNotesText}>📝 Note</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Modal: Rejection Reason Dialog */}
      <Modal visible={rejectionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <Text style={styles.modalTitle}>Reject Order {orderToReject?.orderNumber}</Text>
            <Text style={styles.modalSubtitle}>
              Please select or enter the operational reason for rejecting this order:
            </Text>

            {/* Quick preset chips */}
            <View style={styles.presetChips}>
              {[
                'Out of Pizza Dough / Cheese',
                'Kitchen Overloaded (>45m backlogged)',
                'Ingredient Expired or Unavailable',
                'Store Closing / Generator Maintenance',
              ].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={styles.presetChip}
                  onPress={() => setRejectionReason(preset)}
                >
                  <Text style={styles.presetChipText}>{preset}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.reasonInput}
              placeholder="Or enter custom rejection reason..."
              placeholderTextColor={Colors.textMuted}
              multiline
              value={rejectionReason}
              onChangeText={(text) => {
                setRejectionReason(text);
                setRejectionError(null);
              }}
            />

            {rejectionError && <Text style={styles.errorText}>{rejectionError}</Text>}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelModalButton}
                onPress={() => setRejectionModalVisible(false)}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmRejectButton}
                onPress={handleConfirmRejection}
              >
                <Text style={styles.confirmRejectText}>Confirm Rejection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Staff Kitchen Notes */}
      <Modal visible={notesModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <Text style={styles.modalTitle}>Staff Note: {orderForNotes?.orderNumber}</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="e.g. Extra garlic sauce requested at counter..."
              placeholderTextColor={Colors.textMuted}
              multiline
              value={staffNotesText}
              onChangeText={setStaffNotesText}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelModalButton}
                onPress={() => setNotesModalVisible(false)}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.confirmSaveButton} onPress={handleSaveNotes}>
                <Text style={styles.confirmSaveText}>Save Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#160d07', // Dark kitchen background
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    flexWrap: 'wrap',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'column',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.neon,
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.frost,
    opacity: 0.8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 6,
  },
  pillConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  pillReconnecting: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
  },
  iconButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 232, 214, 0.1)',
    borderRadius: 16,
  },
  iconButtonActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.25)',
  },
  iconButtonText: {
    fontSize: 12,
    color: Colors.white,
    fontWeight: '600',
  },
  rolePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
  },
  roleLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginRight: 2,
  },
  roleChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleChipActive: {
    backgroundColor: Colors.lava,
  },
  roleChipText: {
    fontSize: 10,
    color: Colors.frost,
    fontWeight: '700',
  },
  roleChipTextActive: {
    color: Colors.white,
  },
  roleBadgeContainer: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.neon,
  },
  roleBadgeText: {
    fontSize: 11,
    color: Colors.neon,
    fontWeight: '800',
  },
  refreshButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  refreshText: {
    fontSize: 12,
    color: Colors.white,
    fontWeight: '700',
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
  },
  closeText: {
    fontSize: 12,
    color: Colors.status.cancelled,
    fontWeight: '700',
  },
  laneBar: {
    flexDirection: 'row',
    backgroundColor: '#20130a',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  laneTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  laneTabActive: {
    borderBottomColor: Colors.neon,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
  },
  laneTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  laneTabTextActive: {
    color: Colors.neon,
    fontWeight: '800',
  },
  incomingBadge: {
    position: 'absolute',
    top: 6,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.status.cancelled,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    color: Colors.frost,
  },
  emptyLaneTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.frost,
    marginBottom: 6,
  },
  emptyLaneSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 400,
  },
  ordersGrid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  orderCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
    minWidth: 320,
    maxWidth: 420,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.neon,
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: 13,
    color: Colors.frost,
    marginTop: 2,
    fontWeight: '600',
  },
  timerContainer: {
    alignItems: 'flex-end',
  },
  timerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  timerText: {
    fontSize: 12,
    fontWeight: '800',
  },
  urgentLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: Colors.status.cancelled,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  fulfillmentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeDelivery: {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
  },
  badgePickup: {
    backgroundColor: 'rgba(6, 182, 212, 0.25)',
  },
  fulfillmentBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.white,
  },
  paymentBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  paymentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.status.paid,
  },
  destinationBox: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#8b5cf6',
  },
  destinationTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#a78bfa',
    textTransform: 'uppercase',
  },
  destinationAddress: {
    fontSize: 12,
    color: Colors.frost,
    fontWeight: '600',
    marginTop: 2,
  },
  destinationNotes: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  itemsSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: 10,
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  itemQuantityBadge: {
    backgroundColor: Colors.lava,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  itemQuantityText: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.white,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  halfHalfBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  halfHalfText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.neon,
  },
  customizationsText: {
    fontSize: 12,
    color: Colors.frost,
    opacity: 0.9,
    marginTop: 2,
  },
  instructionsText: {
    fontSize: 11,
    color: '#fca5a5',
    fontStyle: 'italic',
    marginTop: 3,
  },
  notesBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.neon,
  },
  notesContent: {
    fontSize: 12,
    color: Colors.frost,
    marginTop: 2,
  },
  rejectionBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  rejectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.status.cancelled,
  },
  rejectionContent: {
    fontSize: 12,
    color: '#fca5a5',
    marginTop: 2,
  },
  refundRequiredBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1.5,
    borderColor: Colors.status.cancelled,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  refundRequiredTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#f87171',
    letterSpacing: 0.5,
  },
  refundRequiredContent: {
    fontSize: 11,
    color: Colors.white,
    marginTop: 3,
    fontWeight: '600',
  },
  refundSettledBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  refundSettledText: {
    fontSize: 11,
    color: Colors.status.paid,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonAccept: {
    backgroundColor: Colors.status.paid,
  },
  actionButtonTransit: {
    backgroundColor: '#8b5cf6', // Purple dispatch
  },
  actionButtonReject: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.status.cancelled,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  actionButtonPreparing: {
    backgroundColor: Colors.lava,
  },
  actionButtonReady: {
    backgroundColor: Colors.neon,
  },
  actionButtonComplete: {
    backgroundColor: '#059669',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.white,
  },
  actionButtonReadyText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.night,
  },
  actionButtonRejectText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.status.cancelled,
  },
  actionNotesButton: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 232, 214, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionNotesText: {
    fontSize: 12,
    color: Colors.frost,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalDialog: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 14,
  },
  presetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  presetChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 232, 214, 0.15)',
  },
  presetChipText: {
    fontSize: 11,
    color: Colors.frost,
  },
  reasonInput: {
    backgroundColor: '#160d07',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    color: Colors.white,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 13,
  },
  errorText: {
    color: Colors.status.cancelled,
    fontSize: 12,
    marginTop: 6,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelModalButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  cancelModalText: {
    color: Colors.frost,
    fontWeight: '700',
    fontSize: 13,
  },
  confirmRejectButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.status.cancelled,
  },
  confirmRejectText: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: 13,
  },
  confirmSaveButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.status.paid,
  },
  confirmSaveText: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: 13,
  },
});
