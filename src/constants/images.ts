/**
 * AY Pizza — Static Bundled Food Asset Registry
 * Provides offline-safe, high-resolution bundled photography
 * for hero banners, product cards, and modal previews.
 */

export const FoodImages = {
  heroBanner: require('../../assets/images/hero_banner.jpg'),
  pepperoni: require('../../assets/images/pepperoni.jpg'),
  bbqChicken: require('../../assets/images/bbq_chicken.jpg'),
  milkshake: require('../../assets/images/milkshake.jpg'),
  crispyChicken: require('../../assets/images/crispy_chicken.jpg'),
};

/**
 * Returns the best matching photography asset based on product name or slug.
 */
export function getProductImage(productSlugOrName: string): any {
  const query = (productSlugOrName || '').toLowerCase();

  if (query.includes('pepperoni') || query.includes('pep')) {
    return FoodImages.pepperoni;
  }
  if (query.includes('bbq') || query.includes('chicken') || query.includes('suya') || query.includes('beef') || query.includes('meat') || query.includes('pizza')) {
    return FoodImages.bbqChicken;
  }
  if (query.includes('shake') || query.includes('cream') || query.includes('ice') || query.includes('dessert')) {
    return FoodImages.milkshake;
  }
  if (query.includes('wing') || query.includes('fast') || query.includes('side') || query.includes('fry') || query.includes('chips') || query.includes('burger')) {
    return FoodImages.crispyChicken;
  }

  // Fallback to hero pizza
  return FoodImages.pepperoni;
}
