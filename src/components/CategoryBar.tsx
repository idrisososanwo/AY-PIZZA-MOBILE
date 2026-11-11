import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/colors';
import { ProductCategory, normalizeCategorySlug } from '../types/catalog';
import { Radius, Shadows } from '../constants/theme';

interface CategoryBarProps {
  categories: ProductCategory[];
  selectedCategorySlug: string;
  onSelectCategory: (slug: string) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  all: '🍽️',
  pizza: '🍕',
  icecream: '🍦',
  fastfood: '🍔',
  sides: '🍟',
  drinks: '🥤',
  beverages: '🥤',
};

function getCategoryIcon(slug: string, name?: string): string {
  const norm = normalizeCategorySlug(slug);
  if (CATEGORY_ICONS[norm]) return CATEGORY_ICONS[norm];
  if (CATEGORY_ICONS[slug]) return CATEGORY_ICONS[slug];
  if (name) {
    const n = name.toLowerCase();
    if (n.includes('pizza')) return '🍕';
    if (n.includes('ice') || n.includes('shake')) return '🍦';
    if (n.includes('side') || n.includes('burger') || n.includes('fast') || n.includes('wing')) return '🍔';
    if (n.includes('drink') || n.includes('beverage') || n.includes('water')) return '🥤';
  }
  return '🍽️';
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
  categories,
  selectedCategorySlug,
  onSelectCategory,
}) => {
  const allPill = { id: 'all', name: 'All Menu', slug: 'all' as any, displayOrder: 0, isActive: true, createdAt: '' };
  const displayList = [allPill, ...categories];
  const activeNormalized = normalizeCategorySlug(selectedCategorySlug);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {displayList.map((cat) => {
          const isSelected = activeNormalized === normalizeCategorySlug(cat.slug);
          const icon = getCategoryIcon(cat.slug, cat.name);

          return (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.pill,
                isSelected ? styles.pillActive : styles.pillInactive,
              ]}
              onPress={() => onSelectCategory(cat.slug)}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              testID={`category-pill-${cat.slug}`}
            >
              <Text style={styles.icon}>{icon}</Text>
              <Text style={[styles.pillText, isSelected ? styles.pillTextActive : styles.pillTextInactive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    backgroundColor: Colors.warmCream,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: Radius.pill,
    ...Shadows.card,
  },
  pillInactive: {
    backgroundColor: Colors.cardWhite,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  pillActive: {
    backgroundColor: Colors.primaryRed,
    borderWidth: 1,
    borderColor: Colors.primaryRed,
  },
  icon: {
    fontSize: 15,
    marginRight: 6,
  },
  pillText: {
    fontSize: 13,
  },
  pillTextInactive: {
    color: Colors.charcoal,
    fontWeight: '700',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
