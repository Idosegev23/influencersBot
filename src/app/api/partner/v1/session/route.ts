import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getOrCreateVisitor, isValidAnonId } from '@/lib/copilot/visitors';
import { recordEvents } from '@/lib/copilot/events';
import type { AssociationTenant } from '@/lib/copilot/tenant';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;

  const body = await req.json().catch(() => null);
  if (!body || !isValidAnonId(body.anonId)) return Response.json({ error: 'invalid_anon_id' }, { status: 400 });

  const assoc = await loadAssociation(tenant);
  if (!assoc) return Response.json({ error: 'association_unavailable' }, { status: 404 });

  const visitor = await getOrCreateVisitor(tenant, body.anonId);

  let sessionId: string | null = null;
  let resumed = false;
  if (typeof body.sessionId === 'string') {
    const { data: s } = await supabase.from('chat_sessions').select('id, account_id, visitor_id').eq('id', body.sessionId).maybeSingle();
    if (s && s.account_id === tenant.accountId && s.visitor_id === visitor.id) { sessionId = s.id; resumed = true; }
  }
  if (!sessionId) {
    const { data: s, error } = await supabase.from('chat_sessions')
      .insert({ account_id: tenant.accountId, visitor_id: visitor.id, anon_id: body.anonId, ref_source: 'copilot' })
      .select('id').single();
    if (error || !s) return Response.json({ error: 'session_unavailable' }, { status: 500 });
    sessionId = s.id;
    await recordEvents(
      { partnerId: tenant.partnerId, accountId: tenant.accountId, visitorId: visitor.id, industry: assoc.industry },
      [{ type: 'session_started', sessionId }],
    );
  }

  return Response.json({
    visitorId: visitor.id,
    sessionId,
    resumed,
    branding: assoc.branding,
    openingQuestions: assoc.openingQuestions,
    identity: { identified: visitor.identity_source !== null, source: visitor.identity_source },
  });
}
