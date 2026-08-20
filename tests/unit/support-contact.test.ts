import { describe, it, expect } from 'vitest';
import { realPhoneOrNull, isRealPhone } from '@/lib/support/contact';

describe('realPhoneOrNull', () => {
  it('keeps dialable numbers verbatim', () => {
    expect(realPhoneOrNull('0545989978')).toBe('0545989978');
    expect(realPhoneOrNull('+972545989978')).toBe('+972545989978');
    expect(realPhoneOrNull('972324044254')).toBe('972324044254');
    expect(realPhoneOrNull('054-598-9978')).toBe('054-598-9978');
    expect(realPhoneOrNull('  0533060097 ')).toBe('0533060097');
  });

  // The exact values that produced (#131009) in production — widget/chat
  // visitor ids written into customer_phone by the escalation path.
  it('rejects synthetic session ids', () => {
    expect(realPhoneOrNull('aw_wxjdyhrzmt18914r')).toBeNull();
    expect(realPhoneOrNull('a_lmb12hfy97msx6171l')).toBeNull();
    expect(realPhoneOrNull('aw_ne4twalomt188abo')).toBeNull();
    expect(realPhoneOrNull('a_1sh8mr8xbkjmswvx3k3')).toBeNull();
  });

  // Meta accepts these and then fails delivery with 131026 — equally useless.
  it('rejects digit fragments', () => {
    expect(realPhoneOrNull('3064')).toBeNull();
    expect(realPhoneOrNull('8246')).toBeNull();
    expect(realPhoneOrNull('9727317')).toBeNull();
  });

  it('rejects empty and non-string input', () => {
    expect(realPhoneOrNull('')).toBeNull();
    expect(realPhoneOrNull('   ')).toBeNull();
    expect(realPhoneOrNull(null)).toBeNull();
    expect(realPhoneOrNull(undefined)).toBeNull();
    expect(realPhoneOrNull(972501234567)).toBeNull();
  });

  it('rejects an overlong digit string', () => {
    expect(realPhoneOrNull('1234567890123456')).toBeNull();
  });

  it('isRealPhone mirrors realPhoneOrNull', () => {
    expect(isRealPhone('0545989978')).toBe(true);
    expect(isRealPhone('aw_wxjdyhrzmt18914r')).toBe(false);
  });
});

describe('realEmailOrNull', () => {
  it('accepts and normalises a real address', async () => {
    const { realEmailOrNull } = await import('@/lib/support/contact');
    expect(realEmailOrNull(' Sigalit@Gmail.com ')).toBe('sigalit@gmail.com');
    expect(realEmailOrNull('csr@labeaute.co.il')).toBe('csr@labeaute.co.il');
  });

  it('rejects prose, phones and malformed addresses', async () => {
    const { realEmailOrNull } = await import('@/lib/support/contact');
    for (const v of ['לא רוצה', '0545989978', 'a@b', 'a b@c.com', '@gmail.com', '', null, 5]) {
      expect(realEmailOrNull(v)).toBeNull();
    }
  });
});

describe('hasContactRoute', () => {
  it('is true when either channel is usable', async () => {
    const { hasContactRoute } = await import('@/lib/support/contact');
    expect(hasContactRoute({ phone: '0545989978' })).toBe(true);
    expect(hasContactRoute({ email: 'a@b.com' })).toBe(true);
    expect(hasContactRoute({ phone: 'aw_x1', email: 'a@b.com' })).toBe(true);
  });

  it('is false when neither is', async () => {
    const { hasContactRoute } = await import('@/lib/support/contact');
    expect(hasContactRoute({})).toBe(false);
    expect(hasContactRoute({ phone: 'aw_x1', email: 'לא רוצה' })).toBe(false);
  });
});
