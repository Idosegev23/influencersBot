/**
 * Per-account support agent auth.
 *
 * Login is name-based: first_name + last_name + password (no email).
 * Each agent belongs to one account (via support_agents.account_id).
 *
 * Sessions are stored in a per-account signed cookie:
 *   agent_session_<accountUsername>  =  <payloadB64>.<hmacB64>
 *
 * Password hashing uses Node's built-in scrypt (no extra dep).
 */

import { cookies } from 'next/headers';
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { supabase } from '@/lib/supabase';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const COOKIE_PREFIX = 'agent_session_';
const SESSION_TTL_DAYS = 30;
const SCRYPT_KEYLEN = 64;

export type AgentSession = {
  agent_id: string;
  account_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  is_admin: boolean;
  account_username: string;
};

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function getSessionSecret(): string {
  const s = process.env.AGENT_SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || '';
  if (!s) {
    throw new Error('AGENT_SESSION_SECRET (or SUPABASE_SECRET_KEY) must be set');
  }
  return s;
}

function sign(payload: string): string {
  return b64urlEncode(createHmac('sha256', getSessionSecret()).update(payload).digest());
}

function verifySig(payload: string, sig: string): boolean {
  const expected = sign(payload);
  if (expected.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

// ─── Password hashing ───────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored?.startsWith('scrypt$')) return false;
  const [, saltB64, hashB64] = stored.split('$');
  if (!saltB64 || !hashB64) return false;
  const salt = b64urlDecode(saltB64);
  const expected = b64urlDecode(hashB64);
  const got = await scrypt(password, salt, expected.length);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

// ─── Cookie name helper ─────────────────────────────────────────────────────

export function cookieNameFor(accountUsername: string): string {
  // matches the legacy `influencer_session_<username>` pattern; usernames may
  // contain dots (e.g., labeaute.israel) which are valid in cookie names.
  return COOKIE_PREFIX + accountUsername;
}

// ─── Session encode / decode ────────────────────────────────────────────────

type SessionPayload = {
  v: 1;
  aid: string; // agent_id
  acc: string; // account_id
  fn: string;
  ln: string;
  adm: boolean;
  un: string; // account username
  iat: number; // issued at (unix sec)
  exp: number; // expires (unix sec)
};

function encodeSession(p: SessionPayload): string {
  const payload = b64urlEncode(Buffer.from(JSON.stringify(p), 'utf8'));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function decodeSession(token: string): SessionPayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!verifySig(payloadB64, sig)) return null;
  try {
    const obj = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as SessionPayload;
    if (obj.v !== 1) return null;
    if (obj.exp < Math.floor(Date.now() / 1000)) return null;
    return obj;
  } catch {
    return null;
  }
}

// ─── Login / Logout (server-side, sets cookies) ─────────────────────────────

export async function loginAgent(
  accountUsername: string,
  firstName: string,
  lastName: string,
  password: string,
): Promise<{ ok: true; session: AgentSession } | { ok: false; reason: 'not_found' | 'bad_password' | 'inactive' | 'no_account' }> {
  const fn = firstName.trim();
  const ln = lastName.trim();
  if (!fn || !ln || !password) return { ok: false, reason: 'not_found' };

  // Resolve account_id from username
  const { data: acc } = await supabase
    .from('accounts')
    .select('id')
    .eq('config->>username', accountUsername)
    .maybeSingle();
  if (!acc) return { ok: false, reason: 'no_account' };

  const { data: agent } = await supabase
    .from('support_agents')
    .select('id, account_id, first_name, last_name, password_hash, is_admin, is_active')
    .eq('account_id', acc.id)
    .eq('first_name', fn)
    .eq('last_name', ln)
    .maybeSingle();
  if (!agent) return { ok: false, reason: 'not_found' };
  if (!agent.is_active) return { ok: false, reason: 'inactive' };

  const ok = await verifyPassword(password, agent.password_hash);
  if (!ok) return { ok: false, reason: 'bad_password' };

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    aid: agent.id,
    acc: agent.account_id,
    fn: agent.first_name,
    ln: agent.last_name,
    adm: !!agent.is_admin,
    un: accountUsername,
    iat: now,
    exp: now + SESSION_TTL_DAYS * 24 * 60 * 60,
  };
  const token = encodeSession(payload);

  const cookieStore = await cookies();
  cookieStore.set(cookieNameFor(accountUsername), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });

  // fire-and-forget last_login update
  supabase
    .from('support_agents')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', agent.id)
    .then(({ error }) => { if (error) console.warn('[agent-auth] last_login update failed:', error.message); });

  return {
    ok: true,
    session: {
      agent_id: agent.id,
      account_id: agent.account_id,
      first_name: agent.first_name,
      last_name: agent.last_name,
      display_name: `${agent.first_name} ${agent.last_name}`,
      is_admin: !!agent.is_admin,
      account_username: accountUsername,
    },
  };
}

export async function logoutAgent(accountUsername: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(cookieNameFor(accountUsername));
}

// ─── Session readers ────────────────────────────────────────────────────────

export async function getAgentSession(accountUsername: string): Promise<AgentSession | null> {
  const cookieStore = await cookies();
  const c = cookieStore.get(cookieNameFor(accountUsername));
  if (!c?.value) return null;
  const p = decodeSession(c.value);
  if (!p) return null;
  return {
    agent_id: p.aid,
    account_id: p.acc,
    first_name: p.fn,
    last_name: p.ln,
    display_name: `${p.fn} ${p.ln}`,
    is_admin: p.adm,
    account_username: p.un,
  };
}

/** Read any agent session present on the request (for routes that can match
 *  multiple accounts). Returns the first valid one. */
export async function getAnyAgentSession(): Promise<AgentSession | null> {
  const cookieStore = await cookies();
  const all = cookieStore.getAll();
  for (const c of all) {
    if (!c.name.startsWith(COOKIE_PREFIX)) continue;
    const p = decodeSession(c.value);
    if (!p) continue;
    return {
      agent_id: p.aid,
      account_id: p.acc,
      first_name: p.fn,
      last_name: p.ln,
      display_name: `${p.fn} ${p.ln}`,
      is_admin: p.adm,
      account_username: p.un,
    };
  }
  return null;
}
