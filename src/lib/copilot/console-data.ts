/**
 * Data access for the partner console: which associations a console user may
 * see, their activity, scan state, conversations (anonymised) and settings.
 *
 * Authorisation order on every :id route: an association-scoped user asking for
 * any other id is refused 403 before anything is read; partner staff asking for
 * an account that is not their partner's get 404 (existence is not revealed).
 */
import { supabase } from '@/lib/supabase';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { computeScanProgress } from '@/lib/pipeline/progress';
import { isUuid, associationNameOf } from './http';
import { canSeeAccount, type ConsoleContext } from './console-auth';
import { sanitizeBranding, validateBranding, httpsUrl } from './branding';
import { readContactRules, validContactRule } from './contact-trigger';
import { isVerifiedIdentity } from './identity';
import { cleanSources } from './history';

const log = (...a: unknown[]) => console.error('[copilot/console]', ...a);
export const refuse = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
export const ok = (body: unknown) => Response.json(body, { headers: { 'Cache-Control': 'no-store' } });

const DAY_MS = 24 * 60 * 60 * 1000;
export const CONVERSATION_PAGE = 25;
const TRANSCRIPT_LIMIT = 500;
const FIRST_MESSAGE_CHARS = 120;

export interface ConsoleAccount { id: string; partner_id: string; config: Record<string, any>; created_at?: string }

/** The account this console user may act on, or the refusal. */
export async function loadConsoleAccount(ctx: ConsoleContext, id: string, db: any = supabase): Promise<ConsoleAccount | Response> {
  if (!isUuid(id)) return refuse(404, 'not_found');
  if (!canSeeAccount(ctx, id)) return refuse(403, 'forbidden');
  const { data, error } = await db.from('accounts').select('id, partner_id, config, created_at').eq('id', id).maybeSingle();
  if (error) { log('account read failed', error.message); return refuse(503, 'unavailable'); }
  if (!data || data.partner_id !== ctx.partnerId) return refuse(404, 'not_found');
  return { ...data, config: (data.config ?? {}) as Record<string, any> };
}

