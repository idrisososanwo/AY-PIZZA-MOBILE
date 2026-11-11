import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';

export interface PromotionOffer {
  id: string;
  title: string;
  badge: string;
  badgeColor?: string;
  description: string;
  discountType: 'perk' | 'flat' | 'percentage';
  discountValueText: string;
  applicableCategorySlug?: string;
  applicableScope: string;
  eligibility: string;
  redemptionInstructions: string;
  validFrom?: string;
  validUntil?: string;
  isActive: boolean;
  isExpired?: boolean;
}

/**
 * Authoritative campus value offerings and active store perks.
 * Note: AY Pizza uses server-authoritative pricing. Discount coupons must be verified
 * on the backend. This catalog surfaces genuine operational campus value offerings.
 */
export const AUTHORITATIVE_OFFERS: PromotionOffer[] = [
  {
    id: 'campus-flat-delivery',
    title: 'Flat ₦500 UNILAG Hostel Delivery',
    badge: 'EVERYDAY PERK',
    badgeColor: Colors.freshGreen,
    description: 'Direct courier delivery to all UNILAG residential halls, hostels, and faculty departments for a guaranteed flat fee.',
    discountType: 'perk',
    discountValueText: '₦500 Flat Tariff',
    applicableScope: 'All Delivery Orders (King Jaja, Moremi, Mariere, MTH, Biobaku, etc.)',
    eligibility: 'All students, staff, and visitors on UNILAG Main Campus',
    redemptionInstructions: 'Select "Delivery" at checkout and pick your campus landmark. The ₦500 tariff is calculated automatically.',
    isActive: true,
  },
  {
    id: 'half-and-half-combo',
    title: 'Two Flavors in One Pizza (Half & Half)',
    badge: 'SIGNATURE VALUE',
    badgeColor: Colors.goldenOrange,
    description: 'Split your pizza between two distinct recipe flavors on a single freshly proofed crust.',
    discountType: 'perk',
    discountValueText: 'From +₦1,000 Surcharge',
    applicableCategorySlug: 'pizza',
    applicableScope: 'All Pizza Sizes (Regular, Standard, Large, Queen, King)',
    eligibility: 'Available on all pizza orders via the pizza customizer',
    redemptionInstructions: 'Open any pizza from the menu, tap "Customize", select "Half & Half Pizza", and choose your secondary flavor.',
    isActive: true,
  },
  {
    id: 'free-counter-pickup',
    title: 'Zero-Fee Kitchen Counter Pickup',
    badge: 'ALWAYS FREE',
    badgeColor: Colors.charcoal,
    description: 'Collect your hot, freshly baked pizza directly from the AY Pizza kitchen counter opposite King Jaja Hall with zero delivery charge.',
    discountType: 'perk',
    discountValueText: '₦0 Pickup Fee',
    applicableScope: 'Entire Catalog',
    eligibility: 'All orders collected in person',
    redemptionInstructions: 'Select "Pickup at Kitchen" during checkout.',
    isActive: true,
  },
];

export interface PromotionsModalProps {
  visible: boolean;
  onClose: () => void;
  onExploreMenu: (categorySlug?: string) => void;
}

