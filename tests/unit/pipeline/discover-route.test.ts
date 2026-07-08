import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: async () => null }));
vi.mock('@/lib/redis', () => ({ redisGet: vi.fn().mockResolvedValue(null), redisSet: vi.fn() }));
vi.mock('@/lib/pipeline/discover', () => ({ discoverCategories: vi.fn().mockResolvedValue({ domain: 's.com', noSitemap: false, categories: [{ id: '/', pathPattern: '/', label: 'מוצרים', type: 'products', count: 2, sampleUrls: [] }] }) }));
describe('POST /api/pipeline/discover', () => {
  it('returns categories', async () => {
    const { POST } = await import('@/app/api/pipeline/discover/route');
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ websiteUrl: 'https://s.com' }) });
    const json = await (await POST(req as any)).json();
    expect(json.categories[0].label).toBe('מוצרים');
  });
});
