import { describe, it, expect } from 'vitest';
import { phoneMatches, verifyOrderAccess } from '@/lib/orders/phone-verify';
import { whatsappIdentity, type CsIdentity } from '@/lib/cs/identity';

describe('phoneMatches (best-effort, reveal-when-absent)', () => {
  it('reveals when the order has no phone', () => {
    expect(phoneMatches(null, '972501234567')).toBe(true);
    expect(phoneMatches(undefined, '972501234567')).toBe(true);
    expect(phoneMatches('', '972501234567')).toBe(true);
  });

  it('matches a local 0-prefixed order phone against an E.164 sender', () => {
    expect(phoneMatches('0501234567', '972501234567')).toBe(true);
  });

  it('matches with +972 and spaces/dashes in the order phone', () => {
    expect(phoneMatches('+972-50-123-4567', '972501234567')).toBe(true);
  });

  it('rejects a genuinely different number', () => {
    expect(phoneMatches('0509999999', '972501234567')).toBe(false);
  });
});

const claimed = (phone?: string): CsIdentity =>
  phone
    ? { channel: 'widget', visitorId: 'v-1', phone, trust: 'phone_claimed' }
    : { channel: 'widget', visitorId: 'v-1', trust: 'unverified' };

describe('verifyOrderAccess (trust matrix, spec §2)', () => {
  const wa = whatsappIdentity('972501234567');

  it('channel_verified: reveal-when-absent + match/mismatch', () => {
    expect(verifyOrderAccess(null, wa)).toBe('ok');
    expect(verifyOrderAccess('', wa)).toBe('ok');
    expect(verifyOrderAccess('0501234567', wa)).toBe('ok');
    expect(verifyOrderAccess('0509999999', wa)).toBe('mismatch');
  });

  it('phone_claimed: matching claim ok, mismatch rejected', () => {
    expect(verifyOrderAccess('0501234567', claimed('+972-50-123-4567'))).toBe('ok');
    expect(verifyOrderAccess('0509999999', claimed('0501234567'))).toBe('mismatch');
  });

  it('GUEST-CHECKOUT LEAK GUARD: a no-phone order is NEVER revealed to a claimed identity — it escalates', () => {
    // This is the leak the whole design exists to prevent (spec §2): a widget visitor who
    // guesses an order number must not see a guest-checkout order.
    expect(verifyOrderAccess(null, claimed('0501234567'))).toBe('escalate');
    expect(verifyOrderAccess('', claimed('0501234567'))).toBe('escalate');
  });

  it('unverified: both cases refuse with identity_required', () => {
    expect(verifyOrderAccess('0501234567', claimed(undefined))).toBe('identity_required');
    expect(verifyOrderAccess(null, claimed(undefined))).toBe('identity_required');
  });
});
