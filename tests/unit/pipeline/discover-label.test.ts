// tests/unit/pipeline/discover-label.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/openai', () => ({ chat: vi.fn().mockResolvedValue(JSON.stringify([
  { pathPattern: '/', label: 'מוצרים', type: 'products' },
  { pathPattern: '/magazine', label: 'מגזין', type: 'articles' },
])) }));
vi.mock('@/lib/pipeline/sitemap', () => ({ discoverSitemapUrls: vi.fn().mockResolvedValue([
  'https://s.com/cl1', 'https://s.com/cl2', 'https://s.com/magazine/a',
]) }));

describe('discoverCategories', () => {
  it('returns labelled categories from the sitemap', async () => {
    const { discoverCategories } = await import('@/lib/pipeline/discover');
    const res = await discoverCategories('https://s.com');
    expect(res.noSitemap).toBe(false);
    const products = res.categories.find(c => c.pathPattern === '/');
    expect(products?.label).toBe('מוצרים');
    expect(products?.type).toBe('products');
    expect(products?.count).toBe(2);
  });
});
