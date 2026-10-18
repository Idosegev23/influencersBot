// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryDb, type MemoryDb } from './memory-db';

const h = vi.hoisted(() => ({ db: null as any, sent: [] as any[], afters: [] as Array<() => Promise<void>> }));
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_t, k) => (h.db as any)[k] }) }));
vi.mock('@/lib/email', () => ({ sendEmail: async (o: any) => { h.sent.push(o); return { success: true }; } }));
vi.mock('@/lib/redis', () => ({
  redisSlidingWindowRateLimit: async () => ({ allowed: true, remaining: 1, resetAt: 0, retryAfterMs: 0 }),
  isRedisAvailable: () => true,
}));
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => { h.afters.push(fn); } }));
const requireTenant = vi.fn();
vi.mock('@/lib/copilot/auth', () => ({ requireTenant: (...a: any[]) => requireTenant(...a) }));

import { POST as requestCode } from '@/app/api/partner/v1/console/auth/request-code/route';
import { POST as verify } from '@/app/api/partner/v1/console/auth/verify/route';
import { MIN_RESPONSE_MS } from '@/lib/copilot/console-auth';

const P = 'partner-A';
let db: MemoryDb;

const req = (path: string, body: any) => new Request(`http://x/api/partner/v1/console/auth/${path}`, { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  process.env.CONSOLE_SESSION_SECRET = 'k'.repeat(48);
  process.env.GMAIL_SEND_FROM = 'mailbox@example.test';
  db = memoryDb({
    console_users: [{ id: 'u1', partner_id: P, account_id: null, email: 'owner@mv.test', name: 'Olive', role: 'owner', status: 'active' }],
    console_login_codes: [],
  });
  h.db = db;
  h.sent = [];
  h.afters = [];
  requireTenant.mockReset();
  requireTenant.mockResolvedValue({ partnerId: P, accountId: null, host: 'copilot-dev.test' });
});

async function timed(p: Promise<Response>) {
  const t0 = Date.now();
  const res = await p;
  return { res, ms: Date.now() - t0, body: await res.text(), headers: [...res.headers.entries()] };
}

describe('POST console/auth/request-code', () => {
  it('answers identically for a known and an unknown address, both after the minimum delay', async () => {
    const known = await timed(requestCode(req('request-code', { email: 'Owner@MV.test' })));
    const unknown = await timed(requestCode(req('request-code', { email: 'nobody@mv.test' })));
    expect(known.res.status).toBe(200);
    expect(unknown.res.status).toBe(200);
    expect(known.body).toBe('{"ok":true}');
    expect(unknown.body).toBe(known.body);
    expect(unknown.headers).toEqual(known.headers);
    expect(known.ms).toBeGreaterThanOrEqual(MIN_RESPONSE_MS - 5);
    expect(unknown.ms).toBeGreaterThanOrEqual(MIN_RESPONSE_MS - 5);
    // The email is sent after the response, and only for the known address.
    expect(h.sent).toHaveLength(0);
    expect(h.afters).toHaveLength(1);
    await h.afters[0]();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].to).toBe('owner@mv.test');
  });

  it('asks for a partner host (never an association host)', async () => {
    requireTenant.mockResolvedValue({ partnerId: P, accountId: 'acc-1', host: 'aba.copilot-dev.test' });
    const res = await requestCode(req('request-code', { email: 'owner@mv.test' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('partner_host_required');
    expect(requireTenant).toHaveBeenCalledWith(expect.anything(), { association: false });
  });

  it('400 for a malformed email', async () => {
    expect((await requestCode(req('request-code', { email: 'nope' }))).status).toBe(400);
  });

  it('503 and no code without the session secret', async () => {
    delete process.env.CONSOLE_SESSION_SECRET;
    const res = await requestCode(req('request-code', { email: 'owner@mv.test' }));
    expect(res.status).toBe(503);
    expect(db.tables.console_login_codes).toHaveLength(0);
  });
});

describe('POST console/auth/verify', () => {
  async function code(): Promise<string> {
    await requestCode(req('request-code', { email: 'owner@mv.test' }));
    await h.afters.pop()!();
    return /(\d{6})/.exec(h.sent[h.sent.length - 1].html)![1];
  }

  it('returns the token and user for the right code', async () => {
    const c = await code();
    const res = await verify(req('verify', { email: 'owner@mv.test', code: c }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ id: 'u1', email: 'owner@mv.test', name: 'Olive', role: 'owner', accountId: null });
    expect(typeof body.token).toBe('string');
  });

  it('every failure is the same 401 invalid_code, after the minimum delay', async () => {
    const c = await code();
    const wrong = c === '000000' ? '111111' : '000000';
    const a = await timed(verify(req('verify', { email: 'owner@mv.test', code: wrong })));
    const b = await timed(verify(req('verify', { email: 'nobody@mv.test', code: wrong })));
    const m = await timed(verify(req('verify', { email: 'bad', code: 'x' })));
    for (const r of [a, b, m]) {
      expect(r.res.status).toBe(401);
      expect(r.body).toBe('{"error":"invalid_code"}');
      expect(r.ms).toBeGreaterThanOrEqual(MIN_RESPONSE_MS - 5);
    }
  });
});
