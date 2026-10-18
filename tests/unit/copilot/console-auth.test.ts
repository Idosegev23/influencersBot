// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/redis', () => ({ redisSlidingWindowRateLimit: vi.fn(), isRedisAvailable: () => true }));
const requireTenant = vi.fn();
vi.mock('@/lib/copilot/auth', () => ({ requireTenant: (...a: any[]) => requireTenant(...a) }));

import {
  requestLoginCode, verifyLoginCode, signConsoleToken, verifyConsoleToken, requireConsole, canManage, canSeeAccount,
  hashLoginCode, normalizeEmail, MAX_CODE_ATTEMPTS, SESSION_TTL_MS, CODE_TTL_MS,
} from '@/lib/copilot/console-auth';
import { memoryDb, type MemoryDb } from './memory-db';

const SECRET = 's'.repeat(40);
const P = 'partner-A';
const PARTNER_T = { partnerId: P, accountId: null, host: 'copilot-dev.test' };

let db: MemoryDb;
let now: number;
let sent: any[];
let allowed: boolean;
const limiter = vi.fn(async () => (allowed ? { allowed: true, remaining: 1, resetAt: 0, retryAfterMs: 0 } : { allowed: false, remaining: 0, resetAt: 0, retryAfterMs: 1000 }));
const send = vi.fn(async (o: any) => { sent.push(o); return { success: true }; });
const deps = () => ({ db, send, limiter, available: () => true, now: () => now });

beforeEach(() => {
  now = Date.parse('2026-10-18T12:00:00Z');
  sent = [];
  allowed = true;
  limiter.mockClear();
  send.mockClear();
  process.env.COPILOT_SEND_FROM = 'mailbox@example.test';
  process.env.GMAIL_SEND_FROM = 'vendor-mailbox@platform.test';
  db = memoryDb({
    console_users: [
      { id: 'u-owner', partner_id: P, account_id: null, email: 'owner@mv.test', name: 'Olive', role: 'owner', status: 'active' },
      { id: 'u-off', partner_id: P, account_id: null, email: 'off@mv.test', name: 'Off', role: 'owner', status: 'disabled' },
      { id: 'u-assoc', partner_id: P, account_id: 'acc-1', email: 'staff@aba.test', name: 'Sam', role: 'admin', status: 'active' },
      { id: 'u-other', partner_id: 'partner-B', account_id: null, email: 'owner@mv.test', name: 'Other', role: 'owner', status: 'active' },
    ],
    console_login_codes: [],
  });
  requireTenant.mockReset();
  requireTenant.mockResolvedValue(PARTNER_T);
});

/** Requests a code and returns it, reading it from the sent email. */
async function codeFor(email: string): Promise<string> {
  const deliver = await requestLoginCode({ partnerId: P, email }, deps());
  expect(deliver).toBeTypeOf('function');
  await deliver!();
  const m = /(\d{6})/.exec(sent[sent.length - 1].html);
  return m![1];
}

