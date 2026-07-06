import { createClient } from '@/lib/supabase/server';
import type { StepContext } from '../types';
import type { StepResult } from './index';

/**
 * Final pipeline step. Runs the config-wipe guard — a recurring race in this
 * codebase (see biopeptix/studiopasha memory notes) silently drops identity
 * fields from `accounts.config`. We reload the row, MERGE any missing identity
 * back (never overwrite existing values), align `config.isDemo` with the
 * pipeline options, then generate the chat-UI tab config.
 */
export async function finalizeStep(ctx: StepContext): Promise<StepResult> {
  const supabase = await createClient();

  // Read-modify-write MERGE: start from whatever is currently persisted so we
  // never clobber archetype/widget/etc. that other steps wrote.
  const { data } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', ctx.accountId)
    .single();
  const cfg: Record<string, any> = { ...(data?.config ?? {}) };

  // config-wipe guard — restore identity fields only when they went missing.
  if (!cfg.username) cfg.username = ctx.username;
  if (!cfg.display_name) cfg.display_name = cfg.username || ctx.username;
  if (ctx.state.websiteUrl && !cfg.website_url) cfg.website_url = ctx.state.websiteUrl;
  cfg.isDemo = ctx.state.options?.isDemo ?? false;

  await supabase.from('accounts').update({ config: cfg }).eq('id', ctx.accountId);

  // Generate the chat-UI tab config (reuse the existing generator). Optional —
  // a missing/failed generator must not fail the whole pipeline.
  try {
    const { generateTabConfig } = await import('@/lib/chat-ui/generate-tab-config');
    await generateTabConfig(ctx.accountId);
  } catch {
    /* generator optional */
  }

  return { status: 'advance' };
}
