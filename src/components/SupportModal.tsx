import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Brand } from '../constants/brand';

interface SupportModalProps {
  visible: boolean;
  onClose: () => void;
  orderNumber?: string;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: 'how-to-order',
    question: 'How do I place an order?',
    answer:
      'Browse our catalog, customize your pizzas with sizes, toppings, or Half-and-Half split options, and add items to your cart. Tap "Proceed to Checkout", select either King Jaja Hall pickup or UNILAG campus delivery, enter your contact information, and pay securely via Paystack.',
  },
  {
    id: 'delivery-and-pickup',
    question: 'How do Delivery and Pickup work?',
    answer:
      `• Counter Pickup (₦0 Free): Collect your hot pizza directly from the AY Pizza counter opposite King Jaja Hall, UNILAG Main Campus.\n• Campus Delivery (₦${Brand.fulfillment.campusDeliveryFee} Flat): Our couriers deliver to all UNILAG hostels, faculties, and verified campus zones. Enter your landmark and room number for seamless handover.`,
  },
  {
    id: 'payment-troubleshooting',
    question: 'What if I was debited but my order shows pending?',
    answer:
      'Do not pay twice! Bank networks occasionally delay confirmation signals. Tap "Re-check Status" on the payment modal. Our server automatically reconciles with Paystack via webhooks. If your account was debited, your order will confirm automatically once verified.',
  },
  {
    id: 'cancellation-policy',
    question: 'Can I cancel an order after placing it?',
    answer:
      'Yes. You can cancel your order directly from the My Orders list, the live tracking screen, or your digital receipt while it remains in "Confirmed" status (before our kitchen team accepts it). Once kitchen preparation begins ("Accepted" or "In Pizza Oven"), ingredients are in the oven and the order can no longer be self-cancelled.',
  },
  {
    id: 'refund-policy',
    question: 'How do refunds work for cancelled orders?',
    answer:
      'When an order is cancelled, it is immediately flagged in our database for refund ("REFUND_REQUIRED"). Our store manager verifies the transaction and triggers a Paystack refund directly to your original payment card or bank account. Actual bank crediting depends on your financial institution\'s settlement cycle.',
  },
  {
    id: 'saved-addresses',
    question: 'How do I save and manage delivery addresses?',
    answer:
      'In the Account tab, tap "Saved Delivery Addresses". You can add new campus locations with hostel and room details, set a default address for 1-tap checkout, or edit and delete saved locations. Guest users have addresses saved safely to their device, while logged-in customers have addresses synchronized to their profile.',
  },
];

