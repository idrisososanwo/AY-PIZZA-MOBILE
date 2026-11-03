"""
AY Pizza & Ice Cream — Phase 5.3 Complete 23-Catalog Image Processor & Optimizer
Converts all raw photography assets into production-grade, optimized WebP & JPEG assets.
"""

import os
import glob
from PIL import Image

PROJECT_ROOT = r"c:\Users\Ososanwo Idris\Documents\AY PIZZA MOBILE"
BRAIN_DIR = r"C:\Users\Ososanwo Idris\.gemini\antigravity\brain\723193bd-dfb5-4f4b-8a28-2c866edd4ad2"
TARGET_BASE = os.path.join(PROJECT_ROOT, "assets", "products")

# Catalog item definitions with explicit source path resolution
CATALOG_SOURCES = [
    # --- 13 PIZZAS ---
    {
        "id": "22222222-2222-2222-2222-222222222201",
        "slug": "sweet-and-sour-pizza",
        "name": "Sweet and Sour Pizza",
        "category": "pizzas",
        "filename": "sweet_and_sour_pizza",
        "source": ("brain_prefix", "pizza_sweet_and_sour"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222202",
        "slug": "club-pizza",
        "name": "Club Pizza",
        "category": "pizzas",
        "filename": "club_pizza",
        "source": ("brain_prefix", "pizza_club"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222203",
        "slug": "cheese-pepperoni-pizza",
        "name": "Cheese Pepperoni Pizza",
        "category": "pizzas",
        "filename": "cheese_pepperoni_pizza",
        "source": ("brain_prefix", "pizza_cheese_pepperoni"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222204",
        "slug": "hawaii-pizza",
        "name": "Hawaii Pizza",
        "category": "pizzas",
        "filename": "hawaii_pizza",
        "source": ("brain_prefix", "pizza_hawaii"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222205",
        "slug": "veggie-deluxe-pizza",
        "name": "Veggie Deluxe Pizza",
        "category": "pizzas",
        "filename": "veggie_deluxe_pizza",
        "source": ("brain_prefix", "pizza_veggie_deluxe"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222206",
        "slug": "chicken-tikka-pizza",
        "name": "Chicken Tikka Pizza",
        "category": "pizzas",
        "filename": "chicken_tikka_pizza",
        "source": ("brain_prefix", "pizza_chicken_tikka"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222207",
        "slug": "bbq-beef-pizza",
        "name": "BBQ Beef Pizza",
        "category": "pizzas",
        "filename": "bbq_beef_pizza",
        "source": ("brain_prefix", "pizza_bbq_beef"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222208",
        "slug": "margherita-pizza",
        "name": "Margherita Pizza",
        "category": "pizzas",
        "filename": "margherita_pizza",
        "source": ("brain_prefix", "pizza_margherita"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222209",
        "slug": "chicken-and-mushroom-pizza",
        "name": "Chicken and Mushroom Pizza",
        "category": "pizzas",
        "filename": "chicken_and_mushroom_pizza",
        "source": ("brain_prefix", "pizza_chicken_mushroom"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222210",
        "slug": "bbq-chicken-pizza",
        "name": "BBQ Chicken Pizza",
        "category": "pizzas",
        "filename": "bbq_chicken_pizza",
        "source": ("brain_prefix", "pizza_bbq_chicken"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222211",
        "slug": "sweet-chili-chicken-pizza",
        "name": "Sweet Chili Chicken Pizza",
        "category": "pizzas",
        "filename": "sweet_chili_chicken_pizza",
        "source": ("brain_prefix", "pizza_sweet_chili_chicken"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222212",
        "slug": "meaty-pizza",
        "name": "Meaty Pizza",
        "category": "pizzas",
        "filename": "meaty_pizza",
        "source": ("brain_prefix", "pizza_meaty"),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222213",
        "slug": "steak-pizza",
        "name": "Steak Pizza",
        "category": "pizzas",
        "filename": "steak_pizza",
        "source": ("brain_prefix", "pizza_steak"),
        "status": "completed",
    },

    # --- 2 ICE CREAM & SHAKES ---
    {
        "id": "22222222-2222-2222-2222-222222222220",
        "slug": "milkshake",
        "name": "Milkshake",
        "category": "ice-cream",
        "filename": "milkshake",
        "source": ("direct", os.path.join(PROJECT_ROOT, "assets", "images", "milkshake.jpg")),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222221",
        "slug": "ice-cream-cup",
        "name": "Ice Cream Cup",
        "category": "ice-cream",
        "filename": "ice_cream_cup",
        "source": ("direct", os.path.join(BRAIN_DIR, "vanilla_chocolate_swirl_standalone_1793569533270.jpg")),
        "status": "completed",
    },

    # --- 6 FAST FOOD & SIDES ---
    {
        "id": "22222222-2222-2222-2222-222222222230",
        "slug": "burger",
        "name": "Burger",
        "category": "sides",
        "filename": "burger",
        "source": ("direct", os.path.join(PROJECT_ROOT, "test_burger.jpg")),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222231",
        "slug": "burger-and-chips",
        "name": "Burger & Chips",
        "category": "sides",
        "filename": "burger_and_chips",
        "source": ("direct", os.path.join(PROJECT_ROOT, "candidate_burger_fries.jpg")),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222232",
        "slug": "wings",
        "name": "Wings",
        "category": "sides",
        "filename": "wings",
        "source": ("direct", os.path.join(PROJECT_ROOT, "candidate_wings.jpg")),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222233",
        "slug": "wing-and-chips",
        "name": "Wing & Chips",
        "category": "sides",
        "filename": "wing_and_chips",
        "source": ("direct", os.path.join(PROJECT_ROOT, "candidate_wings.jpg")),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222234",
        "slug": "chicken-lap",
        "name": "Chicken Lap",
        "category": "sides",
        "filename": "chicken_lap",
        "source": ("direct", os.path.join(PROJECT_ROOT, "assets", "images", "crispy_chicken.jpg")),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222235",
        "slug": "chicken-and-chips",
        "name": "Chicken & Chips",
        "category": "sides",
        "filename": "chicken_and_chips",
        "source": ("direct", os.path.join(PROJECT_ROOT, "assets", "images", "crispy_chicken.jpg")),
        "status": "completed",
    },

    # --- 2 COLD BEVERAGES ---
    {
        "id": "22222222-2222-2222-2222-222222222240",
        "slug": "bottle-water",
        "name": "Bottle Water",
        "category": "drinks",
        "filename": "bottle_water",
        "source": ("direct", os.path.join(PROJECT_ROOT, "candidate_water1.jpg")),
        "status": "completed",
    },
    {
        "id": "22222222-2222-2222-2222-222222222241",
        "slug": "soft-drinks",
        "name": "Soft Drinks",
        "category": "drinks",
        "filename": "soft_drinks",
        "source": ("direct", os.path.join(PROJECT_ROOT, "candidate_soda.jpg")),
        "status": "completed",
    },
]

def resolve_source_path(source_def):
    stype, sval = source_def
    if stype == "direct":
        return sval if os.path.exists(sval) else None
    elif stype == "brain_prefix":
        pattern = os.path.join(BRAIN_DIR, f"{sval}_*.jpg")
        matches = glob.glob(pattern)
        if not matches:
            return None
        matches.sort(key=os.path.getmtime, reverse=True)
        return matches[0]
    return None

def process_product_asset(src_path, dest_dir, filename):
    os.makedirs(dest_dir, exist_ok=True)
    img = Image.open(src_path).convert("RGB")
    
    # Center-weighted 1:1 square crop
    w, h = img.size
    min_dim = min(w, h)
    left = (w - min_dim) // 2
    top = (h - min_dim) // 2
    right = left + min_dim
    bottom = top + min_dim
    cropped = img.crop((left, top, right, bottom))
    
    # Resize to 800x800 master
    resized = cropped.resize((800, 800), Image.Resampling.LANCZOS)
    
    # Save WebP (Primary)
    webp_path = os.path.join(dest_dir, f"{filename}.webp")
    resized.save(webp_path, "WEBP", quality=85, method=6)
    webp_bytes = os.path.getsize(webp_path)
    
    # Save JPG (Bundle fallback)
    jpg_path = os.path.join(dest_dir, f"{filename}.jpg")
    resized.save(jpg_path, "JPEG", quality=85, optimize=True)
    jpg_bytes = os.path.getsize(jpg_path)
    
    return webp_path, webp_bytes, jpg_path, jpg_bytes

def main():
    print("=== Processing All 23 AY Pizza & Ice Cream Catalog Images ===")
    audit_records = []
    
    total_webp_bytes = 0
    total_jpg_bytes = 0
    
    for item in CATALOG_SOURCES:
        src = resolve_source_path(item["source"])
        if not src:
            print(f"FAILED TO RESOLVE: {item['name']} ({item['source']})")
            continue
        
        target_dir = os.path.join(TARGET_BASE, item["category"])
        webp_p, webp_b, jpg_p, jpg_b = process_product_asset(src, target_dir, item["filename"])
        
        total_webp_bytes += webp_b
        total_jpg_bytes += jpg_b
        
        audit_records.append({
            "id": item["id"],
            "name": item["name"],
            "category": item["category"],
            "filename": f"{item['filename']}.webp",
            "webp_kb": round(webp_b / 1024, 1),
            "jpg_kb": round(jpg_b / 1024, 1),
        })
        print(f"[{item['category'].upper()}] {item['name']} -> {item['filename']}.webp ({round(webp_b/1024, 1)} KB)")

    print(f"\n==================================================")
    print(f"Total Products Processed: {len(audit_records)} / {len(CATALOG_SOURCES)}")
    print(f"Total WebP Footprint:     {round(total_webp_bytes / 1024, 1)} KB ({round(total_webp_bytes / (1024*1024), 2)} MB)")
    print(f"Total JPG Footprint:      {round(total_jpg_bytes / 1024, 1)} KB ({round(total_jpg_bytes / (1024*1024), 2)} MB)")
    print(f"Average WebP Size:        {round(total_webp_bytes / len(audit_records) / 1024, 1)} KB / image")
    print(f"==================================================")

if __name__ == "__main__":
    main()
