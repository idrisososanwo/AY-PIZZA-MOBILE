import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Share,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Shadows } from '../constants/theme';
import { Brand } from '../constants/brand';
import { CartItem } from '../domains/cart/cart-types';
import { OrderItem, OrderStatus } from '../types/order';

// Approved Master Concept 3 Brand Monogram Asset
const BrandLogo = require('../../assets/brand-logo.png');

export interface ReceiptItemDisplay {
  quantity: number;
  productName: string;
  sizeName?: string;
  lineTotal?: number;
  itemTotal?: number;
  halfSecondaryFlavor?: string;
  customizations?: {
    optionName: string;
    price?: number;
    optionId?: string;
  }[];
}

export interface OrderReceiptModalProps {
  visible: boolean;
  orderNumber: string;
  paymentReference: string;
  receiptToken: string;
  customerName: string;
  fulfillmentType: 'pickup' | 'delivery';
  landmarkName?: string;
  deliveryAddress?: string;
  items: (CartItem | OrderItem | ReceiptItemDisplay)[];
  subtotal: number;
  deliveryFee: number;
  discountAmount?: number;
  total: number;
  onDone: () => void;
  onTrackOrder?: () => void;
  onCancelOrder?: () => void;
  // Extended lifecycle and payment metadata
  orderDate?: string;
  orderStatus?: OrderStatus;
  paymentStatus?: string;
  refundStatus?: string;
  acceptedAt?: string | null;
  preparedAt?: string | null;
  readyAt?: string | null;
  inTransitAt?: string | null;
  completedAt?: string | null;
}

/**
 * Builds a sanitized, shareable plain-text receipt.
 * Strictly avoids exposing receipt tokens, secret credentials, or customer passwords.
 */
export function buildSanitizedReceiptText(props: {
  orderNumber: string;
  orderDate?: string;
  customerName: string;
  fulfillmentType: 'pickup' | 'delivery';
  landmarkName?: string;
  deliveryAddress?: string;
  items: (CartItem | OrderItem | ReceiptItemDisplay)[];
  subtotal: number;
  deliveryFee: number;
  discountAmount?: number;
  total: number;
  paymentStatus: string;
}): string {
  const isDelivery = props.fulfillmentType === 'delivery';
  const destination = isDelivery
    ? `Campus Delivery (${props.landmarkName || 'UNILAG Campus'}${props.deliveryAddress ? ` - ${props.deliveryAddress}` : ''})`
    : `Counter Pickup (${Brand.location.address})`;

  const dateText = props.orderDate || new Date().toLocaleString('en-GB');

  const itemsLines = props.items
    .map((item) => {
      const sizeStr = item.sizeName ? ` (${item.sizeName})` : '';
      const halfStr = item.halfSecondaryFlavor ? `\n   Half: ${item.halfSecondaryFlavor}` : '';
      const customStr = (item.customizations || [])
        .filter((c) => !c.optionId || !c.optionId.startsWith('half-'))
        .map((c) => `\n   + ${c.optionName}`)
        .join('');
      const itemPrice = (('lineTotal' in item ? item.lineTotal : (item as any).itemTotal) ?? 0);
      const price = itemPrice.toLocaleString();
      return `• ${item.quantity}x ${item.productName}${sizeStr} — ₦${price}${halfStr}${customStr}`;
    })
    .join('\n');

  const discountLine =
    props.discountAmount && props.discountAmount > 0
      ? `\nDiscount: -₦${props.discountAmount.toLocaleString()}`
      : '';

  return (
    `🍕 ${Brand.officialWordmark}\n` +
    `${Brand.officialTagline}\n` +
    `----------------------------------------\n` +
    `Digital Order Receipt: #${props.orderNumber}\n` +
    `Date: ${dateText}\n` +
    `Customer: ${props.customerName || 'Valued Customer'}\n` +
    `Fulfilment: ${destination}\n` +
    `Payment Status: ${props.paymentStatus}\n` +
    `----------------------------------------\n` +
    `PURCHASED ITEMS:\n${itemsLines}\n` +
    `----------------------------------------\n` +
    `Subtotal: ₦${props.subtotal.toLocaleString()}\n` +
    `Delivery Fee: ${props.deliveryFee === 0 ? 'FREE (₦0)' : `₦${props.deliveryFee.toLocaleString()}`}${discountLine}\n` +
    `TOTAL: ₦${props.total.toLocaleString()}\n` +
    `----------------------------------------\n` +
    `Location: ${Brand.location.address}\n` +
    `Thank you for ordering with AY Pizza & Ice Cream!`
  );
}

