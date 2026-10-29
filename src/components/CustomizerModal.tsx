import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Product } from '../types/catalog';
import { CartItem } from '../domains/cart/cart-types';
import {
  initializeCustomizerState,
  selectSize,
  toggleOption,
  toggleHalfAndHalf,
  setHalfSecondaryProduct,
  toggleFlavor,
  setSpecialInstructions,
  setQuantity,
  calculateCustomizerPrice,
  validateCustomizerState,
  toCartItem,
} from '../domains/customizer/customizer-engine';
import { CustomizerState } from '../domains/customizer/customizer-types';

interface CustomizerModalProps {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  onSave: (item: CartItem) => void;
  existingCartItem?: CartItem;
  allPizzaProducts: Product[];
}

interface CustomizerModalContentProps extends Omit<CustomizerModalProps, 'product'> {
  product: Product;
}

const CustomizerModalContent: React.FC<CustomizerModalContentProps> = ({
  product,
  visible,
  onClose,
  onSave,
  existingCartItem,
  allPizzaProducts,
}) => {
  const [state, setState] = useState<CustomizerState>(() =>
    initializeCustomizerState(product, existingCartItem, allPizzaProducts)
  );

  const priceBreakdown = useMemo(() => calculateCustomizerPrice(state), [state]);
  const validation = useMemo(() => validateCustomizerState(state), [state]);

  const isPizza = product.categorySlug === 'pizza';
  const isDessert = ['icecream'].includes(product.categorySlug);

  const handleSave = () => {
    if (!validation.isValid) return;
    const cartItem = toCartItem(state, existingCartItem?.id);
    onSave(cartItem);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.eyebrow}>
                {existingCartItem ? 'EDIT ORDER ITEM' : 'CUSTOMIZE PRODUCT'}
              </Text>
              <Text style={styles.productTitle} numberOfLines={1}>
                {product.name}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* 1. SIZES SECTION */}
            {product.sizes && product.sizes.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>1. Select Size</Text>
                  <Text style={styles.requiredBadge}>REQUIRED</Text>
                </View>
                <View style={styles.sizeOptionsContainer}>
                  {product.sizes.map((s) => {
                    const isSelected = state.selectedSize?.id === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.sizeCard, isSelected && styles.sizeCardSelected]}
                        onPress={() => setState(selectSize(state, s))}
                        activeOpacity={0.8}
                      >
                        <View style={styles.radioOuter}>
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                        <View style={styles.sizeTextContainer}>
                          <Text style={[styles.sizeName, isSelected && styles.sizeNameSelected]}>
                            {s.name}
                          </Text>
                          <Text style={styles.sizePrice}>
                            {s.sizeMultiplierPrice > 0
                              ? `+₦${s.sizeMultiplierPrice.toLocaleString()}`
                              : 'Standard'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 2. HALF & HALF PIZZA BUILDER (Pizzas Only) */}
            {isPizza && (
              <View style={styles.section}>
                <View style={styles.halfAndHalfHeader}>
                  <View style={styles.halfAndHalfInfo}>
                    <Text style={styles.sectionTitle}>2. Half & Half Pizza?</Text>
                    <Text style={styles.sectionSubtitle}>
                      Combine two different pizza flavors on one pie
                    </Text>
                    <Text style={styles.surchargeNotice}>
                      Surcharge: +₦
                      {priceBreakdown.halfAndHalfSurcharge > 0
                        ? priceBreakdown.halfAndHalfSurcharge.toLocaleString()
                        : state.selectedSize?.name?.toLowerCase().includes('large') ||
                          state.selectedSize?.name?.toLowerCase().includes('queen') ||
                          state.selectedSize?.name?.toLowerCase().includes('king')
                        ? '1,500'
                        : '1,000'}
                    </Text>
                  </View>
                  <Switch
                    value={state.isHalfAndHalf}
                    onValueChange={(val) => setState(toggleHalfAndHalf(state, val))}
                    trackColor={{ false: '#3e2723', true: Colors.lava }}
                    thumbColor={state.isHalfAndHalf ? Colors.neon : '#f4f3f4'}
                  />
                </View>

                {state.isHalfAndHalf && (
                  <View style={styles.halfAndHalfPicker}>
                    <Text style={styles.pickerPrompt}>Choose Second Flavor:</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.flavorsScroll}
                    >
                      {allPizzaProducts
                        .filter((p) => p.id !== product.id && p.isAvailable)
                        .map((secProd) => {
                          const isSecSelected = state.halfSecondaryProduct?.id === secProd.id;
                          return (
                            <TouchableOpacity
                              key={secProd.id}
                              style={[
                                styles.flavorPill,
                                isSecSelected && styles.flavorPillSelected,
                              ]}
                              onPress={() =>
                                setState(setHalfSecondaryProduct(state, secProd))
                              }
                              activeOpacity={0.8}
                            >
                              <Text
                                style={[
                                  styles.flavorPillText,
                                  isSecSelected && styles.flavorPillTextSelected,
                                ]}
                              >
                                {secProd.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* 3. FLAVOR SELECTION (Milkshake & Ice Cream) */}
            {isDessert && product.customizationGroups && (
              <View style={styles.section}>
                {product.customizationGroups
                  .filter((g) => g.name.toLowerCase().includes('flavor'))
                  .map((group) => (
                    <View key={group.id}>
                      <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionTitle}>Choose Flavors (Max 2)</Text>
                        <Text style={styles.countBadge}>
                          {state.selectedFlavors.length} / 2 Selected
                        </Text>
                      </View>
                      <View style={styles.flavorGrid}>
                        {group.options.map((opt) => {
                          const isSelected = state.selectedFlavors.includes(opt.name);
                          return (
                            <TouchableOpacity
                              key={opt.id}
                              style={[
                                styles.flavorGridCard,
                                isSelected && styles.flavorGridCardSelected,
                              ]}
                              onPress={() => setState(toggleFlavor(state, opt.name, 2))}
                              activeOpacity={0.8}
                            >
                              <Text
                                style={[
                                  styles.flavorGridCardText,
                                  isSelected && styles.flavorGridCardTextSelected,
                                ]}
                              >
                                {opt.name}
                              </Text>
                              {isSelected && <Text style={styles.checkMark}>✓</Text>}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}
              </View>
            )}

            {/* 4. EXTRA TOPPINGS (Pizza & Dessert Toppings) */}
            {product.customizationGroups &&
              product.customizationGroups
                .filter(
                  (g) =>
                    !g.name.toLowerCase().includes('half and half') &&
                    !g.name.toLowerCase().includes('flavor')
                )
                .map((group) => {
                  const selectedList = state.selectedOptions[group.id] || [];
                  return (
                    <View key={group.id} style={styles.section}>
                      <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionTitle}>{group.name}</Text>
                        <Text style={styles.optionalBadge}>
                          {group.minSelections > 0
                            ? `SELECT MIN ${group.minSelections}`
                            : `OPTIONAL (MAX ${group.maxSelections})`}
                        </Text>
                      </View>
                      <View style={styles.toppingsGrid}>
                        {group.options.map((opt) => {
                          const isSelected = selectedList.some((o) => o.id === opt.id);
                          return (
                            <TouchableOpacity
                              key={opt.id}
                              style={[
                                styles.toppingCard,
                                isSelected && styles.toppingCardSelected,
                              ]}
                              onPress={() => setState(toggleOption(state, group, opt))}
                              activeOpacity={0.8}
                            >
                              <View style={styles.toppingCheckbox}>
                                {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
                              </View>
                              <View style={styles.toppingTextContainer}>
                                <Text
                                  style={[
                                    styles.toppingName,
                                    isSelected && styles.toppingNameSelected,
                                  ]}
                                >
                                  {opt.name}
                                </Text>
                                {opt.price > 0 && (
                                  <Text style={styles.toppingPrice}>
                                    +₦{opt.price.toLocaleString()}
                                  </Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}

            {/* 5. SPECIAL INSTRUCTIONS */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Special Kitchen Instructions</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Extra crispy crust, less spicy sauce..."
                placeholderTextColor="rgba(255, 232, 214, 0.4)"
                multiline
                numberOfLines={3}
                value={state.specialInstructions}
                onChangeText={(text) => setState(setSpecialInstructions(state, text))}
              />
            </View>
          </ScrollView>

          {/* Validation Warnings */}
          {!validation.isValid && validation.errors.length > 0 && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️ {validation.errors[0]}</Text>
            </View>
          )}

          {/* STICKY FOOTER */}
          <View style={styles.footer}>
            <View style={styles.footerTopRow}>
              {/* Quantity Stepper */}
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setState(setQuantity(state, state.quantity - 1))}
                  disabled={state.quantity <= 1}
                >
                  <Text style={styles.stepperButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{state.quantity}</Text>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setState(setQuantity(state, state.quantity + 1))}
                >
                  <Text style={styles.stepperButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Price Breakdown */}
              <View style={styles.footerPriceContainer}>
                <Text style={styles.footerPriceLabel}>Estimated Line Total</Text>
                <Text style={styles.footerPriceValue}>
                  ₦{priceBreakdown.lineTotal.toLocaleString()}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveButton, !validation.isValid && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!validation.isValid}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>
                {existingCartItem ? 'Save Item Changes 💾' : 'Add to Local Cart 🛒'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export const CustomizerModal: React.FC<CustomizerModalProps> = (props) => {
  if (!props.product || !props.visible) return null;
  return (
    <CustomizerModalContent
      key={`${props.product.id}_${props.existingCartItem?.id || 'new'}`}
      {...props}
      product={props.product}
    />
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    backgroundColor: Colors.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primaryRed,
    letterSpacing: 1,
    marginBottom: 2,
  },
  productTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(39, 33, 31, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: Colors.charcoal,
    fontWeight: '700',
  },
  scrollBody: {
    padding: 18,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  surchargeNotice: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
    marginTop: 4,
  },
  requiredBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primaryRed,
    letterSpacing: 0.5,
  },
  optionalBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  countBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primaryRed,
  },
  sizeOptionsContainer: {
    gap: 8,
  },
  sizeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardWhite,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  sizeCardSelected: {
    backgroundColor: '#FFF1EF',
    borderColor: Colors.primaryRed,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.charcoal,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primaryRed,
  },
  sizeTextContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sizeName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.charcoal,
  },
  sizeNameSelected: {
    fontWeight: '800',
    color: Colors.charcoal,
  },
  sizePrice: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primaryRed,
  },
  halfAndHalfHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cardWhite,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  halfAndHalfInfo: {
    flex: 1,
    marginRight: 12,
  },
  halfAndHalfPicker: {
    marginTop: 12,
    backgroundColor: Colors.cardWhite,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  pickerPrompt: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.charcoal,
    marginBottom: 8,
  },
  flavorsScroll: {
    gap: 8,
  },
  flavorPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.warmCream,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  flavorPillSelected: {
    backgroundColor: Colors.primaryRed,
    borderColor: Colors.primaryRed,
  },
  flavorPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.charcoal,
  },
  flavorPillTextSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  flavorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flavorGridCard: {
    width: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cardWhite,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  flavorGridCardSelected: {
    backgroundColor: '#FFF1EF',
    borderColor: Colors.primaryRed,
  },
  flavorGridCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.charcoal,
    flex: 1,
  },
  flavorGridCardTextSelected: {
    color: Colors.charcoal,
    fontWeight: '800',
  },
  checkMark: {
    fontSize: 14,
    color: Colors.primaryRed,
    fontWeight: '800',
  },
  toppingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toppingCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardWhite,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  toppingCardSelected: {
    backgroundColor: '#FFF1EF',
    borderColor: Colors.primaryRed,
  },
  toppingCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.charcoal,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  checkboxTick: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '900',
  },
  toppingTextContainer: {
    flex: 1,
  },
  toppingName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.charcoal,
  },
  toppingNameSelected: {
    fontWeight: '800',
    color: Colors.charcoal,
  },
  toppingPrice: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  textInput: {
    backgroundColor: Colors.cardWhite,
    borderRadius: 10,
    padding: 12,
    color: Colors.charcoal,
    fontSize: 13,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    minHeight: 65,
  },
  errorBanner: {
    backgroundColor: Colors.softTomato,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryRed,
  },
  errorText: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '700',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.cardWhite,
  },
  footerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warmCream,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  stepperButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonText: {
    fontSize: 18,
    color: Colors.charcoal,
    fontWeight: '800',
  },
  stepperValue: {
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  footerPriceContainer: {
    alignItems: 'flex-end',
  },
  footerPriceLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  footerPriceValue: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  saveButton: {
    backgroundColor: Colors.primaryRed,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: Colors.borderMedium,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
});
