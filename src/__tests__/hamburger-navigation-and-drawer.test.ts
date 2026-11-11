import React from 'react';
import { NavigationDrawer, NavigationDrawerProps } from '../components/NavigationDrawer';
import { CustomerProfile } from '../domains/customer/customer-types';
import { GuestReceiptStore } from '../domains/order/guest-receipt-store';
import { signOutUser } from '../domains/auth/auth-service';
import { supabase } from '../config/supabase';

beforeAll(() => {
  jest.spyOn(React, 'useState').mockImplementation(((initial: any) => [
    typeof initial === 'function' ? initial() : initial,
    jest.fn(),
  ]) as any);
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Mock Supabase
jest.mock('../config/supabase', () => ({
  supabase: {
    auth: {
      signOut: jest.fn().mockResolvedValue({ error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: jest.fn(),
  },
}));

function findByTestId(node: any, testID: string): any {
  if (!node) return null;
  if (node.props?.testID === testID) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const res = findByTestId(child, testID);
      if (res) return res;
    }
  }
  if (node.props?.children) {
    if (Array.isArray(node.props.children)) {
      for (const child of node.props.children) {
        const res = findByTestId(child, testID);
        if (res) return res;
      }
    } else {
      return findByTestId(node.props.children, testID);
    }
  }
  return null;
}

function findTextInNode(node: any, text: string): boolean {
  if (!node) return false;
  if (typeof node === 'string') return node.includes(text);
  if (typeof node === 'number') return String(node).includes(text);
  if (node.props?.children) {
    if (Array.isArray(node.props.children)) {
      return node.props.children.some((c: any) => findTextInNode(c, text));
    }
    return findTextInNode(node.props.children, text);
  }
  return false;
}

describe('Hamburger Navigation & Left-Side Drawer Experience', () => {
  const createMockProps = (overrides?: Partial<NavigationDrawerProps>): NavigationDrawerProps => ({
    visible: true,
    onClose: jest.fn(),
    customer: null,
    activeTab: 'home',
    onNavigateHome: jest.fn(),
    onNavigateMenu: jest.fn(),
    onNavigateOrders: jest.fn(),
    onNavigateAccount: jest.fn(),
    onOpenAddresses: jest.fn(),
    onOpenSupport: jest.fn(),
    onOpenAuth: jest.fn(),
    onSignOut: jest.fn(),
    onOpenKitchenDisplay: jest.fn(),
    activeOrdersCount: 0,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Drawer Open/Close & Visibility Hierarchy', () => {
    it('returns null when visible is false', () => {
      const props = createMockProps({ visible: false });
      const tree = NavigationDrawer(props);
      expect(tree).toBeNull();
    });

    it('renders drawer panel when visible is true', () => {
      const props = createMockProps({ visible: true });
      const tree = NavigationDrawer(props);
      expect(tree).not.toBeNull();

      const panel = findByTestId(tree, 'navigation-drawer-panel');
      expect(panel).not.toBeNull();

      const backdrop = findByTestId(tree, 'drawer-backdrop');
      expect(backdrop).not.toBeNull();
    });

    it('invokes onClose when close button is pressed', () => {
      const props = createMockProps({ visible: true });
      const tree = NavigationDrawer(props);

      const closeBtn = findByTestId(tree, 'drawer-close-btn');
      expect(closeBtn).not.toBeNull();

      closeBtn.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('invokes onClose when backdrop touchable is pressed', () => {
      const props = createMockProps({ visible: true });
      const tree = NavigationDrawer(props);

      const backdrop = findByTestId(tree, 'drawer-backdrop');
      const touchable = backdrop.props.children;
      touchable.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Guest State Presentation', () => {
    it('displays brand identity, welcome greeting, and sign-in/register buttons', () => {
      const props = createMockProps({ customer: null });
      const tree = NavigationDrawer(props);

      const guestProfile = findByTestId(tree, 'drawer-guest-profile');
      expect(guestProfile).not.toBeNull();
      expect(findTextInNode(guestProfile, 'Welcome, Foodie!')).toBe(true);
      expect(findTextInNode(guestProfile, 'Sign in for addresses & order history')).toBe(true);

      const signInBtn = findByTestId(tree, 'drawer-signin-btn');
      const signUpBtn = findByTestId(tree, 'drawer-signup-btn');
      expect(signInBtn).not.toBeNull();
      expect(signUpBtn).not.toBeNull();

      // Sign out must NOT be rendered for guest
      const signOutBtn = findByTestId(tree, 'drawer-signout-btn');
      expect(signOutBtn).toBeNull();
    });

    it('triggers auth modal with signin mode when Sign In is pressed', () => {
      const props = createMockProps({ customer: null });
      const tree = NavigationDrawer(props);

      const signInBtn = findByTestId(tree, 'drawer-signin-btn');
      signInBtn.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onOpenAuth).toHaveBeenCalledWith('signin');
    });

    it('triggers auth modal with signup mode when Register is pressed', () => {
      const props = createMockProps({ customer: null });
      const tree = NavigationDrawer(props);

      const signUpBtn = findByTestId(tree, 'drawer-signup-btn');
      signUpBtn.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onOpenAuth).toHaveBeenCalledWith('signup');
    });
  });

  describe('3. Authenticated State Presentation', () => {
    const mockCustomer: CustomerProfile = {
      id: 'cust-123',
      fullName: 'Idris Ososanwo',
      email: 'idris@aypizza.ng',
      phone: '08130731895',
      role: 'customer',
      isPhoneVerified: true,
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    };

    it('displays customer avatar initials, full name, email, and phone', () => {
      const props = createMockProps({ customer: mockCustomer });
      const tree = NavigationDrawer(props);

      const authProfile = findByTestId(tree, 'drawer-auth-profile');
      expect(authProfile).not.toBeNull();
      expect(findTextInNode(authProfile, 'IO')).toBe(true);
      expect(findTextInNode(authProfile, 'Idris Ososanwo')).toBe(true);
      expect(findTextInNode(authProfile, 'idris@aypizza.ng')).toBe(true);
      expect(findTextInNode(authProfile, '08130731895')).toBe(true);

      // Guest profile must NOT be rendered
      const guestProfile = findByTestId(tree, 'drawer-guest-profile');
      expect(guestProfile).toBeNull();
    });

    it('renders Sign Out button and invokes onSignOut when pressed', () => {
      const props = createMockProps({ customer: mockCustomer });
      const tree = NavigationDrawer(props);

      const signOutBtn = findByTestId(tree, 'drawer-signout-btn');
      expect(signOutBtn).not.toBeNull();

      signOutBtn.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onSignOut).toHaveBeenCalledTimes(1);
    });

    it('renders STAFF badge and Kitchen Display navigation only for staff roles', () => {
      const staffCustomer: CustomerProfile = {
        ...mockCustomer,
        role: 'kitchen',
      };

      const props = createMockProps({ customer: staffCustomer });
      const tree = NavigationDrawer(props);

      const authProfile = findByTestId(tree, 'drawer-auth-profile');
      expect(findTextInNode(authProfile, 'STAFF')).toBe(true);

      const staffNav = findByTestId(tree, 'drawer-nav-staff-kds');
      expect(staffNav).not.toBeNull();

      staffNav.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onOpenKitchenDisplay).toHaveBeenCalledTimes(1);
    });

    it('does not render staff items for normal customer role', () => {
      const props = createMockProps({ customer: mockCustomer });
      const tree = NavigationDrawer(props);

      const staffNav = findByTestId(tree, 'drawer-nav-staff-kds');
      expect(staffNav).toBeNull();
    });
  });

  describe('4. Navigation Destinations Execution', () => {
    it('navigates to Home when Home item is pressed', () => {
      const props = createMockProps();
      const tree = NavigationDrawer(props);

      const homeItem = findByTestId(tree, 'drawer-nav-home');
      expect(homeItem).not.toBeNull();

      homeItem.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onNavigateHome).toHaveBeenCalledTimes(1);
    });

    it('navigates to Menu when Explore Menu item is pressed', () => {
      const props = createMockProps();
      const tree = NavigationDrawer(props);

      const menuItem = findByTestId(tree, 'drawer-nav-menu');
      expect(menuItem).not.toBeNull();

      menuItem.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onNavigateMenu).toHaveBeenCalledTimes(1);
    });

    it('navigates to Orders when My Orders item is pressed and shows count badge', () => {
      const props = createMockProps({ activeOrdersCount: 2 });
      const tree = NavigationDrawer(props);

      const ordersItem = findByTestId(tree, 'drawer-nav-orders');
      expect(ordersItem).not.toBeNull();
      expect(findTextInNode(ordersItem, '2')).toBe(true);

      ordersItem.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onNavigateOrders).toHaveBeenCalledTimes(1);
    });

    it('opens Saved Addresses when Saved Addresses item is pressed', () => {
      const props = createMockProps();
      const tree = NavigationDrawer(props);

      const addressesItem = findByTestId(tree, 'drawer-nav-addresses');
      expect(addressesItem).not.toBeNull();

      addressesItem.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onOpenAddresses).toHaveBeenCalledTimes(1);
    });

    it('navigates to Account when My Account item is pressed', () => {
      const props = createMockProps();
      const tree = NavigationDrawer(props);

      const accountItem = findByTestId(tree, 'drawer-nav-account');
      expect(accountItem).not.toBeNull();

      accountItem.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onNavigateAccount).toHaveBeenCalledTimes(1);
    });

    it('opens Help & Support when Help & Support item is pressed', () => {
      const props = createMockProps();
      const tree = NavigationDrawer(props);

      const supportItem = findByTestId(tree, 'drawer-nav-support');
      expect(supportItem).not.toBeNull();

      supportItem.props.onPress();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onOpenSupport).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. Sign-out and Guest Data Isolation', () => {
    it('clears Supabase auth session cleanly while leaving guest orders intact', async () => {
      const saveSpy = jest.spyOn(GuestReceiptStore, 'saveReceipt').mockResolvedValue(true);
      const getSpy = jest.spyOn(GuestReceiptStore, 'getAllReceipts').mockResolvedValue([
        {
          orderId: 'guest-ord-1',
          orderNumber: 'AY-1001',
          receiptToken: 'token-xyz',
          savedAt: '2026-11-05T12:00:00Z',
        },
      ]);

      await signOutUser();
      expect(supabase.auth.signOut).toHaveBeenCalled();

      // Verify guest receipts were not destroyed or mutated
      const receipts = await GuestReceiptStore.getAllReceipts();
      expect(receipts).toHaveLength(1);
      expect(receipts[0].orderNumber).toBe('AY-1001');

      saveSpy.mockRestore();
      getSpy.mockRestore();
    });
  });
});
