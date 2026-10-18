import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor } from '@/lib/copilot/visitors';
import { recordEvents } from '@/lib/copilot/events';
import { checkChatLimits } from '@/lib/copilot/rate-limit';
import { assistantFrom } from '@/lib/copilot/escalate';
import { buildRecapEmail, type RecapLink } from '@/lib/copilot/recap';
import type { AssociationTenant } from '@/lib/copilot/tenant';
import { normalizeEmail } from '@/lib/support/email-deliverability';
import { sendEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Gated off by default: visitor-facing mail must not go out until the association's sender domain is set up.
const MAX_BODY_BYTES = 16_384;
const MAX_MESSAGES = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (status: number, error: string, headers?: Record<string, string>) => Response.json({ error }, { status, headers });
const log = (...a: unknown[]) => console.error('[copilot/recap]', ...a);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;

  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return bad(413, 'request_too_large');
  const raw = await req.text().catch(() => '');
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return bad(413, 'request_too_large');
  let body: any = null;
  try { body = JSON.parse(raw); } catch { body = null; }

  const hasEmail = body?.email !== undefined && body?.email !== null && body?.email !== '';
  const bodyEmail = hasEmail ? normalizeEmail(body.email)?.toLowerCase() ?? null : null;
  if (
    !body || typeof body !== 'object' ||
    typeof body.visitorId !== 'string' || !UUID.test(body.visitorId) ||
    typeof body.sessionId !== 'string' || !UUID.test(body.sessionId) ||
    (hasEmail && !bodyEmail)
  ) {
    return bad(400, 'invalid_request');
  }
  const sessionId: string = body.sessionId;

  const visitor = await getVisitor(tenant, body.visitorId);
  if (!visitor) return bad(404, 'unknown_visitor');

  const limit = await checkChatLimits({ accountId: tenant.accountId, anonId: visitor.anon_id });
  if (limit.allowed === false) return bad(limit.status, limit.error, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });

  const assoc = await loadAssociation(tenant);
  if (!assoc) return bad(404, 'association_unavailable');
  const config = (assoc.config ?? {}) as any;
  if (config.copilot?.recap?.enabled !== true) return bad(409, 'recap_not_configured');

  const { data: s, error: sErr } = await supabase.from('chat_sessions').select('id, account_id, visitor_id').eq('id', sessionId).maybeSingle();
  if (sErr) log('session read failed', tenant.accountId, sErr.message);
  if (!s || s.id !== sessionId || s.account_id !== tenant.accountId || s.visitor_id !== visitor.id) return bad(404, 'unknown_session');

  const to = bodyEmail ?? normalizeEmail(visitor.email)?.toLowerCase() ?? null;
  if (!to) return bad(400, 'email_required');

  const [msgs, shown] = await Promise.all([
    supabase.from('chat_messages').select('role, content, metadata')
      .eq('session_id', sessionId).order('created_at', { ascending: false }).limit(MAX_MESSAGES),
    supabase.from('interaction_events').select('payload')
      .eq('session_id', sessionId).eq('account_id', tenant.accountId).eq('type', 'resource_shown').limit(MAX_MESSAGES),
  ]);
  if (msgs.error) log('messages read failed', tenant.accountId, msgs.error.message);
  if (shown.error) log('sources read failed', tenant.accountId, shown.error.message);
  const messages = ((msgs.data ?? []) as any[]).filter((m) => m && typeof m.content === 'string').reverse();
  // Cited source URLs are recorded per answer as resource_shown events.
  const sources: RecapLink[] = ((shown.data ?? []) as any[]).flatMap((r) =>
    Array.isArray(r?.payload?.urls) ? r.payload.urls.filter((u: unknown) => typeof u === 'string').map((u: string) => ({ title: u, url: u })) : []);

  const associationName = str(config.display_name) ?? str(config.username) ?? 'association';
  const { subject, html } = buildRecapEmail({ associationName, messages, sources });
  const from = assistantFrom(associationName);
  let sent = false;
  try {
    const r = await sendEmail({ to, subject, html, ...(from ? { from } : {}) });
    sent = !!r?.success;
    if (!sent) log('recap email failed', tenant.accountId, r?.error);
  } catch (e) {
    log('recap email threw', tenant.accountId, e);
  }
  if (!sent) return bad(502, 'recap_unavailable');

  await recordEvents(
    { partnerId: tenant.partnerId, accountId: tenant.accountId, visitorId: visitor.id, industry: assoc.industry ?? null },
    [{ type: 'recap_sent', sessionId, payload: { messages: messages.length, links: sources.length } }],
  );
  return Response.json({ ok: true });
}
