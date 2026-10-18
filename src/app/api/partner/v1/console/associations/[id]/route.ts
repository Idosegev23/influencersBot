import { requireConsole } from '@/lib/copilot/console-auth';
import { loadConsoleAccount, associationDetail } from '@/lib/copilot/console-data';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireConsole(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const acc = await loadConsoleAccount(ctx, id);
  if (acc instanceof Response) return acc;
  return associationDetail(ctx, acc);
}
