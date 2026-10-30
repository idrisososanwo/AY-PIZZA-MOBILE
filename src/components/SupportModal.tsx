import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Brand } from '../constants/brand';

interface SupportModalProps {
  visible: boolean;
  onClose: () => void;
  orderNumber?: string;
}

export const SupportModal: React.FC<SupportModalProps> = ({
  visible,
  onClose,
  orderNumber,
}) => {
  const insets = useSafeAreaInsets();
  const handleCall = () => {
    Linking.openURL(`tel:${Brand.contact.phone.replace(/\s+/g, '')}`);
  };

  const handleWhatsApp = () => {
    const text = orderNumber
      ? `Hello AY Pizza, I need support regarding Order #${orderNumber}.`
      : 'Hello AY Pizza, I need assistance with my order.';
    const url = `${Brand.contact.whatsappUrl}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url);
  };

  const handleEmail = () => {
    const subject = orderNumber ? `Support Request - Order #${orderNumber}` : 'AY Pizza Customer Support';
    Linking.openURL(`mailto:${Brand.contact.email}?subject=${encodeURIComponent(subject)}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.title}>Customer Support 💬</Text>
              <Text style={styles.subtitle}>Direct assistance for UNILAG campus orders</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 12, 24) }}
            showsVerticalScrollIndicator={false}
          >
            {orderNumber && (
              <View style={styles.orderContextCard}>
                <Text style={styles.orderContextLabel}>Inquiry Regarding</Text>
                <Text style={styles.orderContextNumber}>Order #{orderNumber}</Text>
              </View>
            )}

            {/* Quick Contact Buttons */}
            <TouchableOpacity style={styles.channelCard} onPress={handleWhatsApp} activeOpacity={0.85}>
              <Text style={styles.channelEmoji}>💬</Text>
              <View style={styles.channelInfo}>
                <Text style={styles.channelTitle}>WhatsApp Live Chat</Text>
                <Text style={styles.channelSubtitle}>Chat directly with the counter manager</Text>
              </View>
              <View style={styles.actionPillWhatsApp}>
                <Text style={styles.actionPillTextWhatsApp}>Chat Now</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.channelCard} onPress={handleCall} activeOpacity={0.85}>
              <Text style={styles.channelEmoji}>📞</Text>
              <View style={styles.channelInfo}>
                <Text style={styles.channelTitle}>Phone Hotline</Text>
                <Text style={styles.channelSubtitle}>{Brand.contact.phone}</Text>
              </View>
              <View style={styles.actionPillPhone}>
                <Text style={styles.actionPillTextPhone}>Call</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.channelCard} onPress={handleEmail} activeOpacity={0.85}>
              <Text style={styles.channelEmoji}>✉️</Text>
              <View style={styles.channelInfo}>
                <Text style={styles.channelTitle}>Email Support</Text>
                <Text style={styles.channelSubtitle}>{Brand.contact.email}</Text>
              </View>
              <View style={styles.actionPillDefault}>
                <Text style={styles.actionPillTextDefault}>Email</Text>
              </View>
            </TouchableOpacity>

            {/* Location & Hours Card */}
            <View style={styles.infoCard}>
              <Text style={styles.infoSectionTitle}>📍 Physical Counter Location</Text>
              <Text style={styles.infoText}>{Brand.location.address}</Text>
              <Text style={styles.infoSubtext}>Opposite King Jaja Hall, UNILAG Main Campus, Akoka</Text>

              <View style={styles.divider} />

              <Text style={styles.infoSectionTitle}>⏰ Operating Hours</Text>
              <Text style={styles.infoText}>
                Monday – Sunday: {Brand.operatingHours.openHour}:00 AM – 9:00 PM WAT
              </Text>
              <Text style={styles.infoSubtext}>Oven fires up at 10 AM daily for hot pickups and hostel delivery.</Text>
            </View>

            <View style={{ height: 20 }} />
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
    maxHeight: '85%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.06)',
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(39, 33, 31, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  scrollBody: {
    padding: 18,
  },
  orderContextCard: {
    backgroundColor: Colors.warmCream,
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryRed,
  },
  orderContextLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primaryRed,
    textTransform: 'uppercase',
  },
  orderContextNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.charcoal,
    marginTop: 2,
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.1)',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  channelEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  channelInfo: {
    flex: 1,
  },
  channelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  channelSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actionPillWhatsApp: {
    backgroundColor: '#25D366',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  actionPillTextWhatsApp: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  actionPillPhone: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  actionPillTextPhone: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  actionPillDefault: {
    backgroundColor: Colors.warmCream,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  actionPillTextDefault: {
    color: Colors.charcoal,
    fontSize: 11,
    fontWeight: '800',
  },
  infoCard: {
    backgroundColor: Colors.warmCream,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
  },
  infoSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  infoSubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.08)',
    marginVertical: 12,
  },
});

