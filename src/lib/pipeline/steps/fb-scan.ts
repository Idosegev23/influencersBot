import { createClient } from '@/lib/supabase/server';
import { setCount } from '@/lib/pipeline/state';
import { getFacebookProfile, getFacebookPosts, getFacebookPostImage } from '@/lib/scraping/facebookScraper';
import { persistPostMedia } from '@/lib/scraping/media-storage';
import type { StepContext } from '../types';
import { enrichSkips, type StepResult } from './index';

/** Posts whose media is enriched + persisted per invocation. */
const MEDIA_BATCH = 25;
/** Ceiling on the media pass; the run route has no re-enqueue limit of its own. */
const MAX_MEDIA_BATCHES = 60;

const QUOTE_POST_CAP = 15;
const FULL_POST_CAP = 300;

// instagram_posts.views_count is int4 — clamp so a huge view count can't overflow
// the column and fail the upsert. Same guard as tiktok-scan.
const INT4_MAX = 2147483647;
function capInt4(n?: number): number {
  return Math.max(0, Math.min(Math.floor(Number(n) || 0), INT4_MAX));
}

// posted_at is NOT NULL with no default. Facebook gives both an ISO
// `creation_time` and a unix `publishTime`; prefer the ISO one.
function toPostedAt(createdAt?: string, publishTime?: number): string {
  if (createdAt && !Number.isNaN(Date.parse(createdAt))) return new Date(createdAt).toISOString();
  if (publishTime && Number.isFinite(publishTime)) return new Date(publishTime * 1000).toISOString();
  return new Date().toISOString();
}

/**
 * Facebook scan step. If the account has a Facebook page (`options.facebook`),
 * scrape the page profile + recent posts and store them platform-tagged in
 * `instagram_posts` (so RAG, persona and insights pick them up with no further
 * wiring — retrieval does not branch on `platform`). Page metadata goes to
 * `config.facebook`. No page → skip.
 *
 * Departs from the TikTok template in one way: `topComments` are persisted onto
 * the post row. They are the only real audience questions this kind of account
 * has, and the content-gap insight is built directly on them — a scan that drops
 * them makes that insight impossible to produce honestly.
 */
export async function fbScanStep(ctx: StepContext): Promise<StepResult> {
  if (enrichSkips(ctx, 'facebook')) return { status: 'advance' }; // enriching a different source
  const page = ctx.state.options?.facebook;
  if (!page) return { status: 'advance' };

  const supabase = await createClient();

  // Batch 0 walks the page and stores the posts. Every batch after it works on
  // their media, a slice at a time — see mediaBatch below for why that cannot
  // live in the same invocation.
  if (ctx.batch > 0) return mediaBatch(ctx, supabase);

  const profile = await getFacebookProfile(page);
  if (profile) {
    const { data } = await supabase.from('accounts').select('config').eq('id', ctx.accountId).single();
    const cfg: Record<string, any> = { ...(data?.config ?? {}) };
    cfg.facebook = {
      id: profile.id,
      name: profile.name,
      url: profile.url,
      intro: profile.intro,
      category: profile.category,
      followers: profile.followers,
      likes: profile.likes,
      website: profile.website,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      rating: profile.rating,
      ratingCount: profile.ratingCount,
    };
    await supabase.from('accounts').update({ config: cfg }).eq('id', ctx.accountId);
  }

  const cap = ctx.state.options?.scanMode === 'quote' ? QUOTE_POST_CAP : FULL_POST_CAP;
  const posts = await getFacebookPosts(page, cap);
  await setCount(ctx.jobId, 'fb-scan', { done: 0, total: posts.length });

  let done = 0;
  for (const p of posts) {
    try {
      // A post with no text carries nothing for RAG — an image-only post would
      // ingest as an empty chunk. Its engagement still counts for insights, so it
      // is stored, but the caption stays empty rather than being faked.
      const postedAt = toPostedAt(p.createdAt, p.publishTime);
      const { data: postRow } = await supabase
        .from('instagram_posts')
        .upsert(
          {
            account_id: ctx.accountId,
            platform: 'facebook',
            shortcode: `fb_${p.id}`,
            post_url: p.url || null,
            // instagram_posts.type is CHECK-constrained to post|reel|carousel|video.
            type: p.videoViews ? 'video' : 'post',
            caption: p.text.slice(0, 5000),
            media_urls: p.image ? [p.image] : [],
            thumbnail_url: p.image || null,
            likes_count: capInt4(p.reactions),
            comments_count: capInt4(p.comments),
            views_count: capInt4(p.videoViews),
            posted_at: postedAt,
          },
          { onConflict: 'account_id,shortcode' },
        )
        .select('id')
        .single();

      // Comments live in instagram_comments, keyed by the post's uuid — the same
      // home Instagram comments already use, so anything reading audience voice
      // reads one table regardless of platform.
      if (postRow?.id && p.topComments.length > 0) {
        await supabase.from('instagram_comments').upsert(
          p.topComments.map((c) => ({
            post_id: postRow.id,
            account_id: ctx.accountId,
            comment_id: c.id,
            text: c.text,
            // author_username is NOT NULL; Facebook gives a display name, not a handle.
            author_username: c.author || 'facebook_user',
            commented_at: c.publishTime
              ? new Date(c.publishTime * 1000).toISOString()
              : postedAt,
          })),
          { onConflict: 'post_id,comment_id' },
        );
      }
    } catch (e: any) {
      console.error(`[fb-scan] post ${p.id} failed:`, e?.message || e);
    }
    done++;
    if (done % 20 === 0) await setCount(ctx.jobId, 'fb-scan', { done, total: posts.length });
  }

  await setCount(ctx.jobId, 'fb-scan', { done: posts.length, total: posts.length });
  // Hand off to the media pass rather than advancing — see mediaBatch.
  return { status: 're-enqueue' };
}

