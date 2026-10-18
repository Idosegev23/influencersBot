/**
 * The scan pipeline writes accounts.config whole (read, change, write back). A
 * console settings save that lands between that read and that write would be
 * lost. Every such pipeline write re-reads config->copilot immediately before
 * writing and carries it over: the pipeline never owns the copilot object, the
 * console (through copilot_merge_config) does.
 */
export function preserveCopilot<T extends Record<string, any>>(freshConfig: unknown, next: T): T {
  const cp = (freshConfig as any)?.copilot;
  if (!cp || typeof cp !== 'object' || Array.isArray(cp)) return next;
  return { ...next, copilot: cp };
}

export async function withFreshCopilot<T extends Record<string, any>>(db: any, accountId: string, next: T): Promise<T> {
  try {
    const { data, error } = await db.from('accounts').select('config').eq('id', accountId).single();
    if (error) { console.error('[copilot/preserve]', 'fresh read failed', accountId, error.message); return next; }
    return preserveCopilot(data?.config, next);
  } catch (e) {
    console.error('[copilot/preserve]', 'fresh read threw', accountId, e);
    return next;
  }
}
