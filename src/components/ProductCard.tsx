import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { Colors } from '../constants/colors';
import { Product } from '../types/catalog';
import { Radius, Shadows, Typography } from '../constants/theme';
import { getProductImage } from '../constants/images';

interface ProductCardProps {
  product: Product;
  onPress: (product: Product) => void;
  onPressCustomize: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onPress,
  onPressCustomize,
}) => {
  const isAvailable = product.isAvailable;
  const hasCustomizations =
    (product.sizes && product.sizes.length > 0) ||
    (product.customizationGroups && product.customizationGroups.length > 0);

  const formattedPrice = `₦${product.basePrice.toLocaleString()}`;
  const foodImage = getProductImage(product.name);

  return (
    <TouchableOpacity
      style={[styles.card, !isAvailable && styles.cardUnavailable]}
      onPress={() => onPress(product)}
      activeOpacity={0.88}
    >
      <View style={styles.cardHeader}>
        {/* Appetizing Food Thumbnail */}
        <View style={styles.imageContainer}>
          <Image source={foodImage} style={styles.productImage} resizeMode="cover" />
        </View>

        <View style={styles.headerInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.productName} numberOfLines={1}>
              {product.name}
            </Text>
            {isAvailable ? (
              <View style={styles.badgeInStock}>
                <Text style={styles.badgeInStockText}>In Stock</Text>
              </View>
            ) : (
              <View style={styles.badgeOutOfStock}>
                <Text style={styles.badgeOutOfStockText}>Out of Stock</Text>
              </View>
            )}
          </View>

          <Text style={styles.description} numberOfLines={2}>
            {product.description}
          </Text>

          {/* Pricing & CTA */}
          <View style={styles.cardFooter}>
            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>
                {hasCustomizations ? 'From' : 'Price'}
              </Text>
              <Text style={styles.priceValue}>{formattedPrice}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.actionButton,
                !isAvailable && styles.actionButtonDisabled,
                hasCustomizations ? styles.actionButtonCustomize : styles.actionButtonAdd,
              ]}
              onPress={() => onPressCustomize(product)}
              disabled={!isAvailable}
              activeOpacity={0.8}
            >
              <Text style={styles.actionButtonText}>
                {!isAvailable
                  ? 'Unavailable'
                  : hasCustomizations
                  ? 'Customize'
                  : '+ Add'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardWhite,
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  cardUnavailable: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageContainer: {
    width: 86,
    height: 86,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceCream,
    marginRight: 12,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  productName: {
    ...Typography.productName,
    flex: 1,
    marginRight: 6,
  },
  badgeInStock: {
    backgroundColor: 'rgba(40, 122, 75, 0.1)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  badgeInStockText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.freshGreen,
    textTransform: 'uppercase',
  },
  badgeOutOfStock: {
    backgroundColor: Colors.softTomato,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  badgeOutOfStockText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primaryRed,
    textTransform: 'uppercase',
  },
  description: {
    ...Typography.body,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  priceLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  priceValue: {
    ...Typography.pricePrimary,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonCustomize: {
    backgroundColor: Colors.primaryRed,
  },
  actionButtonAdd: {
    backgroundColor: Colors.goldenYellow,
  },
  actionButtonDisabled: {
    backgroundColor: Colors.borderMedium,
  },
  actionButtonText: {
    ...Typography.button,
    fontSize: 12,
  },
});
