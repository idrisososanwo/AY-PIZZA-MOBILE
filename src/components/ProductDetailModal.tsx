import React from 'react';
import { StyleSheet, Text, View, Modal, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Product } from '../types/catalog';
import { Brand } from '../constants/brand';
import { Radius, Shadows, Typography } from '../constants/theme';
import { getProductImage } from '../constants/images';

interface ProductDetailModalProps {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  onCustomize: (product: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  visible,
  onClose,
  onCustomize,
}) => {
  const insets = useSafeAreaInsets();
  if (!product) return null;

  const hasCustomizations =
    (product.sizes && product.sizes.length > 0) ||
    (product.customizationGroups && product.customizationGroups.length > 0);

  const foodImage = getProductImage(product.name);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Hero Image with Close button overlay */}
          <View style={styles.imageHeroContainer}>
            <Image source={foodImage} style={styles.imageHero} resizeMode="cover" />
            <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.8}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.categoryBadgeContainer}>
              <Text style={styles.categoryBadge}>{product.categorySlug.toUpperCase()}</Text>
            </View>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Title & Price Header */}
            <View style={styles.titlePriceRow}>
              <Text style={styles.productTitle}>{product.name}</Text>
              <Text style={styles.priceValue}>₦{product.basePrice.toLocaleString()}</Text>
            </View>

            {/* Description */}
            <Text style={styles.descriptionText}>{product.description}</Text>

            {/* Sizes Preview */}
            {product.sizes && product.sizes.length > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Available Sizes</Text>
                <View style={styles.chipsContainer}>
                  {product.sizes.map((s) => (
                    <View key={s.id} style={styles.sizeChip}>
                      <Text style={styles.sizeChipName}>{s.name}</Text>
                      {s.sizeMultiplierPrice > 0 && (
                        <Text style={styles.sizeChipPrice}>
                          +₦{s.sizeMultiplierPrice.toLocaleString()}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Preparation / Campus Note */}
            <View style={styles.locationNote}>
              <Text style={styles.locationNoteText}>
                🔥 Hand-tossed & baked fresh to order at AY Pizza, {Brand.location.address}.
              </Text>
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.ctaButton, !product.isAvailable && styles.ctaButtonDisabled]}
              onPress={() => {
                onClose();
                onCustomize(product);
              }}
              disabled={!product.isAvailable}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaButtonText}>
                {!product.isAvailable
                  ? 'Currently Out of Stock'
                  : hasCustomizations
                    ? 'Configure & Customize 🍕'
                    : 'Add to Order 🛒'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.warmCream,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    maxHeight: '90%',
    paddingBottom: 24,
    overflow: 'hidden',
    ...Shadows.modal,
  },
  imageHeroContainer: {
    width: '100%',
    height: 220,
    position: 'relative',
    backgroundColor: Colors.surfaceCream,
  },
  imageHero: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(39, 33, 31, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  categoryBadgeContainer: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  scrollBody: {
    padding: 20,
  },
  titlePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  productTitle: {
    ...Typography.pageTitle,
    flex: 1,
    marginRight: 12,
  },
  priceValue: {
    ...Typography.priceLarge,
  },
  descriptionText: {
    ...Typography.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    fontSize: 15,
    marginBottom: 10,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sizeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  sizeChipName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
    marginRight: 4,
  },
  sizeChipPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryRed,
  },
  locationNote: {
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: 16,
  },
  locationNoteText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  ctaButton: {
    backgroundColor: Colors.primaryRed,
    borderRadius: Radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  ctaButtonDisabled: {
    backgroundColor: Colors.borderMedium,
  },
  ctaButtonText: {
    ...Typography.button,
    fontSize: 16,
  },
});
