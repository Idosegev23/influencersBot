// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ db: null as any, jobs: [] as any[], order: [] as string[] }));
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_t, k) => (h.db as any)[k] }) }));
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({
  getScanJobsRepo: () => ({ getByAccount: async (id: string, n: number) => h.jobs.filter((j) => j.account_id === id).slice(0, n) }),
}));
const startPipeline = vi.fn();
vi.mock('@/lib/pipeline/start', () => ({ startPipeline: (...a: any[]) => startPipeline(...a) }));
vi.mock('@/lib/utils', () => ({ hashPassword: async (p: string) => `hashed:${p.length}` }));
const DNS: Record<string, string[]> = { 'uma.org': ['104.18.2.3'], 'intranet-site.org': ['10.0.0.8'], 'meta-site.org': ['169.254.169.254'], 'v6-site.org': ['fd12::1'] };
vi.mock('node:dns/promises', () => ({
  default: { lookup: async (h: string) => { const a = DNS[h]; if (!a) throw new Error('ENOTFOUND'); return a.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })); } },
}));
const requireTenant = vi.fn();
vi.mock('@/lib/copilot/auth', () => ({ requireTenant: (...a: any[]) => requireTenant(...a) }));

import { POST } from '@/app/api/partner/v1/console/associations/route';
import { RESERVED_SLUGS } from '@/lib/copilot/console-create';
import { GET as scanGET } from '@/app/api/partner/v1/console/associations/[id]/scan/route';
import { SECRET, PA, ACC1, ACC2, ACCX, BASE, tokenFor, tenantFor, world, type UserKey } from './console-fixture';

let db: ReturnType<typeof world>;

function post(user: UserKey, body: any) {
  requireTenant.mockResolvedValue(tenantFor(user));
  return POST(new Request('http://x/', { method: 'POST', headers: { 'x-console-token': tokenFor(user) }, body: JSON.stringify(body) }));
}
const scan = (user: UserKey, id: string) => {
  requireTenant.mockResolvedValue(tenantFor(user));
  return scanGET(new Request('http://x/', { headers: { 'x-console-token': tokenFor(user) } }), { params: Promise.resolve({ id }) });
};
const GOOD = { name: 'United Motorcoach Association', websiteUrl: 'uma.org', slug: 'uma' };
const accountCount = () => db.tables.accounts.length;

beforeEach(() => {
  process.env.CONSOLE_SESSION_SECRET = SECRET;
  db = world();
  h.db = db;
  h.jobs = [];
  h.order = [];
  // record the order of writes
  const from = db.from.bind(db);
  db.from = (t: string) => {
    const b = from(t);
    const ins = b.insert;
    b.insert = (r: any) => { h.order.push(`insert:${t}`); return ins(r); };
    return b;
  };
  const rpc = db.rpc.bind(db);
  db.rpc = (n: string, a: any) => { h.order.push(`rpc:${n}`); return rpc(n, a); };
  db.rpcs.copilot_store_secret = () => ({ data: 'vault-ref-1', error: null });
  db.rpcs.copilot_delete_secret = () => ({ data: true, error: null });
  startPipeline.mockReset();
  startPipeline.mockImplementation(async () => { h.order.push('startPipeline'); return { jobId: 'job-1' }; });
  requireTenant.mockReset();
});

