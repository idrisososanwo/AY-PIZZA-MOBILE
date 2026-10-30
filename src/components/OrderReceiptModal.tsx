import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { CartItem } from '../domains/cart/cart-types';

interface OrderReceiptModalProps {
  visible: boolean;
  orderNumber: string;
  paymentReference: string;
  receiptToken: string;
  customerName: string;
  fulfillmentType: 'pickup' | 'delivery';
  landmarkName?: string;
  deliveryAddress?: string;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  onDone: () => void;
  onTrackOrder?: () => void;
}

export const OrderReceiptModal: React.FC<OrderReceiptModalProps> = ({
  visible,
  orderNumber,
  paymentReference,
  receiptToken,
  customerName,
  fulfillmentType,
  landmarkName,
  deliveryAddress,
  items,
  subtotal,
  deliveryFee,
  total,
  onDone,
  onTrackOrder,
}) => {
  const insets = useSafeAreaInsets();
  const isDelivery = fulfillmentType === 'delivery';

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
          {/* Success Banner */}
          <View style={styles.successBadgeBox}>
            <Text style={styles.successEmoji}>🍕🎉</Text>
            <Text style={styles.successTitle}>Payment Verified!</Text>
            <Text style={styles.successSubtitle}>
              Your order has been confirmed and sent to AY Pizza kitchen.
            </Text>
          </View>

          {/* Receipt Card */}
          <View style={styles.receiptCard}>
            <View style={styles.receiptHeader}>
              <Text style={styles.brandTitle}>AY PIZZA (UNILAG)</Text>
              <Text style={styles.brandLocation}>Opposite King Jaja Hall, UNILAG, Akoka</Text>
              <Text style={styles.receiptTimestamp}>
                Date: {new Date().toLocaleDateString('en-GB')} • {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            <View style={styles.divider} />

            {/* Key Order Metadata */}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Order Number:</Text>
              <Text style={styles.metaValueHighlight}>{orderNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Payment Reference:</Text>
              <Text style={styles.metaValue}>{paymentReference.slice(0, 24)}...</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Customer Name:</Text>
              <Text style={styles.metaValue}>{customerName}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Fulfillment:</Text>
              <Text style={styles.metaValue}>
                {isDelivery ? `Delivery (${landmarkName || 'Campus'})` : 'Pickup at King Jaja Hall'}
              </Text>
            </View>
            {isDelivery && deliveryAddress && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Delivery Address:</Text>
                <Text style={styles.metaValue}>{deliveryAddress}</Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* Purchased Items List */}
            <Text style={styles.itemsSectionTitle}>Purchased Items</Text>
            {items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>
                    {item.quantity}x {item.productName}
                    {item.sizeName ? ` (${item.sizeName})` : ''}
                  </Text>
                  {item.halfSecondaryFlavor && (
                    <Text style={styles.itemSubtext}>🍕 Half: {item.halfSecondaryFlavor}</Text>
                  )}
                  {item.customizations
                    .filter((c) => !c.optionId.startsWith('half-'))
                    .map((c, i) => (
                      <Text key={i} style={styles.itemSubtext}>
                        + {c.optionName}
                      </Text>
                    ))}
                </View>
                <Text style={styles.itemPrice}>₦{item.lineTotal.toLocaleString()}</Text>
              </View>
            ))}

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
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total Paid:</Text>
              <Text style={styles.totalValue}>₦{total.toLocaleString()}</Text>
            </View>

            <View style={styles.divider} />

            {/* Verified Digital Receipt Notice */}
            <View style={styles.tokenBox}>
              <Text style={styles.tokenLabel}>Digital Receipt Verified</Text>
              <Text style={styles.tokenText}>Order #{orderNumber}</Text>
              <Text style={styles.tokenNote}>
                ✅ Stored securely on your device. Show this order number when collecting your pizza opposite King Jaja Hall.
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          {onTrackOrder && (
            <TouchableOpacity
              style={[styles.doneBtn, { backgroundColor: Colors.lava, marginBottom: 12 }]}
              onPress={onTrackOrder}
              activeOpacity={0.85}
            >
              <Text style={styles.doneBtnText}>Track Order Live 📡</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.doneBtn,
              onTrackOrder
                ? { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: Colors.charcoal, shadowOpacity: 0 }
                : null,
            ]}
            onPress={onDone}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.doneBtnText,
                onTrackOrder ? { color: Colors.frost, fontWeight: '700' } : null,
              ]}
            >
              Back to Menu & Order More 🍕
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
    backgroundColor: Colors.night,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  successBadgeBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  successEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.neon,
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 13,
    color: Colors.frost,
    textAlign: 'center',
  },
  receiptCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.charcoal,
    marginBottom: 24,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  brandTitle: {
    color: Colors.frost,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  brandLocation: {
    color: Colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  receiptTimestamp: {
    color: Colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.charcoal,
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metaLabel: {
    color: Colors.muted,
    fontSize: 12,
  },
  metaValue: {
    color: Colors.frost,
    fontSize: 12,
    fontWeight: '600',
  },
  metaValueHighlight: {
    color: Colors.neon,
    fontSize: 13,
    fontWeight: '800',
  },
  itemsSectionTitle: {
    color: Colors.frost,
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
    color: Colors.frost,
    fontSize: 13,
    fontWeight: '700',
  },
  itemSubtext: {
    color: Colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  itemPrice: {
    color: Colors.frost,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    color: Colors.muted,
    fontSize: 13,
  },
  summaryValue: {
    color: Colors.frost,
    fontSize: 13,
    fontWeight: '600',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.charcoal,
    marginTop: 8,
    paddingTop: 8,
  },
  totalLabel: {
    color: Colors.frost,
    fontSize: 16,
    fontWeight: '800',
  },
  totalValue: {
    color: Colors.neon,
    fontSize: 18,
    fontWeight: '900',
  },
  tokenBox: {
    backgroundColor: Colors.night,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.charcoal,
  },
  tokenLabel: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  tokenText: {
    color: Colors.frost,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  tokenNote: {
    color: Colors.muted,
    fontSize: 10,
    marginTop: 4,
  },
  doneBtn: {
    backgroundColor: Colors.lava,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.lava,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});
