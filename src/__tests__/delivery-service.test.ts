import {
  resolveDeliveryFee,
  isCampusLandmark,
  PROVISIONAL_LANDMARKS,
  VERIFIED_LANDMARKS,
} from '../domains/delivery/delivery-service';

describe('Delivery & Landmark Pricing Service', () => {
  it('contains exactly 19 provisional landmarks from web portal audit', () => {
    expect(PROVISIONAL_LANDMARKS.length).toBe(19);
    expect(VERIFIED_LANDMARKS).toBe(PROVISIONAL_LANDMARKS);
  });

  it('charges ₦0 for pickup fulfillment', () => {
    expect(resolveDeliveryFee('pickup')).toBe(0);
    expect(resolveDeliveryFee('pickup', 'Inside School (UNILAG Campus)')).toBe(0);
  });

  it('charges exactly ₦500 for UNILAG campus delivery', () => {
    expect(resolveDeliveryFee('delivery', 'Inside School (UNILAG Campus)')).toBe(500);
    expect(resolveDeliveryFee('delivery', 'lm-1')).toBe(500);
  });

  it('correctly maps mainland landmark fees', () => {
    expect(resolveDeliveryFee('delivery', 'Akoka')).toBe(1000);
    expect(resolveDeliveryFee('delivery', 'Abule Oja')).toBe(1000);
    expect(resolveDeliveryFee('delivery', 'Abule Ijesha')).toBe(1200);
    expect(resolveDeliveryFee('delivery', 'Bariga')).toBe(1500);
    expect(resolveDeliveryFee('delivery', 'Yaba')).toBe(2000);
    expect(resolveDeliveryFee('delivery', 'Palmgroove')).toBe(2500);
    expect(resolveDeliveryFee('delivery', 'Luth (Idi-Araba)')).toBe(3000);
    expect(resolveDeliveryFee('delivery', 'Surulere')).toBe(3500);
    expect(resolveDeliveryFee('delivery', 'Gbagada')).toBe(4000);
  });

  it('throws an error for unrecognized landmarks', () => {
    expect(() => resolveDeliveryFee('delivery', 'Lekki Phase 1')).toThrow(
      /Unrecognized delivery landmark/
    );
  });

  it('throws an error when landmark is missing for delivery orders', () => {
    expect(() => resolveDeliveryFee('delivery', '')).toThrow(
      /A delivery landmark must be selected/
    );
  });

  it('correctly flags UNILAG campus vs off-campus landmarks', () => {
    expect(isCampusLandmark('Inside School (UNILAG Campus)')).toBe(true);
    expect(isCampusLandmark('lm-1')).toBe(true);
    expect(isCampusLandmark('Akoka')).toBe(false);
    expect(isCampusLandmark('Surulere')).toBe(false);
  });
});
