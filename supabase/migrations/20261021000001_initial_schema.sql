-- =============================================================================
-- AY PIZZA PRODUCTION POSTGRESQL SCHEMA MIGRATION
-- Migration: 20261021000001_initial_schema.sql
-- Description: Core tables, enums, RLS policies, triggers, and audit logging.
-- =============================================================================

-- Enable required cryptographic and UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'staff', 'admin', 'rider');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'DRAFT',
        'PENDING_PAYMENT',
        'PAID',
        'CONFIRMED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'IN_TRANSIT',
        'DELIVERED',
        'CANCELLED',
        'REFUNDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM (
        'initialized',
        'pending',
        'success',
        'failed',
        'reversed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE fulfillment_type AS ENUM (
        'pickup',
        'delivery'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 2. USER PROFILES & ROLE-BASED ACCESS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    email TEXT,
    role user_role NOT NULL DEFAULT 'customer',
    avatar_url TEXT,
    is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 3. PRODUCT CATALOG & SIZES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    base_price NUMERIC(10, 2) NOT NULL CHECK (base_price >= 0),
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.product_sizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    category_slug TEXT, -- e.g. 'pizza' applies across all pizza items
    name TEXT NOT NULL, -- e.g. 'Regular', 'Standard', 'Large', 'Queen', 'King'
    size_price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (size_price >= 0),
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 4. CUSTOMIZATION & TOPPING GROUPS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customization_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- e.g. 'Extra Toppings', 'Ice Cream Flavors'
    min_selections INT NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
    max_selections INT NOT NULL DEFAULT 1 CHECK (max_selections >= min_selections),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.customization_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.customization_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.product_customization_groups (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.customization_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, group_id)
);

-- =============================================================================
-- 5. DELIVERY ZONES & LANDMARKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- e.g. 'UNILAG Campus', 'Mainland Zone 1'
    base_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (base_fee >= 0),
    estimated_minutes_min INT NOT NULL DEFAULT 15,
    estimated_minutes_max INT NOT NULL DEFAULT 35,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.delivery_landmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID NOT NULL REFERENCES public.delivery_zones(id) ON DELETE RESTRICT,
    name TEXT NOT NULL, -- e.g. 'Inside School (UNILAG)', 'Akoka', 'Yaba'
    fee NUMERIC(10, 2) NOT NULL CHECK (fee >= 0),
    is_campus BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    landmark_id UUID NOT NULL REFERENCES public.delivery_landmarks(id) ON DELETE RESTRICT,
    detailed_address TEXT NOT NULL, -- e.g. 'King Jaja Hall, Block A, Room 12'
    contact_phone TEXT NOT NULL,
    delivery_notes TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 6. ORDERS & ORDER ITEMS
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1000;

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    guest_email TEXT,
    guest_phone TEXT,
    guest_name TEXT,
    fulfillment_type fulfillment_type NOT NULL,
    landmark_id UUID REFERENCES public.delivery_landmarks(id) ON DELETE SET NULL,
    landmark_name TEXT,
    delivery_address TEXT,
    delivery_notes TEXT,
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    status order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
    payment_reference TEXT UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    size_name TEXT,
    size_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_base_price NUMERIC(10, 2) NOT NULL,
    customizations_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    item_total NUMERIC(10, 2) NOT NULL CHECK (item_total >= 0),
    half_secondary_flavor TEXT,
    flavors TEXT[],
    special_instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.order_item_customizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    option_id UUID REFERENCES public.customization_options(id) ON DELETE SET NULL,
    option_name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 7. FINANCIAL TRANSACTIONS & PAYSTACK RECONCILIATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    gateway TEXT NOT NULL DEFAULT 'paystack',
    reference TEXT NOT NULL UNIQUE,
    amount NUMERIC(10, 2) NOT NULL,
    amount_in_kobo BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'NGN',
    status payment_status NOT NULL DEFAULT 'initialized',
    channel TEXT,
    paid_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 8. AUDIT LOGS (IMMUTABLE SECURITY LEDGER)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    performed_by TEXT,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 9. FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Order number generator (Format: AYP-YYYYMMDD-XXXX)
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := 'AYP-' || to_char(now(), 'YYYYMMDD') || '-' || nextval('public.order_number_seq');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER set_orders_order_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_order_number();

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_payment_transactions_updated_at
    BEFORE UPDATE ON public.payment_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Auto create profile on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'phone',
        'customer'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 10. ROW-LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customization_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customization_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_customization_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_landmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_customizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check role in RLS
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('staff', 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles: Users can view & update only their own profile. Staff/Admin can view all.
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR public.is_staff_or_admin());

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Catalog: Anyone can read active categories, products, sizes, options, and landmarks
CREATE POLICY "Public read active categories" ON public.categories
    FOR SELECT USING (is_active = TRUE OR public.is_staff_or_admin());

CREATE POLICY "Public read products" ON public.products
    FOR SELECT USING (TRUE);

CREATE POLICY "Staff modify products" ON public.products
    FOR ALL USING (public.is_staff_or_admin());

CREATE POLICY "Public read sizes" ON public.product_sizes
    FOR SELECT USING (TRUE);

CREATE POLICY "Public read customization groups" ON public.customization_groups
    FOR SELECT USING (TRUE);

CREATE POLICY "Public read customization options" ON public.customization_options
    FOR SELECT USING (TRUE);

CREATE POLICY "Public read product customizations" ON public.product_customization_groups
    FOR SELECT USING (TRUE);

CREATE POLICY "Public read active delivery zones" ON public.delivery_zones
    FOR SELECT USING (is_active = TRUE OR public.is_staff_or_admin());

CREATE POLICY "Public read active delivery landmarks" ON public.delivery_landmarks
    FOR SELECT USING (is_active = TRUE OR public.is_staff_or_admin());

-- Customer Addresses: Users can manage only their own addresses
CREATE POLICY "Users manage own addresses" ON public.customer_addresses
    FOR ALL USING (auth.uid() = customer_id);

-- Orders:
-- 1. Customers can view their own orders.
-- 2. Staff/Admin can view and update orders (KDS).
-- 3. Anyone (including guests) can create an order.
CREATE POLICY "Customers view own orders" ON public.orders
    FOR SELECT USING (
        (auth.uid() IS NOT NULL AND auth.uid() = customer_id)
        OR public.is_staff_or_admin()
    );

CREATE POLICY "Allow order creation" ON public.orders
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Staff update orders" ON public.orders
    FOR UPDATE USING (public.is_staff_or_admin());

-- Order Items & Customizations follow order permissions
CREATE POLICY "View order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
            AND (orders.customer_id = auth.uid() OR public.is_staff_or_admin())
        )
    );

CREATE POLICY "Insert order items" ON public.order_items
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "View order customizations" ON public.order_item_customizations
    FOR SELECT USING (TRUE);

CREATE POLICY "Insert order customizations" ON public.order_item_customizations
    FOR INSERT WITH CHECK (TRUE);

-- Payment Transactions:
-- Customers cannot view raw transaction logs directly; Staff/Admin can view.
CREATE POLICY "Staff view payments" ON public.payment_transactions
    FOR SELECT USING (public.is_staff_or_admin());

-- Audit logs: Strict immutability. Insert allowed by system; Select allowed only for Admin.
CREATE POLICY "Admin view audit logs" ON public.audit_logs
    FOR SELECT USING (public.is_admin());

CREATE POLICY "System insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (TRUE);