describe('POST console/associations', () => {
  it('creates account, host, secret, then starts the scan; answers 201 {id, slug, jobId}', async () => {
    const res = await post('owner', GOOD);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: expect.any(String), slug: 'uma', jobId: 'job-1' });
    expect(h.order).toEqual(['insert:accounts', 'insert:tenant_domains', 'rpc:copilot_store_secret', 'rpc:copilot_merge_config', 'startPipeline']);

    const acc = db.tables.accounts.find((a) => a.id === body.id)!;
    expect(acc).toMatchObject({
      type: 'creator', plan: 'free', status: 'active', language: 'en', timezone: 'America/New_York', partner_id: PA,
      allowed_channels: { web: true }, features: { chatbot: true, analytics: true },
      config: {
        username: 'uma', display_name: 'United Motorcoach Association', archetype: 'association', website_url: 'https://uma.org', isDemo: false,
        copilot: { industry: null, opening_questions: [], links: {}, ams: { provider: 'stub', stub_members: [] }, identify_secret_ref: 'vault-ref-1' },
      },
    });
    expect(acc.security_config.admin_password_hash).toBe('hashed:64');
    expect(db.tables.tenant_domains).toContainEqual(expect.objectContaining({ host: `uma.${BASE}`, partner_id: PA, account_id: body.id, kind: 'subdomain' }));
    expect(startPipeline).toHaveBeenCalledWith({
      accountId: body.id, websiteUrl: 'https://uma.org', archetype: 'association', language: 'en', isDemo: false, scanMode: 'full', requestedBy: `partner:${PA}`,
    });
    expect(JSON.stringify(body)).not.toContain('vault');
  });

  it('admin can create too', async () => {
    expect((await post('admin', GOOD)).status).toBe(201);
  });

  it.each(['viewer', 'assocAdmin', 'assocViewer'] as UserKey[])('%s cannot create (403), nothing written', async (u) => {
    const n = accountCount();
    const res = await post(u, GOOD);
    expect(res.status).toBe(403);
    expect(accountCount()).toBe(n);
    expect(startPipeline).not.toHaveBeenCalled();
  });

  it('409 slug_taken when the tenant host exists, no account, no pipeline', async () => {
    const n = accountCount();
    const res = await post('owner', { ...GOOD, slug: 'aba' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'slug_taken' });
    expect(accountCount()).toBe(n);
    expect(startPipeline).not.toHaveBeenCalled();
  });

  it('409 when any account already uses the slug as its username (any partner)', async () => {
    const res = await post('owner', { ...GOOD, slug: 'theirs' });
    expect(res.status).toBe(409);
    expect(startPipeline).not.toHaveBeenCalled();
  });

  it('409 and a full rollback when a concurrent create wins the host first', async () => {
    const n = accountCount();
    db.failNext.push({ table: 'tenant_domains', op: 'insert', error: { code: '23505', message: 'duplicate key' } });
    const res = await post('owner', GOOD);
    expect(res.status).toBe(409);
    expect(accountCount()).toBe(n);
    expect(h.order).not.toContain('rpc:copilot_store_secret');
    expect(startPipeline).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...GOOD, slug: 'API' }, 'invalid_slug'],
    [{ ...GOOD, slug: 'a' }, 'invalid_slug'],
    [{ ...GOOD, slug: '-uma' }, 'invalid_slug'],
    [{ ...GOOD, slug: 'uma-' }, 'invalid_slug'],
    [{ ...GOOD, slug: 'x'.repeat(33) }, 'invalid_slug'],
    [{ ...GOOD, slug: 'u.ma' }, 'invalid_slug'],
    [{ ...GOOD, slug: 'api' }, 'slug_reserved'],
    [{ ...GOOD, slug: 'console' }, 'slug_reserved'],
    [{ ...GOOD, slug: 'embed' }, 'slug_reserved'],
    [{ ...GOOD, slug: 'static' }, 'slug_reserved'],
    [{ ...GOOD, websiteUrl: 'ftp://uma.org' }, 'invalid_website'],
    [{ ...GOOD, websiteUrl: 'javascript:alert(1)' }, 'invalid_website'],
    [{ ...GOOD, websiteUrl: 'not a site' }, 'invalid_website'],
    [{ ...GOOD, websiteUrl: '' }, 'invalid_website'],
    [{ ...GOOD, websiteUrl: 'http://127.0.0.1/' }, 'invalid_website'],
    [{ ...GOOD, websiteUrl: 'http://[::1]/' }, 'invalid_website'],
    [{ ...GOOD, websiteUrl: 'http://localhost:3000/' }, 'invalid_website'],
    [{ ...GOOD, websiteUrl: 'https://intranet-site.org' }, 'invalid_website'],
    [{ ...GOOD, websiteUrl: 'https://meta-site.org' }, 'invalid_website'],
    [{ ...GOOD, websiteUrl: 'https://v6-site.org' }, 'invalid_website'],
    [{ ...GOOD, websiteUrl: 'https://does-not-resolve.org' }, 'invalid_website'],
    [{ ...GOOD, name: '' }, 'invalid_name'],
    [{ ...GOOD, name: '<script>' }, 'invalid_name'],
  ])('400 for %j (%s), nothing written', async (body, error) => {
    const n = accountCount();
    const res = await post('owner', body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(accountCount()).toBe(n);
    expect(startPipeline).not.toHaveBeenCalled();
  });

  it('accepts an explicit http:// site as given', async () => {
    const res = await post('owner', { ...GOOD, websiteUrl: 'http://uma.org/' });
    expect(res.status).toBe(201);
    expect(startPipeline.mock.calls[0][0].websiteUrl).toBe('http://uma.org/');
  });

  it.each([
    ['returns an error', async () => ({ error: 'qstash down', status: 500 })],
    ['throws', async () => { throw new Error('boom'); }],
  ])('rolls back the account and host when the pipeline start %s', async (_n, impl) => {
    startPipeline.mockImplementation(impl as any);
    const n = accountCount();
    const hosts = db.tables.tenant_domains.length;
    const res = await post('owner', GOOD);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'scan_start_failed' });
    expect(accountCount()).toBe(n);
    expect(db.tables.tenant_domains.length).toBe(hosts);
    expect(db.tables.tenant_domains.find((d) => d.host === `uma.${BASE}`)).toBeUndefined();
    // the slug is free again
    startPipeline.mockImplementation(async () => ({ jobId: 'job-2' }));
    expect((await post('owner', GOOD)).status).toBe(201);
    expect(startPipeline).toHaveBeenCalledTimes(2);
  });

  it('rollback also deletes the Vault secret and any scan job the failed start created', async () => {
    startPipeline.mockImplementation(async ({ accountId }: any) => {
      db.tables.scan_jobs.push({ id: 'orphan-job', account_id: accountId, status: 'queued' });
      throw new Error('publish failed');
    });
    db.tables.scan_jobs.push({ id: 'other-job', account_id: ACC1, status: 'succeeded' });
    const res = await post('owner', GOOD);
    expect(res.status).toBe(503);
    expect(h.order).toContain('rpc:copilot_delete_secret');
    expect(db.tables.scan_jobs.map((j) => j.id)).toEqual(['other-job']);
  });

  it('a successful create never deletes the secret', async () => {
    expect((await post('owner', GOOD)).status).toBe(201);
    expect(h.order).not.toContain('rpc:copilot_delete_secret');
    expect(h.order).toContain('rpc:copilot_store_secret');
  });

  it('pins the reserved slugs (the console frontend uses the same list)', () => {
    expect([...RESERVED_SLUGS].sort()).toEqual([
      'api', 'admin', 'console', 'login', 'logout', 'embed', 'assets', '_next', 'static', 'associations',
      'settings', 'install', 't', 'auth', 'www', 'favicon.ico', 'robots.txt', 'health',
    ].sort());
  });

  it.each(['logout', 'associations', 'settings', 'install', 'auth', 'www', 'health'])('refuses the reserved slug %s', async (slug) => {
    const res = await post('owner', { ...GOOD, slug });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'slug_reserved' });
  });

  it('rolls back when the identify secret cannot be stored', async () => {
    db.rpcs.copilot_store_secret = () => ({ data: null, error: { message: 'vault down' } });
    const n = accountCount();
    const res = await post('owner', GOOD);
    expect(res.status).toBe(503);
    expect(accountCount()).toBe(n);
    expect(db.tables.tenant_domains.find((d) => d.host === `uma.${BASE}`)).toBeUndefined();
    expect(startPipeline).not.toHaveBeenCalled();
  });

  it('503 and nothing created when the account insert fails', async () => {
    db.failNext.push({ table: 'accounts', op: 'insert', error: { message: 'down' } });
    const n = accountCount();
    expect((await post('owner', GOOD)).status).toBe(503);
    expect(accountCount()).toBe(n);
    expect(startPipeline).not.toHaveBeenCalled();
  });
});

