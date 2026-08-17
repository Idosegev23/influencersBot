#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Persist an account's top reels as playable mp4s and seed the banner rotation.
 *
 * Why a script and not a cron: Instagram's mp4 URLs are signed with a short
 * `oe=` expiry, so the ones already in `instagram_posts.media_urls` are dead
 * within a week or two. The only way to play a reel is to fetch a fresh URL
 * from the scraper and copy the file into our own storage. Doing that for
 * every reel on every scan would cost gigabytes for no benefit — only the
 * handful chosen for a banner needs it.
 *
 * The rotation this writes to `config.chat.banner.art.reels` is SEEDED from
 * view counts but is meant to be edited by hand afterwards. Rank order says
 * nothing about whether a reel reads well muted, cropped to a banner, and
 * looping — so a bad one should be droppable by deleting a line from config,
 * not by changing code.
 *
 * Usage:
 *   persist-reel-videos.ts <account_id> [--shortcodes=A,B,C] [--count=3] [--dry-run]
 *
 * Prefer --shortcodes. Ranking by views picks what an audience watched, which
 * is a different question from what plays well silent, cropped and looping —
 * see the comment at the ranking code.
 *
 * Requires Node 22 (the Supabase client needs native WebSocket):
 *   nvm use 22
 *   npx tsx --tsconfig tsconfig.json scripts/persist-reel-videos.ts \
 *     038fd490-906d-431f-b428-ff9203ce4968 --shortcodes=DTQf3YkjM_h,DLAI4FgNpSs
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Modules are imported inside main(), not at the top. scrapeCreatorsClient
// reads SCRAPECREATORS_API_KEY into a module-level const, and every static
// import is evaluated BEFORE the dotenv.config() call above — so a plain
// `import { getScrapeCreatorsClient }` throws "not configured" every time.
// (Top-level await would fix the ordering but tsx compiles this to CJS.)

/** How deep to look for reels before ranking. Reels are sparse among posts. */
const FETCH_LIMIT = 60;
/**
 * Named shortcodes get a much deeper sweep. Curating by eye means picking from
 * the whole archive — the good food reels on the account this was built for
 * sat well outside the recent window, and a silent "not found" would have sent
 * you back to view rank, which is the thing hand-picking exists to escape.
 */
const FETCH_LIMIT_TARGETED = 240;

function arg(name: string, fallback: string): string {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
}

async function main() {
  const { createClient } = await import('@/lib/supabase/server');
  const { getScrapeCreatorsClient } = await import('@/lib/scraping/scrapeCreatorsClient');
  const { persistReelVideo, persistPostMedia } = await import('@/lib/scraping/media-storage');

  const accountId = process.argv[2];
  const count = Math.max(1, Math.min(5, Number(arg('count', '3')) || 3));
  const dryRun = process.argv.includes('--dry-run');

  if (!accountId || accountId.startsWith('--')) {
    console.error('Usage: persist-reel-videos.ts <account_id> [--count=3] [--dry-run]');
    process.exit(1);
  }

  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    console.error(`Account ${accountId} not found: ${error?.message}`);
    process.exit(1);
  }

  const config: any = account.config || {};
  const { data: persona } = await supabase
    .from('chatbot_persona')
    .select('instagram_username')
    .eq('account_id', accountId)
    .maybeSingle();
  const username = persona?.instagram_username || config.username;

  if (!username) {
    console.error('No instagram username on the persona or config — cannot fetch fresh URLs.');
    process.exit(1);
  }

  // Hand-picked shortcodes beat view rank, and should be the normal path.
  // View count measures what an audience watched, not what works as a silent
  // looping backdrop: on the account this was built for, the most-watched
  // reels were a talking-head about relationships and a soldier's memorial,
  // while the ones that actually suit a recipe assistant — a pan of pasta, a
  // bowl of orzo — sat far down the list. Rank is a starting point, not a
  // choice; look at the frames before you ship them.
  const wanted = arg('shortcodes', '').split(',').map((s) => s.trim()).filter(Boolean);
  const limit = wanted.length ? FETCH_LIMIT_TARGETED : FETCH_LIMIT;

  console.log(`Account ${accountId} (@${username}) — fetching ${limit} posts for fresh media URLs...`);
  const posts = await getScrapeCreatorsClient().getPosts(username, limit);

  const videos = posts.filter((p) => p.media_type === 'video' && p.media_urls?.[0]);

  const candidates = wanted.length
    ? wanted.map((sc) => videos.find((p) => p.shortcode === sc)).filter(Boolean as any as (p: any) => p is any)
    : videos.sort((a, b) => (b.views_count || 0) - (a.views_count || 0)).slice(0, count);

  for (const sc of wanted) {
    if (!videos.some((p) => p.shortcode === sc)) {
      console.warn(`  ! ${sc} not among the ${videos.length} videos in the last ${limit} posts — skipped`);
    }
  }

  if (candidates.length === 0) {
    console.error('No video posts with a media URL came back from the scraper.');
    process.exit(1);
  }

  console.log(`\nTop ${candidates.length} by views:`);
  for (const p of candidates) {
    console.log(`  ${p.shortcode.padEnd(14)} ${String(p.views_count || 0).padStart(10)} views`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing downloaded, nothing written.');
    return;
  }

  const reels: { video: string; poster: string | null }[] = [];
  for (const p of candidates) {
    process.stdout.write(`\nPersisting ${p.shortcode} ... `);
    const result = await persistReelVideo(supabase as any, accountId, p.shortcode, p.media_urls[0]);
    if (!result.url) {
      console.log(`FAILED — ${result.error}`);
      continue;
    }
    const mb = result.bytes / 1_048_576;
    if (mb > 15) {
      console.log(`\n  ⚠ ${mb.toFixed(1)}MB — every chat open re-serves this. Consider a shorter reel.`);
    }
    // Re-persist the images too: this is the only moment we hold live URLs for
    // this post, and the banner needs a poster frame that outlives them.
    const stored = await persistPostMedia(
      supabase as any,
      accountId,
      p.shortcode,
      p.media_urls.slice(1),
      p.thumbnail_url,
    );
    const poster = stored.stored_media_urls?.[0] || stored.stored_thumbnail_url || null;
    console.log(`ok — ${mb.toFixed(1)}MB${poster ? ' (+poster)' : ' (no poster)'}`);
    reels.push({ video: result.url, poster });
  }

  if (reels.length === 0) {
    console.error('\nNothing persisted — leaving config untouched.');
    process.exit(1);
  }

  // One list at account level, read by both surfaces. Writing it per-banner
  // meant copying the same array into config.chat and config.widget and
  // keeping them in step; the reels belong to the account, not to a surface.
  // Its presence is also the opt-in — resolveArt switches to video whenever an
  // account has a rotation and its banner has not explicitly asked for a still.
  const { error: writeErr } = await supabase
    .from('accounts')
    .update({ config: { ...config, reels } })
    .eq('id', accountId);

  if (writeErr) {
    console.error(`\nFailed to write config: ${writeErr.message}`);
    process.exit(1);
  }

  console.log(`\nWrote ${reels.length} reel(s) to config.reels — live on the chat page AND the widget.`);
  console.log('Edit or prune that list by hand if one of them reads badly muted.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
