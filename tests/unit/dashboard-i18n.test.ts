import { describe, it, expect } from 'vitest';
import { getDashboardStrings, dashboardDir, normalizeLang } from '@/lib/i18n/dashboard';

describe('normalizeLang', () => {
  it('accepts the two supported languages', () => {
    expect(normalizeLang('en')).toBe('en');
    expect(normalizeLang('he')).toBe('he');
  });
  it('rejects anything else', () => {
    expect(normalizeLang('fr')).toBeNull();
    expect(normalizeLang('EN')).toBeNull(); // case-sensitive on purpose (stored value is lowercase)
    expect(normalizeLang(undefined)).toBeNull();
    expect(normalizeLang(null)).toBeNull();
    expect(normalizeLang(1)).toBeNull();
  });
});

describe('dashboardDir', () => {
  it('en → ltr, he/default → rtl', () => {
    expect(dashboardDir('en')).toBe('ltr');
    expect(dashboardDir('he')).toBe('rtl');
    expect(dashboardDir(null)).toBe('rtl');
  });
});

describe('getDashboardStrings', () => {
  it('returns English strings for en and Hebrew for he/default', () => {
    expect(getDashboardStrings('en').nav.dashboard).toBe('Dashboard');
    expect(getDashboardStrings('he').nav.dashboard).toBe('דשבורד');
    expect(getDashboardStrings(undefined).nav.dashboard).toBe('דשבורד');
  });
  it('en mirrors he — every he key exists in en for each section', () => {
    const he = getDashboardStrings('he') as Record<string, Record<string, unknown>>;
    const en = getDashboardStrings('en') as Record<string, Record<string, unknown>>;
    for (const section of Object.keys(he)) {
      for (const key of Object.keys(he[section])) {
        expect(en[section], `en.${section} missing`).toBeDefined();
        expect(en[section][key], `en.${section}.${key} missing`).toBeDefined();
      }
    }
  });
});