describe('normalizeEmail', () => {
  it('lowercases and trims, refuses junk', () => {
    expect(normalizeEmail('  Owner@MV.test ')).toBe('owner@mv.test');
    expect(normalizeEmail('nope')).toBeNull();
    expect(normalizeEmail('a@b.c,d@e.f')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe('requestLoginCode', () => {
  it('creates a hashed, 10-minute code for an active user and emails it from Multiview', async () => {
    const code = await codeFor('owner@mv.test');
    const row = db.tables.console_login_codes[0];
    expect(row.console_user_id).toBe('u-owner');
    expect(row.code_hash).toBe(hashLoginCode('u-owner', code));
    expect(row.code_hash).not.toContain(code);
    expect(Date.parse(row.expires_at) - now).toBe(CODE_TTL_MS);
    expect(sent[0]).toMatchObject({ to: 'owner@mv.test', from: '"Multiview" <mailbox@example.test>', impersonate: 'mailbox@example.test', subject: 'Your sign-in code' });
    expect(JSON.stringify(sent[0])).not.toContain('platform.test');
    expect(JSON.stringify(sent[0]).toLowerCase()).not.toMatch(/bestie|influencerbot|ldrs|imai/);
  });

  it('does no database work before the response: the deferred delivery does it all', async () => {
    const deliver = await requestLoginCode({ partnerId: P, email: 'owner@mv.test' }, deps());
    expect(deliver).toBeTypeOf('function');
    expect(db.log).toHaveLength(0);
    expect(db.tables.console_login_codes).toHaveLength(0);
    await deliver!();
    expect(db.tables.console_login_codes).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('unknown, disabled or other-partner addresses get the same deferred delivery, which writes and sends nothing', async () => {
    for (const [partnerId, email] of [[P, 'nobody@mv.test'], [P, 'off@mv.test'], ['partner-C', 'owner@mv.test']]) {
      const deliver = await requestLoginCode({ partnerId, email }, deps());
      expect(deliver).toBeTypeOf('function');
      await deliver!();
    }
    expect(db.tables.console_login_codes).toHaveLength(0);
    expect(sent).toHaveLength(0);
    // presence: the known address does get one
    await codeFor('owner@mv.test');
    expect(db.tables.console_login_codes).toHaveLength(1);
  });

  it('rate-limits unknown addresses too, and asks the limiter not to record refusals', async () => {
    await requestLoginCode({ partnerId: P, email: 'nobody@mv.test' }, deps());
    expect(limiter).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, windowMs: 15 * 60 * 1000, recordRejected: false }));
    // the key never carries the raw address
    expect((limiter.mock.calls[0] as any)[0].key).not.toContain('nobody');
  });

  it('sends nothing when capped or when the limiter is down (fail closed)', async () => {
    allowed = false;
    expect(await requestLoginCode({ partnerId: P, email: 'owner@mv.test' }, deps())).toBeNull();
    expect(await requestLoginCode({ partnerId: P, email: 'owner@mv.test' }, { ...deps(), available: () => false })).toBeNull();
    expect(db.tables.console_login_codes).toHaveLength(0);
  });

  it('a capped request does not retire the live code', async () => {
    const code = await codeFor('owner@mv.test');
    allowed = false;
    expect(await requestLoginCode({ partnerId: P, email: 'owner@mv.test' }, deps())).toBeNull();
    expect(db.tables.console_login_codes[0].used_at ?? null).toBeNull();
    expect((await verifyLoginCode({ partnerId: P, email: 'owner@mv.test', code }, { ...deps(), secret: SECRET })).ok).toBe(true);
  });

  it('a new request retires the previous unused code', async () => {
    const first = await codeFor('owner@mv.test');
    const second = await codeFor('owner@mv.test');
    expect((await verifyLoginCode({ partnerId: P, email: 'owner@mv.test', code: first }, { ...deps(), secret: SECRET })).ok).toBe(first === second);
    expect((await verifyLoginCode({ partnerId: P, email: 'owner@mv.test', code: second }, { ...deps(), secret: SECRET })).ok).toBe(true);
  });

  it('never sends without COPILOT_SEND_FROM, even when the platform mailbox is set', async () => {
    delete process.env.COPILOT_SEND_FROM;
    process.env.GMAIL_SEND_FROM = 'vendor-mailbox@platform.test';
    const d = await requestLoginCode({ partnerId: P, email: 'owner@mv.test' }, deps());
    await d!();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('verifyLoginCode', () => {
  const verify = (code: string, email = 'owner@mv.test', extra: any = {}) =>
    verifyLoginCode({ partnerId: P, email, code }, { ...deps(), secret: SECRET, ...extra });

  it('signs in with the right code: token, user, last_login_at, code consumed', async () => {
    const code = await codeFor('owner@mv.test');
    const r = await verify(code);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.user).toEqual({ id: 'u-owner', email: 'owner@mv.test', name: 'Olive', role: 'owner', accountId: null });
    expect(verifyConsoleToken(r.token, SECRET, now)).toEqual({ u: 'u-owner', p: P, a: null, r: 'owner', e: now + SESSION_TTL_MS });
    expect(db.tables.console_users.find((u) => u.id === 'u-owner')!.last_login_at).toBeTruthy();
    expect((await verify(code)).ok).toBe(false); // single use
  });

  it('an association-scoped user gets a token carrying the account', async () => {
    const code = await codeFor('staff@aba.test');
    const r = await verify(code, 'staff@aba.test');
    expect(r.ok && r.user.accountId).toBe('acc-1');
    expect(r.ok && verifyConsoleToken(r.token, SECRET, now)!.a).toBe('acc-1');
  });

  it('the 6th attempt fails even with the right code', async () => {
    const code = await codeFor('owner@mv.test');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) expect(await verify(wrong)).toEqual({ ok: false, status: 401, error: 'invalid_code' });
    expect(await verify(code)).toEqual({ ok: false, status: 401, error: 'invalid_code' });
  });

  it('the 5th attempt still works', async () => {
    const code = await codeFor('owner@mv.test');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_CODE_ATTEMPTS - 1; i++) await verify(wrong);
    expect((await verify(code)).ok).toBe(true);
  });

  it('parallel guesses cannot share an attempt: exactly 5 are counted, then the right code fails too', async () => {
    const code = await codeFor('owner@mv.test');
    const wrong = code === '000000' ? '111111' : '000000';
    const results = await Promise.all(Array.from({ length: 20 }, () => verify(wrong)));
    expect(results.every((r) => r.ok === false)).toBe(true);
    expect(db.tables.console_login_codes[0].attempts).toBe(MAX_CODE_ATTEMPTS);
    expect(await verify(code)).toEqual({ ok: false, status: 401, error: 'invalid_code' });
  });

  it('an expired code fails with the same error', async () => {
    const code = await codeFor('owner@mv.test');
    now += CODE_TTL_MS + 1;
    expect(await verify(code)).toEqual({ ok: false, status: 401, error: 'invalid_code' });
  });

  it('unknown, disabled and other-partner users fail with the same error', async () => {
    expect(await verify('123456', 'nobody@mv.test')).toEqual({ ok: false, status: 401, error: 'invalid_code' });
    expect(await verify('123456', 'off@mv.test')).toEqual({ ok: false, status: 401, error: 'invalid_code' });
    const code = await codeFor('owner@mv.test');
    expect(await verifyLoginCode({ partnerId: 'partner-C', email: 'owner@mv.test', code }, { ...deps(), secret: SECRET }))
      .toEqual({ ok: false, status: 401, error: 'invalid_code' });
  });

  it('a user disabled after requesting a code cannot use it', async () => {
    const code = await codeFor('owner@mv.test');
    db.tables.console_users.find((u) => u.id === 'u-owner')!.status = 'disabled';
    expect((await verify(code)).ok).toBe(false);
  });

  it('a malformed code fails without counting', async () => {
    await codeFor('owner@mv.test');
    expect((await verify('12ab56')).ok).toBe(false);
    expect(db.tables.console_login_codes[0].attempts).toBe(0);
  });

  it('refuses to sign in without a session secret', async () => {
    const code = await codeFor('owner@mv.test');
    expect(await verify(code, 'owner@mv.test', { secret: null })).toEqual({ ok: false, status: 503, error: 'console_unavailable' });
  });
});

describe('console token', () => {
  const p = { u: 'u-owner', p: P, a: null, r: 'owner' as const, e: Date.now() + 1000 };
  it('round-trips', () => expect(verifyConsoleToken(signConsoleToken(p, SECRET), SECRET)).toEqual(p));
  it('rejects a tampered payload', () => {
    const [body, sig] = signConsoleToken(p, SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ ...p, r: 'owner', a: null, u: 'u-x' })).toString('base64url');
    expect(verifyConsoleToken(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyConsoleToken(`${body}.${sig.slice(0, -2)}xx`, SECRET)).toBeNull();
    expect(verifyConsoleToken(signConsoleToken(p, 'x'.repeat(40)), SECRET)).toBeNull();
    expect(verifyConsoleToken('garbage', SECRET)).toBeNull();
  });
  it('rejects an expired token', () => expect(verifyConsoleToken(signConsoleToken({ ...p, e: Date.now() - 1 }, SECRET), SECRET)).toBeNull());
  it('rejects an unknown role', () => expect(verifyConsoleToken(signConsoleToken({ ...p, r: 'root' as any }, SECRET), SECRET)).toBeNull());
});

describe('requireConsole', () => {
  const tok = (o: Partial<{ u: string; p: string; a: string | null; r: any; e: number }> = {}) =>
    signConsoleToken({ u: 'u-owner', p: P, a: null, r: 'owner', e: Date.now() + 60_000, ...o }, SECRET);
  const req = (token?: string) => new Request('http://x/api/partner/v1/console/associations', { headers: token ? { 'x-console-token': token } : {} });
  const run = (token?: string) => requireConsole(req(token), { db, secret: SECRET });

  it('returns the context for a valid token on the partner host', async () => {
    expect(await run(tok())).toEqual({ partnerId: P, userId: 'u-owner', accountId: null, role: 'owner', baseHost: 'copilot-dev.test' });
  });

  it('takes role from the row (a demotion applies at once)', async () => {
    db.tables.console_users.find((u) => u.id === 'u-owner')!.role = 'viewer';
    expect(((await run(tok())) as any).role).toBe('viewer');
  });

  it('refuses an association host', async () => {
    requireTenant.mockResolvedValue({ partnerId: P, accountId: 'acc-1', host: 'aba.copilot-dev.test' });
    const r = (await run(tok())) as Response;
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('partner_host_required');
  });

  it('passes through a tenant refusal, uncacheable', async () => {
    requireTenant.mockResolvedValue(Response.json({ error: 'invalid_key' }, { status: 401 }));
    const r = (await run(tok())) as Response;
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('invalid_key');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    ['missing', undefined, 'missing_console_token'],
    ['tampered', 'abc.def', 'invalid_console_token'],
  ])('refuses a %s token', async (_n, t, err) => {
    const r = (await run(t)) as Response;
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe(err);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses an expired token', async () => {
    expect(((await run(tok({ e: Date.now() - 1 }))) as Response).status).toBe(401);
  });

  it('refuses a token of another partner (even with a real user id)', async () => {
    expect(((await run(tok({ u: 'u-other', p: 'partner-B' }))) as Response).status).toBe(401);
  });

  it('refuses a disabled user', async () => {
    expect(((await run(tok({ u: 'u-off' }))) as Response).status).toBe(401);
  });

  it('refuses when the user scope changed since sign-in', async () => {
    expect(((await run(tok({ u: 'u-assoc', a: null, r: 'admin' }))) as Response).status).toBe(401);
    expect(((await run(tok({ u: 'u-assoc', a: 'acc-1', r: 'admin' }))) as any).accountId).toBe('acc-1');
  });

  it('answers 503 without a secret', async () => {
    const r = (await requireConsole(req(tok()), { db, secret: null })) as Response;
    expect(r.status).toBe(503);
  });
});

describe('canManage / canSeeAccount', () => {
  it('only owner and admin manage', () => {
    expect(canManage({ role: 'owner' })).toBe(true);
    expect(canManage({ role: 'admin' })).toBe(true);
    expect(canManage({ role: 'viewer' })).toBe(false);
  });
  it('partner staff see all; association staff only theirs', () => {
    expect(canSeeAccount({ accountId: null }, 'acc-2')).toBe(true);
    expect(canSeeAccount({ accountId: 'acc-1' }, 'acc-1')).toBe(true);
    expect(canSeeAccount({ accountId: 'acc-1' }, 'acc-2')).toBe(false);
  });
});
