-- =============================================================================
-- AY PIZZA PRODUCTION SEED DATA
-- Migration: 20261021000002_seed_ay_pizza.sql
-- Description: Seeds verified AY Pizza catalog, sizes, toppings, and UNILAG delivery zones.
-- =============================================================================

-- =============================================================================
-- 1. CATEGORIES
-- =============================================================================

INSERT INTO public.categories (id, name, slug, description, display_order)
VALUES
    ('11111111-1111-1111-1111-111111111101', 'Pizza Menu', 'pizza', 'Freshly baked artisan pizzas made with perfectly proofed dough', 1),
    ('11111111-1111-1111-1111-111111111102', 'Ice Cream & Shakes', 'icecream', 'Creamy soft-serve cups and thick gourmet milkshakes', 2),
    ('11111111-1111-1111-1111-111111111103', 'Fast Food & Sides', 'fastfood', 'Crispy wings, juicy chicken, gourmet burgers and chips', 3),
    ('11111111-1111-1111-1111-111111111104', 'Cold Beverages', 'drinks', 'Refreshing cold soft drinks and chilled bottled water', 4)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 2. PIZZA CATALOG (BASE PRICE: ₦7,000.00)
-- =============================================================================

INSERT INTO public.products (id, category_id, name, description, base_price, is_available, display_order)
VALUES
    ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Sweet and Sour Pizza', 'Delicious sweet and sour sauce with tender chicken and melted cheese', 7000.00, TRUE, 1),
    ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111101', 'Club Pizza', 'Layered club pizza with sausage, chicken, peppers, and savory toppings', 7000.00, TRUE, 2),
    ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111101', 'Cheese Pepperoni Pizza', 'Classic beef pepperoni slices over rich mozzarella cheese and marinara', 7000.00, TRUE, 3),
    ('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111101', 'Hawaii Pizza', 'Sweet pineapple chunks paired with savory chicken and premium cheese', 7000.00, TRUE, 4),
    ('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111101', 'Veggie Deluxe Pizza', 'Fresh bell peppers, onions, sweetcorn, olives, and signature herb blend', 7000.00, TRUE, 5),
    ('22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111101', 'Chicken Tikka Pizza', 'Tender tikka spiced chicken pieces with roasted onions and peppers', 7000.00, TRUE, 6),
    ('22222222-2222-2222-2222-222222222207', '11111111-1111-1111-1111-111111111101', 'BBQ Beef Pizza', 'Seasoned minced beef drizzled with smoky BBQ sauce and crisp onions', 7000.00, TRUE, 7),
    ('22222222-2222-2222-2222-222222222208', '11111111-1111-1111-1111-111111111101', 'Margherita Pizza', 'Traditional tomato sauce, double mozzarella cheese, and fragrant basil herbs', 7000.00, TRUE, 8),
    ('22222222-2222-2222-2222-222222222209', '11111111-1111-1111-1111-111111111101', 'Chicken and Mushroom Pizza', 'Succulent roasted chicken with sliced button mushrooms in herb cheese', 7000.00, TRUE, 9),
    ('22222222-2222-2222-2222-222222222210', '11111111-1111-1111-1111-111111111101', 'BBQ Chicken Pizza', 'Tender shredded chicken glazed with tangy sweet BBQ sauce and herbs', 7000.00, TRUE, 10),
    ('22222222-2222-2222-2222-222222222211', '11111111-1111-1111-1111-111111111101', 'Sweet Chili Chicken Pizza', 'Sweet and spicy chili-glazed chicken baked with sweet peppers', 7000.00, TRUE, 11),
    ('22222222-2222-2222-2222-222222222212', '11111111-1111-1111-1111-111111111101', 'Meaty Pizza', 'Loaded with shredded beef, spicy chicken bits, and sausage toppings', 7000.00, TRUE, 12),
    ('22222222-2222-2222-2222-222222222213', '11111111-1111-1111-1111-111111111101', 'Steak Pizza', 'Marinated spicy steak strips with caramelized onions and peppers', 7000.00, TRUE, 13)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 3. PIZZA UNIVERSAL SIZES
-- =============================================================================

