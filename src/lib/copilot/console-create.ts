/**
 * Self-serve onboarding from the partner console: create the association
 * account, its tenant host and identify secret, then start the scan pipeline.
 * All or nothing as far as the platform allows: any failure after the account
 * insert deletes what was created (tenant_domains and scan_jobs cascade from
 * the account too), so a retry with the same slug works and no second pipeline
 * runs for a half-created account.
 */
import crypto from 'node:crypto';
import { supabase } from '@/lib/supabase';
import { hashPassword } from '@/lib/utils';
import { startPipeline } from '@/lib/pipeline/start';
import { normalizeWebsiteUrl } from '@/lib/pipeline/website-url';
import { computeScanProgress, SCAN_STEPS } from '@/lib/pipeline/progress';
import type { ConsoleContext } from './console-auth';
import { refuse, ok, latestScanJob, type ConsoleAccount } from './console-data';

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
export const RESERVED_SLUGS = new Set(['api', 'admin', 'console', 'login', 'embed', 'assets', '_next', 'static']);

const log = (...a: unknown[]) => console.error('[copilot/console-create]', ...a);

export type CreateInput = { name: string; websiteUrl: string; slug: string };

/** Validated create input, or the 400 refusal naming the field. */
export function parseCreateBody(body: any): { ok: true; value: CreateInput } | { ok: false; error: string } {
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 120 || /[<>\r\n]/.test(name)) return { ok: false, error: 'invalid_name' };
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'invalid_slug' };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, error: 'slug_reserved' };
  const raw = typeof body?.websiteUrl === 'string' ? body.websiteUrl : '';
  if (raw.length > 500) return { ok: false, error: 'invalid_website' };
  const websiteUrl = normalizeWebsiteUrl(raw);
  if (!websiteUrl) return { ok: false, error: 'invalid_website' };
  let proto = '';
  try { proto = new URL(websiteUrl).protocol; } catch { return { ok: false, error: 'invalid_website' }; }
  if (proto !== 'https:' && proto !== 'http:') return { ok: false, error: 'invalid_website' };
  return { ok: true, value: { name, websiteUrl, slug } };
}

export interface CreateDeps {
  db: any;
  startPipeline: typeof startPipeline;
  hashPassword: (p: string) => Promise<string>;
}

const defaults = (): CreateDeps => ({ db: supabase, startPipeline, hashPassword });

