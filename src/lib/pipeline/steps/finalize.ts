import { createClient } from '@/lib/supabase/server';
import type { StepContext } from '../types';
import type { StepResult } from './index';

/**
 * Final pipeline step.
 *
 * 1. config-wipe guard — a recurring race in this codebase (see biopeptix/
 *    studiopasha memory notes) silently drops identity fields from
 *    `accounts.config`. We reload the row and MERGE any missing identity back.
 * 2. archetype — set from the add-account form (`options.archetype`), falling
 *    back to a website heuristic. Must be set BEFORE tab generation, which reads
 *    it to decide the tab set (brand → products tab, etc.).
 * 3. `generateAndSaveChatConfig` — derives a clean `display_name` from the IG
 *    profile `full_name` (not the raw username), plus theme/greeting/questions.
 *    This is what makes accounts come out fully branded with no manual SQL.
 * 4. `generateTabConfig` — builds the chat-UI tabs from archetype + display_name.
 */
export async function finalizeStep(ctx: StepContext): Promise<StepResult> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', ctx.accountId)
    .single();
  const cfg: Record<string, any> = { ...(data?.config ?? {}) };

  // config-wipe guard — restore identity fields only when they went missing.
  if (!cfg.username) cfg.username = ctx.username;
  if (!cfg.display_name) cfg.display_name = cfg.username || ctx.username; // fallback; generateAndSaveChatConfig upgrades this to the IG full_name below
  if (ctx.state.websiteUrl && !cfg.website_url) cfg.website_url = ctx.state.websiteUrl;
  cfg.isDemo = ctx.state.options?.isDemo ?? false;

  // archetype from the add-account form; heuristic fallback if unspecified.
  if (!cfg.archetype) {
    cfg.archetype = ctx.state.options?.archetype || (ctx.state.websiteUrl ? 'brand' : 'influencer');
  }

  await supabase.from('accounts').update({ config: cfg }).eq('id', ctx.accountId);

  // Clean display_name from IG full_name + theme/greeting (reuse local step-7).
  // Optional — a failure here must not fail the whole pipeline.
  try {
    const { generateAndSaveChatConfig } = await import('@/lib/processing/generate-chat-config');
    await generateAndSaveChatConfig(ctx.accountId);
  } catch {
    /* chat-config generator optional */
  }

  // Tab config (reads archetype + display_name set above).
  try {
    const { generateTabConfig } = await import('@/lib/chat-ui/generate-tab-config');
    await generateTabConfig(ctx.accountId);
  } catch {
    /* tab generator optional */
  }

  return { status: 'advance' };
}
