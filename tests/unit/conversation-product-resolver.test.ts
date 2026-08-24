import { describe, it, expect } from 'vitest';
import {
  buildProductIndex,
  resolveProduct,
  productCatalogPrompt,
  type CatalogProduct,
} from '@/lib/conversation-analytics/product-resolver';

const CATALOG: CatalogProduct[] = [
  { id: 'p1', name: 'Argan Oil Shampoo', name_he: 'שמפו שמן ארגן', slug: 'argan-oil-shampoo', category: 'hair_care', product_line: 'סדרת ארגן' },
  { id: 'p2', name: 'Argan Oil Conditioner', name_he: 'מרכך שמן ארגן', slug: 'argan-oil-conditioner', category: 'hair_care', product_line: 'סדרת ארגן' },
  { id: 'p3', name: 'Panda Face Mask', name_he: 'מסכת פנדה', slug: 'panda-face-mask', category: 'face_care', product_line: null },
];

describe('resolveProduct', () => {
  const index = buildProductIndex(CATALOG);

  it('matches the Hebrew name exactly', () => {
    expect(resolveProduct(index, 'שמפו שמן ארגן')).toEqual({ productId: 'p1', category: 'hair_care', productLine: 'סדרת ארגן' });
  });

  it('matches the English name case- and space-insensitively', () => {
    expect(resolveProduct(index, '  argan oil CONDITIONER ')).toEqual({ productId: 'p2', category: 'hair_care', productLine: 'סדרת ארגן' });
  });

  it('matches the slug', () => {
    expect(resolveProduct(index, 'panda-face-mask')).toEqual({ productId: 'p3', category: 'face_care', productLine: null });
  });

  // The brand_logos lesson: a near miss must resolve to nothing, never to a
  // neighbour. A silent wrong SKU is worse than an honest "unidentified".
  it('refuses near misses instead of guessing', () => {
    expect(resolveProduct(index, 'Pandora Face Mask')).toEqual({ productId: null, category: null, productLine: null });
    expect(resolveProduct(index, 'שמפו')).toEqual({ productId: null, category: null, productLine: null });
    expect(resolveProduct(index, 'argan')).toEqual({ productId: null, category: null, productLine: null });
    expect(resolveProduct(index, 'שמפו שמן ארגן 500 מל')).toEqual({ productId: null, category: null, productLine: null });
  });

  it('returns nulls for empty input', () => {
    expect(resolveProduct(index, null)).toEqual({ productId: null, category: null, productLine: null });
    expect(resolveProduct(index, '')).toEqual({ productId: null, category: null, productLine: null });
    expect(resolveProduct(index, '   ')).toEqual({ productId: null, category: null, productLine: null });
  });

  it('never invents an id for an empty catalog', () => {
    expect(resolveProduct(buildProductIndex([]), 'שמפו שמן ארגן'))
      .toEqual({ productId: null, category: null, productLine: null });
  });
});

describe('product line carried off the matched SKU', () => {
  it('returns the line so a matched product also attributes to its series', () => {
    const index = buildProductIndex(CATALOG);
    expect(resolveProduct(index, 'שמפו שמן ארגן').productLine).toBe('סדרת ארגן');
  });

  it('is null when the product has no line rather than inventing one', () => {
    const index = buildProductIndex(CATALOG);
    expect(resolveProduct(index, 'מסכת פנדה').productLine).toBeNull();
  });
});

describe('productCatalogPrompt', () => {
  it('lists every product name for the cacheable prefix', () => {
    const text = productCatalogPrompt(buildProductIndex(CATALOG));
    expect(text).toContain('שמפו שמן ארגן');
    expect(text).toContain('מסכת פנדה');
    expect(text.split('\n').length).toBeGreaterThanOrEqual(3);
  });

  it('is stable across calls so the prompt cache actually hits', () => {
    const a = productCatalogPrompt(buildProductIndex(CATALOG));
    const b = productCatalogPrompt(buildProductIndex([...CATALOG].reverse()));
    expect(a).toBe(b);
  });
});
