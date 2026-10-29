import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Colors } from '../constants/colors';

interface TermsPrivacyModalProps {
  visible: boolean;
  type: 'terms' | 'privacy';
  onClose: () => void;
}

export const TermsPrivacyModal: React.FC<TermsPrivacyModalProps> = ({
  visible,
  type,
  onClose,
}) => {
  const isTerms = type === 'terms';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.title}>
                {isTerms ? 'Terms & Conditions 📜' : 'Privacy Policy 🔒'}
              </Text>
              <Text style={styles.subtitle}>AY Pizza UNILAG Campus Service Policy</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {isTerms ? (
              <View style={styles.textContainer}>
                <Text style={styles.sectionHeading}>1. Service Overview</Text>
                <Text style={styles.paragraph}>
                  AY Pizza operates as a single-restaurant food preparation and delivery service located opposite King Jaja Hall, University of Lagos, Akoka, Nigeria. Orders placed through this mobile application are prepared fresh and fulfilled via on-campus delivery or counter pickup.
                </Text>

                <Text style={styles.sectionHeading}>2. Pricing & Payments</Text>
                <Text style={styles.paragraph}>
                  All menu prices, customization fees, and delivery charges are quoted in Nigerian Naira (₦). Payments are processed securely via Paystack. AY Pizza does not store payment card numbers or banking credentials on user devices or internal servers.
                </Text>

                <Text style={styles.sectionHeading}>3. Fulfillment & Campus Delivery</Text>
                <Text style={styles.paragraph}>
                  Campus deliveries are dispatched directly to selected halls, hostels, faculty blocks, and designated UNILAG landmarks. Counter pickups must be collected directly from the AY Pizza counter opposite King Jaja Hall by presenting the digital Order Number.
                </Text>

                <Text style={styles.sectionHeading}>4. Cancellations & Reversals</Text>
                <Text style={styles.paragraph}>
                  Because pizzas are prepared fresh immediately upon kitchen ticket acceptance, orders already baking in the oven cannot be cancelled. In the rare event an ordered item becomes unavailable, store management will initiate a refund or offer a substitute with your consent.
                </Text>
              </View>
            ) : (
              <View style={styles.textContainer}>
                <Text style={styles.sectionHeading}>1. Information We Collect</Text>
                <Text style={styles.paragraph}>
                  To fulfill orders, we collect your name, phone number, email address, and campus delivery location. If you browse as a guest, order credentials and receipts are stored locally on your device in secure storage.
                </Text>

                <Text style={styles.sectionHeading}>2. How Your Data Is Used</Text>
                <Text style={styles.paragraph}>
                  Your contact details are strictly used to coordinate order baking, counter handover, and rider dispatch to your hostel or department. We do not sell, rent, or share personal data with external third parties for advertising.
                </Text>

                <Text style={styles.sectionHeading}>3. Push Notifications</Text>
                <Text style={styles.paragraph}>
                  With your permission, push notification tokens are registered to deliver order milestone alerts (baking status, counter readiness, courier transit). You can disable notifications at any time in device settings.
                </Text>

                <Text style={styles.sectionHeading}>4. Account Deletion & Data Rights</Text>
                <Text style={styles.paragraph}>
                  You may request deletion of your account and personal profile at any time from your Account Settings. Upon processing, your profile data is purged from our active customer records.
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.closeActionBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.closeActionBtnText}>I Understand</Text>
            </TouchableOpacity>

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
  textContainer: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
    marginTop: 14,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  closeActionBtn: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  closeActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