export const OrderReceiptModal: React.FC<OrderReceiptModalProps> = ({
  visible,
  orderNumber,
  paymentReference,
  receiptToken: _receiptToken,
  customerName,
  fulfillmentType,
  landmarkName,
  deliveryAddress,
  items,
  subtotal,
  deliveryFee,
  discountAmount = 0,
  total,
  onDone,
  onTrackOrder,
  onCancelOrder,
  orderDate,
  orderStatus,
  paymentStatus,
  refundStatus,
  acceptedAt,
  preparedAt,
  readyAt,
  inTransitAt,
  completedAt,
}) => {
  const insets = useSafeAreaInsets();
  const isDelivery = fulfillmentType === 'delivery';

  // Determine authoritative payment status text
  const isVerifiedPaid = !!orderStatus && [
    'CONFIRMED',
    'ACCEPTED',
    'PREPARING',
    'READY_FOR_PICKUP',
    'IN_TRANSIT',
    'DELIVERED',
  ].includes(orderStatus);

  const resolvedPaymentStatus =
    paymentStatus ||
    (orderStatus === 'REFUNDED'
      ? 'Refund Confirmed ✅'
      : orderStatus === 'CANCELLED'
      ? refundStatus === 'REFUNDED'
        ? 'Refund Confirmed ✅'
        : 'Cancelled (Refund Flagged / Pending Review) 💳'
      : orderStatus === 'PENDING_PAYMENT'
      ? 'Payment Pending ⏳'
      : isVerifiedPaid
      ? 'Verified Paid via Paystack ✅'
      : 'Payment Verified ✅');

  const formattedDate =
    orderDate ||
    `${new Date().toLocaleDateString('en-GB')} • ${new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;

  const handleShare = async () => {
    try {
      const message = buildSanitizedReceiptText({
        orderNumber,
        orderDate: formattedDate,
        customerName,
        fulfillmentType,
        landmarkName,
        deliveryAddress,
        items,
        subtotal,
        deliveryFee,
        discountAmount,
        total,
        paymentStatus: resolvedPaymentStatus,
      });

      await Share.share({
        title: `AY Pizza Receipt #${orderNumber}`,
        message,
      });
    } catch {
      Alert.alert('Notice', 'Unable to open share dialogue on this device.');
    }
  };

  const isOrderActive =
    !!orderStatus &&
    orderStatus !== 'DELIVERED' &&
    orderStatus !== 'CANCELLED' &&
    orderStatus !== 'REFUNDED';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onDone}>
      <View
        style={[
          styles.container,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Status Banner */}
          <View style={styles.successBadgeBox}>
            <Text style={styles.successEmoji}>
              {orderStatus === 'CANCELLED'
                ? '🚫'
                : orderStatus === 'REFUNDED'
                ? '💳'
                : orderStatus === 'DELIVERED'
                ? '✅'
                : '🍕🎉'}
            </Text>
            <Text style={styles.successTitle}>
              {orderStatus === 'CANCELLED'
                ? 'Order Cancelled'
                : orderStatus === 'REFUNDED'
                ? 'Order Refunded'
                : orderStatus === 'DELIVERED'
                ? 'Order Completed'
                : 'Payment Verified!'}
            </Text>
            <Text style={styles.successSubtitle}>
              {orderStatus === 'CANCELLED'
                ? 'This order was cancelled before kitchen acceptance.'
                : orderStatus === 'REFUNDED'
                ? 'Refund has been confirmed for this transaction.'
                : orderStatus === 'DELIVERED'
                ? 'Order successfully delivered. Hope you enjoyed your meal!'
                : 'Your order has been authoritatively confirmed and queued at AY Pizza.'}
            </Text>
          </View>

          {/* Receipt Card */}
          <View style={styles.receiptCard}>
            {/* Approved Brand Logo & Wordmark Header */}
            <View style={styles.receiptHeader}>
              <Image source={BrandLogo} style={styles.brandLogo} resizeMode="contain" />
              <Text style={styles.brandTitle}>{Brand.officialWordmark}</Text>
              <Text style={styles.brandTagline}>{Brand.officialTagline}</Text>
              <Text style={styles.brandLocation}>{Brand.location.address}</Text>
              <Text style={styles.receiptTimestamp}>Date: {formattedDate}</Text>
            </View>

            <View style={styles.divider} />

            {/* Key Order Metadata */}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Order Number:</Text>
              <Text style={styles.metaValueHighlight}>#{orderNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Payment Method:</Text>
              <Text style={styles.metaValue}>Paystack</Text>
            </View>
            {paymentReference ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Payment Ref:</Text>
                <Text style={styles.metaValue}>
                  {paymentReference.length > 20
                    ? `${paymentReference.slice(0, 18)}...`
                    : paymentReference}
                </Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Payment Status:</Text>
              <Text
                style={[
                  styles.metaValue,
                  isVerifiedPaid ? styles.statusPaidText : styles.statusNeutralText,
                ]}
              >
                {resolvedPaymentStatus}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Customer Name:</Text>
              <Text style={styles.metaValue}>{customerName || 'Valued Customer'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Fulfillment:</Text>
              <Text style={styles.metaValue}>
                {isDelivery
                  ? `🛵 Campus Delivery (${landmarkName || 'UNILAG Campus'})`
                  : '🏬 Counter Pickup at King Jaja'}
              </Text>
            </View>
            {isDelivery && deliveryAddress ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Delivery Address:</Text>
                <Text style={[styles.metaValue, { flex: 1, textAlign: 'right', marginLeft: 12 }]}>
                  {deliveryAddress}
                </Text>
              </View>
            ) : null}

            <View style={styles.divider} />

            {/* Purchased Items List */}
            <Text style={styles.itemsSectionTitle}>Purchased Items</Text>
            {items.map((item, index) => {
              const itemTotal = (('lineTotal' in item ? item.lineTotal : (item as any).itemTotal) ?? 0);
              return (
                <View key={index} style={styles.itemRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.itemName}>
                      {item.quantity}x {item.productName}
                      {item.sizeName ? ` (${item.sizeName})` : ''}
                    </Text>
                    {item.halfSecondaryFlavor && (
                      <Text style={styles.itemSubtext}>🍕 Half: {item.halfSecondaryFlavor}</Text>
                    )}
                    {item.customizations &&
                      item.customizations
                        .filter((c) => !c.optionId || !c.optionId.startsWith('half-'))
                        .map((c, i) => (
                          <Text key={i} style={styles.itemSubtext}>
                            + {c.optionName}
                          </Text>
                        ))}
                  </View>
                  <Text style={styles.itemPrice}>₦{itemTotal.toLocaleString()}</Text>
                </View>
              );
            })}

            <View style={styles.divider} />

            {/* Financial Summary */}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal:</Text>
              <Text style={styles.summaryValue}>₦{subtotal.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery Fee:</Text>
              <Text style={styles.summaryValue}>
                {deliveryFee === 0 ? 'FREE (₦0)' : `₦${deliveryFee.toLocaleString()}`}
              </Text>
            </View>
            {discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Discount:</Text>
                <Text style={styles.discountValue}>-₦{discountAmount.toLocaleString()}</Text>
              </View>
            )}
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>
                {orderStatus === 'REFUNDED' ? 'Amount Refunded:' : 'Total Paid:'}
              </Text>
              <Text style={styles.totalValue}>₦{total.toLocaleString()}</Text>
            </View>

            {/* Order Timestamps Lifecycle (if present) */}
            {(acceptedAt || preparedAt || readyAt || inTransitAt || completedAt) && (
              <>
                <View style={styles.divider} />
                <Text style={styles.itemsSectionTitle}>Order Lifecycle Timestamps</Text>
                {acceptedAt && (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Kitchen Accepted:</Text>
                    <Text style={styles.metaValue}>
                      {new Date(acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                )}
                {preparedAt && (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Oven Baked:</Text>
                    <Text style={styles.metaValue}>
                      {new Date(preparedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                )}
                {readyAt && (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Ready for Collection:</Text>
                    <Text style={styles.metaValue}>
                      {new Date(readyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                )}
                {inTransitAt && (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Out for Delivery:</Text>
                    <Text style={styles.metaValue}>
                      {new Date(inTransitAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                )}
                {completedAt && (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Completed:</Text>
                    <Text style={styles.metaValue}>
                      {new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                )}
              </>
            )}

            <View style={styles.divider} />

            {/* Verified Digital Receipt Notice */}
            <View style={styles.tokenBox}>
              <Text style={styles.tokenLabel}>Authoritative Digital Receipt</Text>
              <Text style={styles.tokenText}>Order #{orderNumber}</Text>
              <Text style={styles.tokenNote}>
                ✅ Stored securely on your device. Show this order number when collecting your pizza opposite King Jaja Hall or to the courier upon delivery.
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.shareBtn]}
            onPress={handleShare}
            activeOpacity={0.85}
          >
            <Text style={styles.shareBtnText}>Share Digital Receipt 📤</Text>
          </TouchableOpacity>

          {isOrderActive && onTrackOrder && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.trackLiveBtn]}
              onPress={onTrackOrder}
              activeOpacity={0.85}
            >
              <Text style={[styles.actionBtnText, styles.primaryBtnText]}>Track Order Live 📡</Text>
            </TouchableOpacity>
          )}

          {/* Cancel Order (Eligible strictly while in CONFIRMED status before kitchen acceptance) */}
          {orderStatus === 'CONFIRMED' && onCancelOrder && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={onCancelOrder}
              activeOpacity={0.85}
              testID="receipt-cancel-order-btn"
            >
              <Text style={styles.cancelBtnText}>Cancel Order ✕</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.actionBtn,
              isOrderActive && onTrackOrder ? styles.secondaryBtn : styles.primaryBtn,
            ]}
            onPress={onDone}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.actionBtnText,
                isOrderActive && onTrackOrder ? styles.secondaryBtnText : styles.primaryBtnText,
              ]}
            >
              {isOrderActive ? 'Back to Menu & Order More 🍕' : 'Close Receipt ✕'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.warmCream,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  successBadgeBox: {
    alignItems: 'center',
    marginBottom: 16,
  },
  successEmoji: {
    fontSize: 44,
    marginBottom: 6,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.primaryRed,
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  receiptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: 20,
    ...Shadows.card,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  brandLogo: {
    width: 54,
    height: 54,
    marginBottom: 8,
  },
  brandTitle: {
    color: Colors.primaryRed,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  brandTagline: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  brandLocation: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 3,
    textAlign: 'center',
  },
  receiptTimestamp: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    alignItems: 'center',
  },
  metaLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  metaValue: {
    color: Colors.charcoal,
    fontSize: 12,
    fontWeight: '700',
  },
  metaValueHighlight: {
    color: Colors.primaryRed,
    fontSize: 13,
    fontWeight: '900',
  },
  statusPaidText: {
    color: Colors.freshGreen,
    fontWeight: '800',
  },
  statusNeutralText: {
    color: Colors.charcoal,
    fontWeight: '700',
  },
  itemsSectionTitle: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  itemName: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '700',
  },
  itemSubtext: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  itemPrice: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '800',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  summaryValue: {
    color: Colors.charcoal,
    fontSize: 13,
    fontWeight: '700',
  },
  discountValue: {
    color: Colors.freshGreen,
    fontSize: 13,
    fontWeight: '700',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderMedium,
    marginTop: 8,
    paddingTop: 8,
  },
  totalLabel: {
    color: Colors.charcoal,
    fontSize: 15,
    fontWeight: '800',
  },
  totalValue: {
    color: Colors.primaryRed,
    fontSize: 18,
    fontWeight: '900',
  },
  tokenBox: {
    backgroundColor: Colors.surfaceCream,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.15)',
  },
  tokenLabel: {
    color: Colors.primaryRed,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  tokenText: {
    color: Colors.charcoal,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  tokenNote: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  actionBtn: {
    minHeight: 48,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  shareBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.primaryRed,
  },
  shareBtnText: {
    color: Colors.primaryRed,
    fontSize: 15,
    fontWeight: '800',
  },
  trackLiveBtn: {
    backgroundColor: Colors.primaryRed,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryBtn: {
    backgroundColor: Colors.primaryRed,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.borderMedium,
  },
  cancelBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#DC2626',
    textAlign: 'center',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  primaryBtnText: {
    color: '#FFFFFF',
  },
  secondaryBtnText: {
    color: Colors.charcoal,
  },
});
