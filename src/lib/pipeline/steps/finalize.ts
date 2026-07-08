import { createClient } from '@/lib/supabase/server';
import { extractImageData } from '@/lib/scraping/image-analyzer';
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

  // scan-mode marking — quote = bounded pre-sales demo; undefined ⇒ full.
  cfg.scan_mode = ctx.state.options?.scanMode || 'full';
  cfg.scanned_categories = ctx.state.options?.categories ?? [];

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

  // Best-effort branding — grab a cover image (og:image or first large <img>)
  // from the homepage so quote/website-only accounts come out branded. This is
  // strictly optional: any failure here must never fail the pipeline. We
  // re-read the config (read-modify-write MERGE) so we don't clobber whatever
  // generateAndSaveChatConfig just wrote.
  try {
    if (ctx.state.websiteUrl) {
      const { data: fresh } = await supabase
        .from('accounts')
        .select('config')
        .eq('id', ctx.accountId)
        .single();
      const bcfg: Record<string, any> = { ...(fresh?.config ?? {}) };
      const widget: Record<string, any> = { ...(bcfg.widget ?? {}) };
      if (!widget.coverImage) {
        const res = await fetch(ctx.state.websiteUrl, {
          signal: AbortSignal.timeout(4000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bestieAI/1.0)' },
        });
        const html = await res.text();
        const og =
          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        let cover: string | undefined = og?.[1];
        if (!cover) cover = extractImageData(html)[0]?.src;
        if (cover) {
          try { cover = new URL(cover, ctx.state.websiteUrl).href; } catch { /* keep raw */ }
          widget.coverImage = cover;
          bcfg.widget = widget;
          await supabase.from('accounts').update({ config: bcfg }).eq('id', ctx.accountId);
        }
      }
    }
  } catch {
    /* branding is best-effort */
  }

  return { status: 'advance' };
}
