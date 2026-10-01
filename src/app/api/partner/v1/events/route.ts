import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor } from '@/lib/copilot/visitors';
import { recordEvents } from '@/lib/copilot/events';
import { sanitizeClientEvents } from '@/lib/copilot/client-events';
import type { AssociationTenant } from '@/lib/copilot/tenant';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.visitorId !== 'string') return Response.json({ error: 'invalid_request' }, { status: 400 });
  const visitor = await getVisitor(tenant, body.visitorId);
  if (!visitor) return Response.json({ error: 'unknown_visitor' }, { status: 404 });
  const { events, rejected } = sanitizeClientEvents(body.events);

  // A session id is kept only when that session belongs to this visitor in this association.
  const sessionIds = [...new Set(events.map((e) => e.sessionId).filter((s): s is string => !!s))];
  if (sessionIds.length) {
    const { data, error } = await supabase.from('chat_sessions').select('id')
      .in('id', sessionIds).eq('account_id', tenant.accountId).eq('visitor_id', visitor.id);
    if (error) console.error('[copilot/events]', 'session ownership check failed', error.message);
    const owned = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
    for (const e of events) if (e.sessionId && !owned.has(e.sessionId)) delete e.sessionId;
  }

  const assoc = await loadAssociation(tenant);
  await recordEvents({ partnerId: tenant.partnerId, accountId: tenant.accountId, visitorId: visitor.id, industry: assoc?.industry ?? null }, events);
  return Response.json({ accepted: events.length, rejected });
}
