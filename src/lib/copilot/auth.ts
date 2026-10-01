import { bearerToken, hashPartnerKey, normalizeHost } from './keys';
import { resolveTenant, type Tenant } from './tenant';

function refuse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function requireTenant(req: Request, opts: { association: boolean }): Promise<Tenant | Response> {
  const token = bearerToken(req.headers.get('authorization'));
  if (!token) return refuse(401, 'missing_key');
  const host = normalizeHost(req.headers.get('x-tenant-host'));
  if (!host) return refuse(400, 'missing_host');
  const r = await resolveTenant(hashPartnerKey(token), host);
  if (r.ok === false) return refuse(r.status, r.error);
  if (opts.association && !r.tenant.accountId) return refuse(400, 'association_host_required');
  return r.tenant;
}
