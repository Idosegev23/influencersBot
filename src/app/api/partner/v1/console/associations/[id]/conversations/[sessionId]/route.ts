import { requireConsole } from '@/lib/copilot/console-auth';
import { loadConsoleAccount, conversationTranscript } from '@/lib/copilot/console-data';

export const dynamic = 'force-dynamic';

/** GET -> the anonymised transcript of one session of this association. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const ctx = await requireConsole(req);
  if (ctx instanceof Response) return ctx;
  const { id, sessionId } = await params;
  const acc = await loadConsoleAccount(ctx, id);
  if (acc instanceof Response) return acc;
  return conversationTranscript(acc, sessionId);
}
