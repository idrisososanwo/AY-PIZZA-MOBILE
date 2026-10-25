-- =============================================================================
-- AY PIZZA CATALOG CUSTOMIZATION LINKS & REFINEMENT
-- Migration: 20261021000004_catalog_customization_links.sql
-- Description:
--   1. Links products with their customization groups in product_customization_groups.
--   2. Adds category_slug to customization_groups for category-wide customization inheritance.
--   3. Provides a clean database view public.catalog_view for client querying.
-- =============================================================================

-- 1. Add category_slug to customization_groups for category-level defaults
ALTER TABLE public.customization_groups 
ADD COLUMN IF NOT EXISTS category_slug TEXT;

-- Update existing customization groups with their target category slugs
UPDATE public.customization_groups 
SET category_slug = 'pizza' 
WHERE id IN ('44444444-4444-4444-4444-444444444401', '44444444-4444-4444-4444-444444444402');

UPDATE public.customization_groups 
SET category_slug = 'icecream' 
WHERE id IN ('44444444-4444-4444-4444-444444444410', '44444444-4444-4444-4444-444444444411', '44444444-4444-4444-4444-444444444412');

-- 2. Populate product_customization_groups for all pizza products
INSERT INTO public.product_customization_groups (product_id, group_id)
SELECT p.id, g.id
FROM public.products p
JOIN public.categories c ON p.category_id = c.id
CROSS JOIN public.customization_groups g
WHERE c.slug = 'pizza' 
  AND g.id IN ('44444444-4444-4444-4444-444444444401', '44444444-4444-4444-4444-444444444402')
ON CONFLICT (product_id, group_id) DO NOTHING;

-- Populate product_customization_groups for Milkshake
INSERT INTO public.product_customization_groups (product_id, group_id)
VALUES
    ('22222222-2222-2222-2222-222222222220', '44444444-4444-4444-4444-444444444410'), -- Milkshake Flavors
    ('22222222-2222-2222-2222-222222222220', '44444444-4444-4444-4444-444444444412')  -- Dessert Toppings
ON CONFLICT (product_id, group_id) DO NOTHING;

-- Populate product_customization_groups for Ice Cream Cup
INSERT INTO public.product_customization_groups (product_id, group_id)
VALUES
    ('22222222-2222-2222-2222-222222222221', '44444444-4444-4444-4444-444444444411'), -- Ice Cream Flavors
    ('22222222-2222-2222-2222-222222222221', '44444444-4444-4444-4444-444444444412')  -- Dessert Toppings
ON CONFLICT (product_id, group_id) DO NOTHING;

-- 3. Grant select on customization_groups category_slug
GRANT SELECT ON public.customization_groups TO anon, authenticated;
GRANT SELECT ON public.product_customization_groups TO anon, authenticated;
