import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Keep native splash screen visible until initial app data is ready
SplashScreen.preventAutoHideAsync().catch(() => {
  /* Ignore unhandled rejection in web/test environments */
});
import { Colors } from './src/constants/colors';
import { Brand } from './src/constants/brand';
import { FoodImages } from './src/constants/images';
import { Product, ProductCategory } from './src/types/catalog';
import { catalogRepository } from './src/domains/catalog/catalog-repository';
import { cartStore, INITIAL_CART_STATE } from './src/domains/cart/cart-store';
import { CartState, CartItem } from './src/domains/cart/cart-types';
import { CustomerProfile } from './src/domains/customer/customer-types';
import { CategoryBar } from './src/components/CategoryBar';
import { ProductCard } from './src/components/ProductCard';
import { ProductDetailModal } from './src/components/ProductDetailModal';
import { CustomizerModal } from './src/components/CustomizerModal';
import { CartView } from './src/components/CartView';
import { CheckoutModal } from './src/components/CheckoutModal';
import { PaystackPaymentModal } from './src/components/PaystackPaymentModal';
import { OrderReceiptModal } from './src/components/OrderReceiptModal';
import { KitchenDisplaySystem } from './src/components/KitchenDisplaySystem';
import { OrderTrackingModal } from './src/components/OrderTrackingModal';
import { BottomTabBar, CustomerTab } from './src/components/BottomTabBar';
import { HomeScreen } from './src/components/HomeScreen';
import { AccountScreen } from './src/components/AccountScreen';
import { OrdersScreen } from './src/components/OrdersScreen';
import { LandmarkPickerModal } from './src/components/LandmarkPickerModal';
import { GuestReceiptStore, GuestReceiptRecord } from './src/domains/order/guest-receipt-store';
import {
  fetchAuthenticatedRole,
  fetchCurrentCustomerProfile,
  isStaffRole,
  subscribeAuthState,
  subscribeCustomerProfile,
} from './src/domains/auth/auth-service';
import { UserRole } from './src/types/auth';
import { DeliveryLandmark } from './src/types/delivery';

