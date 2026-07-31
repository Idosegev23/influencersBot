import { describe, it, expect } from 'vitest';
import { summarizeStructuredData, structuredProductImage } from '@/lib/recommendations/extract-products';

// Real shape from terminalx.com — headless Magento emits a complete schema.org/Product
// plus a BreadcrumbList that spells out the site's own category hierarchy. Feeding both to
// the extractor grounds category/brand/price on facts instead of free-text guessing.
const TX_PRODUCT = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  image: ['https://media.terminalx.com/a.jpg', 'https://media.terminalx.com/b.jpg'],
  name: 'גופייה צמודה ALINE',
  description: 'גופייה מעוצבת בשילוב מפתח צוואר עגול וכתפיות דקות',
  sku: 'R340280005',
  color: 'לבן',
  material: 'null',
  brand: { '@type': 'Brand', name: 'RUBY BAY' },
  offers: [
    {
      '@type': 'Offer',
      availability: 'https://schema.org/InStock',
      name: 'גופייה צמודה ALINE – מידה 1',
      price: 19.9,
      priceCurrency: 'ILS',
      url: 'https://www.terminalx.com/women/tops/tank-tops/r340280005/?color=10',
    },
  ],
};

const TX_BREADCRUMBS = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, item: { '@id': 'https://www.terminalx.com/', name: 'דף הבית' } },
    { '@type': 'ListItem', position: 2, item: { '@id': 'https://www.terminalx.com/women', name: 'נשים' } },
    { '@type': 'ListItem', position: 2, item: { '@id': 'https://www.terminalx.com/women/tops', name: 'חולצות' } },
    { '@type': 'ListItem', position: 2, item: { '@id': 'https://www.terminalx.com/women/tops/tank-tops', name: 'גופיות' } },
  ],
};

describe('summarizeStructuredData', () => {
  it('extracts name, brand, sku, colour and description from a Product node', () => {
    const out = summarizeStructuredData([TX_PRODUCT]);
    expect(out).toContain('גופייה צמודה ALINE');
    expect(out).toContain('RUBY BAY');
    expect(out).toContain('R340280005');
    expect(out).toContain('לבן');
  });

  it('extracts price, currency and availability from an offers array', () => {
    const out = summarizeStructuredData([TX_PRODUCT]);
    expect(out).toContain('19.9');
    expect(out).toContain('ILS');
    expect(out).toMatch(/InStock|במלאי/);
  });

  it('accepts offers as a bare object, not only an array', () => {
    const out = summarizeStructuredData([{ ...TX_PRODUCT, offers: TX_PRODUCT.offers[0] }]);
    expect(out).toContain('19.9');
  });

  it('renders the breadcrumb trail as the site category hierarchy, home page dropped', () => {
    const out = summarizeStructuredData([TX_PRODUCT, TX_BREADCRUMBS]);
    expect(out).toContain('נשים');
    expect(out).toContain('חולצות');
    expect(out).toContain('גופיות');
    expect(out).not.toContain('דף הבית');
  });

  it('drops the literal string "null" that Magento emits for empty attributes', () => {
    const out = summarizeStructuredData([TX_PRODUCT]);
    expect(out).not.toMatch(/:\s*null\s*$/m);
  });

  it('finds a Product nested inside an @graph wrapper', () => {
    const out = summarizeStructuredData([{ '@context': 'https://schema.org', '@graph': [TX_PRODUCT] }]);
    expect(out).toContain('גופייה צמודה ALINE');
  });

  it('returns an empty string when there is no Product or BreadcrumbList', () => {
    expect(summarizeStructuredData([{ '@type': 'Organization', name: 'TerminalX' }])).toBe('');
    expect(summarizeStructuredData([])).toBe('');
    expect(summarizeStructuredData(undefined)).toBe('');
    expect(summarizeStructuredData(null)).toBe('');
  });

  it('survives malformed input without throwing', () => {
    expect(() => summarizeStructuredData(['not an object' as any])).not.toThrow();
    expect(() => summarizeStructuredData({ '@type': 'Product', name: 'x' } as any)).not.toThrow();
  });

  it('accepts a single object (not wrapped in an array)', () => {
    expect(summarizeStructuredData(TX_PRODUCT as any)).toContain('גופייה צמודה ALINE');
  });
});

describe('structuredProductImage', () => {
  // TerminalX product pages carry no og:image, so image_urls[0] is whatever <img> happened
  // to come first — often a nav logo. The ld+json image is the actual product shot.
  it('returns the first image of the Product node', () => {
    expect(structuredProductImage([TX_PRODUCT, TX_BREADCRUMBS])).toBe('https://media.terminalx.com/a.jpg');
  });

  it('accepts image as a bare string', () => {
    expect(structuredProductImage([{ ...TX_PRODUCT, image: 'https://x.com/one.jpg' }])).toBe('https://x.com/one.jpg');
  });

  it('accepts image as an ImageObject with a url', () => {
    expect(structuredProductImage([{ ...TX_PRODUCT, image: { '@type': 'ImageObject', url: 'https://x.com/o.jpg' } }]))
      .toBe('https://x.com/o.jpg');
  });

  it('returns null when absent, non-http, or malformed', () => {
    expect(structuredProductImage([{ '@type': 'Organization', name: 'TerminalX' }])).toBeNull();
    expect(structuredProductImage([{ ...TX_PRODUCT, image: 'null' }])).toBeNull();
    expect(structuredProductImage([{ ...TX_PRODUCT, image: '/relative.jpg' }])).toBeNull();
    expect(structuredProductImage(undefined)).toBeNull();
  });
});
