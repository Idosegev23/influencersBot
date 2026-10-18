import { requireConsole, canManage } from '@/lib/copilot/console-auth';
import { loadConsoleAccount, updateSettings, refuse } from '@/lib/copilot/console-data';
import { readJsonBody } from '@/lib/copilot/http';

export const dynamic = 'force-dynamic';

/** PATCH {branding?, opening_questions?, exclusions?, contact_trigger?, escalation?, links?, tone?} -> {settings}. Owner/admin only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireConsole(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const acc = await loadConsoleAccount(ctx, id);
  if (acc instanceof Response) return acc;
  if (!canManage(ctx)) return refuse(403, 'forbidden');
  const parsed = await readJsonBody(req, 32_768);
  if (parsed instanceof Response) return parsed;
  return updateSettings(acc, parsed.body);
}
