import { describe, it, expect } from 'vitest';
import { buildTouchIndex, attributeOrder, attributeCart, isAttributableOrder } from '@/lib/analytics/value-proof/attribute';
import type { TouchRecord, AttributableOrder } from '@/lib/analytics/value-proof/types';

const T0 = Date.parse('2026-07-01T10:00:00Z');
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const touch = (over: Partial<TouchRecord> = {}): TouchRecord => ({
  touchAt: T0, surface: 'chat', anonId: null, phone: null, email: null, ...over,
});
const order = (over: Partial<AttributableOrder> = {}): AttributableOrder => ({
  id: 'o1', occurredAt: T0 + HOUR, amount: 200, utmSource: null, anonId: null, phone: null, email: null, ...over,
});

describe('attribution tiers', () => {
  it('direct wins over assisted and influenced, and needs no touch record', () => {
    const idx = buildTouchIndex([touch({ anonId: 'a1', phone: '972501234567' })]);
    const a = attributeOrder(order({ utmSource: 'bestie', anonId: 'a1', phone: '972501234567' }), idx);
    expect(a.tier).toBe('direct');
    expect(a.matchKey).toBe('utm');

    const bare = attributeOrder(order({ utmSource: 'bestie' }), buildTouchIndex([]));
    expect(bare.tier).toBe('direct');
  });

  it('assisted wins over influenced when both match', () => {
    const idx = buildTouchIndex([touch({ anonId: 'a1' }), touch({ phone: '972501234567' })]);
    const a = attributeOrder(order({ anonId: 'a1', phone: '972501234567' }), idx);
    expect(a.tier).toBe('assisted');
    expect(a.matchKey).toBe('anon_id');
  });

  it('assisted honours the 24h boundary', () => {
    const idx = buildTouchIndex([touch({ anonId: 'a1' })]);
    expect(attributeOrder(order({ anonId: 'a1', occurredAt: T0 + DAY - 60_000 }), idx).tier).toBe('assisted');
    expect(attributeOrder(order({ anonId: 'a1', occurredAt: T0 + DAY + 60_000 }), idx).tier).toBe('none');
  });

  it('influenced honours the 7-day boundary', () => {
    const idx = buildTouchIndex([touch({ email: 'dana@example.com' })]);
    expect(attributeOrder(order({ email: 'dana@example.com', occurredAt: T0 + 7 * DAY - HOUR }), idx).tier).toBe('influenced');
    expect(attributeOrder(order({ email: 'dana@example.com', occurredAt: T0 + 7 * DAY + HOUR }), idx).tier).toBe('none');
  });

  it('a touch AFTER the order never attributes it', () => {
    const idx = buildTouchIndex([touch({ touchAt: T0 + 2 * HOUR, anonId: 'a1', phone: '972501234567' })]);
    const a = attributeOrder(order({ occurredAt: T0 + HOUR, anonId: 'a1', phone: '972501234567' }), idx);
    expect(a.tier).toBe('none');
    expect(a.touchAt).toBeNull();
  });

  it('picks the LATEST qualifying touch and reports the lag', () => {
    const idx = buildTouchIndex([touch({ anonId: 'a1' }), touch({ touchAt: T0 + 30 * 60_000, anonId: 'a1' })]);
    const a = attributeOrder(order({ anonId: 'a1', occurredAt: T0 + HOUR }), idx);
    expect(a.touchAt).toBe(T0 + 30 * 60_000);
    expect(a.lagSec).toBe(1800);
  });

  it('excludes zero-value and POS orders from attribution entirely', () => {
    expect(isAttributableOrder({ amount: 0, utmSource: 'bestie' })).toBe(false);
    expect(isAttributableOrder({ amount: 120, utmSource: 'pos' })).toBe(false);
    expect(isAttributableOrder({ amount: 120, utmSource: 'bestie' })).toBe(true);
    expect(isAttributableOrder({ amount: 120, utmSource: null })).toBe(true);
  });

  it('a cart is attributed only when the touch lands BETWEEN abandonment and recovery', () => {
    const cart = { id: 'c1', occurredAt: T0, amount: 300, email: 'dana@example.com' };
    const recoveredAt = T0 + 2 * DAY;

    // touch after the abandonment and before the purchase — this is recovery
    const during = buildTouchIndex([touch({ touchAt: T0 + DAY, email: 'dana@example.com' })]);
    const a = attributeCart(cart, during, recoveredAt);
    expect(a.tier).toBe('influenced');
    expect(a.touchAt).toBe(T0 + DAY);

    // touch BEFORE the abandonment — talking to someone who then abandoned is
    // not recovering them
    const before = buildTouchIndex([touch({ touchAt: T0 - DAY, email: 'dana@example.com' })]);
    expect(attributeCart(cart, before, recoveredAt).tier).toBe('none');

    // touch AFTER the purchase — cannot have caused it
    const after = buildTouchIndex([touch({ touchAt: recoveredAt + DAY, email: 'dana@example.com' })]);
    expect(attributeCart(cart, after, recoveredAt).tier).toBe('none');
  });

  it('an unrecovered cart is never attributed, whoever touched it', () => {
    const idx = buildTouchIndex([touch({ touchAt: T0 + DAY, email: 'dana@example.com' })]);
    expect(attributeCart({ id: 'c1', occurredAt: T0, amount: 300, email: 'dana@example.com' }, idx, null).tier).toBe('none');
  });

  it('a cart with a different email is not attributed', () => {
    const idx = buildTouchIndex([touch({ touchAt: T0 + DAY, email: 'dana@example.com' })]);
    expect(attributeCart({ id: 'c2', occurredAt: T0, amount: 300, email: 'other@example.com' }, idx, T0 + 2 * DAY).tier).toBe('none');
  });
});
