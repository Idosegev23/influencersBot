import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor, applyIdentity, IdentityConflictError } from '@/lib/copilot/visitors';
import { identityFromEmail } from '@/lib/copilot/identity';
import { getAmsAdapter } from '@/lib/copilot/ams';
import { recordEvents, type InteractionEventInput } from '@/lib/copilot/events';
import { checkChatLimits } from '@/lib/copilot/rate-limit';
import { escapeHtml as esc, staffRecipients, assistantFrom } from '@/lib/copilot/escalate';
import type { AssociationTenant } from '@/lib/copilot/tenant';
import { normalizeEmail } from '@/lib/support/email-deliverability';
import { sendEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16_384;
const MAX_NAME = 100;
const MAX_COMPANY = 200;
const TRANSCRIPT_LIMIT = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (status: number, error: string, headers?: Record<string, string>) => Response.json({ error }, { status, headers });
const log = (...a: unknown[]) => console.error('[copilot/contact]', ...a);

/** Optional free-text field: undefined when absent or blank, null when invalid, else single-line text. */
function field(v: unknown, max: number): string | undefined | null {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  return s.length > max ? null : s;
}

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

  const email = normalizeEmail(body?.email)?.toLowerCase() ?? null;
  const name = field(body?.name, MAX_NAME);
  const company = field(body?.company, MAX_COMPANY);
  const hasSession = body?.sessionId !== undefined && body?.sessionId !== null;
  if (
    !body || typeof body !== 'object' ||
    typeof body.visitorId !== 'string' || !UUID.test(body.visitorId) ||
    (hasSession && (typeof body.sessionId !== 'string' || !UUID.test(body.sessionId))) ||
    body.consent !== true || !email || name === null || company === null
  ) {
    return bad(400, 'invalid_request');
  }
  const sessionId: string | null = hasSession ? body.sessionId : null;

  const visitor = await getVisitor(tenant, body.visitorId);
  if (!visitor) return bad(404, 'unknown_visitor');

  // Contact writes to the visitor and emails staff, so it shares the chat limits.
  const limit = await checkChatLimits({ accountId: tenant.accountId, anonId: visitor.anon_id });
  if (limit.allowed === false) return bad(limit.status, limit.error, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });

  const assoc = await loadAssociation(tenant);
  if (!assoc) return bad(404, 'association_unavailable');

  // A session is used only when it belongs to this association and this visitor; nothing is written otherwise.
  if (sessionId) {
    const { data: s, error } = await supabase.from('chat_sessions').select('id, account_id, visitor_id').eq('id', sessionId).maybeSingle();
    if (error) log('session read failed', tenant.accountId, error.message);
    if (!s || s.id !== sessionId || s.account_id !== tenant.accountId || s.visitor_id !== visitor.id) return bad(404, 'unknown_session');
  }

  const { update, amsUnavailable } = await identityFromEmail(email, getAmsAdapter(assoc.config));
  let identity: 'member' | 'company' | 'email_only' | 'conflict';
  let current = visitor;
  if (update) {
    try {
      const r = await applyIdentity(tenant, visitor, { ...update, name: name ?? update.name, company: update.company ?? company });
      current = r.visitor;
      identity = update.source === 'ams_email' ? 'member' : 'company';
    } catch (e) {
      if (!(e instanceof IdentityConflictError)) throw e;
      identity = 'conflict';
    }
  } else {
    identity = 'email_only';
    // Fill only what the visitor profile does not have yet; never overwrite a stronger identity.
    const fills: Array<[string, string | undefined]> = [['email', email], ['name', name], ['company', company]];
    for (const [col, val] of fills) {
      if (!val) continue;
      const { error } = await supabase.from('visitors').update({ [col]: val }).eq('id', visitor.id).is(col, null);
      if (error) log('visitor fill failed', tenant.accountId, col, error.message);
    }
  }

  const recipients = staffRecipients(assoc.config);
  if (recipients.length) {
    const config = (assoc.config ?? {}) as any;
    const associationName = str(config.display_name) ?? str(config.username) ?? 'association';
    let transcript: Array<{ role: string; content: string }> = [];
    if (sessionId) {
      const { data, error } = await supabase.from('chat_messages').select('role, content')
        .eq('session_id', sessionId).order('created_at', { ascending: false }).limit(TRANSCRIPT_LIMIT);
      if (error) log('transcript read failed', tenant.accountId, error.message);
      transcript = ((data ?? []) as any[]).filter((m) => m && typeof m.content === 'string').reverse();
    }
    const lines = transcript.map((m) => `<p><b>${m.role === 'user' ? 'Visitor' : 'Assistant'}:</b> ${esc(m.content)}</p>`).join('');
    const who = name ?? str(current.name) ?? 'Not given';
    const org = company ?? str(current.company) ?? 'Not given';
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px"><p>A visitor on the ${esc(associationName)} website left their contact details with the assistant.</p>`
      + `<p><b>Name:</b> ${esc(who)}<br><b>Email:</b> ${esc(email)}<br><b>Company:</b> ${esc(org)}</p>`
      + (lines ? `<hr><p><b>Recent conversation</b></p>${lines}` : '') + '</div>';
    const from = assistantFrom(associationName);
    try {
      const r = await sendEmail({
        to: recipients,
        subject: `[${associationName.replace(/[\r\n]+/g, ' ')}] New contact from the website assistant`,
        html,
        ...(from ? { from } : {}),
      });
      if (!r?.success) log('staff email failed', tenant.accountId, r?.error);
    } catch (e) {
      log('staff email threw', tenant.accountId, e);
    }
  }

  const events: InteractionEventInput[] = [];
  if (amsUnavailable) events.push({ type: 'ams_unavailable', sessionId, payload: { during: 'contact' } });
  events.push({ type: 'contact_captured', sessionId, payload: { source: update?.source ?? 'email_only' } });
  await recordEvents({ partnerId: tenant.partnerId, accountId: tenant.accountId, visitorId: current.id, industry: assoc.industry ?? null }, events);

  return Response.json({ ok: true, identity });
}