export const SupportModal: React.FC<SupportModalProps> = ({
  visible,
  onClose,
  orderNumber,
}) => {
  const insets = useSafeAreaInsets();
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  const toggleFaq = (id: string) => {
    setExpandedFaqId((prev) => (prev === id ? null : id));
  };

  const handleCall = () => {
    if (!Brand.contact.isPhoneVerified) {
      Alert.alert(
        'Phone Line Verification Pending',
        `The telephone hotline (${Brand.contact.phone}) is currently awaiting restaurant owner verification. For immediate assistance, please visit our counter opposite King Jaja Hall or email ${Brand.contact.email}.`
      );
      return;
    }
    Linking.openURL(`tel:${Brand.contact.phone.replace(/\s+/g, '')}`);
  };

  const handleWhatsApp = () => {
    if (!Brand.contact.isWhatsAppVerified) {
      Alert.alert(
        'WhatsApp Verification Pending',
        `AY Pizza management is currently verifying the official WhatsApp support line. To ensure your request is securely handled, please visit our counter opposite King Jaja Hall or email ${Brand.contact.email}.`
      );
      return;
    }
    const text = orderNumber
      ? `Hello AY Pizza, I need support regarding Order #${orderNumber}.`
      : 'Hello AY Pizza, I need assistance with my order.';
    const url = `${Brand.contact.whatsappUrl}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url);
  };

  const handleEmail = () => {
    const subject = orderNumber
      ? `Support Request - Order #${orderNumber}`
      : 'AY Pizza Customer Support';
    Linking.openURL(`mailto:${Brand.contact.email}?subject=${encodeURIComponent(subject)}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.title}>Customer Support & FAQs 💬</Text>
              <Text style={styles.subtitle}>Direct assistance for UNILAG campus orders</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 12, 28) }}
            showsVerticalScrollIndicator={false}
          >
            {orderNumber && (
              <View style={styles.orderContextCard}>
                <Text style={styles.orderContextLabel}>Inquiry Regarding</Text>
                <Text style={styles.orderContextNumber}>Order #{orderNumber}</Text>
              </View>
            )}

            {/* In-Person Counter (Confirmed Physical Channel) */}
            <View style={styles.infoCard}>
              <View style={styles.infoTitleRow}>
                <Text style={styles.infoSectionTitle}>📍 Physical Counter Location</Text>
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
                </View>
              </View>
              <Text style={styles.infoText}>{Brand.location.address}</Text>
              <Text style={styles.infoSubtext}>
                Opposite King Jaja Hall, UNILAG Main Campus, Akoka. Visit our counter for hot collections, in-person assistance, or manager escalation.
              </Text>

              <View style={styles.divider} />

              <Text style={styles.infoSectionTitle}>⏰ Operating Hours</Text>
              <Text style={styles.infoText}>
                Monday – Sunday: {Brand.operatingHours.openHour}:00 AM – {Brand.operatingHours.closeHour > 12 ? Brand.operatingHours.closeHour - 12 : Brand.operatingHours.closeHour}:00 PM WAT
              </Text>
              <Text style={styles.infoSubtext}>
                Kitchen oven fires up daily at 10 AM for hot pickups and hostel delivery.
              </Text>
            </View>

            {/* Payment & Order Issue Escalation Box */}
            <View style={styles.escalationCard}>
              <Text style={styles.escalationTitle}>🚨 Payment & Order Issue Escalation</Text>
              <Text style={styles.escalationStep}>
                1. <Text style={styles.boldText}>Re-check Status:</Text> If your bank debited but your order is pending, tap &ldquo;Re-check Status&rdquo; on the payment screen.
              </Text>
              <Text style={styles.escalationStep}>
                2. <Text style={styles.boldText}>Gather Reference:</Text> Note your Order Number and Paystack Reference code.
              </Text>
              <Text style={styles.escalationStep}>
                3. <Text style={styles.boldText}>Escalate Directly:</Text> Email {Brand.contact.email} or speak directly with our Counter Manager opposite King Jaja Hall with your bank alert.
              </Text>
            </View>

            {/* Contact Channels */}
            <Text style={styles.sectionHeader}>Direct Contact Channels</Text>

            {/* Email Support (Verified) */}
            <TouchableOpacity style={styles.channelCard} onPress={handleEmail} activeOpacity={0.85}>
              <Text style={styles.channelEmoji}>✉️</Text>
              <View style={styles.channelInfo}>
                <View style={styles.channelTitleRow}>
                  <Text style={styles.channelTitle}>Email Support</Text>
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
                  </View>
                </View>
                <Text style={styles.channelSubtitle}>{Brand.contact.email}</Text>
              </View>
              <View style={styles.actionPillDefault}>
                <Text style={styles.actionPillTextDefault}>Email</Text>
              </View>
            </TouchableOpacity>

            {/* WhatsApp Live Chat (Owner Verification Pending) */}
            <TouchableOpacity style={styles.channelCard} onPress={handleWhatsApp} activeOpacity={0.85}>
              <Text style={styles.channelEmoji}>💬</Text>
              <View style={styles.channelInfo}>
                <View style={styles.channelTitleRow}>
                  <Text style={styles.channelTitle}>WhatsApp Live Chat</Text>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>VERIFICATION PENDING</Text>
                  </View>
                </View>
                <Text style={styles.channelSubtitle}>
                  {Brand.contact.isWhatsAppVerified
                    ? 'Chat directly with counter team'
                    : 'Awaiting restaurant owner verification'}
                </Text>
              </View>
              <View
                style={
                  Brand.contact.isWhatsAppVerified
                    ? styles.actionPillWhatsApp
                    : styles.actionPillPending
                }
              >
                <Text
                  style={
                    Brand.contact.isWhatsAppVerified
                      ? styles.actionPillTextWhatsApp
                      : styles.actionPillTextPending
                  }
                >
                  {Brand.contact.isWhatsAppVerified ? 'Chat Now' : 'Pending'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Phone Hotline (Owner Verification Pending) */}
            <TouchableOpacity style={styles.channelCard} onPress={handleCall} activeOpacity={0.85}>
              <Text style={styles.channelEmoji}>📞</Text>
              <View style={styles.channelInfo}>
                <View style={styles.channelTitleRow}>
                  <Text style={styles.channelTitle}>Phone Hotline</Text>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>VERIFICATION PENDING</Text>
                  </View>
                </View>
                <Text style={styles.channelSubtitle}>
                  {Brand.contact.isPhoneVerified
                    ? Brand.contact.phone
                    : 'Awaiting restaurant owner verification'}
                </Text>
              </View>
              <View
                style={
                  Brand.contact.isPhoneVerified
                    ? styles.actionPillPhone
                    : styles.actionPillPending
                }
              >
                <Text
                  style={
                    Brand.contact.isPhoneVerified
                      ? styles.actionPillTextPhone
                      : styles.actionPillTextPending
                  }
                >
                  {Brand.contact.isPhoneVerified ? 'Call' : 'Pending'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* FAQs Section */}
            <Text style={styles.sectionHeader}>Frequently Asked Questions (FAQs)</Text>
            {FAQS.map((faq) => {
              const isExpanded = expandedFaqId === faq.id;
              return (
                <View key={faq.id} style={styles.faqCard}>
                  <TouchableOpacity
                    style={styles.faqHeader}
                    onPress={() => toggleFaq(faq.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.faqQuestion}>{faq.question}</Text>
                    <Text style={styles.faqToggleIcon}>{isExpanded ? '−' : '+'}</Text>
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={styles.faqBody}>
                      <Text style={styles.faqAnswer}>{faq.answer}</Text>
                    </View>
                  )}
                </View>
              );
            })}

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.08)',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.warmCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  scrollBody: {
    padding: 16,
  },
  orderContextCard: {
    backgroundColor: Colors.surfaceCream,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.15)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderContextLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  orderContextNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  infoCard: {
    backgroundColor: Colors.surfaceCream,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
  },
  infoTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryRed,
    marginTop: 4,
  },
  infoSubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.08)',
    marginVertical: 10,
  },
  escalationCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  escalationTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#92400E',
    marginBottom: 6,
  },
  escalationStep: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
    marginBottom: 4,
  },
  boldText: {
    fontWeight: '800',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
    marginTop: 8,
    marginBottom: 10,
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    minHeight: 52,
  },
  channelEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  channelInfo: {
    flex: 1,
  },
  channelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  channelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  channelSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  verifiedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#15803D',
  },
  pendingBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pendingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B91C1C',
  },
  actionPillDefault: {
    backgroundColor: Colors.warmCream,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionPillTextDefault: {
    color: Colors.charcoal,
    fontSize: 12,
    fontWeight: '700',
  },
  actionPillWhatsApp: {
    backgroundColor: '#25D366',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionPillTextWhatsApp: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  actionPillPhone: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionPillTextPhone: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  actionPillPending: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionPillTextPending: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    minHeight: 48,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
    paddingRight: 8,
  },
  faqToggleIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.primaryRed,
    width: 24,
    textAlign: 'center',
  },
  faqBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(39, 33, 31, 0.06)',
    paddingTop: 10,
  },
  faqAnswer: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
