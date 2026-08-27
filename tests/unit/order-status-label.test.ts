import { describe, it, expect } from 'vitest';
import { orderStatusLabel } from '@/lib/cs/order-status-label';

describe('orderStatusLabel', () => {
  it('translates the statuses a store actually returns into Hebrew', () => {
    expect(orderStatusLabel('fulfilled', 'he')).toBe('נשלחה');
    expect(orderStatusLabel('unfulfilled', 'he')).toBe('בהכנה');
    expect(orderStatusLabel('partially_fulfilled', 'he')).toBe('נשלחה חלקית');
    expect(orderStatusLabel('delivered', 'he')).toBe('נמסרה');
    expect(orderStatusLabel('cancelled', 'he')).toBe('בוטלה');
    expect(orderStatusLabel('refunded', 'he')).toBe('זוכתה');
  });

  it('accepts the American spelling QuickShop and Shopify disagree on', () => {
    expect(orderStatusLabel('canceled', 'he')).toBe(orderStatusLabel('cancelled', 'he'));
  });

  it('is case- and whitespace-insensitive, because platforms are not consistent', () => {
    expect(orderStatusLabel('  FULFILLED ', 'he')).toBe('נשלחה');
    expect(orderStatusLabel('Partially_Fulfilled', 'he')).toBe('נשלחה חלקית');
  });

  it('reads as a sentence in English rather than as a database value', () => {
    expect(orderStatusLabel('fulfilled', 'en')).toBe('Fulfilled');
    expect(orderStatusLabel('partially_fulfilled', 'en')).toBe('Partially fulfilled');
  });

  // The card must never lose information. An unmapped status is still better
  // shown raw than dropped — the shopper can quote it to a human.
  it('passes an unknown status straight through instead of blanking the card', () => {
    expect(orderStatusLabel('awaiting_pickup_at_locker', 'he')).toBe('awaiting_pickup_at_locker');
    expect(orderStatusLabel('awaiting_pickup_at_locker', 'en')).toBe('awaiting_pickup_at_locker');
  });

  it('returns empty for nothing, so the caller can hide the chip', () => {
    expect(orderStatusLabel(undefined, 'he')).toBe('');
    expect(orderStatusLabel('', 'he')).toBe('');
    expect(orderStatusLabel('   ', 'he')).toBe('');
  });
});
