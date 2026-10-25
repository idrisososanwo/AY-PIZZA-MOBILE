import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Colors } from '../constants/colors';
import { ProductCategory } from '../types/catalog';
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
  drinks: '🥤',
};

export const CategoryBar: React.FC<CategoryBarProps> = ({
  categories,
  selectedCategorySlug,
  onSelectCategory,
}) => {
  const allPill = { id: 'all', name: 'All Menu', slug: 'all' as any, displayOrder: 0, isActive: true, createdAt: '' };
  const displayList = [allPill, ...categories];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {displayList.map((cat) => {
          const isSelected = selectedCategorySlug === cat.slug;
          const icon = CATEGORY_ICONS[cat.slug] || '🍽️';

          return (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.pill,
                isSelected ? styles.pillActive : styles.pillInactive,
              ]}
              onPress={() => onSelectCategory(cat.slug)}
              activeOpacity={0.8}
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
    paddingVertical: 12,
    backgroundColor: Colors.warmCream,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
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
