import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor, applyIdentity } from '@/lib/copilot/visitors';
import { identityFromEmail, companyFromEmail } from '@/lib/copilot/identity';
import { getAmsAdapter } from '@/lib/copilot/ams';
import { recordEvents, type InteractionEventInput } from '@/lib/copilot/events';
import { checkChatLimits } from '@/lib/copilot/rate-limit';
import { escapeHtml as esc, staffRecipients, assistantFrom } from '@/lib/copilot/escalate';
import { bad, isUuid, readJsonBody, limited, associationNameOf } from '@/lib/copilot/http';
import type { IdentityUpdate } from '@/lib/copilot/identity';
import type { AssociationTenant } from '@/lib/copilot/tenant';
import { normalizeEmail } from '@/lib/support/email-deliverability';
import { sendEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_NAME = 100;
const MAX_COMPANY = 200;
const TRANSCRIPT_LIMIT = 12;
// Visitors with a verified identity are never touched by what someone types into the chat.
const VERIFIED = new Set(['ams_login', 'newsletter']);
const UNVERIFIED = '(entered by the visitor, not verified)';
const log = (...a: unknown[]) => console.error('[copilot/contact]', ...a);

/** Optional free-text field: undefined when absent or blank, null when invalid, else single-line text. */
function field(v: unknown, max: number): string | undefined | null {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  return s.length > max ? null : s;
}

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;

  const read = await readJsonBody(req);
  if (read instanceof Response) return read;
  const body = read.body;

  const email = normalizeEmail(body?.email)?.toLowerCase() ?? null;
  const name = field(body?.name, MAX_NAME);
  const company = field(body?.company, MAX_COMPANY);
  const hasSession = body?.sessionId !== undefined && body?.sessionId !== null;
  if (
    !body || !isUuid(body.visitorId) || (hasSession && !isUuid(body.sessionId)) ||
    body.consent !== true || !email || name === null || company === null
  ) {
    return bad(400, 'invalid_request');
  }
  const sessionId: string | null = hasSession ? body.sessionId : null;

  const visitor = await getVisitor(tenant, body.visitorId);
  if (!visitor) return bad(404, 'unknown_visitor');

  // Contact writes to the visitor and emails staff, so it shares the chat limits.
  const limit = await checkChatLimits({ accountId: tenant.accountId, anonId: visitor.anon_id });
  if (limit.allowed === false) return limited(limit);

  const assoc = await loadAssociation(tenant);
  if (!assoc) return bad(404, 'association_unavailable');

  // A session is used only when it belongs to this association and this visitor; nothing is written otherwise.
  if (sessionId) {
    const { data: s, error } = await supabase.from('chat_sessions').select('id, account_id, visitor_id').eq('id', sessionId).maybeSingle();
    if (error) log('session read failed', tenant.accountId, error.message);
    if (!s || s.id !== sessionId || s.account_id !== tenant.accountId || s.visitor_id !== visitor.id) return bad(404, 'unknown_session');
  }

  const { update, amsUnavailable } = await identityFromEmail(email, getAmsAdapter(assoc.config));
  // A typed email is never a verified identity. Rules:
  // - a verified visitor (login, newsletter) is never changed by what is typed here;
  // - an AMS match contributes no member reference, membership, name or company: the only
  //   company ever stored is the one derived from the email domain or typed by the visitor;
  // - the response is the same for members and non-members, so it cannot be used to probe the AMS.
  let current = visitor;
  let storedCompany: string | null = null;
  if (!VERIFIED.has(visitor.identity_source ?? '')) {
    const domain = companyFromEmail(email);
    storedCompany = domain?.company ?? company ?? null;
    if (update) {
      const applied: IdentityUpdate = {
        source: update.source, email,
        ...(storedCompany ? { company: storedCompany } : {}),
        ...(domain ? { companyDomain: domain.domain } : {}),
        ...(name ? { name } : {}),
      };
      current = (await applyIdentity(tenant, visitor, applied)).visitor;
    } else {
      // Fill only what the profile does not have yet.
      const fills: Array<[string, string | undefined]> = [['email', email], ['name', name], ['company', company]];
      for (const [col, val] of fills) {
        if (!val) continue;
        const { error } = await supabase.from('visitors').update({ [col]: val }).eq('id', visitor.id).is(col, null);
        if (error) log('visitor fill failed', tenant.accountId, col, error.message);
      }
    }
  }

  const recipients = staffRecipients(assoc.config);
  if (recipients.length) {
    const associationName = associationNameOf(assoc.config);
    let transcript: Array<{ role: string; content: string }> = [];
    if (sessionId) {
      const { data, error } = await supabase.from('chat_messages').select('role, content')
        .eq('session_id', sessionId).order('created_at', { ascending: false }).limit(TRANSCRIPT_LIMIT);
      if (error) log('transcript read failed', tenant.accountId, error.message);
      transcript = ((data ?? []) as any[]).filter((m) => m && typeof m.content === 'string').reverse();
    }
    const lines = transcript.map((m) => `<p><b>${m.role === 'user' ? 'Visitor' : 'Assistant'}:</b> ${esc(m.content)}</p>`).join('');
    const matched = storedCompany && storedCompany !== company ? storedCompany : null;
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px"><p>A visitor on the ${esc(associationName)} website left their contact details with the assistant.</p>`
      + `<p><b>Name ${UNVERIFIED}:</b> ${esc(name ?? 'Not given')}<br><b>Email ${UNVERIFIED}:</b> ${esc(email)}<br><b>Company ${UNVERIFIED}:</b> ${esc(company ?? 'Not given')}`
      + (matched ? `<br><b>Company matched from the email address:</b> ${esc(matched)}` : '') + '</p>'
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

  return Response.json({ ok: true });
}
