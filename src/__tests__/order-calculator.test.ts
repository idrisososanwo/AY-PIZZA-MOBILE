import {
  calculateOrderItem,
  calculateOrderTotal,
  calculateHalfAndHalfSurcharge,
} from '../domains/order/order-calculator';
import { OrderItemInput } from '../types/order';

describe('Order Calculator Domain Service', () => {
  describe('Half & Half Surcharge Rule', () => {
    it('applies ₦1,000 surcharge for Regular and Standard sizes', () => {
      expect(calculateHalfAndHalfSurcharge('Regular')).toBe(1000);
      expect(calculateHalfAndHalfSurcharge('Standard')).toBe(1000);
      expect(calculateHalfAndHalfSurcharge('regular')).toBe(1000);
    });

    it('applies ₦1,500 surcharge for Large, Queen, and King sizes', () => {
      expect(calculateHalfAndHalfSurcharge('Large')).toBe(1500);
      expect(calculateHalfAndHalfSurcharge('Queen')).toBe(1500);
      expect(calculateHalfAndHalfSurcharge('King')).toBe(1500);
      expect(calculateHalfAndHalfSurcharge('king')).toBe(1500);
    });

    it('defaults to ₦1,000 if size is null or unspecified', () => {
      expect(calculateHalfAndHalfSurcharge(null)).toBe(1000);
      expect(calculateHalfAndHalfSurcharge(undefined)).toBe(1000);
    });
  });

  describe('Single Item Price Calculation', () => {
    it('calculates standard regular pizza with no extras', () => {
      const item: OrderItemInput = {
        productId: 'prod-1',
        productName: 'Sweet and Sour Pizza',
        sizeName: 'Regular',
        sizePrice: 0,
        basePrice: 7000,
        quantity: 1,
        customizations: [],
      };

      const result = calculateOrderItem(item);
      expect(result.unitItemTotal).toBe(7000);
      expect(result.lineTotal).toBe(7000);
    });

    it('calculates King size pizza with extra cheese and extra pepperoni', () => {
      const item: OrderItemInput = {
        productId: 'prod-1',
        productName: 'BBQ Beef Pizza',
        sizeName: 'King',
        sizePrice: 7000, // King adder
        basePrice: 7000,
        quantity: 2,
        customizations: [
          { optionId: 'opt-1', optionName: 'Extra Cheese', price: 1000 },
          { optionId: 'opt-2', optionName: 'Extra Pepperoni', price: 1000 },
        ],
      };

      const result = calculateOrderItem(item);
      // Unit total = 7000 (base) + 7000 (king) + 1000 (cheese) + 1000 (pepperoni) = 16000
      expect(result.unitItemTotal).toBe(16000);
      expect(result.lineTotal).toBe(32000); // 16000 * 2
    });

    it('applies dynamic Half & Half price adjustment for King size (+₦1,500)', () => {
      const item: OrderItemInput = {
        productId: 'prod-1',
        productName: 'Margherita Pizza',
        sizeName: 'King',
        sizePrice: 7000,
        basePrice: 7000,
        quantity: 1,
        customizations: [
          { optionId: 'opt-half', optionName: 'Half & Half Pizza', price: 1000 }, // Raw price in option is 1000
        ],
        halfSecondaryFlavor: 'BBQ Chicken Pizza',
      };

      const result = calculateOrderItem(item);
      // Base 7000 + King 7000 + Half&Half adjusted for King 1500 = 15500
      expect(result.customizationsTotal).toBe(1500);
      expect(result.unitItemTotal).toBe(15500);
    });

    it('enforces maximum of 2 flavors for ice cream or milkshake', () => {
      const validItem: OrderItemInput = {
        productId: 'ice-1',
        productName: 'Milkshake',
        basePrice: 4500,
        quantity: 1,
        customizations: [],
        flavors: ['Vanilla Blast', 'Oh Fudge'],
      };
      expect(() => calculateOrderItem(validItem)).not.toThrow();

      const invalidItem: OrderItemInput = {
        productId: 'ice-1',
        productName: 'Milkshake',
        basePrice: 4500,
        quantity: 1,
        customizations: [],
        flavors: ['Vanilla Blast', 'Oh Fudge', 'Strawberry Lovers'],
      };
      expect(() => calculateOrderItem(invalidItem)).toThrow(/Cannot select more than 2 flavors/);
    });

    it('rejects invalid quantity or negative base prices', () => {
      expect(() =>
        calculateOrderItem({
          productId: 'prod-1',
          productName: 'Water',
          basePrice: 300,
          quantity: 0,
          customizations: [],
        })
      ).toThrow(/Invalid item quantity/);

      expect(() =>
        calculateOrderItem({
          productId: 'prod-1',
          productName: 'Water',
          basePrice: -300,
          quantity: 1,
          customizations: [],
        })
      ).toThrow(/Invalid base price/);
    });
  });

  describe('Full Order Total & Paystack Kobo Calculation', () => {
    it('calculates campus delivery order total and converts to Kobo accurately', () => {
      const items: OrderItemInput[] = [
        {
          productId: 'p-1',
          productName: 'Sweet Chili Chicken Pizza',
          sizeName: 'Standard',
          sizePrice: 1500,
          basePrice: 7000,
          quantity: 1,
          customizations: [{ optionId: 'c-1', optionName: 'Extra Chicken', price: 1000 }],
        },
        {
          productId: 'd-1',
          productName: 'Soft Drinks',
          basePrice: 600,
          quantity: 2,
          customizations: [],
        },
      ];

      const order = calculateOrderTotal({
        items,
        fulfillmentType: 'delivery',
        deliveryFee: 500, // Inside School
      });

      // Item 1: 7000 + 1500 + 1000 = 9500
      // Item 2: 600 * 2 = 1200
      // Subtotal: 10700
      // Delivery: 500
      // Grand Total: 11200
      expect(order.subtotal).toBe(10700);
      expect(order.deliveryFee).toBe(500);
      expect(order.total).toBe(11200);
      expect(order.totalInKobo).toBe(1120000); // 11200 * 100
    });

    it('strictly forces delivery fee to ₦0 for pickup orders regardless of input', () => {
      const items: OrderItemInput[] = [
        {
          productId: 'p-1',
          productName: 'Burger',
          basePrice: 3500,
          quantity: 1,
          customizations: [],
        },
      ];

      const order = calculateOrderTotal({
        items,
        fulfillmentType: 'pickup',
        deliveryFee: 1500, // Should be ignored
      });

      expect(order.deliveryFee).toBe(0);
      expect(order.total).toBe(3500);
    });

    it('rejects empty order item list', () => {
      expect(() =>
        calculateOrderTotal({
          items: [],
          fulfillmentType: 'pickup',
        })
      ).toThrow(/Order must contain at least one item/);
    });
  });
});
