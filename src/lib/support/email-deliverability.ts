/**
 * Does this address exist, and can we actually deliver to it?
 *
 * `realEmailOrNull` in ./contact answers a different question — is this the SHAPE of an
 * address — and it must keep answering only that, because a dozen synchronous callers
 * depend on it. This module sits above it.
 *
 * The distinction is the whole point. `lililevy42@gmail.com.il` is shape-perfect: `.il` is
 * a real TLD, and every regex in this repo accepts it. What was wrong is that the domain
 * does not exist. No regex can see that.
 *
 * Four failure classes were measured in production (see the design doc,
 * docs/superpowers/specs/2026-08-31-email-deliverability-design.md §2.2), and no single
 * check covers more than one of them:
 *
 *   invisible bidi suffix   gmail.com<U+202C>          -> normalizeEmail
 *   live typosquat          gamil.com, gnail.com          -> EXPLICIT_SQUAT_MAP  (these HAVE MX)
 *   dead domain             gmail.com.il, gmail.con       -> probeMx
 *   good domain, bad inbox  (invisible until it bounces)  -> inbound-email.ts
 */

import dns from 'node:dns/promises';
import { realEmailOrNull, realPhoneOrNull } from '@/lib/support/contact';
import { redisGet, redisSet } from '@/lib/redis';

export type EmailVerdict =
  | { status: 'ok'; email: string }
  | { status: 'typo'; email: string; suggestion: string }
  | { status: 'undeliverable'; email: string; reason: 'no_mx' | 'nxdomain' | 'bounced'; suggestion?: string }
  | { status: 'unknown'; email: string };

// ── L0: normalization ──────────────────────────────────────────────────────

/**
 * Bidi and zero-width controls, written as escapes on purpose — a character class made of
 * literal invisible characters is one a linter, an editor or a careless paste can change
 * without anyone seeing, which is precisely the bug this line exists to fix.
 *
 * A Hebrew keyboard, and Hebrew text pasted around a Latin address, leave these behind
 * invisibly: U+202C (pop directional formatting) closed three real production addresses.
 * The address LOOKS right in every UI, passes every regex, and fails at DNS with a domain
 * nobody can see is different.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(INVISIBLE, '').trim().replace(/\.+$/, '');
  return realEmailOrNull(cleaned);
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

// ── L1: repair ─────────────────────────────────────────────────────────────

/**
 * Consumer mail providers. Two jobs: they are the targets of the distance check, AND
 * they are the suppression list — a domain that IS one of these is never "corrected".
 */
const PROVIDERS = [
  'gmail.com', 'googlemail.com', 'walla.co.il', 'walla.com', 'hotmail.com', 'hotmail.co.il',
  'outlook.com', 'outlook.co.il', 'live.com', 'msn.com', 'windowslive.com', 'yahoo.com',
  'yahoo.co.il', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'gmx.com',
  'mail.com', 'email.com', 'protonmail.com', 'proton.me', 'zoho.com', 'yandex.com',
  '012.net.il', 'bezeqint.net', 'netvision.net.il', 'zahav.net.il', 'inter.net.il',
  'barak.net.il', 'nana.co.il', 'nana10.co.il', 'actcom.net.il', 'trendline.co.il',
];
const PROVIDER_SET = new Set(PROVIDERS);

/**
 * Domains observed in production that are dead, or are live lookalikes.
 *
 * Every entry was verified before being added: either MX returned nothing, or the domain
 * resolves somewhere that is provably not the provider it imitates. `gamil.com` serves its
 * own MX and `gnail.com` points at a Chinese host — both deliver mail, so MX will never
 * flag them, and the map is the only thing standing between a shopper and a stranger's
 * mailbox. Never add an entry without checking MX first: `outlook.co.il` and
 * `windowslive.com` look exactly like typos and are genuinely Microsoft.
 */
export const EXPLICIT_SQUAT_MAP: Record<string, string> = {
  // gmail — dead
  'gmail.con': 'gmail.com', 'gmail.cim': 'gmail.com', 'gmail.vom': 'gmail.com',
  'gmail.comm': 'gmail.com', 'gmail.coms': 'gmail.com', 'gmail.come': 'gmail.com',
  'gmail.comn': 'gmail.com', 'gmail.comt': 'gmail.com', 'gmail.coml': 'gmail.com',
  'gmail.comtt': 'gmail.com', 'gmail.comdd': 'gmail.com', 'gmail.comcom': 'gmail.com',
  'gmail.com.com': 'gmail.com', 'gmail.com.il': 'gmail.com', 'gmail.co.m': 'gmail.com',
  'gmail.c': 'gmail.com', 'gmail.frcom': 'gmail.com', 'gmail': 'gmail.com',
  'gmai.com': 'gmail.com', 'gmai.con': 'gmail.com', 'gmal.com': 'gmail.com',
  'gmali.com': 'gmail.com', 'gmaii.com': 'gmail.com', 'gmial.com': 'gmail.com',
  'ail.com': 'gmail.com',
  // gmail — live lookalikes, MX-verified as NOT Google
  'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.co.il': 'gmail.com',
  // others
  'yahoo.con': 'yahoo.com', 'walla.com.il': 'walla.co.il', 'walla.co': 'walla.co.il',
  'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
};

/** Levenshtein, capped — we only ever care whether the distance is <= 2. */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * The correct spelling of `domain`, or null.
 *
 * The ordering here is load-bearing. Matching by edit distance alone is UNSAFE:
 * email.com, mail.com and ymail.com are each one edit from gmail.com and all three are
 * real, deliverable providers. That detector tells a mail.com customer she mistyped her
 * own address.
 *
 * So the distance check never DECIDES a domain is wrong — it only proposes a repair for a
 * domain something else already proved wrong. Pass `mxKnownDead` only after probeMx has
 * returned 'no_mx'.
 */
