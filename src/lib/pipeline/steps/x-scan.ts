import { createClient } from '@/lib/supabase/server';
import { setCount } from '@/lib/pipeline/state';
import { getTwitterProfile, getTwitterTweets } from '@/lib/scraping/twitterScraper';
import { persistPostMedia } from '@/lib/scraping/media-storage';
import type { StepContext } from '../types';
import { enrichSkips, type StepResult } from './index';
import { withFreshCopilot } from '@/lib/copilot/preserve-copilot';

const QUOTE_TWEET_CAP = 30;
const FULL_TWEET_CAP = 100;

// instagram_posts counters are int4 — clamp so a huge count can't fail the upsert.
const INT4_MAX = 2147483647;
function capInt4(n?: number): number {
  return Math.max(0, Math.min(Math.floor(Number(n) || 0), INT4_MAX));
}

/**
 * X scan step. If the account has an X handle (`options.x`), scrape the profile and
 * the account's most popular tweets via ScrapeCreators and store them platform-tagged
 * in `instagram_posts` (so RAG, persona and insights pick them up with no further
 * wiring). Profile metadata goes to `config.x`. No handle → skip.
 *
 * The tweet list is the provider's "most popular 100", not a timeline — see
 * twitterScraper's header. Replies are stored as comments-count only; the endpoint
 * returns no reply text.
 */
export async function xScanStep(ctx: StepContext): Promise<StepResult> {
  if (enrichSkips(ctx, 'x')) return { status: 'advance' }; // enriching a different source
  const handle = ctx.state.options?.x;
  if (!handle) return { status: 'advance' };

  const supabase = await createClient();

  const profile = await getTwitterProfile(handle);
  if (profile) {
    const { data } = await supabase.from('accounts').select('config').eq('id', ctx.accountId).single();
    const cfg: Record<string, any> = { ...(data?.config ?? {}) };
    cfg.x = {
      id: profile.id,
      handle: profile.handle,
      name: profile.name,
      description: profile.description,
      location: profile.location,
      url: profile.url,
      followers: profile.followers,
      tweetCount: profile.tweetCount,
      createdAt: profile.createdAt,
    };
    await supabase.from('accounts').update({ config: await withFreshCopilot(supabase, ctx.accountId, cfg) }).eq('id', ctx.accountId);
  }

  const cap = ctx.state.options?.scanMode === 'quote' ? QUOTE_TWEET_CAP : FULL_TWEET_CAP;
  const tweets = await getTwitterTweets(handle, cap);
  await setCount(ctx.jobId, 'x-scan', { done: 0, total: tweets.length });

  let done = 0;
  for (const t of tweets) {
    try {
      const shortcode = `x_${t.id}`;
      const thumb = t.images[0] || null;
      // posted_at is NOT NULL with no default.
      const postedAt = t.createdAt || new Date().toISOString();
      // pbs.twimg.com urls do not expire, but persisting makes the demo independent of X.
      const stored = t.images.length
        ? await persistPostMedia(supabase, ctx.accountId, shortcode, t.images, thumb)
        : null;
      await supabase.from('instagram_posts').upsert(
        {
          account_id: ctx.accountId,
          platform: 'x',
          shortcode,
          post_url: t.url,
          // instagram_posts.type is CHECK-constrained to post|reel|carousel|video.
          type: t.hasVideo ? 'video' : t.images.length > 1 ? 'carousel' : 'post',
          caption: t.text.slice(0, 5000),
          media_urls: t.images,
          thumbnail_url: thumb,
          stored_media_urls: stored?.stored_media_urls ?? null,
          stored_thumbnail_url: stored?.stored_thumbnail_url ?? null,
          media_stored_at: stored?.media_stored_at ?? new Date().toISOString(),
          likes_count: capInt4(t.likes),
          comments_count: capInt4(t.replies),
          views_count: capInt4(t.views),
          posted_at: postedAt,
        },
        { onConflict: 'account_id,shortcode' },
      );
    } catch (e: any) {
      console.error(`[x-scan] tweet ${t.id} failed:`, e?.message || e);
    }
    done++;
    if (done % 10 === 0) await setCount(ctx.jobId, 'x-scan', { done, total: tweets.length });
  }

  await setCount(ctx.jobId, 'x-scan', { done: tweets.length, total: tweets.length });
  return { status: 'advance' };
}