/**
 * Fill in and preserve post images, a slice per invocation.
 *
 * TWO problems, both found on the live ABA scan:
 *
 * 1. The list endpoint returns `image: null` for a large share of posts — 137 of
 *    300 here — because a link share carries its picture on the attachment. The
 *    single-post endpoint has it, at one credit each, so it is only called for
 *    posts that came back with nothing.
 *
 * 2. Facebook CDN urls EXPIRE. Nothing in the pipeline persisted post media, and
 *    the refresh cron only covers Instagram, so a Facebook image would simply
 *    stop loading partway through a demo. Persisting to our own storage is what
 *    makes the images outlive the scan.
 *
 * Both are per-post network work on top of a 300-post walk, which is why this is
 * a separate batched pass rather than more work inside the first invocation.
 */
async function mediaBatch(ctx: StepContext, supabase: any): Promise<StepResult> {
  // No cursor, deliberately. Every row processed here gets `media_stored_at` set —
  // including a text-only post that will never have an image — so the unprocessed
  // set strictly shrinks and "take the next N" always terminates. An offset would
  // have raced the shrinking set and skipped rows.
  if (ctx.batch > MAX_MEDIA_BATCHES) {
    console.warn(`[fb-scan/media] ceiling reached after ${ctx.batch} batches`);
    return { status: 'advance' };
  }

  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('id, shortcode, post_url, media_urls, thumbnail_url')
    .eq('account_id', ctx.accountId)
    .eq('platform', 'facebook')
    .is('media_stored_at', null)
    .order('posted_at', { ascending: false })
    .limit(MEDIA_BATCH);

  if (!posts || posts.length === 0) return { status: 'advance' };

  let recovered = 0;
  let persisted = 0;

  for (const row of posts) {
    try {
      let mediaUrls: string[] = Array.isArray(row.media_urls) ? row.media_urls : [];
      let thumb: string | null = row.thumbnail_url || null;

      if (mediaUrls.length === 0 && row.post_url) {
        const found = await getFacebookPostImage(row.post_url);
        if (found) {
          mediaUrls = [found];
          thumb = found;
          recovered++;
        }
      }

      if (mediaUrls.length === 0) {
        // Genuinely a text-only post. Stamp it anyway so it leaves the queue —
        // otherwise it would be re-examined on every batch, forever.
        await supabase
          .from('instagram_posts')
          .update({ media_stored_at: new Date().toISOString() })
          .eq('id', row.id);
        continue;
      }

      const stored = await persistPostMedia(supabase, ctx.accountId, row.shortcode, mediaUrls, thumb);
      await supabase
        .from('instagram_posts')
        .update({
          media_urls: mediaUrls,
          thumbnail_url: thumb,
          stored_media_urls: stored.stored_media_urls,
          stored_thumbnail_url: stored.stored_thumbnail_url,
          media_stored_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (stored.stored_media_urls?.length) persisted++;
    } catch (e: any) {
      console.error(`[fb-scan/media] post ${row.shortcode} failed:`, e?.message || e);
    }
  }

  console.log(`[fb-scan/media] batch ${ctx.batch}: recovered ${recovered} images, persisted ${persisted}`);
  return { status: 're-enqueue' };
}
