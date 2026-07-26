import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeEmail } from '@/lib/analytics/value-proof/identity';

describe('value-proof identity normalization', () => {
  it('normalizes every Israeli phone spelling to one wa_id', () => {
    const want = '972501234567';
    for (const input of ['0501234567', '050-123-4567', '+972501234567', '972501234567', '00972501234567', '501234567']) {
      expect(normalizePhone(input)).toBe(want);
    }
  });

  it('returns null for empty or digitless input', () => {
    for (const input of [null, undefined, '', '   ', '---']) {
      expect(normalizePhone(input)).toBeNull();
    }
  });

  it('lowercases and trims emails, and rejects non-emails', () => {
    expect(normalizeEmail('  Dana@Example.COM ')).toBe('dana@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});
