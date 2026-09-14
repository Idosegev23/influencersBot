/**
 * Three admin login paths fell back to the literal password '123456' whenever
 * ADMIN_PASSWORD was unset (`process.env.ADMIN_PASSWORD || '123456'`), so a
 * deploy that forgot the env var shipped a guessable admin login. With no
 * ADMIN_PASSWORD configured, admin password login must be refused outright.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { signOut: vi.fn(), signInWithPassword: vi.fn() } }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {},
  getInfluencerByUsername: vi.fn(async () => null),
}));
vi.mock('@/lib/background-scraper', () => ({ runBackgroundScrape: vi.fn() }));
vi.mock('@/lib/scraping-progress', () => ({ getProgress: vi.fn(async () => null) }));

const ORIGINAL = process.env.ADMIN_PASSWORD;
process.env.SESSION_COOKIE_SECRET ||= 'test-session-secret';

function post(url: string, body: any) {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as any;
}

describe('admin password login has no built-in default', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ADMIN_PASSWORD;
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = ORIGINAL;
  });

  it("POST /api/admin refuses '123456' when ADMIN_PASSWORD is unset", async () => {
    const { POST } = await import('@/app/api/admin/route');
    const res = await POST(post('http://x/api/admin', { password: '123456' }));
    expect(res.status).toBe(401);
  });

  it('POST /api/admin still logs in with the configured ADMIN_PASSWORD', async () => {
    process.env.ADMIN_PASSWORD = 'correct-horse-battery';
    const { POST } = await import('@/app/api/admin/route');
    expect((await POST(post('http://x/api/admin', { password: 'correct-horse-battery' }))).status).toBe(200);
    expect((await POST(post('http://x/api/admin', { password: '123456' }))).status).toBe(401);
  });

  it("POST /api/auth/login (username 'admin') refuses '123456' when ADMIN_PASSWORD is unset", async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(post('http://x/api/auth/login', { username: 'admin', password: '123456' }));
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login (admin) still logs in with the configured ADMIN_PASSWORD', async () => {
    process.env.ADMIN_PASSWORD = 'correct-horse-battery';
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(post('http://x/api/auth/login', { username: 'admin', password: 'correct-horse-battery' }));
    expect(res.status).toBe(200);
  });

  it("POST /api/admin/scrape refuses adminPassword '123456' when ADMIN_PASSWORD is unset", async () => {
    const { POST } = await import('@/app/api/admin/scrape/route');
    const res = await POST(post('http://x/api/admin/scrape', { username: 'someone', adminPassword: '123456' }));
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/scrape still accepts the configured ADMIN_PASSWORD (then 404s on the unknown account)', async () => {
    process.env.ADMIN_PASSWORD = 'correct-horse-battery';
    const { POST } = await import('@/app/api/admin/scrape/route');
    const res = await POST(post('http://x/api/admin/scrape', { username: 'someone', adminPassword: 'correct-horse-battery' }));
    expect(res.status).toBe(404);
  });
});
