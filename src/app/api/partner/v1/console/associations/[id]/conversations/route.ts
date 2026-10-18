import { requireConsole } from '@/lib/copilot/console-auth';
import { loadConsoleAccount, listConversations } from '@/lib/copilot/console-data';

export const dynamic = 'force-dynamic';

/** GET ?cursor=<startedAt of the last row> -> 25 sessions per page, newest first. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireConsole(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const acc = await loadConsoleAccount(ctx, id);
  if (acc instanceof Response) return acc;
  const cursor = new URL(req.url).searchParams.get('cursor');
  return listConversations(acc, cursor || null);
}
