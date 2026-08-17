#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Roll the reel banner out across accounts.
 *
 * For each eligible account: score its stored poster frames with the vision
 * picker, take the best few, fetch fresh mp4 URLs from the scraper (the ones in
 * the database are signed and expire within a week or two), copy the files into
 * our storage, and write `config.reels`. That array is the switch — the banner
 * turns to video wherever it exists, on the chat page and in the widget.
 *
 * Judging comes first and costs almost nothing (one small image per candidate),
 * so accounts with nothing usable are skipped before any megabytes move.
 *
 * Requires Node 22 — the Supabase client needs native WebSocket.
 *
 * Usage:
 *   nvm use 22
 *   npx tsx --tsconfig tsconfig.json scripts/rollout-reel-banners.ts [options]
 *
 *   --dry-run          score and report, download nothing, write nothing
 *   --limit=N          process at most N accounts
 *   --count=N          reels per account (default 3)
 *   --min-score=N      reject frames scoring below this (default 6)
 *   --account=<uuid>   just this one
 *   --skip-existing    leave accounts that already have config.reels alone
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

/**
 * Deep enough that the judge can reach past the face-heavy top of the view
 * ranking; the picker exits early once it has enough usable frames, so this is
 * a ceiling rather than a per-account cost.
 */
const CANDIDATES_PER_ACCOUNT = 30;

function arg(name: string, fallback: string): string {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const { createClient } = await import('@/lib/supabase/server');
  const { getScrapeCreatorsClient } = await import('@/lib/scraping/scrapeCreatorsClient');
  const { persistReelVideo, persistPostMedia } = await import('@/lib/scraping/media-storage');
  const { pickReels } = await import('@/lib/widget/reel-picker');

  const dryRun = flag('dry-run');
  const skipExisting = flag('skip-existing');
  const count = Math.max(1, Math.min(5, Number(arg('count', '3')) || 3));
  const minScore = Number(arg('min-score', '6'));
  const limit = Number(arg('limit', '0')) || 0;
  const onlyAccount = arg('account', '');

  const supabase = await createClient();

  let q = supabase.from('accounts').select('id, config, status').eq('status', 'active');
  if (onlyAccount) q = q.eq('id', onlyAccount);
  const { data: accounts, error } = await q;
  if (error || !accounts) {
    console.error('Could not load accounts:', error?.message);
    process.exit(1);
  }

  let targets = accounts as any[];
  if (skipExisting) {
    targets = targets.filter((a) => !Array.isArray(a.config?.reels) || a.config.reels.length === 0);
  }
  if (limit) targets = targets.slice(0, limit);

  console.log(`${targets.length} account(s) to consider${dryRun ? ' (dry run)' : ''}\n`);

  const summary = { done: 0, skippedNoVideo: 0, skippedNothingUsable: 0, failed: 0, bytes: 0 };

  for (const account of targets) {
    const config: any = account.config || {};
    const label = config.username || account.id;

    // Candidates come from what we already scraped: poster frames are stored
    // and permanent, so scoring costs one small image fetch each and no
    // scraper calls. Only the winners need fresh URLs.
    const { data: posts } = await supabase
      .from('instagram_posts')
      .select('shortcode, views_count, caption, stored_media_urls, stored_thumbnail_url')
      .eq('account_id', account.id)
      .in('type', ['reel', 'video'])
      .not('stored_media_urls', 'is', null)
      .order('views_count', { ascending: false, nullsFirst: false })
      .limit(CANDIDATES_PER_ACCOUNT);

    const candidates = (posts || [])
      .map((p: any) => ({
        shortcode: p.shortcode,
        poster: p.stored_media_urls?.[0] || p.stored_thumbnail_url,
        viewsCount: p.views_count,
        caption: p.caption,
      }))
      .filter((c: any) => c.poster);

    if (candidates.length === 0) {
      summary.skippedNoVideo++;
      console.log(`— ${label}: no stored video posters, skipping`);
      continue;
    }

    const { picked, rejected, unjudged } = await pickReels(candidates, { count, minScore });
    console.log(`▸ ${label}: judged ${candidates.length - unjudged.length}/${candidates.length}, ${picked.length} usable`);
    for (const p of picked) console.log(`    ✓ ${p.shortcode.padEnd(14)} ${p.score}/10  ${p.reason}`);
    for (const r of rejected.slice(0, 3)) {
      const why = r.faceDominant ? 'face dominant' : r.burnedInText ? 'burned-in text' : `score ${r.score}`;
      console.log(`    ✗ ${r.shortcode.padEnd(14)} ${why} — ${r.reason}`);
    }

    if (picked.length === 0) {
      summary.skippedNothingUsable++;
      continue;
    }
    if (dryRun) { summary.done++; continue; }

    // Fresh mp4 URLs, only for the winners.
    const username = config.username;
    if (!username) { summary.failed++; console.log(`    ! no username, cannot fetch fresh URLs`); continue; }

    let fresh: any[] = [];
    try {
      fresh = await getScrapeCreatorsClient().getPosts(username, 240);
    } catch (e: any) {
      summary.failed++;
      console.log(`    ! scraper failed: ${e?.message}`);
      continue;
    }

    const reels: { video: string; poster: string | null }[] = [];
    for (const p of picked) {
      const post = fresh.find((f) => f.shortcode === p.shortcode);
      if (!post?.media_urls?.[0]) { console.log(`    ! ${p.shortcode}: not in the fresh window`); continue; }
      const result = await persistReelVideo(supabase as any, account.id, p.shortcode, post.media_urls[0]);
      if (!result.url) { console.log(`    ! ${p.shortcode}: ${result.error}`); continue; }
      summary.bytes += result.bytes;
      const stored = await persistPostMedia(
        supabase as any, account.id, p.shortcode, post.media_urls.slice(1), post.thumbnail_url,
      );
      reels.push({
        video: result.url,
        poster: stored.stored_media_urls?.[0] || stored.stored_thumbnail_url || null,
      });
      console.log(`    ↑ ${p.shortcode} ${(result.bytes / 1_048_576).toFixed(1)}MB`);
    }

    if (reels.length === 0) { summary.failed++; continue; }

    const { error: writeErr } = await supabase
      .from('accounts')
      .update({ config: { ...config, reels } })
      .eq('id', account.id);
    if (writeErr) { summary.failed++; console.log(`    ! write failed: ${writeErr.message}`); continue; }

    summary.done++;
    console.log(`    → config.reels = ${reels.length}`);
  }

  console.log('\n' + JSON.stringify({
    ...summary,
    storedMB: +(summary.bytes / 1_048_576).toFixed(1),
  }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
