import { requireConsole } from '@/lib/copilot/console-auth';
import { loadConsoleAccount } from '@/lib/copilot/console-data';
import { scanStatus } from '@/lib/copilot/console-create';

export const dynamic = 'force-dynamic';

/** GET -> the latest scan of this association: status, percent, steps. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireConsole(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const acc = await loadConsoleAccount(ctx, id);
  if (acc instanceof Response) return acc;
  return scanStatus(acc);
}
