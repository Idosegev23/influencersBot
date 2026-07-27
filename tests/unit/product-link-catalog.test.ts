import { describe, it, expect } from 'vitest';
import { selectRelevantProducts, renderProductCatalogBlock, type ProductLink } from '@/lib/recommendations/product-links';

const P = (name: string, extra: Partial<ProductLink> = {}): ProductLink => ({
  name,
  url: `https://argania-oil.co.il/products/${encodeURIComponent(name)}`,
  price: '57.9',
  currency: 'ILS',
  isAvailable: true,
  ...extra,
});

const CATALOG: ProductLink[] = [
  P('שמפו קיק'),
  P('מסיכה טיפולית'),
  P('גלייז לשיער מתולתל'),
  P('סרום חומצה היאלורונית'),
  P('קרם לחות וקרטין'),
  P('שמן ארגן'),
  P('סבון גוף'),
];

describe('selectRelevantProducts', () => {
  it('ranks products whose name overlaps the question first', () => {
    const top = selectRelevantProducts(CATALOG, 'מה מתאים לשיער מתולתל?', 3);
    expect(top[0].name).toBe('גלייז לשיער מתולתל');
  });

  it('matches on a partial word from the question', () => {
    const top = selectRelevantProducts(CATALOG, 'ספרו לי על שמן ארגן', 3);
    expect(top.map(p => p.name)).toContain('שמן ארגן');
  });

  it('never returns more than the requested cap', () => {
    expect(selectRelevantProducts(CATALOG, 'שיער', 2)).toHaveLength(2);
  });

  it('still returns a catalog slice when nothing matches, so a link is always available', () => {
    const top = selectRelevantProducts(CATALOG, 'זזזז', 3);
    expect(top).toHaveLength(3);
  });

  it('drops unavailable products — never link something that cannot be bought', () => {
    const withOos = [...CATALOG, P('סבון גבות', { isAvailable: false })];
    const top = selectRelevantProducts(withOos, 'סבון גבות', 5);
    expect(top.map(p => p.name)).not.toContain('סבון גבות');
  });
});

describe('renderProductCatalogBlock', () => {
  it('renders each product as name, price and URL', () => {
    const block = renderProductCatalogBlock([P('שמפו קיק')]);
    expect(block).toContain('שמפו קיק');
    expect(block).toContain('57.9');
    expect(block).toContain('https://argania-oil.co.il/products/');
  });

  it('instructs the model to link the product it recommends', () => {
    const block = renderProductCatalogBlock([P('שמפו קיק')]);
    expect(block).toMatch(/קישור|לינק/);
    expect(block).toContain('[');    // markdown link syntax is spelled out
  });

  it('returns an empty string for an empty catalog, adding nothing to the prompt', () => {
    expect(renderProductCatalogBlock([])).toBe('');
  });

  it('does not invent a price when the product has none', () => {
    const block = renderProductCatalogBlock([P('שמפו קיק', { price: null })]);
    expect(block).toContain('שמפו קיק');
    expect(block).not.toContain('null');
  });
});