export function suggestDomain(domain: string, opts?: { mxKnownDead?: boolean }): string | null {
  const d = domain.toLowerCase();
  // A real provider is never "corrected", whatever else we think we know about it.
  if (PROVIDER_SET.has(d)) return null;

  const mapped = EXPLICIT_SQUAT_MAP[d];
  if (mapped) return mapped;

  if (!opts?.mxKnownDead) return null;

  let best: string | null = null;
  let bestDist = 3;
  for (const p of PROVIDERS) {
    const dist = distance(d, p);
    if (dist < bestDist) { bestDist = dist; best = p; }
  }
  return best;
}

// ── L2: MX probe ───────────────────────────────────────────────────────────

/**
 * Hard cap. Measured against production domains: the decisive negatives answer fast
 * (gmail.com.il NXDOMAIN in 103 ms, gmail.con in 160 ms), while a slow resolver can sit
 * on a REAL domain for the better part of a minute — elishevaph.org took 49.7 s and
 * windowslive.com 52.7 s. Waiting is never worth it, because a slow answer and a missing
 * answer are treated identically anyway: as 'unknown', which passes.
 */
const MX_TIMEOUT_MS = 1500;
const TTL_HAS_MX = 7 * 24 * 60 * 60;
const TTL_NO_MX = 24 * 60 * 60;

export async function probeMx(domain: string): Promise<'has_mx' | 'no_mx' | 'unknown'> {
  const key = `email_mx:${domain}`;
  const cached = await redisGet<'has_mx' | 'no_mx'>(key);
  if (cached === 'has_mx' || cached === 'no_mx') return cached;

  let verdict: 'has_mx' | 'no_mx' | 'unknown';
  try {
    const timeout = new Promise<'unknown'>((resolve) => {
      const t = setTimeout(() => resolve('unknown'), MX_TIMEOUT_MS);
      // Don't hold a serverless invocation open just to finish losing a race.
      (t as any).unref?.();
    });
    const lookup = dns.resolveMx(domain).then((records) =>
      records && records.length > 0 ? ('has_mx' as const) : ('no_mx' as const),
    );
    verdict = await Promise.race([lookup, timeout]);
  } catch (err: any) {
    // ENOTFOUND = the domain does not exist. ENODATA = it exists with no MX. Both mean
    // no mail can be delivered. Everything else — SERVFAIL, ETIMEOUT, a resolver that is
    // simply having a bad day — is OUR failure to find out, not proof of anything.
    verdict = err?.code === 'ENOTFOUND' || err?.code === 'ENODATA' ? 'no_mx' : 'unknown';
  }

  // 'unknown' is deliberately not cached: it is a statement about this moment, not the domain.
  if (verdict !== 'unknown') {
    await redisSet(key, verdict, verdict === 'has_mx' ? TTL_HAS_MX : TTL_NO_MX);
  }
  return verdict;
}

// ── Orchestration ──────────────────────────────────────────────────────────

/** L0 + L1 only. For callers with no network budget; never claims 'ok'. */
export function verifyEmailSync(raw: unknown): EmailVerdict {
  const email = normalizeEmail(raw);
  if (!email) return { status: 'undeliverable', email: String(raw ?? ''), reason: 'nxdomain' };
  const suggestion = suggestDomain(domainOf(email));
  if (suggestion) return { status: 'typo', email, suggestion };
  // Not 'ok': MX has not been checked, so we do not know that it is.
  return { status: 'unknown', email };
}

/** The full verdict. Never throws. */
export async function verifyEmail(raw: unknown): Promise<EmailVerdict> {
  const email = normalizeEmail(raw);
  if (!email) return { status: 'undeliverable', email: String(raw ?? ''), reason: 'nxdomain' };

  const domain = domainOf(email);
  const mapped = suggestDomain(domain);
  const mx = await probeMx(domain);

  if (mx === 'no_mx') {
    // Now, and only now, edit distance is allowed to propose a repair.
    const suggestion = mapped ?? suggestDomain(domain, { mxKnownDead: true }) ?? undefined;
    return { status: 'undeliverable', email, reason: 'no_mx', suggestion };
  }
  // Has MX (or we could not tell) but the domain is a known lookalike: suggest, never block.
  if (mapped) return { status: 'typo', email, suggestion: mapped };
  return mx === 'has_mx' ? { status: 'ok', email } : { status: 'unknown', email };
}

// ── The intake gate ────────────────────────────────────────────────────────

/**
 * Should a submission be refused because we would have no way to answer it?
 *
 * Three conditions, and each one exists to stop a different way of getting this wrong.
 *
 * First, the account has to have opted in. Absence means permissive, so shipping this
 * changes nothing for anyone until someone turns it on.
 *
 * Second, only `undeliverable` counts. A `typo` verdict is a GUESS — the address may well
 * be fine — and blocking on a guess is how a mail.com customer gets told she mistyped her
 * own address. Only MX actually reporting that no mail server exists is fact enough.
 *
 * Third, even then, only when there is no phone. A ticket with a dead email and a real
 * number is answerable; refusing it loses the customer entirely, which is the very failure
 * this feature exists to prevent. לילי left 0526936571 on the ticket that started all this.
 */
export function emailGate(
  verdict: EmailVerdict,
  phone: string | null | undefined,
  enforce: boolean,
): { blocked: boolean; suggestion?: string } {
  if (!enforce) return { blocked: false };
  if (verdict.status !== 'undeliverable') return { blocked: false };
  if (realPhoneOrNull(phone)) return { blocked: false };
  return { blocked: true, suggestion: verdict.suggestion };
}
