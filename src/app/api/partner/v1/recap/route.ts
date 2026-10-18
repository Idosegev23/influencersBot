import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor } from '@/lib/copilot/visitors';
import { recordEvents } from '@/lib/copilot/events';
import { checkChatLimits } from '@/lib/copilot/rate-limit';
import { assistantFrom } from '@/lib/copilot/escalate';
import { buildRecapEmail, recipientHash, type RecapLink } from '@/lib/copilot/recap';
import { bad, isUuid, readJsonBody, limited, associationNameOf } from '@/lib/copilot/http';
import type { AssociationTenant } from '@/lib/copilot/tenant';
import { normalizeEmail } from '@/lib/support/email-deliverability';
import { sendEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Gated off by default: visitor-facing mail must not go out until the association's sender domain is set up.
const MAX_MESSAGES = 60;
// One recap per session; at most this many per recipient address per day across the association.
const PER_ADDRESS_LIMIT = 3;
const PER_ADDRESS_WINDOW_MS = 24 * 60 * 60 * 1000;
const log = (...a: unknown[]) => console.error('[copilot/recap]', ...a);

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;

  const read = await readJsonBody(req);
  if (read instanceof Response) return read;
  const body = read.body;
  // Any email in the body is ignored: a recap goes only to the address on the visitor's profile,
  // so this route cannot be used to mail arbitrary people.
  if (!body || !isUuid(body.visitorId) || !isUuid(body.sessionId)) return bad(400, 'invalid_request');
  const sessionId: string = body.sessionId;

  const visitor = await getVisitor(tenant, body.visitorId);
  if (!visitor) return bad(404, 'unknown_visitor');

  const limit = await checkChatLimits({ accountId: tenant.accountId, anonId: visitor.anon_id });
  if (limit.allowed === false) return limited(limit);

  const assoc = await loadAssociation(tenant);
  if (!assoc) return bad(404, 'association_unavailable');
  const config = (assoc.config ?? {}) as any;
  if (config.copilot?.recap?.enabled !== true) return bad(409, 'recap_not_configured');

  const { data: s, error: sErr } = await supabase.from('chat_sessions').select('id, account_id, visitor_id').eq('id', sessionId).maybeSingle();
  if (sErr) log('session read failed', tenant.accountId, sErr.message);
  if (!s || s.id !== sessionId || s.account_id !== tenant.accountId || s.visitor_id !== visitor.id) return bad(404, 'unknown_session');

  const to = normalizeEmail(visitor.email)?.toLowerCase() ?? null;
  if (!to) return bad(400, 'email_required');
  const toHash = recipientHash(to);

  // Abuse limits. A read failure refuses the send: these guard visitor-facing mail.
  const since = new Date(Date.now() - PER_ADDRESS_WINDOW_MS).toISOString();
  const [already, recent] = await Promise.all([
    supabase.from('interaction_events').select('id')
      .eq('account_id', tenant.accountId).eq('session_id', sessionId).eq('type', 'recap_sent').limit(1),
    supabase.from('interaction_events').select('id')
      .eq('account_id', tenant.accountId).eq('type', 'recap_sent').eq('payload->>to_hash', toHash)
      .gte('occurred_at', since).limit(PER_ADDRESS_LIMIT),
  ]);
  if (already.error || recent.error) {
    log('recap limit read failed', tenant.accountId, already.error?.message ?? recent.error?.message);
    return bad(503, 'recap_unavailable');
  }
  if (Array.isArray(already.data) && already.data.length > 0) return bad(409, 'recap_already_sent');
  if (Array.isArray(recent.data) && recent.data.length >= PER_ADDRESS_LIMIT) return bad(429, 'recap_limit_reached');

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

  const associationName = associationNameOf(config);
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
    [{ type: 'recap_sent', sessionId, payload: { to_hash: toHash, messages: messages.length, links: sources.length } }],
  );
  return Response.json({ ok: true });
}
