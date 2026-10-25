import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Colors } from './src/constants/colors';
import { Brand } from './src/constants/brand';
import { FoodImages } from './src/constants/images';
import { Product, ProductCategory } from './src/types/catalog';
import { catalogRepository } from './src/domains/catalog/catalog-repository';
import { cartStore, INITIAL_CART_STATE } from './src/domains/cart/cart-store';
import { CartState, CartItem } from './src/domains/cart/cart-types';
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
import { GuestReceiptStore, GuestReceiptRecord } from './src/domains/order/guest-receipt-store';
import {
  fetchAuthenticatedRole,
  isStaffRole,
  subscribeAuthState,
} from './src/domains/auth/auth-service';
import { UserRole } from './src/types/auth';

type AppTab = 'menu' | 'cart' | 'orders' | 'status';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('menu');
  const [isKitchenMode, setIsKitchenMode] = useState<boolean>(false);
  const [authenticatedRole, setAuthenticatedRole] = useState<UserRole | null>(null);
  const [guestOrders, setGuestOrders] = useState<GuestReceiptRecord[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState('all');

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

  // Load catalog on mount
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
          // Reconcile cart with live catalog
          await cartStore.reconcileWithCatalog(prods);
        }
      } catch (err) {
        console.warn('Error loading catalog:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadCatalog();

    // Check for web route /kitchen (dedicated staff endpoint)
    if (typeof window !== 'undefined' && window.location?.pathname === '/kitchen') {
      setIsKitchenMode(true);
    }

    // Load recent guest orders for Orders tab
    GuestReceiptStore.getAllReceipts().then((records: GuestReceiptRecord[]) => {
      if (isMounted) setGuestOrders(records);
    });

    // Subscribe to auth state changes and fetch current authenticated role
    const authSub = subscribeAuthState((role) => {
      if (isMounted) {
        setAuthenticatedRole(role);
        // If logged out or demoted from staff, immediately exit kitchen mode
        if (!isStaffRole(role)) {
          setIsKitchenMode(false);
          if (typeof window !== 'undefined' && window.location?.pathname === '/kitchen' && window.history?.pushState) {
            window.history.pushState({}, '', '/');
          }
        }
      }
    });

    fetchAuthenticatedRole().then((role) => {
      if (isMounted) {
        setAuthenticatedRole(role);
      }
    });

    // Subscribe to persistent cart store
    const unsubscribe = cartStore.subscribe((newState) => {
      if (isMounted) {
        setCartState(newState);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      authSub.unsubscribe();
    };
  }, []);

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
    showToast(`Payment verified! Order #${result.orderNumber} confirmed! 🍕`);
  };

  const handleReceiptDone = () => {
    setReceiptData(null);
    setActiveTab('menu');
    GuestReceiptStore.getAllReceipts().then(setGuestOrders);
  };

  // STAFF ROUTE: Dedicated /kitchen entry point with strict database RBAC gate
  if (isKitchenMode) {
    if (!isStaffRole(authenticatedRole)) {
      return (
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
              <Text style={styles.returnMenuBtnText}>← Return to Customer Menu</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safeArea}>
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
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {/* TOP HEADER */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <View>
            <View style={styles.brandLogoRow}>
              <Text style={styles.pizzaEmoji}>🍕</Text>
              <Text style={styles.brandTitle}>{Brand.name}</Text>
              <View style={styles.brandBadgeUnilag}>
                <Text style={styles.brandBadgeUnilagText}>UNILAG</Text>
              </View>
            </View>
            <View style={styles.brandLocationRow}>
              <Text style={styles.brandLocationPin}>📍</Text>
              <Text style={styles.brandSubtitle}>
                Opposite King Jaja Hall • Campus Delivery
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Staff portal badge: visible ONLY if authenticated user has staff privileges */}
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
                  👨‍🍳 Staff KDS ({authenticatedRole?.toUpperCase()})
                </Text>
              </TouchableOpacity>
            )}

            {/* Cart Icon / Counter */}
            <TouchableOpacity
              style={[styles.cartBadgeBtn, activeTab === 'cart' && styles.cartBadgeBtnActive]}
              onPress={() => setActiveTab('cart')}
              activeOpacity={0.85}
            >
              <Text style={styles.cartIcon}>🛒</Text>
              {cartState.itemCount > 0 && (
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

      {/* CUSTOMER TAB NAVIGATION BAR (KDS is excluded from customer navigation) */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'menu' && styles.tabButtonActive]}
          onPress={() => setActiveTab('menu')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'menu' && styles.tabTextActive]}>
            🍕 Menu Catalog
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'cart' && styles.tabButtonActive]}
          onPress={() => setActiveTab('cart')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'cart' && styles.tabTextActive]}>
            🛒 Cart ({cartState.itemCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'orders' && styles.tabButtonActive]}
          onPress={() => {
            setActiveTab('orders');
            GuestReceiptStore.getAllReceipts().then(setGuestOrders);
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'orders' && styles.tabTextActive]}>
            📜 Orders {guestOrders.length > 0 ? `(${guestOrders.length})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'status' && styles.tabButtonActive]}
          onPress={() => setActiveTab('status')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'status' && styles.tabTextActive]}>
            ⚙️ Phase Status
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB 1: MENU CATALOG */}
      {activeTab === 'menu' && (
        <View style={styles.tabContent}>
          {/* Search Box */}
          <View style={styles.searchSection}>
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search pizzas, shakes, toppings, burgers..."
                placeholderTextColor={Colors.muted}
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
              <ActivityIndicator size="large" color={Colors.lava} />
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
            <ScrollView
              contentContainerStyle={styles.productListContent}
              showsVerticalScrollIndicator={false}
            >
              {/* HERO PROMOTIONAL BANNER */}
              <View style={styles.heroCard}>
                <Image
                  source={FoodImages.heroBanner}
                  style={styles.heroImage}
                  resizeMode="cover"
                />
                <View style={styles.heroOverlay}>
                  <View style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>⚡ HOT & FRESH FROM JAX OVEN</Text>
                  </View>
                  <Text style={styles.heroTitle}>Craving Real Artisan Pizza?</Text>
                  <Text style={styles.heroSubtitle}>
                    Hand-stretched crusts, 100% mozzarella & farm-fresh toppings baked opposite King Jaja Hall.
                  </Text>
                  <View style={styles.heroFooter}>
                    <View style={styles.heroTimingPill}>
                      <Text style={styles.heroTimingText}>⏱️ Fresh UNILAG Campus Delivery</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Provisional Price Banner */}
              <View style={styles.provisionalHeaderBanner}>
                <Text style={styles.provisionalHeaderText}>
                  ℹ️ Catalog prices and landmark fees are database-provided provisional estimates pending owner confirmation.
                </Text>
              </View>

              {filteredProducts.map((prod) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  onPress={(p) => setSelectedProductForDetail(p)}
                  onPressCustomize={(p) => handleOpenCustomize(p)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* TAB 2: LOCAL CART VIEW */}
      {activeTab === 'cart' && (
        <CartView
          cartState={cartState}
          onExploreMenu={() => setActiveTab('menu')}
          onEditItem={handleEditCartItem}
          onProceedToCheckout={() => setCheckoutVisible(true)}
        />
      )}

      {/* TAB 3: SYSTEM & PHASE 2 VERIFICATION STATUS */}
      {activeTab === 'status' && (
        <ScrollView contentContainerStyle={styles.statusScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.statusCard}>
            <Text style={styles.statusCardHeader}>🚀 Phase 3 Implementation Summary</Text>
            <Text style={styles.statusParagraph}>
              Phase 3 delivers a complete, secure customer checkout experience with authoritative
              PostgreSQL order creation and Paystack payment processing.
            </Text>

            <View style={styles.checkItem}>
              <Text style={styles.checkIcon}>✅</Text>
              <Text style={styles.checkLabel}>Authoritative Order RPC: Zero-direct-client-insert enforced by PostgreSQL RLS</Text>
            </View>
            <View style={styles.checkItem}>
              <Text style={styles.checkIcon}>✅</Text>
              <Text style={styles.checkLabel}>Secure Guest Checkout with 256-bit unguessable receipt tokens</Text>
            </View>
            <View style={styles.checkItem}>
              <Text style={styles.checkIcon}>✅</Text>
              <Text style={styles.checkLabel}>Paystack Integration: Provider abstraction with strict integer Kobo calculations</Text>
            </View>
            <View style={styles.checkItem}>
              <Text style={styles.checkIcon}>✅</Text>
              <Text style={styles.checkLabel}>HMAC-SHA512 Webhook Security: Timing-safe signature verification & idempotency</Text>
            </View>
            <View style={styles.checkItem}>
              <Text style={styles.checkIcon}>✅</Text>
              <Text style={styles.checkLabel}>State Machine Separation: Payment status vs Fulfillment status isolation</Text>
            </View>
            <View style={styles.checkItem}>
              <Text style={styles.checkIcon}>✅</Text>
              <Text style={styles.checkLabel}>Anti-Regression Protection: Settled orders cannot be overridden by delayed webhooks</Text>
            </View>
            <View style={styles.checkItem}>
              <Text style={styles.checkIcon}>✅</Text>
              <Text style={styles.checkLabel}>Itemized Customer Receipt: Secure order confirmation viewable with token</Text>
            </View>
          </View>

          <View style={styles.statusCard}>
            <Text style={styles.statusCardHeader}>🔒 Phase Boundary & Security</Text>
            <Text style={styles.statusParagraph}>
              As mandated by Phase 3 architectural constraints:
            </Text>
            <Text style={styles.bulletPoint}>• Paystack secrets remain strictly in server environment variables.</Text>
            <Text style={styles.bulletPoint}>• No client can insert orders, order items, or modify order totals directly.</Text>
            <Text style={styles.bulletPoint}>• No Kitchen Display System (KDS) or live tracking implemented (deferred to Phase 4).</Text>
            <Text style={styles.bulletPoint}>• No push notifications or loyalty points implemented (deferred to Phase 5).</Text>
          </View>

          <View style={styles.statusCard}>
            <Text style={styles.statusCardHeader}>📍 Restaurant Contact</Text>
            <Text style={styles.contactRow}>📍 Address: {Brand.location.address}</Text>
            <Text style={styles.contactRow}>📞 Phone: {Brand.contact.phone}</Text>
            <Text style={styles.contactRow}>
              ⏰ Hours: {Brand.operatingHours.openHour}:00 AM – {Brand.operatingHours.closeHour - 12}:00 PM WAT
            </Text>
          </View>
        </ScrollView>
      )}

      {/* TAB 3: CUSTOMER ORDERS / RECEIPTS */}
      {activeTab === 'orders' && (
        <ScrollView contentContainerStyle={styles.statusScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.statusCard}>
            <Text style={styles.statusCardHeader}>📜 My Order Receipts</Text>
            <Text style={styles.statusParagraph}>
              Guest order receipts placed on this device are securely stored in encrypted hardware-backed storage for status inspection and receipt presentation.
            </Text>

            {guestOrders.length === 0 ? (
              <View style={styles.emptyOrdersBox}>
                <Text style={{ fontSize: 44, marginBottom: 12 }}>🍕</Text>
                <Text style={styles.emptyOrdersTitle}>No Orders Yet</Text>
                <Text style={styles.emptyOrdersSubtitle}>
                  Orders placed on this device will appear here so you can view your digital receipt and live tracking.
                </Text>
                <TouchableOpacity
                  style={[styles.resetSearchBtn, { marginTop: 18 }]}
                  onPress={() => setActiveTab('menu')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.resetSearchBtnText}>Explore Menu Catalog</Text>
                </TouchableOpacity>
              </View>
            ) : (
              guestOrders.map((rec) => (
                <TouchableOpacity
                  key={rec.orderId}
                  style={styles.orderReceiptCard}
                  onPress={() => setSelectedOrderForTracking({ orderId: rec.orderId, receiptToken: rec.receiptToken })}
                  activeOpacity={0.85}
                >
                  <View style={styles.orderReceiptHeaderRow}>
                    <View style={styles.orderReceiptBadge}>
                      <Text style={styles.orderReceiptBadgeText}>Order #{rec.orderNumber}</Text>
                    </View>
                    <Text style={styles.orderReceiptDate}>
                      {new Date(rec.savedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.orderReceiptIdText}>
                    Order ID: {rec.orderId}
                  </Text>
                  <View style={styles.orderReceiptFooterRow}>
                    <Text style={styles.orderReceiptSecureTag}>🔒 Verified Secure Token</Text>
                    <View style={styles.trackOrderLiveBtn}>
                      <Text style={styles.trackOrderLiveBtnText}>Track Live 📡</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
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

      {/* PHASE 3: CHECKOUT MODAL */}
      <CheckoutModal
        visible={checkoutVisible}
        cartState={cartState}
        onClose={() => setCheckoutVisible(false)}
        onProceedToPayment={handleProceedToPayment}
      />

      {/* PHASE 3: PAYSTACK PAYMENT MODAL */}
      <PaystackPaymentModal
        visible={Boolean(paystackParams)}
        params={paystackParams}
        onClose={() => setPaystackParams(null)}
        onPaymentSuccess={handlePaymentSuccess}
      />

      {/* PHASE 3: ORDER RECEIPT MODAL */}
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

      {/* PHASE 4.2: CUSTOMER ORDER TRACKING MODAL */}
      <OrderTrackingModal
        visible={Boolean(selectedOrderForTracking)}
        orderId={selectedOrderForTracking?.orderId || ''}
        receiptToken={selectedOrderForTracking?.receiptToken || ''}
        onClose={() => setSelectedOrderForTracking(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.night, // Warm Cream #FFF8EC
  },
  topHeader: {
    backgroundColor: Colors.royal, // Card White #FFFFFF
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.charcoal,
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
  pizzaEmoji: {
    fontSize: 24,
    marginRight: 6,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.lava, // Primary Red #C9232B
    letterSpacing: 0.6,
  },
  brandBadgeUnilag: {
    backgroundColor: Colors.gold, // Golden Yellow #F4B323
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
  brandLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  brandLocationPin: {
    fontSize: 11,
    marginRight: 3,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.muted,
  },
  cartBadgeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.night, // Warm cream circle
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.charcoal,
    position: 'relative',
  },
  cartBadgeBtnActive: {
    backgroundColor: Colors.lava,
    borderColor: Colors.lava,
  },
  cartIcon: {
    fontSize: 20,
  },
  cartCountCircle: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.lava, // Primary red
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  cartCountText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  toastContainer: {
    backgroundColor: Colors.lava,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 8,
    alignItems: 'center',
    shadowColor: Colors.lava,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.royal,
    borderBottomWidth: 1,
    borderColor: Colors.charcoal,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    marginHorizontal: 3,
  },
  tabButtonActive: {
    backgroundColor: Colors.lava, // Primary Red
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.muted,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tabContent: {
    flex: 1,
    backgroundColor: Colors.night,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.royal, // Pure White
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: Colors.charcoal,
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
    color: Colors.frost, // Charcoal
    fontSize: 14,
    padding: 0,
    fontWeight: '500',
  },
  clearSearchText: {
    color: Colors.muted,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  productListContent: {
    padding: 16,
    paddingBottom: 36,
  },
  heroCard: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#27211F',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0.72,
  },
  heroOverlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.42)',
    padding: 16,
    justifyContent: 'space-between',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#27211F',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#FFF8EC',
    lineHeight: 16,
    fontWeight: '500',
    maxWidth: '90%',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroTimingPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  heroTimingText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.lava,
  },
  provisionalHeaderBanner: {
    backgroundColor: Colors.softTomato,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(201, 35, 43, 0.2)',
  },
  provisionalHeaderText: {
    fontSize: 11,
    color: Colors.crust,
    lineHeight: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: Colors.frost,
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
    color: Colors.frost,
    marginBottom: 6,
  },
  emptySearchSubtitle: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
    marginBottom: 16,
  },
  resetSearchBtn: {
    backgroundColor: Colors.lava,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  resetSearchBtnText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  statusScroll: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: Colors.night,
  },
  statusCard: {
    backgroundColor: Colors.royal,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.charcoal,
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  statusCardHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.lava,
    marginBottom: 8,
  },
  statusParagraph: {
    fontSize: 13,
    color: Colors.frost,
    lineHeight: 19,
    marginBottom: 12,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  checkIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  checkLabel: {
    fontSize: 13,
    color: Colors.frost,
    flex: 1,
    fontWeight: '500',
  },
  bulletPoint: {
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 18,
    marginBottom: 4,
  },
  contactRow: {
    fontSize: 13,
    color: Colors.frost,
    marginBottom: 6,
    fontWeight: '600',
  },
  emptyOrdersBox: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  emptyOrdersTitle: {
    color: Colors.frost,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyOrdersSubtitle: {
    color: Colors.muted,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  orderReceiptCard: {
    backgroundColor: Colors.night,
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.charcoal,
  },
  orderReceiptHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderReceiptBadge: {
    backgroundColor: Colors.softTomato,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  orderReceiptBadgeText: {
    color: Colors.lava,
    fontWeight: '900',
    fontSize: 14,
  },
  orderReceiptDate: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  orderReceiptIdText: {
    color: Colors.muted,
    fontSize: 11,
    marginTop: 6,
    fontFamily: 'monospace',
  },
  orderReceiptFooterRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderReceiptSecureTag: {
    fontSize: 11,
    color: Colors.green,
    fontWeight: '700',
  },
  trackOrderLiveBtn: {
    backgroundColor: Colors.lava,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    shadowColor: Colors.lava,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  trackOrderLiveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  staffHeaderBadge: {
    backgroundColor: 'rgba(40, 122, 75, 0.12)',
    borderWidth: 1,
    borderColor: Colors.green,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 10,
  },
  staffHeaderBadgeText: {
    color: Colors.green,
    fontSize: 11,
    fontWeight: '800',
  },
  accessDeniedContainer: {
    flex: 1,
    backgroundColor: Colors.night,
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
    color: Colors.lava,
    textAlign: 'center',
    marginBottom: 8,
  },
  accessDeniedSubtitle: {
    fontSize: 14,
    color: Colors.frost,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 420,
  },
  accessDeniedRoleCard: {
    backgroundColor: Colors.royal,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.charcoal,
  },
  accessDeniedRoleLabel: {
    fontSize: 11,
    color: Colors.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontWeight: '700',
  },
  accessDeniedRoleValue: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.frost,
  },
  returnMenuBtn: {
    backgroundColor: Colors.lava,
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
