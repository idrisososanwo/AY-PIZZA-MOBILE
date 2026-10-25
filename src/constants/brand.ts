/**
 * AY Pizza Restaurant Metadata and Operational Constants
 */
export const Brand = {
  name: 'AY Pizza & Ice Cream Corner',
  shortName: 'AY Pizza',
  tagline: 'Hand-tossed pizzas made fresh daily, creamy ice cream & refreshing drinks',
  location: {
    address: 'Opposite King Jaja Hall, University of Lagos',
    city: 'Akoka, Yaba, Lagos',
    country: 'Nigeria',
    coordinates: {
      latitude: 6.5173,
      longitude: 3.3986,
    },
  },
  contact: {
    phone: '0813 073 1895',
    internationalPhone: '+2348130731895',
    whatsappUrl: 'https://wa.me/2348130731895',
    email: 'info@aypizza.ng',
    website: 'https://aypizza.ng',
    socials: {
      instagram: 'https://www.instagram.com/aypizza1',
      tiktok: 'https://tiktok.com/@aypizza1',
      twitter: 'https://x.com/ay_pizza1',
    },
  },
  operatingHours: {
    openHour: 10,   // 10:00 AM WAT
    closeHour: 21,  // 09:00 PM WAT
    timezone: 'Africa/Lagos',
  },
  currency: {
    code: 'NGN',
    symbol: '₦',
    name: 'Nigerian Naira',
  },
  fulfillment: {
    campusDeliveryFee: 500, // ₦500 flat for UNILAG campus hostels and faculties
    pickupFee: 0,           // Free pickup at King Jaja
  },
  dietaryPolicy: {
    isConfirmedByOwner: false,      // Pending explicit confirmation from restaurant owner
    enforceRestrictions: false,    // Disabled until owner confirms policy
    provisionalRestrictions: ['pork', 'bacon', 'ham', 'lard', 'alcohol'],
    note: 'Provisional dietary rules. Not enforced until confirmed by restaurant owner.',
  },
} as const;