/** `aba` for `aba.copilot-dev.test` under base `copilot-dev.test`; null otherwise. */
export function slugOf(host: string, baseHost: string): string | null {
  const suffix = `.${baseHost}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  return label && !label.includes('.') ? label : null;
}

export async function slugsFor(ctx: ConsoleContext, accountIds: string[], db: any = supabase): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!accountIds.length) return out;
  const { data, error } = await db.from('tenant_domains').select('host, account_id').eq('partner_id', ctx.partnerId).in('account_id', accountIds);
  if (error) { log('tenant_domains read failed', error.message); return out; }
  for (const r of (data ?? []) as any[]) {
    const s = slugOf(String(r.host), ctx.baseHost);
    if (s && r.account_id && !out.has(r.account_id)) out.set(r.account_id, s);
  }
  return out;
}

export type AssociationStatus = 'scanning' | 'ready' | 'failed';

/** The association's state from its latest scan job (no job = set up by hand = ready). */
export function scanSummary(job: any, now = Date.now()): { status: AssociationStatus; scan: { percent: number; currentStep: string | null } | null } {
  if (!job) return { status: 'ready', scan: null };
  if (job.status === 'queued' || job.status === 'running') {
    const p = computeScanProgress(job, now);
    return { status: 'scanning', scan: { percent: p.percent, currentStep: p.currentStep } };
  }
  if (job.status === 'failed' || job.status === 'cancelled') return { status: 'failed', scan: null };
  return { status: 'ready', scan: null };
}

/**
 * The job that describes the association now: newest first, skipping cancelled jobs
 * and queued/running jobs that stopped showing life (an orphan must not read as
 * "scanning" forever, nor a cancel as a failure).
 */
export function pickCurrentJob(jobs: any[] | null | undefined, now = Date.now()): any | null {
  for (const j of jobs ?? []) {
    if (j?.status === 'cancelled') continue;
    if ((j?.status === 'queued' || j?.status === 'running') && !isLiveScan(j, now)) continue;
    return j;
  }
  return null;
}

export async function latestScanJob(accountId: string): Promise<any | null> {
  try {
    const jobs = await getScanJobsRepo().getByAccount(accountId, 5);
    return pickCurrentJob(jobs);
  } catch (e) {
    log('scan job read failed', accountId, e instanceof Error ? e.message : e);
    return null;
  }
}

export interface Counts { sessions: number; messages: number; escalations: number; lastActivity: string | null }

export async function countsFor(accountIds: string[], sinceMs: number, db: any = supabase): Promise<Map<string, Counts> | null> {
  const out = new Map<string, Counts>();
  if (!accountIds.length) return out;
  const { data, error } = await db.rpc('partner_account_counts', { p_account_ids: accountIds, p_since: new Date(sinceMs).toISOString() });
  if (error) { log('counts failed', error.message); return null; }
  for (const r of (data ?? []) as any[]) {
    out.set(r.account_id, {
      sessions: Number(r.sessions) || 0, messages: Number(r.messages) || 0,
      escalations: Number(r.escalations) || 0, lastActivity: r.last_activity ?? null,
    });
  }
  return out;
}

const ZERO: Counts = { sessions: 0, messages: 0, escalations: 0, lastActivity: null };

/** GET associations */
export async function listAssociations(ctx: ConsoleContext, deps: { db?: any; latestJob?: typeof latestScanJob; now?: () => number } = {}) {
  const db = deps.db ?? supabase;
  const latestJob = deps.latestJob ?? latestScanJob;
  const now = (deps.now ?? Date.now)();
  let q = db.from('accounts').select('id, partner_id, config, created_at').eq('partner_id', ctx.partnerId);
  if (ctx.accountId) q = q.eq('id', ctx.accountId);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) { log('accounts read failed', error.message); return refuse(503, 'unavailable'); }
  const accounts = ((data ?? []) as any[]).filter((a) => a.partner_id === ctx.partnerId && canSeeAccount(ctx, a.id));
  const ids = accounts.map((a) => a.id);
  const [slugs, counts, jobs] = await Promise.all([
    slugsFor(ctx, ids, db),
    countsFor(ids, now - 30 * DAY_MS, db),
    Promise.all(ids.map((id) => latestJob(id))),
  ]);
  return ok(accounts.map((a, i) => {
    const c = counts?.get(a.id) ?? ZERO;
    const cfg = (a.config ?? {}) as any;
    return {
      id: a.id,
      slug: slugs.get(a.id) ?? null,
      name: associationNameOf(cfg),
      websiteUrl: typeof cfg.website_url === 'string' ? cfg.website_url : null,
      ...scanSummary(jobs[i], now),
      counts: { sessions30: c.sessions, messages30: c.messages, escalations30: c.escalations, lastActivity: c.lastActivity },
    };
  }));
}

/** Whitelisted settings of an association, in the same shape PATCH accepts. */
export function settingsSnapshot(copilot: unknown) {
  const cp = (copilot && typeof copilot === 'object' && !Array.isArray(copilot) ? copilot : {}) as Record<string, any>;
  const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);
  const links = (cp.links ?? {}) as Record<string, unknown>;
  return {
    branding: sanitizeBranding(cp.branding),
    opening_questions: strs(cp.opening_questions, 6),
    exclusions: strs(cp.exclusions, 50),
    contact_trigger: readContactRules({ copilot: cp }),
    escalation: { recipients: strs(cp.escalation?.recipients, 10) },
    links: { join: httpsUrl(links.join), renew: httpsUrl(links.renew) },
    tone: typeof cp.tone === 'string' ? cp.tone : null,
    industry: typeof cp.industry === 'string' ? cp.industry : null,
  };
}

/** GET associations/:id */
export async function associationDetail(ctx: ConsoleContext, acc: ConsoleAccount, deps: { db?: any; latestJob?: typeof latestScanJob; now?: () => number } = {}) {
  const db = deps.db ?? supabase;
  const now = (deps.now ?? Date.now)();
  const [slugs, c7, c30, job, topics, escalations] = await Promise.all([
    slugsFor(ctx, [acc.id], db),
    countsFor([acc.id], now - 7 * DAY_MS, db),
    countsFor([acc.id], now - 30 * DAY_MS, db),
    (deps.latestJob ?? latestScanJob)(acc.id),
    (async () => {
      const { data, error } = await db.from('conversation_topics').select('label, session_count')
        .eq('account_id', acc.id).eq('is_active', true).order('session_count', { ascending: false }).limit(5);
      if (error) { log('topics read failed', error.message); return []; }
      return ((data ?? []) as any[]).map((t) => ({ label: String(t.label), sessions: Number(t.session_count) || 0 }));
    })(),
    (async () => {
      const { data, error } = await db.from('support_requests').select('escalation_reason, created_at')
        .eq('account_id', acc.id).eq('source', 'copilot_escalation').order('created_at', { ascending: false }).limit(5);
      if (error) { log('escalations read failed', error.message); return []; }
      return ((data ?? []) as any[]).map((r) => ({ reason: typeof r.escalation_reason === 'string' ? r.escalation_reason : null, createdAt: r.created_at }));
    })(),
  ]);
  const k7 = c7?.get(acc.id) ?? ZERO;
  const k30 = c30?.get(acc.id) ?? ZERO;
  const cfg = acc.config;
  return ok({
    id: acc.id,
    slug: slugs.get(acc.id) ?? null,
    name: associationNameOf(cfg),
    websiteUrl: typeof cfg.website_url === 'string' ? cfg.website_url : null,
    ...scanSummary(job, now),
    counts: {
      d7: { sessions: k7.sessions, messages: k7.messages, escalations: k7.escalations },
      d30: { sessions: k30.sessions, messages: k30.messages, escalations: k30.escalations },
      lastActivity: k30.lastActivity ?? k7.lastActivity,
    },
    topTopics: topics,
    recentEscalations: escalations,
    settings: settingsSnapshot(cfg.copilot),
  });
}

const EMAIL_IN_TEXT = /[^\s@<>()[\],;:"']+@[^\s@<>()[\],;:"']+\.[a-z]{2,}/gi;
const PHONE_IN_TEXT = /\+?\d[\d\s().-]{5,}\d/g;
const DATE_LIKE = /^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}[.-]\d{1,2}[.-]\d{2,4}$/;

/**
 * Anonymise text an unverified visitor typed (or the assistant echoed): emails, and
 * any run of 7 or more digits (with separators) that is not a date, never reach staff screens.
 */
export function redactContact(text: string): string {
  return text.replace(EMAIL_IN_TEXT, '[email]').replace(PHONE_IN_TEXT, (m) => {
    const digits = m.replace(/\D/g, '').length;
    return digits >= 7 && !DATE_LIKE.test(m.trim()) ? '[phone]' : m;
  });
}

/** Opaque keyset cursor over (created_at desc, id desc). */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id])).toString('base64url');
}
export function decodeCursor(raw: string): { createdAt: string; id: string } | null {
  if (raw.length > 200) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'string' || !Number.isFinite(Date.parse(v[0])) || !isUuid(v[1])) return null;
    return { createdAt: v[0], id: v[1] };
  } catch {
    return null;
  }
}

/** GET associations/:id/conversations?cursor= */
export async function listConversations(acc: ConsoleAccount, cursor: string | null, db: any = supabase) {
  const after = cursor === null ? null : decodeCursor(cursor);
  if (cursor !== null && !after) return refuse(400, 'invalid_cursor');
  const COLS = 'id, created_at, last_turn_at, message_count, identified_at';
  const base = () => db.from('chat_sessions').select(COLS).eq('account_id', acc.id).eq('ref_source', 'copilot');
  // Keyset on (created_at, id): the rest of the cursor's own timestamp, then everything older.
  const reads = after
    ? [
      base().eq('created_at', after.createdAt).lt('id', after.id).order('id', { ascending: false }).limit(CONVERSATION_PAGE + 1),
      base().lt('created_at', after.createdAt).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(CONVERSATION_PAGE + 1),
    ]
    : [base().order('created_at', { ascending: false }).order('id', { ascending: false }).limit(CONVERSATION_PAGE + 1)];
  const results = await Promise.all(reads);
  const failed = results.find((r: any) => r.error);
  if (failed) { log('sessions read failed', failed.error.message); return refuse(503, 'unavailable'); }
  const rows = results.flatMap((r: any) => (r.data ?? []) as any[]).slice(0, CONVERSATION_PAGE + 1);
  const page = rows.slice(0, CONVERSATION_PAGE);
  const ids = page.map((s) => s.id);

  const [firsts, escalated] = await Promise.all([
    (async () => {
      const out = new Map<string, string>();
      if (!ids.length) return out;
      // One query for the page. Oldest first, so the first row per session is its opening message.
      const { data: m, error: mErr } = await db.from('chat_messages').select('session_id, content, created_at')
        .in('session_id', ids).eq('role', 'user').order('created_at', { ascending: true }).limit(1000);
      if (mErr) { log('first messages read failed', mErr.message); return out; }
      for (const r of (m ?? []) as any[]) if (!out.has(r.session_id) && typeof r.content === 'string') out.set(r.session_id, r.content);
      return out;
    })(),
    (async () => {
      if (!ids.length) return new Set<string>();
      const { data: r, error: rErr } = await db.from('support_requests').select('session_id')
        .eq('account_id', acc.id).eq('source', 'copilot_escalation').in('session_id', ids);
      if (rErr) { log('escalation flags read failed', rErr.message); return new Set<string>(); }
      return new Set(((r ?? []) as any[]).map((x) => x.session_id));
    })(),
  ]);

  const last = page[page.length - 1];
  return ok({
    conversations: page.map((s) => {
      const identified = !!s.identified_at;
      const first = firsts.get(s.id) ?? null;
      const text = first == null ? null : (identified ? first : redactContact(first));
      return {
        id: s.id,
        startedAt: s.created_at,
        lastTurnAt: s.last_turn_at ?? null,
        messageCount: Number(s.message_count) || 0,
        firstMessage: text == null ? null : text.slice(0, FIRST_MESSAGE_CHARS),
        escalated: escalated.has(s.id),
        identified,
      };
    }),
    nextCursor: rows.length > CONVERSATION_PAGE && last ? encodeCursor(last.created_at, last.id) : null,
  });
}

/** GET associations/:id/conversations/:sessionId */
export async function conversationTranscript(acc: ConsoleAccount, sessionId: string, db: any = supabase) {
  if (!isUuid(sessionId)) return refuse(404, 'not_found');
  const { data: s, error } = await db.from('chat_sessions').select('id, account_id, ref_source, visitor_id, created_at, last_turn_at')
    .eq('id', sessionId).maybeSingle();
  if (error) { log('session read failed', error.message); return refuse(503, 'unavailable'); }
  if (!s || s.account_id !== acc.id || s.ref_source !== 'copilot') return refuse(404, 'not_found');

  let verified = false;
  let label = 'Visitor';
  if (s.visitor_id) {
    const { data: v, error: vErr } = await db.from('visitors').select('identity_source, name, account_id').eq('id', s.visitor_id).maybeSingle();
    if (vErr) log('visitor read failed', vErr.message);
    if (v && v.account_id === acc.id && isVerifiedIdentity(v.identity_source)) {
      verified = true;
      label = typeof v.name === 'string' && v.name.trim() ? v.name.trim() : 'Member';
    }
  }

  const [{ data: msgs, error: mErr }, { data: esc }] = await Promise.all([
    db.from('chat_messages').select('role, content, created_at, metadata').eq('session_id', s.id)
      .order('created_at', { ascending: true }).limit(TRANSCRIPT_LIMIT),
    db.from('support_requests').select('id').eq('account_id', acc.id).eq('session_id', s.id).eq('source', 'copilot_escalation').limit(1),
  ]);
  if (mErr) { log('messages read failed', mErr.message); return refuse(503, 'unavailable'); }

  return ok({
    id: s.id,
    startedAt: s.created_at,
    lastTurnAt: s.last_turn_at ?? null,
    visitor: { label, identified: verified },
    escalated: Array.isArray(esc) && esc.length > 0,
    messages: ((msgs ?? []) as any[])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({
        role: m.role,
        content: verified ? m.content : redactContact(m.content),
        createdAt: m.created_at,
        sources: m.role === 'assistant' ? cleanSources(m.metadata?.copilot?.sources) : [],
      })),
  });
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const SETTINGS_KEYS = ['branding', 'opening_questions', 'exclusions', 'contact_trigger', 'escalation', 'links', 'tone'];

export type SettingsPatch = { ok: true; patch: Record<string, unknown> } | { ok: false; field: string };

/**
 * Validates a settings body into the copilot patch to merge. Unknown top-level keys
 * are refused (naming them), so a typo never looks saved. `escalation` and `links`
 * merge onto their current values so keys this API does not manage survive.
 */
export function buildSettingsPatch(body: any, current: Record<string, any>): SettingsPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body' };
  const keys = Object.keys(body);
  if (!keys.length) return { ok: false, field: 'body' };
  for (const k of keys) if (!SETTINGS_KEYS.includes(k)) return { ok: false, field: k };
  const patch: Record<string, unknown> = {};

  if ('branding' in body) {
    const b = validateBranding(body.branding);
    if (b.ok === false) return { ok: false, field: b.field };
    // Merge onto the stored branding: a key not sent stays, a key sent as null is removed.
    const cur = current.branding && typeof current.branding === 'object' && !Array.isArray(current.branding) ? { ...current.branding } : {};
    for (const k of b.cleared) delete cur[k];
    patch.branding = { ...cur, ...b.value };
  }
  if ('opening_questions' in body) {
    const v = body.opening_questions;
    if (!Array.isArray(v) || v.length > 6) return { ok: false, field: 'opening_questions' };
    const qs: string[] = [];
    for (const q of v) {
      if (typeof q !== 'string' || !q.trim() || q.trim().length > 120) return { ok: false, field: 'opening_questions' };
      qs.push(q.trim());
    }
    patch.opening_questions = qs;
  }
  if ('exclusions' in body) {
    const v = body.exclusions;
    if (!Array.isArray(v) || v.length > 50) return { ok: false, field: 'exclusions' };
    const out: string[] = [];
    for (const e of v) {
      if (typeof e !== 'string') return { ok: false, field: 'exclusions' };
      const s = e.trim();
      if (!s || s.length > 500 || !(s.startsWith('/') || /^https?:\/\//i.test(s))) return { ok: false, field: 'exclusions' };
      out.push(s);
    }
    patch.exclusions = out;
  }
  if ('contact_trigger' in body) {
    const v = body.contact_trigger;
    const list = Array.isArray(v) ? v : [v];
    if (!list.length || list.length > 5) return { ok: false, field: 'contact_trigger' };
    const rules = [];
    for (const r of list) {
      const ok = validContactRule(r);
      if (!ok) return { ok: false, field: 'contact_trigger' };
      if (ok.kind === 'on_intent' && (ok.topics.length > 20 || ok.topics.some((t) => !t || t.length > 40))) return { ok: false, field: 'contact_trigger' };
      if (ok.kind === 'after_n_questions' && ok.n > 50) return { ok: false, field: 'contact_trigger' };
      rules.push(ok);
    }
    patch.contact_trigger = rules;
  }
  if ('escalation' in body) {
    const e = body.escalation;
    if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).some((k) => k !== 'recipients')) return { ok: false, field: 'escalation' };
    const v = e.recipients;
    if (!Array.isArray(v) || v.length > 10) return { ok: false, field: 'escalation.recipients' };
    const out: string[] = [];
    for (const r of v) {
      const s = typeof r === 'string' ? r.trim().toLowerCase() : '';
      if (!s || s.length > 254 || !EMAIL_RE.test(s)) return { ok: false, field: 'escalation.recipients' };
      if (!out.includes(s)) out.push(s);
    }
    const cur = current.escalation && typeof current.escalation === 'object' && !Array.isArray(current.escalation) ? current.escalation : {};
    patch.escalation = { ...cur, recipients: out };
  }
  if ('links' in body) {
    const l = body.links;
    if (!l || typeof l !== 'object' || Array.isArray(l) || Object.keys(l).some((k) => k !== 'join' && k !== 'renew')) return { ok: false, field: 'links' };
    const cur = current.links && typeof current.links === 'object' && !Array.isArray(current.links) ? { ...current.links } : {};
    for (const k of ['join', 'renew'] as const) {
      if (!(k in l)) continue;
      const v = l[k];
      if (v === null || v === '') { delete cur[k]; continue; }
      const u = httpsUrl(v);
      if (!u || u.length > 500) return { ok: false, field: `links.${k}` };
      cur[k] = u;
    }
    patch.links = cur;
  }
  if ('tone' in body) {
    const t = body.tone;
    if (t === null || t === '') patch.tone = null;
    else if (typeof t !== 'string' || t.length > 300) return { ok: false, field: 'tone' };
    else patch.tone = t.trim();
  }
  return { ok: true, patch };
}

export const STALE_SCAN_MS = 45 * 60 * 1000;

/**
 * A queued/running job that has shown life in the last 45 minutes. A job stuck in
 * "running" (a worker died) must not lock the settings forever.
 */
export function isLiveScan(job: any, now = Date.now()): boolean {
  if (!job || (job.status !== 'queued' && job.status !== 'running')) return false;
  const seen = Date.parse(job.updated_at ?? job.started_at ?? job.created_at ?? '');
  return Number.isFinite(seen) && now - seen < STALE_SCAN_MS;
}

/** PATCH associations/:id/settings (the caller has checked canManage). */
export async function updateSettings(acc: ConsoleAccount, body: any, db: any = supabase, latestJob: typeof latestScanJob = latestScanJob) {
  const current = (acc.config.copilot ?? {}) as Record<string, any>;
  const p = buildSettingsPatch(body, current);
  if (p.ok === false) return refuse(400, 'invalid_settings', { field: p.field });
  // A running scan rewrites accounts.config whole at several steps. Those writes carry
  // config->copilot over (preserve-copilot), but refusing here keeps the window shut.
  const job = await latestJob(acc.id);
  if (isLiveScan(job)) return refuse(409, 'scan_in_progress');
  const { data, error } = await db.rpc('copilot_merge_config', { p_account_id: acc.id, p_patch: p.patch });
  if (error) { log('settings merge failed', acc.id, error.message); return refuse(503, 'unavailable'); }
  if (!data) return refuse(404, 'not_found');
  return ok({ settings: settingsSnapshot(data) });
}
