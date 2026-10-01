import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor, applyIdentity, IdentityConflictError } from '@/lib/copilot/visitors';
import { recordEvents, type InteractionEventInput } from '@/lib/copilot/events';
import { getIdentifySecret } from '@/lib/copilot/secrets';
import { verifyIdentify, verifyNewsletterToken } from '@/lib/copilot/signature';
import { getAmsAdapter } from '@/lib/copilot/ams';
import { AmsUnavailableError, type MemberSnapshot } from '@/lib/copilot/ams/types';
import type { IdentitySource } from '@/lib/copilot/identity';
import type { AssociationTenant } from '@/lib/copilot/tenant';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const bad = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;

  const body = await req.json().catch(() => null);
  const viaLogin = body && typeof body.memberId === 'string' && typeof body.signature === 'string' && typeof body.ts === 'number';
  const viaNewsletter = body && typeof body.newsletterToken === 'string';
  if (!body || typeof body.visitorId !== 'string' || (!viaLogin && !viaNewsletter)) return bad(400, 'invalid_request');

  const visitor = await getVisitor(tenant, body.visitorId);
  if (!visitor) return bad(404, 'unknown_visitor');

  const secret = await getIdentifySecret(tenant.accountId);
  if (!secret) return bad(409, 'identify_not_configured');

  let memberRef: string;
  let email: string | null;
  let source: IdentitySource;
  if (viaLogin) {
    const email0 = typeof body.email === 'string' && body.email ? body.email : null;
    const v = verifyIdentify(secret, { memberId: body.memberId, email: email0, ts: body.ts }, body.signature);
    if (v === 'expired') return bad(401, 'expired_signature');
    if (v !== 'ok') return bad(401, 'invalid_signature');
    memberRef = body.memberId; email = email0; source = 'ams_login';
  } else {
    const c = verifyNewsletterToken(secret, body.newsletterToken);
    if (!c) return bad(401, 'invalid_signature');
    memberRef = c.memberId; email = c.email; source = 'newsletter';
  }

  const assoc = await loadAssociation(tenant);
  const ams = getAmsAdapter(assoc?.config);
  const sessionId = typeof body.sessionId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.sessionId) ? body.sessionId : null;
  const events: InteractionEventInput[] = [];
  let member: MemberSnapshot | null = null;
  if (ams) {
    try { member = await ams.getMember(memberRef); }
    catch (e) {
      if (!(e instanceof AmsUnavailableError)) throw e;
      events.push({ type: 'ams_unavailable', sessionId, payload: { during: 'identify' } });
    }
  }

  let applied: Awaited<ReturnType<typeof applyIdentity>>;
  try {
    applied = await applyIdentity(tenant, visitor, {
      source, memberRef,
      email: email ?? member?.email ?? null,
      name: member?.name ?? null,
      company: member?.company ?? null,
      membership: member,
    });
  } catch (e) {
    if (e instanceof IdentityConflictError) return bad(409, 'identity_conflict');
    throw e;
  }
  const { visitor: v, merged } = applied;

  if (sessionId) {
    const { error } = await supabase.from('chat_sessions').update({ identified_at: new Date().toISOString(), visitor_id: v.id })
      .eq('id', sessionId).eq('account_id', tenant.accountId)
      .or(`visitor_id.is.null,visitor_id.eq.${visitor.id},visitor_id.eq.${v.id}`);
    if (error) console.error('[copilot/identify]', 'session link failed', error.message);
  }
  events.push({ type: 'identified', sessionId, payload: { source, merged } });
  await recordEvents({ partnerId: tenant.partnerId, accountId: tenant.accountId, visitorId: v.id, industry: assoc?.industry ?? null }, events);

  return Response.json({
    visitorId: v.id,
    merged,
    identified: true,
    membership: member ? { status: member.status, renewalDate: member.renewalDate } : null,
  });
}
