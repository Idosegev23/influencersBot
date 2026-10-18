import { requireConsole } from '@/lib/copilot/console-auth';
import { listAssociations } from '@/lib/copilot/console-data';

export const dynamic = 'force-dynamic';

/** GET -> the associations this console user may see, with 30-day activity and scan state. */
export async function GET(req: Request) {
  const ctx = await requireConsole(req);
  if (ctx instanceof Response) return ctx;
  return listAssociations(ctx);
}
