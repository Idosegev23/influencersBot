import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor } from '@/lib/copilot/visitors';
import { recordEvents } from '@/lib/copilot/events';
import { sanitizeClientEvents } from '@/lib/copilot/client-events';
import type { AssociationTenant } from '@/lib/copilot/tenant';

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
  const assoc = await loadAssociation(tenant);
  await recordEvents({ partnerId: tenant.partnerId, accountId: tenant.accountId, visitorId: visitor.id, industry: assoc?.industry ?? null }, events);
  return Response.json({ accepted: events.length, rejected });
}
