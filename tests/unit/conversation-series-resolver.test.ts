import { describe, it, expect } from 'vitest';
import {
  buildSeriesIndex,
  resolveSeries,
  seriesCatalogPrompt,
  type SeriesProduct,
} from '@/lib/conversation-analytics/series-resolver';

// Shapes taken from Argania's real widget_products.product_line values.
const PRODUCTS: SeriesProduct[] = [
  { id: 'p1', product_line: 'סדרת קיק' },
  { id: 'p2', product_line: 'קיק' },
  { id: 'p3', product_line: 'חומצה היאלורונית וקרטין' },
  { id: 'p4', product_line: 'סדרת חומצה היאלורונית קרטין' },
  { id: 'p5', product_line: 'Hyaluronic Acid & Keratin' },
  { id: 'p6', product_line: 'סילבר אסאי' },
  { id: 'p7', product_line: null },
];

describe('buildSeriesIndex', () => {
  const index = buildSeriesIndex(PRODUCTS);

  // "סדרת קיק" (18 products) and "קיק" (9) are the same line under two names.
  it('merges the same line written with and without the סדרת prefix', () => {
    expect(resolveSeries(index, 'סדרת קיק')).toBe(resolveSeries(index, 'קיק'));
    expect(resolveSeries(index, 'קיק')).toBeTruthy();
  });

  it('ignores products with no line', () => {
    expect(index.labels).not.toContain(null as any);
  });
});

describe('resolveSeries', () => {
  const index = buildSeriesIndex(PRODUCTS);

  it('resolves a bare line name', () => {
    expect(resolveSeries(index, 'סילבר אסאי')).toBe('סילבר אסאי');
  });

  it('resolves the way customers actually write it', () => {
    // Real mentions from production, all of which failed SKU matching.
    expect(resolveSeries(index, 'סדרת הקיק')).toBeTruthy();
    expect(resolveSeries(index, 'מסכת קיק')).toBeTruthy();
    expect(resolveSeries(index, 'מי חומצה היאלורונית וקרטין')).toBeTruthy();
    expect(resolveSeries(index, 'סדרת חומצה היאלורונית וקרטין')).toBeTruthy();
  });

  it('is whitespace and case insensitive', () => {
    expect(resolveSeries(index, '  HYALURONIC acid & keratin ')).toBeTruthy();
  });

  // The Panda/Pandora rule still applies: a line name must actually appear.
  it('refuses mentions that name no line', () => {
    expect(resolveSeries(index, 'שמפו')).toBeNull();
    expect(resolveSeries(index, 'המסכה')).toBeNull();
    expect(resolveSeries(index, 'מברשת שיער')).toBeNull();
    expect(resolveSeries(index, '')).toBeNull();
    expect(resolveSeries(index, null)).toBeNull();
  });

  // A one-word line would otherwise match almost any sentence containing it.
  it('does not match on a line name shorter than three characters', () => {
    const tiny = buildSeriesIndex([{ id: 'x', product_line: 'AB' }]);
    expect(resolveSeries(tiny, 'שמפו AB לשיער')).toBeNull();
  });

  it('prefers the longest matching line when two overlap', () => {
    const overlapping = buildSeriesIndex([
      { id: 'a', product_line: 'ארגן' },
      { id: 'b', product_line: 'שמן ארגן וחומצה היאלורונית' },
    ]);
    expect(resolveSeries(overlapping, 'שמן ארגן וחומצה היאלורונית')).toBe('שמן ארגן וחומצה היאלורונית');
  });

  it('returns null for an empty catalog', () => {
    expect(resolveSeries(buildSeriesIndex([]), 'סדרת קיק')).toBeNull();
  });
});

describe('seriesCatalogPrompt', () => {
  it('is stable across orderings so the prompt cache hits', () => {
    const a = seriesCatalogPrompt(buildSeriesIndex(PRODUCTS));
    const b = seriesCatalogPrompt(buildSeriesIndex([...PRODUCTS].reverse()));
    expect(a).toBe(b);
  });

  it('lists each merged line once', () => {
    const text = seriesCatalogPrompt(buildSeriesIndex(PRODUCTS));
    const kikLines = text.split('\n').filter((l) => l.includes('קיק'));
    expect(kikLines).toHaveLength(1);
  });
});
