import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { Product, ProductCategory, isProductInCategory, normalizeCategorySlug } from './src/types/catalog';
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
import { CancelOrderConfirmationModal } from './src/components/CancelOrderConfirmationModal';
import { orderService } from './src/domains/order/order-service';
import { Order, OrderStatus } from './src/types/order';
import { KitchenDisplaySystem } from './src/components/KitchenDisplaySystem';
import { OrderTrackingModal } from './src/components/OrderTrackingModal';
import { BottomTabBar, CustomerTab } from './src/components/BottomTabBar';
import { HomeScreen } from './src/components/HomeScreen';
import { AccountScreen } from './src/components/AccountScreen';
import { OrdersScreen } from './src/components/OrdersScreen';
import { LandmarkPickerModal } from './src/components/LandmarkPickerModal';
import { NavigationDrawer } from './src/components/NavigationDrawer';
import { AuthModal } from './src/components/AuthModal';
import { SavedAddressesModal } from './src/components/SavedAddressesModal';
import { SupportModal } from './src/components/SupportModal';
import { PromotionsModal } from './src/components/PromotionsModal';
import { BrandedLaunchScreen } from './src/components/BrandedLaunchScreen';
import { GuestReceiptStore, GuestReceiptRecord } from './src/domains/order/guest-receipt-store';
import {
  fetchAuthenticatedRole,
  fetchCurrentCustomerProfile,
  isStaffRole,
  signOutUser,
  subscribeAuthState,
  subscribeCustomerProfile,
} from './src/domains/auth/auth-service';
import { UserRole } from './src/types/auth';
import { DeliveryLandmark } from './src/types/delivery';
import { deliveryPricingEngine } from './src/domains/delivery/delivery-pricing-engine';
import { notificationService } from './src/domains/notifications/notification-service';

