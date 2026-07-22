import { describe, it, expect } from 'vitest';
import { phoneMatches } from '@/lib/orders/phone-verify';

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
