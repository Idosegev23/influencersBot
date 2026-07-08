import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: async () => null }));
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({ getScanJobsRepo: () => ({ create: async () => ({ id: 'job-1' }) }) }));
let savedState: any = null;
vi.mock('@/lib/pipeline/state', () => ({ saveState: vi.fn(async (_id: string, s: any) => { savedState = s; }) }));
vi.mock('@/lib/pipeline/qstash', () => ({ publishStep: vi.fn() }));
describe('start with categories', () => {
  it('threads scanMode+categories and domain-anchors when no IG', async () => {
    const { POST } = await import('@/app/api/pipeline/start/route');
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ accountId: 'a', websiteUrl: 'https://s.com', scanMode: 'quote', categories: [{ pathPattern: '/', cap: 30 }] }) });
    await POST(req as any);
    expect(savedState.options.scanMode).toBe('quote');
    expect(savedState.options.categories[0].cap).toBe(30);
  });
});
