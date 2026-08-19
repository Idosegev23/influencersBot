import { describe, it, expect } from 'vitest';
import { sanitizeOverrides } from '@/lib/widget/banner';

describe('sanitizeOverrides', () => {
  it('drops non-arrays', () => {
    expect(sanitizeOverrides(null)).toEqual([]);
    expect(sanitizeOverrides({})).toEqual([]);
  });

  it('keeps a well-formed override', () => {
    const out = sanitizeOverrides([
      { id: 'sale', from: '2026-08-20', until: '2026-08-31', surface: 'both', headline: 'מבצע' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].headline).toBe('מבצע');
  });

  it('rejects malformed dates rather than storing a window that never closes', () => {
    const out = sanitizeOverrides([{ from: '20/08/2026', headline: 'x' }]);
    expect(out[0].from).toBeUndefined();
  });

  it('rejects a window that ends before it starts', () => {
    expect(sanitizeOverrides([{ from: '2026-08-31', until: '2026-08-01', headline: 'x' }])).toEqual([]);
  });

  it('normalises an unknown surface to both', () => {
    expect(sanitizeOverrides([{ surface: 'sms', headline: 'x' }])[0].surface).toBe('both');
  });

  it('caps the list so config cannot balloon', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ headline: `x${i}` }));
    expect(sanitizeOverrides(many)).toHaveLength(20);
  });

  it('drops an override with no content — a window over nothing is not a promotion', () => {
    expect(sanitizeOverrides([{ from: '2026-08-01', until: '2026-08-31' }])).toEqual([]);
  });

  it('rejects a date that is shaped right but is not a real date', () => {
    expect(sanitizeOverrides([{ until: '2026-13-45', headline: 'x' }])[0].until).toBeUndefined();
    expect(sanitizeOverrides([{ until: '9999-99-99', headline: 'x' }])[0].until).toBeUndefined();
  });

  it('rejects a day that does not exist in that month', () => {
    // Date would silently roll this forward to March 2nd.
    expect(sanitizeOverrides([{ until: '2026-02-30', headline: 'x' }])[0].until).toBeUndefined();
  });

  it('keeps a leap day that does exist', () => {
    expect(sanitizeOverrides([{ until: '2028-02-29', headline: 'x' }])[0].until).toBe('2028-02-29');
  });
});