export default function App() {
  const [activeTab, setActiveTab] = useState<CustomerTab>('home');
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isKitchenMode, setIsKitchenMode] = useState<boolean>(
    () => typeof window !== 'undefined' && window.location?.pathname === '/kitchen'
  );
  const [authenticatedRole, setAuthenticatedRole] = useState<UserRole | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [guestOrders, setGuestOrders] = useState<GuestReceiptRecord[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLaunchScreenActive, setIsLaunchScreenActive] = useState<boolean>(true);
  const [isAppReady, setIsAppReady] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState('all');
  const [landmarkPickerVisible, setLandmarkPickerVisible] = useState(false);
  const [homePromoSlideIndex, setHomePromoSlideIndex] = useState<number>(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [savedAddressesVisible, setSavedAddressesVisible] = useState<boolean>(false);
  const [supportModalVisible, setSupportModalVisible] = useState<boolean>(false);
  const [promotionsModalVisible, setPromotionsModalVisible] = useState<boolean>(false);
  const [authModalVisible, setAuthModalVisible] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const menuScrollViewRef = useRef<any>(null);

  // Auto-advance homepage promotional carousel every 5 seconds when active on Home tab
  useEffect(() => {
    if (activeTab !== 'home' || isCartOpen || !isAppReady) return;
    const interval = setInterval(() => {
      setHomePromoSlideIndex((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTab, isCartOpen, isAppReady]);

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
    items: CartItem[] | any[];
    subtotal: number;
    deliveryFee: number;
    discountAmount?: number;
    total: number;
    orderStatus?: OrderStatus;
    refundStatus?: string;
    orderDate?: string;
    acceptedAt?: string | null;
    preparedAt?: string | null;
    readyAt?: string | null;
    inTransitAt?: string | null;
    completedAt?: string | null;
  } | null>(null);
  const [selectedOrderForTracking, setSelectedOrderForTracking] = useState<{
    orderId: string;
    receiptToken: string;
  } | null>(null);
  const [cancellingReceiptOrder, setCancellingReceiptOrder] = useState<{
    orderId: string;
    orderNumber: string;
    orderTotal: number;
    receiptToken: string;
  } | null>(null);
  const [isCancellingReceiptOrder, setIsCancellingReceiptOrder] = useState(false);

  // Cart subscription state
  const [cartState, setCartState] = useState<CartState>(INITIAL_CART_STATE);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Refresh profile
  const refreshCustomer = useCallback(async (): Promise<CustomerProfile | null> => {
    const prof = await fetchCurrentCustomerProfile();
    setCustomerProfile(prof);
    const role = await fetchAuthenticatedRole();
    setAuthenticatedRole(role);
    if (prof) {
      notificationService.syncTokenOnAuth();
    }
    return prof;
  }, []);

  // Ensure customer profile is refreshed whenever navigating to Account tab
  useEffect(() => {
    if (activeTab === 'account') {
      refreshCustomer();
    }
  }, [activeTab, refreshCustomer]);

  // Load catalog and session on mount
  useEffect(() => {
    let isMounted = true;

    // Safety timeout: guarantee launch screen always transitions even on network hang/outage (10s max)
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setIsAppReady(true);
        setLoading(false);
      }
    }, 10000);

    async function loadCatalog() {
      try {
        setLoading(true);
        const [cats, prods] = await Promise.all([
          catalogRepository.getCategories(),
          catalogRepository.getProducts({ includeUnavailable: true }),
          deliveryPricingEngine.initialize().catch((err) => {
            console.warn('Failed to sync delivery pricing from DB:', err);
            return null;
          }),
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
          setIsAppReady(true);
        }
      }
    }

    loadCatalog();

    // Load recent guest orders
    GuestReceiptStore.getAllReceipts().then((records: GuestReceiptRecord[]) => {
      if (isMounted) setGuestOrders(records);
    });

    // Subscribe to auth state changes and fetch profile
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      clearTimeout(safetyTimer);
      unsubscribeCart();
      authSub.unsubscribe();
      profSub.unsubscribe();
    };
  }, [refreshCustomer]);

  // Filter products by selected category and search term
  const filteredProducts = useMemo(() => {
    let result = products;

    if (normalizeCategorySlug(selectedCategorySlug) !== 'all') {
      result = result.filter((p) => isProductInCategory(p.categorySlug, selectedCategorySlug));
    }

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
    }

    return result;
  }, [products, selectedCategorySlug, searchQuery]);

  // Robust category selection that clears stale search queries and scrolls to top
  const handleSelectCategory = useCallback((slug: string) => {
    setSelectedCategorySlug(slug);
    setSearchQuery('');
    menuScrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

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
    let activeReceiptToken = paystackParams?.receiptToken || '';
    if (!activeReceiptToken) {
      const stored = await GuestReceiptStore.getReceipt(result.orderId);
      if (stored?.receiptToken) {
        activeReceiptToken = stored.receiptToken;
      }
    }
    const customerName =
      paystackParams?.customerName ||
      customerProfile?.fullName ||
      'Valued Customer';

    // Persist confirmed guest receipt in hardware-backed SecureStore immediately
    if (activeReceiptToken) {
      await GuestReceiptStore.saveReceipt(
        result.orderId,
        result.orderNumber,
        activeReceiptToken
      );
    }

    // Authoritative Order Hydration: Retrieve genuine database order
    let authOrder: Order | null = null;
    try {
      const authRes = await orderService.getOrderReceipt(result.orderId, activeReceiptToken);
      if (authRes.success && authRes.order) {
        authOrder = authRes.order;
      }
    } catch {
      // Offline fallback
    }

    const receiptSnapshot = {
      orderId: result.orderId,
      orderNumber: authOrder?.orderNumber || result.orderNumber,
      paymentReference: authOrder?.paymentReference || result.paymentReference,
      receiptToken: activeReceiptToken,
      customerName: authOrder?.guestName || customerName,
      fulfillmentType: authOrder?.fulfillmentType || cartState.fulfillmentType,
      landmarkName: authOrder?.landmarkName || cartState.selectedLandmark?.name,
      deliveryAddress: authOrder?.deliveryAddress || cartState.deliveryAddress,
      items: authOrder?.items && authOrder.items.length > 0 ? authOrder.items : [...cartState.items],
      subtotal: authOrder ? authOrder.subtotal : cartState.subtotal,
      deliveryFee: authOrder ? authOrder.deliveryFee : cartState.deliveryFee,
      discountAmount: authOrder?.discountAmount ?? 0,
      total: authOrder ? authOrder.total : cartState.estimatedTotal,
      orderStatus: authOrder?.status ?? 'CONFIRMED',
      refundStatus: authOrder?.refundStatus ?? 'NONE',
      orderDate: authOrder?.createdAt,
      acceptedAt: authOrder?.acceptedAt,
      preparedAt: authOrder?.preparedAt,
      readyAt: authOrder?.readyAt,
      inTransitAt: authOrder?.inTransitAt,
      completedAt: authOrder?.completedAt,
    };

    setPaystackParams(null);
    setReceiptData(receiptSnapshot);

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

  // Real-time synchronization for immediate post-checkout receipt
  useEffect(() => {
    if (!receiptData?.orderId) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await orderService.getOrderReceipt(receiptData.orderId, receiptData.receiptToken);
        if (isMounted && res.success && res.order) {
          setReceiptData((prev) => {
            if (!prev || prev.orderId !== res.order!.id) return prev;
            if (prev.orderStatus !== res.order!.status || prev.refundStatus !== res.order!.refundStatus) {
              return {
                ...prev,
                orderStatus: res.order!.status,
                refundStatus: res.order!.refundStatus,
                acceptedAt: res.order!.acceptedAt,
                preparedAt: res.order!.preparedAt,
                readyAt: res.order!.readyAt,
                inTransitAt: res.order!.inTransitAt,
                completedAt: res.order!.completedAt,
              };
            }
            return prev;
          });
        }
      } catch {
        // Ignored during background polling
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [receiptData?.orderId, receiptData?.receiptToken]);

  const handleDrawerSignOut = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of AY Pizza?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await notificationService.deactivateCurrentToken('User Logged Out');
            await signOutUser();
            await refreshCustomer();
            showToast('Signed out of AY Pizza 👋');
          },
        },
      ]
    );
  }, [refreshCustomer]);

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
        <StatusBar style={isKitchenMode ? 'light' : isLaunchScreenActive ? 'light' : 'dark'} />

        {/* 1. TOP BRAND HEADER */}
        <View style={styles.topHeader}>
          <View style={styles.brandRow}>
            {isCartOpen ? (
              <TouchableOpacity
                style={styles.backBtnRow}
                onPress={() => setIsCartOpen(false)}
                activeOpacity={0.8}
                testID="cart-back-btn"
              >
                <Text style={styles.backArrow}>←</Text>
                <Text style={styles.backLabel}>Back to Menu</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.brandHeaderLeft}>
                {/* 1. Proper Hamburger Menu on top-left */}
                <TouchableOpacity
                  style={styles.hamburgerBtn}
                  onPress={() => setIsDrawerOpen(true)}
                  activeOpacity={0.75}
                  accessibilityLabel="Open navigation menu"
                  testID="hamburger-menu-btn"
                >
                  <Text style={styles.hamburgerIcon}>☰</Text>
                </TouchableOpacity>

                {/* 2. Brand Identity */}
                <TouchableOpacity
                  style={styles.brandLogoRow}
                  onPress={() => {
                    setIsCartOpen(false);
                    setActiveTab('home');
                  }}
                  activeOpacity={0.9}
                  testID="brand-home-btn"
                >
                  <Text style={styles.pizzaEmoji}>🍕</Text>
                  <Text style={styles.brandTitle}>{Brand.shortName}</Text>
                  <View style={styles.brandBadgeUnilag}>
                    <Text style={styles.brandBadgeUnilagText}>UNILAG</Text>
                  </View>
                </TouchableOpacity>
              </View>
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

              {/* Prominent Cart Button with Count Badge on Right */}
              <TouchableOpacity
                style={[styles.cartBadgeBtn, isCartOpen && styles.cartBadgeBtnActive]}
                onPress={() => setIsCartOpen(!isCartOpen)}
                activeOpacity={0.85}
                testID="cart-header-btn"
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
              userId={customerProfile?.id}
              onExploreMenu={() => {
                setIsCartOpen(false);
                setActiveTab('menu');
              }}
              onEditItem={handleEditCartItem}
              onProceedToCheckout={() => setCheckoutVisible(true)}
              suggestedProducts={pizzaProducts.slice(0, 3)}
              onOpenCustomizer={(prod) => {
                setIsCartOpen(false);
                handleOpenCustomize(prod);
              }}
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
                handleSelectCategory(slug);
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
              activeSlideIndex={homePromoSlideIndex}
              onSelectSlide={(idx) => setHomePromoSlideIndex(idx)}
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
                    selectionColor={Colors.primaryRed}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.clearSearchText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Category Bar */}
              <CategoryBar
                categories={categories}
                selectedCategorySlug={selectedCategorySlug}
                onSelectCategory={handleSelectCategory}
              />

              {/* Product Listing */}
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors.primaryRed} />
                  <Text style={styles.loadingText}>Loading AY Pizza catalog...</Text>
                </View>
              ) : filteredProducts.length === 0 ? (
                <View style={styles.emptySearchContainer}>
                  <Text style={styles.emptySearchEmoji}>{searchQuery.length > 0 ? '🔍' : '🍽️'}</Text>
                  <Text style={styles.emptySearchTitle}>
                    {searchQuery.length > 0 ? 'No matching products' : 'No items in this category'}
                  </Text>
                  <Text style={styles.emptySearchSubtitle}>
                    {searchQuery.length > 0
                      ? `No items found for "${searchQuery}". Try a different keyword or category.`
                      : 'There are currently no items listed in this section. Browse our full menu below.'}
                  </Text>
                  <TouchableOpacity
                    style={styles.resetSearchBtn}
                    onPress={() => {
                      setSearchQuery('');
                      setSelectedCategorySlug('all');
                      menuScrollViewRef.current?.scrollTo({ y: 0, animated: false });
                    }}
                  >
                    <Text style={styles.resetSearchBtnText}>View All Menu</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  <ScrollView
                    ref={menuScrollViewRef}
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
              onNavigateToHome={() => setActiveTab('home')}
            />
          )}
        </View>

        {/* CHOWDECK SIGNATURE FLOATING CART BAR (Docked above BottomTabBar) */}
        {!isCartOpen && cartState.itemCount > 0 && (
          <View style={styles.floatingCartBarContainer} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.floatingCartBar}
              onPress={() => setIsCartOpen(true)}
              activeOpacity={0.9}
              testID="floating-cart-bar"
            >
              <View style={styles.floatingCartLeft}>
                <View style={styles.floatingCartBadge}>
                  <Text style={styles.floatingCartBadgeText}>
                    {cartState.itemCount}
                  </Text>
                </View>
                <View>
                  <Text style={styles.floatingCartItemsLabel}>
                    {cartState.itemCount === 1 ? '1 Item' : `${cartState.itemCount} Items`}
                  </Text>
                  <Text style={styles.floatingCartTotal}>
                    ₦{cartState.estimatedTotal.toLocaleString()}
                  </Text>
                </View>
              </View>
              <View style={styles.floatingCartActionWrap}>
                <Text style={styles.floatingCartAction}>View Cart →</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

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
          onPaymentSuccess={handlePaymentSuccess}
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
            discountAmount={receiptData.discountAmount}
            total={receiptData.total}
            orderDate={receiptData.orderDate}
            orderStatus={receiptData.orderStatus}
            refundStatus={receiptData.refundStatus}
            acceptedAt={receiptData.acceptedAt}
            preparedAt={receiptData.preparedAt}
            readyAt={receiptData.readyAt}
            inTransitAt={receiptData.inTransitAt}
            completedAt={receiptData.completedAt}
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
            onCancelOrder={
              receiptData.orderStatus === 'CONFIRMED'
                ? () => {
                    setCancellingReceiptOrder({
                      orderId: receiptData.orderId,
                      orderNumber: receiptData.orderNumber,
                      orderTotal: receiptData.total,
                      receiptToken: receiptData.receiptToken,
                    });
                  }
                : undefined
            }
          />
        )}

        {/* CANCEL ORDER CONFIRMATION MODAL (Post-Checkout Receipt) */}
        {cancellingReceiptOrder && (
          <CancelOrderConfirmationModal
            visible={Boolean(cancellingReceiptOrder)}
            orderNumber={cancellingReceiptOrder.orderNumber}
            orderTotal={cancellingReceiptOrder.orderTotal}
            isCancelling={isCancellingReceiptOrder}
            onClose={() => setCancellingReceiptOrder(null)}
            onConfirm={async (reason) => {
              try {
                setIsCancellingReceiptOrder(true);
                const res = await orderService.cancelOrderByCustomer(
                  cancellingReceiptOrder.orderId,
                  cancellingReceiptOrder.receiptToken,
                  reason
                );
                if (res.success) {
                  setCancellingReceiptOrder(null);
                  setReceiptData(null);
                  await GuestReceiptStore.getAllReceipts().then(setGuestOrders);
                  Alert.alert(
                    'Order Cancelled 🚫',
                    'Your order has been cancelled successfully. If payment was completed, a refund has been flagged for manager review.'
                  );
                  setActiveTab('orders');
                } else {
                  Alert.alert(
                    'Cannot Cancel Order',
                    res.error || 'The kitchen may have already accepted your order.'
                  );
                  // Refresh order status from server to remove button if transitioned
                  if (receiptData?.orderId) {
                    orderService.getOrderReceipt(receiptData.orderId, receiptData.receiptToken).then((freshRes) => {
                      if (freshRes.success && freshRes.order) {
                        setReceiptData((prev) => prev ? { ...prev, orderStatus: freshRes.order!.status } : null);
                      }
                    });
                  }
                }
              } catch (err: any) {
                Alert.alert('Error', err?.message || 'Failed to cancel order.');
              } finally {
                setIsCancellingReceiptOrder(false);
              }
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

        {/* 1. HAMBURGER NAVIGATION DRAWER */}
        <NavigationDrawer
          visible={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          customer={customerProfile}
          activeTab={activeTab}
          onNavigateHome={() => {
            setIsCartOpen(false);
            setActiveTab('home');
          }}
          onNavigateMenu={() => {
            setIsCartOpen(false);
            setActiveTab('menu');
          }}
          onNavigateOrders={() => {
            setIsCartOpen(false);
            setActiveTab('orders');
          }}
          onNavigateAccount={() => {
            setIsCartOpen(false);
            setActiveTab('account');
            refreshCustomer();
          }}
          onOpenAddresses={() => setSavedAddressesVisible(true)}
          onOpenSupport={() => setSupportModalVisible(true)}
          onOpenPromotions={() => setPromotionsModalVisible(true)}
          onOpenAuth={(mode) => {
            setAuthModalMode(mode);
            setAuthModalVisible(true);
          }}
          onSignOut={handleDrawerSignOut}
          onOpenKitchenDisplay={() => setIsKitchenMode(true)}
          activeOrdersCount={guestOrders.length}
        />

        {/* 2. GLOBAL SAVED ADDRESSES MODAL (Accessible from Drawer) */}
        <SavedAddressesModal
          visible={savedAddressesVisible}
          userId={customerProfile?.id}
          onClose={() => setSavedAddressesVisible(false)}
          onSelectAddress={(addr) => {
            const landmark = deliveryPricingEngine.findLandmark(addr.landmarkId);
            if (landmark) {
              cartStore.setLandmark(landmark);
            }
            const fullAddr = addr.detailedAddress || addr.streetAddress || '';
            if (fullAddr) {
              cartStore.setDeliveryDetails(fullAddr, addr.deliveryNotes || undefined);
            }
            showToast(`Selected "${addr.title || addr.landmarkName || 'Campus'}" address`);
          }}
        />

        {/* 3. GLOBAL HELP & SUPPORT MODAL (Accessible from Drawer) */}
        <SupportModal
          visible={supportModalVisible}
          onClose={() => setSupportModalVisible(false)}
        />

        {/* 4. GLOBAL PROMOTIONS & OFFERS MODAL (Accessible from Drawer) */}
        <PromotionsModal
          visible={promotionsModalVisible}
          onClose={() => setPromotionsModalVisible(false)}
          onExploreMenu={(categorySlug) => {
            setPromotionsModalVisible(false);
            if (categorySlug && categorySlug !== 'all') {
              setSelectedCategorySlug(categorySlug);
            }
            setIsCartOpen(false);
            setActiveTab('menu');
          }}
        />

        {/* 5. GLOBAL AUTHENTICATION MODAL (Accessible from Drawer & Top Header) */}
        <AuthModal
          visible={authModalVisible}
          initialMode={authModalMode}
          onClose={() => setAuthModalVisible(false)}
          onSuccess={async () => {
            const prof = await refreshCustomer();
            if (prof?.fullName) {
              showToast(`Welcome back, ${prof.fullName}! 🍕`);
            } else {
              showToast('Welcome to AY Pizza! 🍕');
            }
          }}
          onNavigateHome={() => {
            setActiveTab('home');
            setIsCartOpen(false);
          }}
        />
      </SafeAreaView>

      {/* STAGE 2: CUSTOM ANIMATED AY PIZZA BRAND INTRODUCTION */}
      {isLaunchScreenActive && (
        <BrandedLaunchScreen
          isAppReady={isAppReady}
          onAnimationComplete={() => setIsLaunchScreenActive(false)}
        />
      )}
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
  brandHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hamburgerBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.warmCream,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.08)',
    marginRight: 10,
  },
  hamburgerIcon: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.chocolateBrown,
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
  accountHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.warmCream,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginRight: 8,
  },
  accountHeaderIcon: {
    fontSize: 16,
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
    bottom: 74,
    left: 14,
    right: 14,
    zIndex: 99,
  },
  floatingCartBar: {
    backgroundColor: Colors.primaryRed,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  floatingCartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  floatingCartBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  floatingCartBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  floatingCartItemsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
    textTransform: 'uppercase',
  },
  floatingCartTotal: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  floatingCartActionWrap: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  floatingCartAction: {
    color: '#FFFFFF',
    fontSize: 13,
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
