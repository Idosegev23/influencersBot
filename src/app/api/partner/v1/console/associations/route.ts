import { requireConsole, canManage } from '@/lib/copilot/console-auth';
import { listAssociations, refuse } from '@/lib/copilot/console-data';
import { createAssociation } from '@/lib/copilot/console-create';
import { readJsonBody } from '@/lib/copilot/http';

export const dynamic = 'force-dynamic';

/** GET -> the associations this console user may see, with 30-day activity and scan state. */
export async function GET(req: Request) {
  const ctx = await requireConsole(req);
  if (ctx instanceof Response) return ctx;
  return listAssociations(ctx);
}

/** POST {name, websiteUrl, slug} -> 201 {id, slug, jobId}. Partner staff with owner/admin only. */
export async function POST(req: Request) {
  const ctx = await requireConsole(req);
  if (ctx instanceof Response) return ctx;
  if (ctx.accountId !== null || !canManage(ctx)) return refuse(403, 'forbidden');
  const parsed = await readJsonBody(req, 4096);
  if (parsed instanceof Response) return parsed;
  return createAssociation(ctx, parsed.body);
}
