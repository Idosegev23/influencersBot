import { describe, it, expect } from 'vitest';
import { buildExtractionPrompt, brandFromStructuredData } from '@/lib/recommendations/extract-products';

const PRODUCT = {
  '@type': 'Product',
  name: 'גופייה צמודה ALINE',
  brand: { '@type': 'Brand', name: 'RUBY BAY' },
  offers: { '@type': 'Offer', price: 19.9, priceCurrency: 'ILS' },
};

describe('brandFromStructuredData', () => {
  // Multi-brand retailers (TerminalX, Terminal, department stores) put the manufacturer in
  // the Product node. "do you carry MANGO?" is a top query there, so brand must survive
  // extraction rather than being dropped on the floor.
  it('reads brand.name from a Brand object', () => {
    expect(brandFromStructuredData([PRODUCT])).toBe('RUBY BAY');
  });

  it('accepts brand as a bare string', () => {
    expect(brandFromStructuredData([{ ...PRODUCT, brand: 'MANGO' }])).toBe('MANGO');
  });

  it('accepts brand nested under an Organization node type', () => {
    expect(brandFromStructuredData([{ ...PRODUCT, brand: { '@type': 'Organization', name: 'HAVAIANAS' } }]))
      .toBe('HAVAIANAS');
  });

  it('trims whitespace', () => {
    expect(brandFromStructuredData([{ ...PRODUCT, brand: { name: '  SWAROVSKI  ' } }])).toBe('SWAROVSKI');
  });

  it('returns null for the literal "null" Magento writes for unset attributes', () => {
    expect(brandFromStructuredData([{ ...PRODUCT, brand: 'null' }])).toBeNull();
    expect(brandFromStructuredData([{ ...PRODUCT, brand: { name: 'null' } }])).toBeNull();
  });

  it('returns null when there is no Product node or no brand', () => {
    expect(brandFromStructuredData([{ '@type': 'Organization', name: 'TerminalX' }])).toBeNull();
    expect(brandFromStructuredData([{ ...PRODUCT, brand: undefined }])).toBeNull();
    expect(brandFromStructuredData(undefined)).toBeNull();
    expect(brandFromStructuredData([])).toBeNull();
  });

  it('does not throw on malformed input', () => {
    expect(() => brandFromStructuredData(['nope' as any])).not.toThrow();
    expect(() => brandFromStructuredData([{ ...PRODUCT, brand: 42 }])).not.toThrow();
  });
});

describe('extraction prompt asks for brand', () => {
  it('includes a brand rule and a brand key in the JSON envelope, for every vertical', () => {
    for (const v of ['fashion', 'beauty', 'food', 'saas'] as const) {
      const p = buildExtractionPrompt(v);
      expect(p, v).toContain('"brand"');
    }
  });
});
