import { describe, it, expect } from 'vitest';
import {
  normalizeBrandKey,
  buildBrandLogoIndex,
  lookupBrandLogo,
  type BrandLogoRow,
} from '@/lib/brands/brand-logo-index';

// A slice of the real brand_logos table — the shapes that actually occur in prod:
// English-normalized key, Hebrew display name, Hebrew + English aliases, and rows
// that exist but carry no logo yet.
const ROWS: BrandLogoRow[] = [
  {
    brand_name_normalized: 'opticana',
    display_name: 'Opticana',
    logo_url: 'https://cdn/Opticana.png',
    aliases: ['Opticana', 'אופטיקנה', 'Opticana (אופטיקנה)'],
  },
  {
    brand_name_normalized: 'magnus',
    display_name: 'Magnus',
    logo_url: 'https://cdn/Magnus.png',
    aliases: ['מגנוס'],
  },
  {
    brand_name_normalized: 'philips',
    display_name: 'Philips',
    logo_url: 'https://cdn/Philips.png',
    aliases: ['Philips', 'פיליפס'],
  },
  {
    brand_name_normalized: 'pandora',
    display_name: 'Pandora',
    logo_url: 'https://cdn/Pandora.png',
    aliases: ['Pandora', 'פנדורה'],
  },
  {
    brand_name_normalized: 'la roche-posay',
    display_name: 'La Roche-Posay',
    logo_url: 'https://cdn/La_Roche_Posay.png',
    aliases: ['La Roche-Posay', 'לה רוש פוזה'],
  },
  // Registered brand with NO logo uploaded yet — must never resolve.
  {
    brand_name_normalized: 'super-pharm',
    display_name: 'Super-Pharm',
    logo_url: null,
    aliases: ['Super-Pharm', 'סופר-פארם'],
  },
];

const index = buildBrandLogoIndex(ROWS);
const lookup = (name: string) => lookupBrandLogo(index, name);

describe('normalizeBrandKey', () => {
  it('folds case, punctuation and latin diacritics into one key', () => {
    expect(normalizeBrandKey('La Roche-Posay')).toBe(normalizeBrandKey('la roche posay'));
    expect(normalizeBrandKey('LA BEAUTÉ')).toBe('la beaute');
    expect(normalizeBrandKey("Papa John's")).toBe('papa john s');
  });

  it('leaves Hebrew intact', () => {
    expect(normalizeBrandKey(' אופטיקנה ')).toBe('אופטיקנה');
  });
});

describe('lookupBrandLogo', () => {
  it('matches the English normalized name', () => {
    expect(lookup('Opticana')).toBe('https://cdn/Opticana.png');
  });

  it('matches a Hebrew alias — the name partnerships are actually stored under', () => {
    expect(lookup('אופטיקנה')).toBe('https://cdn/Opticana.png');
    expect(lookup('מגנוס')).toBe('https://cdn/Magnus.png');
    expect(lookup('פיליפס')).toBe('https://cdn/Philips.png');
  });

  it('strips a bilingual parenthetical suffix', () => {
    // "Magnus (מגנוס)" is neither the normalized name nor a listed alias.
    expect(lookup('Magnus (מגנוס)')).toBe('https://cdn/Magnus.png');
  });

  it('splits a slash-joined brand pair on its first known half', () => {
    expect(lookup('Opticana / Cattleya')).toBe('https://cdn/Opticana.png');
  });

  it('falls back to the leading words for a sub-brand', () => {
    expect(lookup('Philips Sonicare')).toBe('https://cdn/Philips.png');
  });

  it('returns null for a brand that has no logo row', () => {
    expect(lookup('Zohara')).toBeNull();
    expect(lookup('Candle Club')).toBeNull();
  });

  it('returns null for a registered brand whose logo_url is empty', () => {
    expect(lookup('Super-Pharm')).toBeNull();
    expect(lookup('סופר-פארם')).toBeNull();
  });

  it('never guesses a similar-looking brand', () => {
    // Panda is not Pandora. A wrong logo is worse than no logo.
    expect(lookup('Panda')).toBeNull();
    expect(lookup('Panda (Pandazzz)')).toBeNull();
  });

  it('handles empty and missing names', () => {
    expect(lookup('')).toBeNull();
    expect(lookup(undefined as any)).toBeNull();
  });
});
