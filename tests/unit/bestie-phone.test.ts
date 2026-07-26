import { describe, it, expect } from 'vitest';
import { normalizeIsraeliPhone } from '@/lib/bestie/phone';

describe('normalizeIsraeliPhone', () => {
  it('accepts the formats Israelis actually type', () => {
    expect(normalizeIsraeliPhone('0501234567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('050-123-4567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('050 123 4567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('+972501234567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('972-50-1234567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('00972501234567')).toBe('972501234567');
  });

  it('handles a local number written without the leading zero', () => {
    expect(normalizeIsraeliPhone('501234567')).toBe('972501234567');
  });

  it('keeps a non-Israeli number that already carries a country code', () => {
    expect(normalizeIsraeliPhone('+1 415 555 0123')).toBe('14155550123');
  });

  it('rejects what cannot be dialled', () => {
    expect(normalizeIsraeliPhone('')).toBeNull();
    expect(normalizeIsraeliPhone(null)).toBeNull();
    expect(normalizeIsraeliPhone('   ')).toBeNull();
    expect(normalizeIsraeliPhone('12345')).toBeNull();          // too short
    expect(normalizeIsraeliPhone('לא מספר')).toBeNull();
    expect(normalizeIsraeliPhone('03-1234567')).toBeNull();     // landline, not WhatsApp
  });

  it('rejects the placeholder Meta sends for test leads', () => {
    expect(normalizeIsraeliPhone('<test lead: dummy data for מספר_טלפון>')).toBeNull();
  });
});
