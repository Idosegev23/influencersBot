/**
 * /api/cron compared the Authorization header against a template string built
 * from an env var: `Bearer ${process.env.CRON_SECRET}` (GET) and
 * `Bearer ${process.env.ADMIN_PASSWORD}` (POST). With the variable unset the
 * expected value is the literal "Bearer undefined", which anyone can send.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  getAllInfluencers: vi.fn(async () => []),
  updateInfluencer: vi.fn(),
  upsertPosts: vi.fn(),
}));
vi.mock('@/lib/scraping/scrapeCreatorsClient', () => ({ getScrapeCreatorsClient: vi.fn() }));
vi.mock('@/lib/openai', () => ({ analyzeAllPosts: vi.fn(), extractDataFromPost: vi.fn() }));

const saved = { cron: process.env.CRON_SECRET, admin: process.env.ADMIN_PASSWORD };

function req(method: string, auth: string, body?: any) {
  return new Request('http://x/api/cron', {
    method,
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

describe('/api/cron with its secret unset', () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.ADMIN_PASSWORD;
  });
  afterAll(() => {
    if (saved.cron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved.cron;
    if (saved.admin === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = saved.admin;
  });

  it('GET rejects "Bearer undefined" when CRON_SECRET is unset', async () => {
    const { GET } = await import('@/app/api/cron/route');
    expect((await GET(req('GET', 'Bearer undefined'))).status).toBe(401);
  });

  it('GET still runs for the configured CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'cron-s3cret';
    const { GET } = await import('@/app/api/cron/route');
    expect((await GET(req('GET', 'Bearer cron-s3cret'))).status).toBe(200);
  });

  it('POST rejects "Bearer undefined" when ADMIN_PASSWORD is unset', async () => {
    const { POST } = await import('@/app/api/cron/route');
    expect((await POST(req('POST', 'Bearer undefined', {}))).status).toBe(401);
  });

  it('POST still passes the gate for the configured ADMIN_PASSWORD (then 400s on a missing subdomain)', async () => {
    process.env.ADMIN_PASSWORD = 'admin-s3cret';
    const { POST } = await import('@/app/api/cron/route');
    expect((await POST(req('POST', 'Bearer admin-s3cret', {}))).status).toBe(400);
  });
});