export const PromotionsModal: React.FC<PromotionsModalProps> = ({
  visible,
  onClose,
  onExploreMenu,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'perks' | 'codes'>('all');

  const filteredOffers = AUTHORITATIVE_OFFERS.filter((offer) => {
    if (selectedFilter === 'perks') return offer.discountType === 'perk';
    if (selectedFilter === 'codes') return false; // No promotional coupon codes configured yet
    return true;
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]} testID="promotions-modal">
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.title}>Promotions & Offers 🏷️</Text>
              <Text style={styles.subtitle}>Verified campus value perks & promotional deals</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Close promotions"
              testID="btn-close-promotions"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Filter Pills */}
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterPill, selectedFilter === 'all' && styles.filterPillActive]}
              onPress={() => setSelectedFilter('all')}
              activeOpacity={0.8}
              testID="filter-promo-all"
            >
              <Text style={[styles.filterPillText, selectedFilter === 'all' && styles.filterPillTextActive]}>
                All Deals ({AUTHORITATIVE_OFFERS.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, selectedFilter === 'perks' && styles.filterPillActive]}
              onPress={() => setSelectedFilter('perks')}
              activeOpacity={0.8}
              testID="filter-promo-perks"
            >
              <Text style={[styles.filterPillText, selectedFilter === 'perks' && styles.filterPillTextActive]}>
                Campus Perks
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, selectedFilter === 'codes' && styles.filterPillActive]}
              onPress={() => setSelectedFilter('codes')}
              activeOpacity={0.8}
              testID="filter-promo-codes"
            >
              <Text style={[styles.filterPillText, selectedFilter === 'codes' && styles.filterPillTextActive]}>
                Coupon Codes (0)
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 12, 28) }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Backend Verification Assurance Banner */}
            <View style={styles.integrityBanner}>
              <Text style={styles.integrityBannerIcon}>🛡️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.integrityBannerTitle}>Authoritative Pricing Guarantee</Text>
                <Text style={styles.integrityBannerText}>
                  All prices, tariffs, and discounts are validated directly by our secure server. No unexpected charges or phantom discounts at checkout.
                </Text>
              </View>
            </View>

            {/* Empty State for Codes Filter */}
            {selectedFilter === 'codes' || filteredOffers.length === 0 ? (
              <View style={styles.emptyContainer} testID="promo-empty-state">
                <Text style={styles.emptyIcon}>🎟️</Text>
                <Text style={styles.emptyTitle}>No Coupon Codes Currently Active</Text>
                <Text style={styles.emptySubtitle}>
                  AY Pizza does not use arbitrary discount codes. All standard student tariffs (such as flat ₦500 delivery) are applied automatically at checkout without entering codes.
                </Text>
                <Text style={styles.emptySubtext}>
                  Watch for seasonal campaigns announced at our kitchen counter opposite King Jaja Hall!
                </Text>
                <TouchableOpacity
                  style={styles.exploreMenuBtn}
                  onPress={() => {
                    onClose();
                    onExploreMenu();
                  }}
                  activeOpacity={0.85}
                  testID="btn-promo-explore-menu"
                >
                  <Text style={styles.exploreMenuBtnText}>Explore Full Menu 🍕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Offers List */
              filteredOffers.map((offer) => (
                <View key={offer.id} style={styles.offerCard} testID={`offer-card-${offer.id}`}>
                  {/* Card Header Row */}
                  <View style={styles.offerHeaderRow}>
                    <View style={[styles.badgePill, { backgroundColor: offer.badgeColor || Colors.primaryRed }]}>
                      <Text style={styles.badgeText}>{offer.badge}</Text>
                    </View>
                    <View style={styles.valueTextWrap}>
                      <Text style={styles.valueText}>{offer.discountValueText}</Text>
                    </View>
                  </View>

                  {/* Title & Description */}
                  <Text style={styles.offerTitle}>{offer.title}</Text>
                  <Text style={styles.offerDescription}>{offer.description}</Text>

                  {/* Terms & Scope Box */}
                  <View style={styles.scopeBox}>
                    <View style={styles.scopeRow}>
                      <Text style={styles.scopeLabel}>Applies to:</Text>
                      <Text style={styles.scopeValue}>{offer.applicableScope}</Text>
                    </View>
                    <View style={styles.scopeRow}>
                      <Text style={styles.scopeLabel}>Eligibility:</Text>
                      <Text style={styles.scopeValue}>{offer.eligibility}</Text>
                    </View>
                    <View style={styles.scopeRow}>
                      <Text style={styles.scopeLabel}>How to redeem:</Text>
                      <Text style={styles.scopeValue}>{offer.redemptionInstructions}</Text>
                    </View>
                  </View>

                  {/* Action CTA */}
                  <TouchableOpacity
                    style={styles.redeemBtn}
                    onPress={() => {
                      onClose();
                      onExploreMenu(offer.applicableCategorySlug);
                    }}
                    activeOpacity={0.85}
                    testID={`btn-redeem-${offer.id}`}
                  >
                    <Text style={styles.redeemBtnText}>
                      {offer.applicableCategorySlug === 'pizza'
                        ? 'Browse Pizzas & Customize 🍕'
                        : 'Order Now & Enjoy Perk →'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* Physical Counter Notice */}
            <View style={styles.counterFooterBox}>
              <Text style={styles.counterFooterText}>
                📍 Have a special bulk student event or hostel celebration inquiry? Visit our physical counter opposite King Jaja Hall or reach out via Customer Support.
              </Text>
            </View>
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
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.06)',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.charcoal,
    letterSpacing: 0.3,
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.05)',
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.warmCream,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
  },
  filterPillActive: {
    backgroundColor: Colors.primaryRed,
    borderColor: Colors.primaryRed,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  scrollBody: {
    paddingHorizontal: 18,
  },
  scrollContent: {
    paddingTop: 14,
  },
  integrityBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(40, 122, 75, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(40, 122, 75, 0.2)',
    alignItems: 'center',
    gap: 10,
  },
  integrityBannerIcon: {
    fontSize: 20,
  },
  integrityBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.freshGreen,
    marginBottom: 2,
  },
  integrityBannerText: {
    fontSize: 11,
    color: Colors.charcoal,
    lineHeight: 15,
  },
  offerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  offerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  valueTextWrap: {
    backgroundColor: Colors.warmCream,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  valueText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryRed,
  },
  offerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 6,
  },
  offerDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 12,
  },
  scopeBox: {
    backgroundColor: Colors.warmCream,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 6,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  scopeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.charcoal,
    width: 95,
  },
  scopeValue: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  redeemBtn: {
    backgroundColor: Colors.primaryRed,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redeemBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 20,
  },
  exploreMenuBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  exploreMenuBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  counterFooterBox: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  counterFooterText: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
    textAlign: 'center',
  },
});
