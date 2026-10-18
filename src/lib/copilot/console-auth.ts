/**
 * Partner console sign-in: email one-time codes (no passwords) and a signed
 * session token. Every console request comes through the partner base host
 * with the partner key, plus the console user's token.
 *
 * Enumeration safety: request-code answers the same thing, after the same
 * minimum delay, whether or not the email belongs to a console user; the email
 * itself is sent after the response. Every verify failure is the same 401.
 */
import crypto from 'node:crypto';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { redisSlidingWindowRateLimit, isRedisAvailable } from '@/lib/redis';
import { requireTenant } from './auth';
import type { Tenant } from './tenant';

export type ConsoleRole = 'owner' | 'admin' | 'viewer';

export interface ConsoleContext {
  partnerId: string;
  userId: string;
  /** null = partner staff (every association of the partner); else the one association. */
  accountId: string | null;
  role: ConsoleRole;
  /** The partner base host the request came through (e.g. `copilot-dev.test`). */
  baseHost: string;
}

export interface ConsoleTokenPayload { u: string; p: string; a: string | null; r: ConsoleRole; e: number }

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const CODE_REQUESTS_PER_WINDOW = 5;
export const CODE_REQUEST_WINDOW_MS = 15 * 60 * 1000;
export const MIN_RESPONSE_MS = 400;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_SECRET_CHARS = 32;

const ROLES: ConsoleRole[] = ['owner', 'admin', 'viewer'];
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const log = (...a: unknown[]) => console.error('[copilot/console-auth]', ...a);

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/** Null when unset or too short to be a real secret: callers refuse to issue tokens then. */
export function consoleSecret(): string | null {
  const s = process.env.CONSOLE_SESSION_SECRET?.trim();
  return s && s.length >= MIN_SECRET_CHARS ? s : null;
}