export default function App() {
  const [activeTab, setActiveTab] = useState<CustomerTab>('home');
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isKitchenMode, setIsKitchenMode] = useState<boolean>(false);
  const [authenticatedRole, setAuthenticatedRole] = useState<UserRole | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [guestOrders, setGuestOrders] = useState<GuestReceiptRecord[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState('all');
  const [landmarkPickerVisible, setLandmarkPickerVisible] = useState(false);

  // Modals state
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null);
  const [customizerProduct, setCustomizerProduct] = useState<Product | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | undefined>(undefined);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [paystackParams, setPaystackParams] = useState<{
    orderId: string;
    orderNumber: string;
    receiptToken: string;
    amount: number;
    amountInKobo: number;
    email: string;
    customerName: string;
    customerPhone: string;
  } | null>(null);
  const [receiptData, setReceiptData] = useState<{
    orderId: string;
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
  } | null>(null);
  const [selectedOrderForTracking, setSelectedOrderForTracking] = useState<{
    orderId: string;
    receiptToken: string;
  } | null>(null);

  // Cart subscription state
  const [cartState, setCartState] = useState<CartState>(INITIAL_CART_STATE);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Refresh profile
  const refreshCustomer = useCallback(async () => {
    const prof = await fetchCurrentCustomerProfile();
    setCustomerProfile(prof);
    const role = await fetchAuthenticatedRole();
    setAuthenticatedRole(role);
  }, []);

  // Load catalog and session on mount
  useEffect(() => {
    let isMounted = true;

    async function loadCatalog() {
      try {
        setLoading(true);
        const [cats, prods] = await Promise.all([
          catalogRepository.getCategories(),
          catalogRepository.getProducts({ includeUnavailable: true }),
        ]);

        if (isMounted) {
          setCategories(cats);
          setProducts(prods);
          await cartStore.reconcileWithCatalog(prods);
        }
      } catch (err) {
        console.warn('Error loading catalog:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
          SplashScreen.hideAsync().catch(() => {
            /* Ignore in web/test environments */
          });
        }
      }
    }

    loadCatalog();

    // Check for web route /kitchen (dedicated staff endpoint)
    if (typeof window !== 'undefined' && window.location?.pathname === '/kitchen') {
      setIsKitchenMode(true);
    }

    // Load recent guest orders
    GuestReceiptStore.getAllReceipts().then((records: GuestReceiptRecord[]) => {
      if (isMounted) setGuestOrders(records);
    });

    // Subscribe to auth state changes and fetch profile
    refreshCustomer();

    const authSub = subscribeAuthState((role) => {
      if (isMounted) {
        setAuthenticatedRole(role);
        refreshCustomer();
        if (!isStaffRole(role)) {
          setIsKitchenMode(false);
          if (typeof window !== 'undefined' && window.location?.pathname === '/kitchen' && window.history?.pushState) {
            window.history.pushState({}, '', '/');
          }
        }
      }
    });

    const profSub = subscribeCustomerProfile((prof) => {
      if (isMounted) {
        setCustomerProfile(prof);
      }
    });

    // Subscribe to persistent cart store
    const unsubscribeCart = cartStore.subscribe((newState) => {
      if (isMounted) {
        setCartState(newState);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeCart();
      authSub.unsubscribe();
      profSub.unsubscribe();
    };
  }, [refreshCustomer]);

  // Filter products by selected category and search term
  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedCategorySlug !== 'all') {
      result = result.filter((p) => p.categorySlug === selectedCategorySlug);
    }

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
    }

    return result;
  }, [products, selectedCategorySlug, searchQuery]);

  // Pizzas list for Half & Half secondary flavor picker
  const pizzaProducts = useMemo(
    () => products.filter((p) => p.categorySlug === 'pizza'),
    [products]
  );

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const handleOpenCustomize = (product: Product, existingItem?: CartItem) => {
    setEditingCartItem(existingItem);
    setCustomizerProduct(product);
  };

  const handleSaveCustomization = async (item: CartItem) => {
    if (editingCartItem) {
      await cartStore.updateItem(editingCartItem.id, item);
      showToast(`Updated "${item.productName}" in cart! 🍕`);
    } else {
      await cartStore.addItem(item);
      showToast(`Added ${item.quantity}x "${item.productName}" to cart! 🛒`);
    }
    setEditingCartItem(undefined);
    setCustomizerProduct(null);
  };

  const handleEditCartItem = (item: CartItem) => {
    const originalProduct = products.find((p) => p.id === item.productId);
    if (originalProduct) {
      handleOpenCustomize(originalProduct, item);
    } else {
      Alert.alert('Notice', 'Product definition not found in current catalog.');
    }
  };

  const handleProceedToPayment = (orderParams: {
    orderId: string;
    orderNumber: string;
    receiptToken: string;
    amount: number;
    amountInKobo: number;
    email: string;
    customerName: string;
    customerPhone: string;
  }) => {
    setCheckoutVisible(false);
    setPaystackParams(orderParams);
  };

  const handlePaymentSuccess = async (result: {
    orderId: string;
    orderNumber: string;
    paymentReference: string;
  }) => {
    if (!paystackParams) return;

    const receiptSnapshot = {
      orderId: paystackParams.orderId,
      orderNumber: result.orderNumber,
      paymentReference: result.paymentReference,
      receiptToken: paystackParams.receiptToken,
      customerName: paystackParams.customerName,
      fulfillmentType: cartState.fulfillmentType,
      landmarkName: cartState.selectedLandmark?.name,
      deliveryAddress: cartState.deliveryAddress,
      items: [...cartState.items],
      subtotal: cartState.subtotal,
      deliveryFee: cartState.deliveryFee,
      total: cartState.estimatedTotal,
    };

    setPaystackParams(null);
    setReceiptData(receiptSnapshot);

    // Persist confirmed guest receipt in hardware-backed SecureStore
    await GuestReceiptStore.saveReceipt(
      paystackParams.orderId,
      result.orderNumber,
      paystackParams.receiptToken
    );

    await cartStore.clearCart();
    setIsCartOpen(false);
    showToast(`Payment verified! Order #${result.orderNumber} confirmed! 🍕`);
    GuestReceiptStore.getAllReceipts().then(setGuestOrders);
  };

  const handleReceiptDone = () => {
    setReceiptData(null);
    setActiveTab('orders');
    GuestReceiptStore.getAllReceipts().then(setGuestOrders);
  };

  // STAFF ROUTE: Dedicated /kitchen entry point with strict database RBAC gate
  if (isKitchenMode) {
    if (!isStaffRole(authenticatedRole)) {
      return (
        <SafeAreaProvider>
          <SafeAreaView style={styles.safeArea}>
            <StatusBar style="light" />
            <View style={styles.accessDeniedContainer}>
              <Text style={styles.accessDeniedIcon}>🔒</Text>
              <Text style={styles.accessDeniedTitle}>Staff Authorization Required</Text>
              <Text style={styles.accessDeniedSubtitle}>
                The Kitchen Display System (/kitchen) is strictly restricted to authenticated AY Pizza staff members (Kitchen, Counter, Manager, or Admin).
              </Text>
              <View style={styles.accessDeniedRoleCard}>
                <Text style={styles.accessDeniedRoleLabel}>Detected Identity</Text>
                <Text style={styles.accessDeniedRoleValue}>
                  {authenticatedRole ? authenticatedRole.toUpperCase() : 'ANONYMOUS / UNREGISTERED CUSTOMER'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.returnMenuBtn}
                onPress={() => {
                  setIsKitchenMode(false);
                  if (typeof window !== 'undefined' && window.history?.pushState) {
                    window.history.pushState({}, '', '/');
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.returnMenuBtnText}>← Return to Customer App</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </SafeAreaProvider>
      );
    }

    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <StatusBar style="light" />
          <KitchenDisplaySystem
            currentRole={authenticatedRole!}
            onClose={() => {
              setIsKitchenMode(false);
              if (typeof window !== 'undefined' && window.history?.pushState) {
                window.history.pushState({}, '', '/');
              }
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />

        {/* 1. TOP BRAND HEADER */}
        <View style={styles.topHeader}>
          <View style={styles.brandRow}>
            {isCartOpen ? (
              <TouchableOpacity
                style={styles.backBtnRow}
                onPress={() => setIsCartOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.backArrow}>←</Text>
                <Text style={styles.backLabel}>Back to Menu</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.brandLogoRow}
                onPress={() => {
                  setIsCartOpen(false);
                  setActiveTab('home');
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.pizzaEmoji}>🍕</Text>
                <Text style={styles.brandTitle}>{Brand.shortName}</Text>
                <View style={styles.brandBadgeUnilag}>
                  <Text style={styles.brandBadgeUnilagText}>UNILAG</Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.headerRightActions}>
              {/* Staff Portal Badge (Strictly visible only if authenticated user is staff) */}
              {isStaffRole(authenticatedRole) && (
                <TouchableOpacity
                  style={styles.staffHeaderBadge}
                  onPress={() => {
                    setIsKitchenMode(true);
                    if (typeof window !== 'undefined' && window.history?.pushState) {
                      window.history.pushState({}, '', '/kitchen');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.staffHeaderBadgeText}>
                    👨‍🍳 Staff KDS
                  </Text>
                </TouchableOpacity>
              )}

              {/* Prominent Cart Button with Count Badge */}
              <TouchableOpacity
                style={[styles.cartBadgeBtn, isCartOpen && styles.cartBadgeBtnActive]}
                onPress={() => setIsCartOpen(!isCartOpen)}
                activeOpacity={0.85}
              >
                <Text style={styles.cartIcon}>{isCartOpen ? '✕' : '🛒'}</Text>
                {!isCartOpen && cartState.itemCount > 0 && (
                  <View style={styles.cartCountCircle}>
                    <Text style={styles.cartCountText}>{cartState.itemCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Global Toast Notification */}
          {toastMessage && (
            <View style={styles.toastContainer}>
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          )}
        </View>

        {/* 2. BODY CONTENT */}
        <View style={styles.mainContent}>
          {isCartOpen ? (
            /* DEDICATED CART VIEW */
            <CartView
              cartState={cartState}
              onExploreMenu={() => {
                setIsCartOpen(false);
                setActiveTab('menu');
              }}
              onEditItem={handleEditCartItem}
              onProceedToCheckout={() => setCheckoutVisible(true)}
            />
          ) : activeTab === 'home' ? (
            /* TAB 1: HOME SCREEN */
            <HomeScreen
              customer={customerProfile}
              categories={categories}
              popularProducts={pizzaProducts}
              allProducts={products}
              fulfillmentType={cartState.fulfillmentType}
              selectedLandmark={cartState.selectedLandmark}
              activeOrders={guestOrders}
              selectedCategorySlug={selectedCategorySlug}
              onSelectCategory={(slug) => {
                setSelectedCategorySlug(slug);
                setActiveTab('menu');
              }}
              onOpenSearch={() => setActiveTab('menu')}
              onOpenProductDetail={(prod) => setSelectedProductForDetail(prod)}
              onOpenCustomizer={(prod) => handleOpenCustomize(prod)}
              onTrackOrder={(orderId, receiptToken) =>
                setSelectedOrderForTracking({ orderId, receiptToken })
              }
              onOpenFulfillmentPicker={() => setLandmarkPickerVisible(true)}
              onExploreMenu={() => setActiveTab('menu')}
              onToggleFulfillmentType={(type) => {
                cartStore.setFulfillmentType(type);
                if (type === 'delivery' && !cartState.selectedLandmark) {
                  setLandmarkPickerVisible(true);
                }
              }}
            />
          ) : activeTab === 'menu' ? (
            /* TAB 2: MENU CATALOG SCREEN */
            <View style={styles.tabContent}>
              {/* Search Box */}
              <View style={styles.searchSection}>
                <View style={styles.searchBox}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search pizzas, shakes, toppings, burgers..."
                    placeholderTextColor={Colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Text style={styles.clearSearchText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Category Bar */}
              <CategoryBar
                categories={categories}
                selectedCategorySlug={selectedCategorySlug}
                onSelectCategory={(slug) => setSelectedCategorySlug(slug)}
              />

              {/* Product Listing */}
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors.primaryRed} />
                  <Text style={styles.loadingText}>Loading AY Pizza catalog...</Text>
                </View>
              ) : filteredProducts.length === 0 ? (
                <View style={styles.emptySearchContainer}>
                  <Text style={styles.emptySearchEmoji}>🔍</Text>
                  <Text style={styles.emptySearchTitle}>No matching products</Text>
                  <Text style={styles.emptySearchSubtitle}>
                    No items found for "{searchQuery}". Try a different keyword or category.
                  </Text>
                  <TouchableOpacity
                    style={styles.resetSearchBtn}
                    onPress={() => {
                      setSearchQuery('');
                      setSelectedCategorySlug('all');
                    }}
                  >
                    <Text style={styles.resetSearchBtnText}>Reset Filter</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  <ScrollView
                    contentContainerStyle={[
                      styles.productListContent,
                      cartState.itemCount > 0 && { paddingBottom: 100 },
                    ]}
                    showsVerticalScrollIndicator={false}
                  >
                    {filteredProducts.map((prod) => (
                      <ProductCard
                        key={prod.id}
                        product={prod}
                        onPress={(p) => setSelectedProductForDetail(p)}
                        onPressCustomize={(p) => handleOpenCustomize(p)}
                      />
                    ))}
                  </ScrollView>

                  {/* FLOATING CART BAR ON MENU SCREEN (Chowdeck UX benchmark) */}
                  {cartState.itemCount > 0 && (
                    <View style={styles.floatingCartBarContainer}>
                      <TouchableOpacity
                        style={styles.floatingCartBar}
                        onPress={() => setIsCartOpen(true)}
                        activeOpacity={0.9}
                      >
                        <View style={styles.floatingCartLeft}>
                          <View style={styles.floatingCartBadge}>
                            <Text style={styles.floatingCartBadgeText}>
                              {cartState.itemCount}
                            </Text>
                          </View>
                          <Text style={styles.floatingCartTotal}>
                            ₦{cartState.estimatedTotal.toLocaleString()}
                          </Text>
                        </View>
                        <Text style={styles.floatingCartAction}>View Cart →</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          ) : activeTab === 'orders' ? (
            /* TAB 3: CUSTOMER ORDERS SCREEN */
            <OrdersScreen
              userId={customerProfile?.id}
              catalogProducts={products}
              onExploreMenu={() => setActiveTab('menu')}
              onNavigateToCart={() => setIsCartOpen(true)}
            />
          ) : (
            /* TAB 4: CUSTOMER ACCOUNT SCREEN */
            <AccountScreen
              customer={customerProfile}
              onRefreshProfile={refreshCustomer}
              onOpenKitchenDisplay={() => setIsKitchenMode(true)}
              onNavigateToOrders={() => setActiveTab('orders')}
            />
          )}
        </View>

        {/* 3. PERSISTENT CUSTOMER BOTTOM NAVIGATION BAR */}
        {!isCartOpen && (
          <BottomTabBar
            activeTab={activeTab}
            onTabChange={(tab) => {
              setIsCartOpen(false);
              setActiveTab(tab);
            }}
            activeOrdersCount={guestOrders.length}
          />
        )}

        {/* PRODUCT DETAIL MODAL */}
        <ProductDetailModal
          product={selectedProductForDetail}
          visible={Boolean(selectedProductForDetail)}
          onClose={() => setSelectedProductForDetail(null)}
          onCustomize={(prod) => {
            setSelectedProductForDetail(null);
            handleOpenCustomize(prod);
          }}
        />

        {/* INTERACTIVE CUSTOMIZER MODAL */}
        <CustomizerModal
          product={customizerProduct}
          visible={Boolean(customizerProduct)}
          onClose={() => {
            setCustomizerProduct(null);
            setEditingCartItem(undefined);
          }}
          onSave={handleSaveCustomization}
          existingCartItem={editingCartItem}
          allPizzaProducts={pizzaProducts}
        />

        {/* CHECKOUT MODAL */}
        <CheckoutModal
          visible={checkoutVisible}
          cartState={cartState}
          customerProfile={customerProfile}
          onClose={() => setCheckoutVisible(false)}
          onProceedToPayment={handleProceedToPayment}
        />

        {/* PAYSTACK PAYMENT MODAL */}
        <PaystackPaymentModal
          visible={Boolean(paystackParams)}
          params={paystackParams}
          onClose={() => setPaystackParams(null)}
          onPaymentSuccess={handlePaymentSuccess}
        />

        {/* ORDER RECEIPT MODAL */}
        {receiptData && (
          <OrderReceiptModal
            visible={Boolean(receiptData)}
            orderNumber={receiptData.orderNumber}
            paymentReference={receiptData.paymentReference}
            receiptToken={receiptData.receiptToken}
            customerName={receiptData.customerName}
            fulfillmentType={receiptData.fulfillmentType}
            landmarkName={receiptData.landmarkName}
            deliveryAddress={receiptData.deliveryAddress}
            items={receiptData.items}
            subtotal={receiptData.subtotal}
            deliveryFee={receiptData.deliveryFee}
            total={receiptData.total}
            onDone={handleReceiptDone}
            onTrackOrder={() => {
              const target = {
                orderId: receiptData.orderId,
                receiptToken: receiptData.receiptToken,
              };
              setReceiptData(null);
              setSelectedOrderForTracking(target);
              GuestReceiptStore.getAllReceipts().then(setGuestOrders);
            }}
          />
        )}

        {/* CUSTOMER ORDER TRACKING MODAL */}
        <OrderTrackingModal
          visible={Boolean(selectedOrderForTracking)}
          orderId={selectedOrderForTracking?.orderId || ''}
          receiptToken={selectedOrderForTracking?.receiptToken || ''}
          onClose={() => setSelectedOrderForTracking(null)}
        />

        {/* LANDMARK / FULFILLMENT PICKER MODAL */}
        <LandmarkPickerModal
          visible={landmarkPickerVisible}
          selectedLandmark={cartState.selectedLandmark}
          onSelectLandmark={(landmark: DeliveryLandmark) => {
            cartStore.setLandmark(landmark);
            showToast(`Delivery set to ${landmark.name}`);
          }}
          onClose={() => setLandmarkPickerVisible(false)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.warmCream,
  },
  topHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.08)',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  backArrow: {
    fontSize: 20,
    color: Colors.charcoal,
    fontWeight: '800',
    marginRight: 6,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  pizzaEmoji: {
    fontSize: 24,
    marginRight: 6,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.primaryRed,
    letterSpacing: 0.6,
  },
  brandBadgeUnilag: {
    backgroundColor: Colors.goldenYellow,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  brandBadgeUnilagText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#27211F',
    letterSpacing: 0.5,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartBadgeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.warmCream,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(39, 33, 31, 0.1)',
    position: 'relative',
  },
  cartBadgeBtnActive: {
    backgroundColor: Colors.primaryRed,
    borderColor: Colors.primaryRed,
  },
  cartIcon: {
    fontSize: 18,
    color: Colors.charcoal,
  },
  cartCountCircle: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.primaryRed,
    borderRadius: 10,
    minWidth: 19,
    height: 19,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  cartCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  staffHeaderBadge: {
    backgroundColor: 'rgba(40, 122, 75, 0.12)',
    borderWidth: 1,
    borderColor: Colors.freshGreen,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 10,
  },
  staffHeaderBadgeText: {
    color: Colors.freshGreen,
    fontSize: 11,
    fontWeight: '800',
  },
  toastContainer: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 8,
    alignItems: 'center',
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  mainContent: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    backgroundColor: Colors.warmCream,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.charcoal,
    fontSize: 14,
    padding: 0,
    fontWeight: '500',
  },
  clearSearchText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  productListContent: {
    padding: 16,
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: Colors.charcoal,
    fontSize: 14,
    marginTop: 12,
    fontWeight: '600',
  },
  emptySearchContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptySearchEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptySearchTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 6,
  },
  emptySearchSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  resetSearchBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  resetSearchBtnText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  floatingCartBarContainer: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
  },
  floatingCartBar: {
    backgroundColor: Colors.primaryRed,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  floatingCartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  floatingCartBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 10,
  },
  floatingCartBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  floatingCartTotal: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  floatingCartAction: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  accessDeniedContainer: {
    flex: 1,
    backgroundColor: Colors.warmCream,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  accessDeniedIcon: {
    fontSize: 54,
    marginBottom: 16,
  },
  accessDeniedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primaryRed,
    textAlign: 'center',
    marginBottom: 8,
  },
  accessDeniedSubtitle: {
    fontSize: 14,
    color: Colors.charcoal,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 420,
  },
  accessDeniedRoleCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.1)',
  },
  accessDeniedRoleLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontWeight: '700',
  },
  accessDeniedRoleValue: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  returnMenuBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  returnMenuBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