/** POST associations. The caller has checked: partner staff (ctx.accountId === null) and canManage. */
export async function createAssociation(ctx: ConsoleContext, body: any, deps: Partial<CreateDeps> = {}): Promise<Response> {
  const d = { ...defaults(), ...deps };
  const parsed = parseCreateBody(body);
  if (parsed.ok === false) return refuse(400, parsed.error);
  const { name, websiteUrl, slug } = parsed.value;
  const host = `${slug}.${ctx.baseHost}`;

  // Conflicts: the tenant host (any partner) or an account already using the slug as its username.
  const [{ data: dom, error: domErr }, { data: named, error: namedErr }] = await Promise.all([
    d.db.from('tenant_domains').select('host').eq('host', host).maybeSingle(),
    d.db.from('accounts').select('id').eq('config->>username', slug).limit(1),
  ]);
  if (domErr || namedErr) { log('conflict check failed', (domErr ?? namedErr).message); return refuse(503, 'unavailable'); }
  if (dom || (Array.isArray(named) && named.length)) return refuse(409, 'slug_taken');

  // 1. The account.
  const adminHash = await d.hashPassword(crypto.randomBytes(32).toString('hex'));
  const { data: acc, error: accErr } = await d.db.from('accounts').insert({
    type: 'creator', plan: 'free', status: 'active', language: 'en', timezone: 'America/New_York',
    partner_id: ctx.partnerId,
    allowed_channels: { web: true, whatsapp: false },
    features: { chatbot: true, analytics: true },
    config: {
      username: slug, display_name: name, archetype: 'association', website_url: websiteUrl, isDemo: false,
      copilot: { industry: null, opening_questions: [], links: {}, ams: { provider: 'stub', stub_members: [] } },
    },
    security_config: { admin_password_hash: adminHash },
  }).select('id').single();
  if (accErr || !acc?.id) { log('account insert failed', accErr?.message); return refuse(503, 'unavailable'); }
  const accountId: string = acc.id;

  let hostCreated = false;
  const rollback = async (why: string) => {
    log('rolling back association create', accountId, why);
    try {
      if (hostCreated) {
        const { error } = await d.db.from('tenant_domains').delete().eq('host', host).eq('account_id', accountId);
        if (error) log('rollback tenant_domains failed', error.message);
      }
      const { error } = await d.db.from('accounts').delete().eq('id', accountId).eq('partner_id', ctx.partnerId);
      if (error) log('rollback account failed', accountId, error.message);
    } catch (e) {
      log('rollback threw', accountId, e);
    }
  };

  // 2. The tenant host. Done before the secret so a slug race (host primary key) loses
  //    before anything is written to Vault.
  const { error: tdErr } = await d.db.from('tenant_domains').insert({ host, partner_id: ctx.partnerId, account_id: accountId, kind: 'subdomain' });
  if (tdErr) {
    await rollback(`tenant_domains insert: ${tdErr.message}`);
    return tdErr.code === '23505' ? refuse(409, 'slug_taken') : refuse(503, 'unavailable');
  }
  hostCreated = true;

  // 3. The identify secret, merged into config.copilot (never a whole-config write).
  try {
    const { data: ref, error: sErr } = await d.db.rpc('copilot_store_secret', { p_secret: crypto.randomBytes(32).toString('hex') });
    if (sErr || typeof ref !== 'string' || !ref) throw new Error(sErr?.message ?? 'no secret id');
    const { data: merged, error: mErr } = await d.db.rpc('copilot_merge_config', { p_account_id: accountId, p_patch: { identify_secret_ref: ref } });
    if (mErr || !merged) throw new Error(mErr?.message ?? 'merge returned nothing');
  } catch (e) {
    await rollback(`identify secret: ${e instanceof Error ? e.message : e}`);
    return refuse(503, 'unavailable');
  }

  // 4. The scan.
  let started: Awaited<ReturnType<typeof startPipeline>>;
  try {
    started = await d.startPipeline({
      accountId, websiteUrl, archetype: 'association', language: 'en', isDemo: false, scanMode: 'full',
      requestedBy: `partner:${ctx.partnerId}`,
    });
  } catch (e) {
    started = { error: e instanceof Error ? e.message : String(e), status: 500 };
  }
  if (!started || 'error' in started) {
    await rollback(`startPipeline: ${(started as any)?.error}`);
    return refuse(503, 'scan_start_failed');
  }

  return Response.json({ id: accountId, slug, jobId: started.jobId }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

/** GET associations/:id/scan */
export async function scanStatus(acc: ConsoleAccount, deps: { latestJob?: typeof latestScanJob; now?: () => number } = {}) {
  const job = await (deps.latestJob ?? latestScanJob)(acc.id);
  const steps0 = SCAN_STEPS.map((step) => ({ step, status: 'pending' as 'pending' | 'running' | 'done' }));
  if (!job) {
    return ok({ status: 'none', percent: 0, currentStep: null, completedSteps: 0, totalSteps: SCAN_STEPS.length, steps: steps0, startedAt: null, finishedAt: null, error: null });
  }
  const p = computeScanProgress(job, (deps.now ?? Date.now)());
  const logs: any[] = Array.isArray(job.step_logs) ? job.step_logs : [];
  const done = new Set(logs.filter((l) => l?.status === 'completed').map((l) => l.step));
  const active = job.status === 'queued' || job.status === 'running';
  const steps = SCAN_STEPS.map((step) => ({
    step,
    status: (done.has(step) ? 'done' : active && step === p.currentStep ? 'running' : 'pending') as 'pending' | 'running' | 'done',
  }));
  return ok({
    status: job.status,
    percent: job.status === 'succeeded' ? 100 : p.percent,
    currentStep: active ? p.currentStep : null,
    completedSteps: p.completedSteps,
    totalSteps: p.totalSteps,
    steps,
    startedAt: job.started_at ?? job.created_at ?? null,
    finishedAt: job.finished_at ?? null,
    // Internal scanner errors stay internal; the console only learns that it failed.
    error: job.status === 'failed' ? 'scan_failed' : job.status === 'cancelled' ? 'scan_cancelled' : null,
  });
}