export function generateLoginCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Salted with the user id so equal codes of two users never share a hash. */
export function hashLoginCode(userId: string, code: string): string {
  return crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const hmac = (body: string, secret: string) => crypto.createHmac('sha256', secret).update(body).digest();

export function signConsoleToken(p: ConsoleTokenPayload, secret: string): string {
  const body = b64(JSON.stringify(p));
  return `${body}.${hmac(body, secret).toString('base64url')}`;
}

export function verifyConsoleToken(token: unknown, secret: string, now = Date.now()): ConsoleTokenPayload | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = hmac(parts[0], secret);
  const given = Buffer.from(parts[1], 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let p: any;
  try { p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return null; }
  if (!p || typeof p.u !== 'string' || typeof p.p !== 'string' || !(p.a === null || typeof p.a === 'string')) return null;
  if (!ROLES.includes(p.r) || typeof p.e !== 'number' || !Number.isFinite(p.e) || p.e <= now) return null;
  return { u: p.u, p: p.p, a: p.a, r: p.r, e: p.e };
}

export const canManage = (ctx: Pick<ConsoleContext, 'role'>) => ctx.role === 'owner' || ctx.role === 'admin';
export const canSeeAccount = (ctx: Pick<ConsoleContext, 'accountId'>, accountId: string) =>
  ctx.accountId === null || ctx.accountId === accountId;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves no sooner than `min` ms after `startedAt`, so every outcome takes the same time. */
export async function holdUntil(startedAt: number, min = MIN_RESPONSE_MS, now = Date.now) {
  const left = startedAt + min - now();
  if (left > 0) await sleep(left);
}

function partnerFrom(): string | null {
  const sendFrom = process.env.GMAIL_SEND_FROM?.trim();
  return sendFrom ? `"Multiview" <${sendFrom}>` : null;
}

export function loginCodeEmail(code: string): { subject: string; html: string } {
  return {
    subject: 'Your sign-in code',
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0B1B2B">`
      + `<p>Your Multiview console sign-in code is:</p>`
      + `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>`
      + `<p>It expires in 10 minutes. If you did not ask for it, you can ignore this email.</p></div>`,
  };
}

export interface ConsoleAuthDeps {
  db: any;
  send: typeof sendEmail;
  limiter: typeof redisSlidingWindowRateLimit;
  available: () => boolean;
  now: () => number;
}

export function defaultConsoleAuthDeps(): ConsoleAuthDeps {
  return { db: supabase, send: sendEmail, limiter: redisSlidingWindowRateLimit, available: isRedisAvailable, now: () => Date.now() };
}

/**
 * Creates a code for an active console user of this partner and returns the
 * delivery to run after the response, or null when nothing is to be sent
 * (unknown email, rate limited, limiter down, DB failure). The caller answers
 * the same in every case.
 */
export async function requestLoginCode(
  input: { partnerId: string; email: string },
  deps: Partial<ConsoleAuthDeps> = {},
): Promise<(() => Promise<void>) | null> {
  const d = { ...defaultConsoleAuthDeps(), ...deps };
  const { partnerId, email } = input;

  // Rate limit every address alike (known or not), so the limiter reveals nothing either.
  let rl: Awaited<ReturnType<typeof redisSlidingWindowRateLimit>> = null;
  try {
    if (d.available()) {
      rl = await d.limiter({
        key: `rl:copilot:console:code:${partnerId}:${crypto.createHash('sha256').update(email).digest('hex')}`,
        limit: CODE_REQUESTS_PER_WINDOW, windowMs: CODE_REQUEST_WINDOW_MS, identifier: crypto.randomUUID(),
      });
    }
  } catch (e) {
    log('limiter threw', e);
  }
  if (!rl) { log('code limiter unavailable, not sending'); return null; }
  if (!rl.allowed) { log('code requests capped for an address'); return null; }

  const { data: user, error: uErr } = await d.db.from('console_users').select('id, partner_id, status')
    .eq('partner_id', partnerId).eq('email', email).maybeSingle();
  if (uErr) { log('user lookup failed', uErr.message); return null; }
  if (!user || user.status !== 'active' || user.partner_id !== partnerId) return null;

  const nowIso = new Date(d.now()).toISOString();
  // One live code per user: a new request retires every unused earlier code.
  const { error: invErr } = await d.db.from('console_login_codes').update({ used_at: nowIso })
    .eq('console_user_id', user.id).is('used_at', null);
  if (invErr) { log('code invalidate failed', invErr.message); return null; }

  const code = generateLoginCode();
  const { error: insErr } = await d.db.from('console_login_codes').insert({
    console_user_id: user.id,
    code_hash: hashLoginCode(user.id, code),
    expires_at: new Date(d.now() + CODE_TTL_MS).toISOString(),
    attempts: 0,
  });
  if (insErr) { log('code insert failed', insErr.message); return null; }

  return async () => {
    const from = partnerFrom();
    // Without a configured sender the mail would go out under the default (vendor) name: never.
    if (!from) { log('GMAIL_SEND_FROM not set, sign-in code not sent'); return; }
    try {
      const r = await d.send({ to: email, from, ...loginCodeEmail(code) });
      if (!r?.success) log('sign-in code email failed', r?.error);
    } catch (e) {
      log('sign-in code email threw', e);
    }
  };
}

export type VerifyResult =
  | { ok: true; token: string; user: { id: string; email: string; name: string; role: ConsoleRole; accountId: string | null } }
  | { ok: false; status: 401 | 503; error: 'invalid_code' | 'console_unavailable' };

const INVALID: VerifyResult = { ok: false, status: 401, error: 'invalid_code' };

export async function verifyLoginCode(
  input: { partnerId: string; email: string; code: string },
  deps: Partial<ConsoleAuthDeps> & { secret?: string | null } = {},
): Promise<VerifyResult> {
  const d = { ...defaultConsoleAuthDeps(), ...deps };
  const secret = deps.secret !== undefined ? deps.secret : consoleSecret();
  if (!secret) { log('CONSOLE_SESSION_SECRET missing, refusing to sign in'); return { ok: false, status: 503, error: 'console_unavailable' }; }
  if (!/^\d{6}$/.test(input.code)) return INVALID;

  const { data: user, error: uErr } = await d.db.from('console_users').select('id, partner_id, account_id, email, name, role, status')
    .eq('partner_id', input.partnerId).eq('email', input.email).maybeSingle();
  if (uErr) { log('user lookup failed', uErr.message); return INVALID; }
  if (!user || user.status !== 'active' || user.partner_id !== input.partnerId || !ROLES.includes(user.role)) return INVALID;

  const { data: rows, error: cErr } = await d.db.from('console_login_codes').select('id, code_hash, expires_at, attempts, used_at')
    .eq('console_user_id', user.id).is('used_at', null).order('created_at', { ascending: false }).limit(1);
  if (cErr) { log('code lookup failed', cErr.message); return INVALID; }
  const row = Array.isArray(rows) ? rows[0] : null;
  const now = d.now();
  if (!row || row.used_at || Date.parse(row.expires_at) <= now) return INVALID;
  const attempts = Number(row.attempts) || 0;
  if (attempts >= MAX_CODE_ATTEMPTS) return INVALID;

  // Count the attempt before comparing, with a compare-and-set on the counter: parallel
  // guesses cannot share one attempt, so at most MAX_CODE_ATTEMPTS guesses are ever evaluated.
  const { data: counted, error: aErr } = await d.db.from('console_login_codes').update({ attempts: attempts + 1 })
    .eq('id', row.id).eq('attempts', attempts).is('used_at', null).select('id');
  if (aErr) { log('attempt count failed', aErr.message); return INVALID; }
  if (!Array.isArray(counted) || counted.length !== 1) return INVALID;

  const expected = Buffer.from(String(row.code_hash), 'hex');
  const given = Buffer.from(hashLoginCode(user.id, input.code), 'hex');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return INVALID;

  // Single use: only one verify can mark the code used.
  const { data: used, error: usedErr } = await d.db.from('console_login_codes').update({ used_at: new Date(now).toISOString() })
    .eq('id', row.id).is('used_at', null).select('id');
  if (usedErr) { log('code consume failed', usedErr.message); return INVALID; }
  if (!Array.isArray(used) || used.length !== 1) return INVALID;

  const { error: llErr } = await d.db.from('console_users').update({ last_login_at: new Date(now).toISOString() }).eq('id', user.id);
  if (llErr) log('last_login_at update failed', llErr.message);

  const accountId: string | null = user.account_id ?? null;
  const token = signConsoleToken({ u: user.id, p: user.partner_id, a: accountId, r: user.role, e: now + SESSION_TTL_MS }, secret);
  return { ok: true, token, user: { id: user.id, email: user.email, name: user.name ?? '', role: user.role, accountId } };
}

const refuse = (status: number, error: string) => Response.json({ error }, { status });

/** Partner key + partner-level host (never an association host). */
export async function requirePartnerHost(req: Request): Promise<Tenant | Response> {
  const t = await requireTenant(req, { association: false });
  if (t instanceof Response) return t;
  if (t.accountId !== null) return refuse(400, 'partner_host_required');
  return t;
}

/**
 * Partner key + partner host + a valid console token whose user is still active,
 * still this partner's, and still scoped the same. Role and scope come from the
 * row, so a demotion or a disable takes effect on the next request.
 */
export async function requireConsole(
  req: Request,
  deps: { db?: any; secret?: string | null; now?: () => number } = {},
): Promise<ConsoleContext | Response> {
  const t = await requirePartnerHost(req);
  if (t instanceof Response) return t;
  const secret = deps.secret !== undefined ? deps.secret : consoleSecret();
  if (!secret) { log('CONSOLE_SESSION_SECRET missing'); return refuse(503, 'console_unavailable'); }
  const raw = req.headers.get('x-console-token');
  if (!raw) return refuse(401, 'missing_console_token');
  const p = verifyConsoleToken(raw, secret, (deps.now ?? Date.now)());
  if (!p || p.p !== t.partnerId) return refuse(401, 'invalid_console_token');

  const db = deps.db ?? supabase;
  const { data: user, error } = await db.from('console_users').select('id, partner_id, account_id, role, status').eq('id', p.u).maybeSingle();
  if (error) { log('console user read failed', error.message); return refuse(503, 'unavailable'); }
  if (!user || user.status !== 'active' || user.partner_id !== t.partnerId || (user.account_id ?? null) !== p.a || !ROLES.includes(user.role)) {
    return refuse(401, 'invalid_console_token');
  }
  return { partnerId: t.partnerId, userId: user.id, accountId: user.account_id ?? null, role: user.role, baseHost: t.host };
}