describe('GET console/associations/:id/scan', () => {
  it('reports the latest job with steps', async () => {
    h.jobs.push({ id: 'j', account_id: ACC2, status: 'running', created_at: '2026-10-18T00:00:00Z', updated_at: new Date().toISOString(), started_at: '2026-10-18T00:00:02Z', error_message: 'apify secret detail',
      step_logs: [{ step: 'create-account', status: 'completed', timestamp: '2026-10-18T00:00:05Z' }, { step: 'ig-scan', status: 'running', timestamp: '2026-10-18T00:00:06Z' }] });
    const res = await scan('owner', ACC2);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'running', percent: 7, currentStep: 'ig-scan', completedSteps: 1, totalSteps: 15, startedAt: '2026-10-18T00:00:02Z', finishedAt: null, error: null });
    expect(body.steps).toHaveLength(15);
    expect(body.steps[0]).toEqual({ step: 'create-account', status: 'done' });
    expect(body.steps[1]).toEqual({ step: 'ig-scan', status: 'running' });
    expect(body.steps[2]).toEqual({ step: 'transcribe', status: 'pending' });
  });

  it('a failed scan says scan_failed and never the internal message', async () => {
    h.jobs.push({ id: 'j', account_id: ACC1, status: 'failed', created_at: '2026-10-18T00:00:00Z', finished_at: '2026-10-18T00:10:00Z', error_message: 'apify token xyz', step_logs: [] });
    const body = await (await scan('assocViewer', ACC1)).json();
    expect(body).toMatchObject({ status: 'failed', error: 'scan_failed', currentStep: null, finishedAt: '2026-10-18T00:10:00Z' });
    expect(JSON.stringify(body)).not.toContain('apify');
  });

  it('no job: status none', async () => {
    const body = await (await scan('owner', ACC1)).json();
    expect(body).toMatchObject({ status: 'none', percent: 0, currentStep: null });
  });

  it('authorisation: other association 403, other partner 404', async () => {
    expect((await scan('assocAdmin', ACC2)).status).toBe(403);
    expect((await scan('owner', ACCX)).status).toBe(404);
    expect((await scan('otherOwner', ACC1)).status).toBe(404);
  });
});