INSERT INTO public.product_sizes (id, category_slug, name, size_price, display_order)
VALUES
    ('33333333-3333-3333-3333-333333333301', 'pizza', 'Regular', 0.00, 1),
    ('33333333-3333-3333-3333-333333333302', 'pizza', 'Standard', 1500.00, 2),
    ('33333333-3333-3333-3333-333333333303', 'pizza', 'Large', 3000.00, 3),
    ('33333333-3333-3333-3333-333333333304', 'pizza', 'Queen', 5000.00, 4),
    ('33333333-3333-3333-3333-333333333305', 'pizza', 'King', 7000.00, 5)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 4. PIZZA TOPPINGS & CUSTOMIZATION GROUPS
-- =============================================================================

INSERT INTO public.customization_groups (id, name, min_selections, max_selections)
VALUES
    ('44444444-4444-4444-4444-444444444401', 'Extra Pizza Toppings', 0, 5),
    ('44444444-4444-4444-4444-444444444402', 'Half and Half Selection', 0, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customization_options (id, group_id, name, price, display_order)
VALUES
    ('55555555-5555-5555-5555-555555555501', '44444444-4444-4444-4444-444444444401', 'Extra Beef', 1000.00, 1),
    ('55555555-5555-5555-5555-555555555502', '44444444-4444-4444-4444-444444444401', 'Extra Cheese', 1000.00, 2),
    ('55555555-5555-5555-5555-555555555503', '44444444-4444-4444-4444-444444444401', 'Extra Chicken', 1000.00, 3),
    ('55555555-5555-5555-5555-555555555504', '44444444-4444-4444-4444-444444444401', 'Extra Pepperoni', 1000.00, 4),
    ('55555555-5555-5555-5555-555555555505', '44444444-4444-4444-4444-444444444402', 'Half & Half Pizza', 1000.00, 1)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 5. ICE CREAM & MILKSHAKES
-- =============================================================================

INSERT INTO public.products (id, category_id, name, description, base_price, is_available, display_order)
VALUES
    ('22222222-2222-2222-2222-222222222220', '11111111-1111-1111-1111-111111111102', 'Milkshake', 'Thick, creamy, and delicious milkshakes crafted with fresh ingredients', 4500.00, TRUE, 1),
    ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111102', 'Ice Cream Cup', 'Creamy, flavorful soft-serve ice creams in various cup sizes', 3500.00, TRUE, 2)
ON CONFLICT (id) DO NOTHING;

-- Milkshake Sizes
INSERT INTO public.product_sizes (id, product_id, name, size_price, display_order)
VALUES
    ('33333333-3333-3333-3333-333333333310', '22222222-2222-2222-2222-222222222220', 'Small Shake', 0.00, 1),
    ('33333333-3333-3333-3333-333333333311', '22222222-2222-2222-2222-222222222220', 'Big Shake', 1000.00, 2) -- Total ₦5,500
ON CONFLICT (id) DO NOTHING;

-- Ice Cream Sizes
INSERT INTO public.product_sizes (id, product_id, name, size_price, display_order)
VALUES
    ('33333333-3333-3333-3333-333333333320', '22222222-2222-2222-2222-222222222221', 'Small Cup', 0.00, 1),
    ('33333333-3333-3333-3333-333333333321', '22222222-2222-2222-2222-222222222221', 'Medium Cup', 1000.00, 2), -- Total ₦4,500
    ('33333333-3333-3333-3333-333333333322', '22222222-2222-2222-2222-222222222221', 'Big Cup', 2000.00, 3)    -- Total ₦5,500
ON CONFLICT (id) DO NOTHING;

-- Dessert Customization Groups
INSERT INTO public.customization_groups (id, name, min_selections, max_selections)
VALUES
    ('44444444-4444-4444-4444-444444444410', 'Milkshake Flavors', 1, 2),
    ('44444444-4444-4444-4444-444444444411', 'Ice Cream Flavors', 1, 2),
    ('44444444-4444-4444-4444-444444444412', 'Dessert Toppings', 0, 8)
ON CONFLICT (id) DO NOTHING;

-- Milkshake Flavors
INSERT INTO public.customization_options (id, group_id, name, price, display_order)
VALUES
    ('55555555-5555-5555-5555-555555555510', '44444444-4444-4444-4444-444444444410', 'Vanilla Blast', 0.00, 1),
    ('55555555-5555-5555-5555-555555555511', '44444444-4444-4444-4444-444444444410', 'Strawberry Lovers', 0.00, 2),
    ('55555555-5555-5555-5555-555555555512', '44444444-4444-4444-4444-444444444410', 'Milk and Cookies', 0.00, 3),
    ('55555555-5555-5555-5555-555555555513', '44444444-4444-4444-4444-444444444410', 'Oh Fudge', 0.00, 4)
ON CONFLICT (id) DO NOTHING;

-- Ice Cream Flavors
INSERT INTO public.customization_options (id, group_id, name, price, display_order)
VALUES
    ('55555555-5555-5555-5555-555555555520', '44444444-4444-4444-4444-444444444411', 'Vanilla', 0.00, 1),
    ('55555555-5555-5555-5555-555555555521', '44444444-4444-4444-4444-444444444411', 'Strawberry', 0.00, 2),
    ('55555555-5555-5555-5555-555555555522', '44444444-4444-4444-4444-444444444411', 'Chocolate', 0.00, 3),
    ('55555555-5555-5555-5555-555555555523', '44444444-4444-4444-4444-444444444411', 'Sweet Malt', 0.00, 4),
    ('55555555-5555-5555-5555-555555555524', '44444444-4444-4444-4444-444444444411', 'Bailey', 0.00, 5),
    ('55555555-5555-5555-5555-555555555525', '44444444-4444-4444-4444-444444444411', 'Sweet Cream', 0.00, 6)
ON CONFLICT (id) DO NOTHING;

-- Dessert Toppings (+₦1,000 each)
INSERT INTO public.customization_options (id, group_id, name, price, display_order)
VALUES
    ('55555555-5555-5555-5555-555555555530', '44444444-4444-4444-4444-444444444412', 'Oreo', 1000.00, 1),
    ('55555555-5555-5555-5555-555555555531', '44444444-4444-4444-4444-444444444412', 'M & M', 1000.00, 2),
    ('55555555-5555-5555-5555-555555555532', '44444444-4444-4444-4444-444444444412', 'Brown Coconut', 1000.00, 3),
    ('55555555-5555-5555-5555-555555555533', '44444444-4444-4444-4444-444444444412', 'Cashew Nut', 1000.00, 4),
    ('55555555-5555-5555-5555-555555555534', '44444444-4444-4444-4444-444444444412', 'Chocolate Syrup', 1000.00, 5),
    ('55555555-5555-5555-5555-555555555535', '44444444-4444-4444-4444-444444444412', 'Caramel Syrup', 1000.00, 6),
    ('55555555-5555-5555-5555-555555555536', '44444444-4444-4444-4444-444444444412', 'Waffle Cone', 1000.00, 7),
    ('55555555-5555-5555-5555-555555555537', '44444444-4444-4444-4444-444444444412', 'Waffle Bowl', 1000.00, 8)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 6. FAST FOOD & REFRESHMENTS
-- =============================================================================

INSERT INTO public.products (id, category_id, name, description, base_price, is_available, display_order)
VALUES
    ('22222222-2222-2222-2222-222222222230', '11111111-1111-1111-1111-111111111103', 'Burger', 'Juicy grilled beef patty with fresh lettuce, tomatoes, and house sauce', 3500.00, TRUE, 1),
    ('22222222-2222-2222-2222-222222222231', '11111111-1111-1111-1111-111111111103', 'Burger & Chips', 'Gourmet burger served with golden seasoned french fries', 5000.00, TRUE, 2),
    ('22222222-2222-2222-2222-222222222232', '11111111-1111-1111-1111-111111111103', 'Wings', 'Spicy glazed chicken wings baked until crispy and tender', 3500.00, TRUE, 3),
    ('22222222-2222-2222-2222-222222222233', '11111111-1111-1111-1111-111111111103', 'Wing & Chips', 'Spicy chicken wings served with hot crispy potato chips', 5000.00, TRUE, 4),
    ('22222222-2222-2222-2222-222222222234', '11111111-1111-1111-1111-111111111103', 'Chicken Lap', 'Well-seasoned fried or roasted chicken drumstick portion', 3500.00, TRUE, 5),
    ('22222222-2222-2222-2222-222222222235', '11111111-1111-1111-1111-111111111103', 'Chicken & Chips', 'Crispy spiced chicken quarter with golden french fries', 5000.00, TRUE, 6),
    ('22222222-2222-2222-2222-222222222240', '11111111-1111-1111-1111-111111111104', 'Bottle Water', 'Chilled purified natural spring water (75cl)', 300.00, TRUE, 1),
    ('22222222-2222-2222-2222-222222222241', '11111111-1111-1111-1111-111111111104', 'Soft Drinks', 'Chilled Coca-Cola, Fanta, Sprite, or Pepsi (50cl PET)', 600.00, TRUE, 2)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 7. DELIVERY ZONES & VERIFIED LANDMARKS
-- =============================================================================

INSERT INTO public.delivery_zones (id, name, base_fee, estimated_minutes_min, estimated_minutes_max)
VALUES
    ('66666666-6666-6666-6666-666666666601', 'UNILAG Campus', 500.00, 15, 25),
    ('66666666-6666-6666-6666-666666666602', 'Lagos Mainland — Inner Environs', 1000.00, 25, 40),
    ('66666666-6666-6666-6666-666666666603', 'Lagos Mainland — Mid Environs', 2000.00, 30, 50),
    ('66666666-6666-6666-6666-666666666604', 'Lagos Mainland — Outer Environs', 3500.00, 45, 65)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.delivery_landmarks (id, zone_id, name, fee, is_campus, display_order)
VALUES
    ('77777777-7777-7777-7777-777777777701', '66666666-6666-6666-6666-666666666601', 'Inside School (UNILAG Campus)', 500.00, TRUE, 1),
    ('77777777-7777-7777-7777-777777777702', '66666666-6666-6666-6666-666666666602', 'Abule Oja', 1000.00, FALSE, 2),
    ('77777777-7777-7777-7777-777777777703', '66666666-6666-6666-6666-666666666602', 'Akoka', 1000.00, FALSE, 3),
    ('77777777-7777-7777-7777-777777777704', '66666666-6666-6666-6666-666666666602', 'Onike', 1000.00, FALSE, 4),
    ('77777777-7777-7777-7777-777777777705', '66666666-6666-6666-6666-666666666602', 'Iwaya', 1000.00, FALSE, 5),
    ('77777777-7777-7777-7777-777777777706', '66666666-6666-6666-6666-666666666602', 'Abule Ijesha', 1200.00, FALSE, 6),
    ('77777777-7777-7777-7777-777777777707', '66666666-6666-6666-6666-666666666602', 'Bariga', 1500.00, FALSE, 7),
    ('77777777-7777-7777-7777-777777777708', '66666666-6666-6666-6666-666666666603', 'Makoko', 2000.00, FALSE, 8),
    ('77777777-7777-7777-7777-777777777709', '66666666-6666-6666-6666-666666666603', 'Alagomeji', 2000.00, FALSE, 9),
    ('77777777-7777-7777-7777-777777777710', '66666666-6666-6666-6666-666666666603', 'Bajuliaye', 2000.00, FALSE, 10),
    ('77777777-7777-7777-7777-777777777711', '66666666-6666-6666-6666-666666666603', 'Shomolu', 2000.00, FALSE, 11),
    ('77777777-7777-7777-7777-777777777712', '66666666-6666-6666-6666-666666666603', 'Yaba', 2000.00, FALSE, 12),
    ('77777777-7777-7777-7777-777777777713', '66666666-6666-6666-6666-666666666603', 'Palmgroove', 2500.00, FALSE, 13),
    ('77777777-7777-7777-7777-777777777714', '66666666-6666-6666-6666-666666666604', 'Luth (Idi-Araba)', 3000.00, FALSE, 14),
    ('77777777-7777-7777-7777-777777777715', '66666666-6666-6666-6666-666666666604', 'Onipanu', 3000.00, FALSE, 15),
    ('77777777-7777-7777-7777-777777777716', '66666666-6666-6666-6666-666666666604', 'Surulere', 3500.00, FALSE, 16),
    ('77777777-7777-7777-7777-777777777717', '66666666-6666-6666-6666-666666666604', 'Gbagada', 4000.00, FALSE, 17),
    ('77777777-7777-7777-7777-777777777718', '66666666-6666-6666-6666-666666666604', 'Ebute Meta', 4000.00, FALSE, 18),
    ('77777777-7777-7777-7777-777777777719', '66666666-6666-6666-6666-666666666604', 'Oworo', 4000.00, FALSE, 19)
ON CONFLICT (id) DO NOTHING;
