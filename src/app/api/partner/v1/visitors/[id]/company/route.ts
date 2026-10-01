import { requireTenant } from '@/lib/copilot/auth';
import { getVisitor, applyIdentity } from '@/lib/copilot/visitors';
import type { AssociationTenant } from '@/lib/copilot/tenant';

export const dynamic = 'force-dynamic';

const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const company = clean(body?.company, 200);
  if (!company || !clean(body?.provider, 60)) return Response.json({ error: 'invalid_request' }, { status: 400 });
  const visitor = await getVisitor(tenant, id);
  if (!visitor) return Response.json({ error: 'unknown_visitor' }, { status: 404 });
  const { visitor: v } = await applyIdentity(tenant, visitor, {
    source: 'external', company, companyDomain: clean(body?.companyDomain, 253)?.toLowerCase() ?? null,
  });
  return Response.json({ applied: v.company !== visitor.company || v.company_domain !== visitor.company_domain });
}
