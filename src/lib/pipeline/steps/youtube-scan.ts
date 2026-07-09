import { createClient } from '@/lib/supabase/server';
import { setCount } from '@/lib/pipeline/state';
import { getYoutubeChannel, getYoutubeVideos, getYoutubeTranscript } from '@/lib/scraping/youtubeScraper';
import type { StepContext } from '../types';
import type { StepResult } from './index';

// Quote (demo) scans grab fewer videos to stay fast; full scans grab more.
const QUOTE_VIDEO_CAP = 10;
const FULL_VIDEO_CAP = 30;

// instagram_posts.views_count / likes_count are int4 — clamp so a video with
// billions of views doesn't overflow the column and fail the whole upsert.
const INT4_MAX = 2147483647;
function capInt4(n?: number): number {
  return Math.max(0, Math.min(Math.floor(Number(n) || 0), INT4_MAX));
}
// posted_at is NOT NULL with no default — always supply a valid timestamp.
function toPostedAt(dateLike?: string): string {
  if (dateLike) {
    const t = Date.parse(dateLike);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

/**
 * YouTube scan step. If the account has a YouTube channel (`options.youtube`),
 * scrape the channel + its recent videos + transcripts via ScrapeCreators, store
 * them platform-tagged in `instagram_posts` / `instagram_transcriptions` (so the
 * existing RAG + persona steps pick them up automatically), and stash channel
 * metadata (subscribers/views) in `config.youtube`. No channel → skip.
 */
export async function youtubeScanStep(ctx: StepContext): Promise<StepResult> {
  const channelInput = ctx.state.options?.youtube;
  if (!channelInput) return { status: 'advance' };

  const supabase = await createClient();

  // Channel metadata → config.youtube (read-modify-write merge).
  const channel = await getYoutubeChannel(channelInput);
  if (channel) {
    const { data } = await supabase.from('accounts').select('config').eq('id', ctx.accountId).single();
    const cfg: Record<string, any> = { ...(data?.config ?? {}) };
    cfg.youtube = {
      channelId: channel.channelId,
      name: channel.name,
      handle: channel.handle,
      subscribers: channel.subscriberCount,
      videoCount: channel.videoCount,
      views: channel.viewCount,
    };
    await supabase.from('accounts').update({ config: cfg }).eq('id', ctx.accountId);
  }

  const cap = ctx.state.options?.scanMode === 'quote' ? QUOTE_VIDEO_CAP : FULL_VIDEO_CAP;
  const videos = await getYoutubeVideos(channelInput, cap);
  await setCount(ctx.jobId, 'youtube-scan', { done: 0, total: videos.length });

  let done = 0;
  for (const v of videos) {
    try {
      const { data: postRow } = await supabase
        .from('instagram_posts')
        .upsert(
          {
            account_id: ctx.accountId,
            platform: 'youtube',
            shortcode: `yt_${v.id}`,
            post_url: v.url,
            type: 'video',
            caption: [v.title, v.description].filter(Boolean).join('\n').slice(0, 5000),
            media_urls: [v.url],
            views_count: capInt4(v.views),
            posted_at: toPostedAt(v.publishDate),
          },
          { onConflict: 'account_id,shortcode' },
        )
        .select('id')
        .single();

      // instagram_transcriptions.source_id is a uuid FK to the post row — use the
      // post's id, NOT the shortcode (a text id here throws invalid-uuid).
      const transcript = postRow?.id ? await getYoutubeTranscript(v.url) : '';
      if (transcript && postRow?.id) {
        await supabase.from('instagram_transcriptions').upsert(
          {
            account_id: ctx.accountId,
            platform: 'youtube',
            source_type: 'post',
            source_id: postRow.id,
            video_url: v.url,
            transcription_text: transcript,
            processing_status: 'completed',
          },
          { onConflict: 'source_type,source_id' },
        );
      }
    } catch (e: any) {
      console.error(`[youtube-scan] video ${v.id} failed:`, e?.message || e);
    }
    done++;
    if (done % 5 === 0) await setCount(ctx.jobId, 'youtube-scan', { done, total: videos.length });
  }

  await setCount(ctx.jobId, 'youtube-scan', { done: videos.length, total: videos.length });
  return { status: 'advance' };
}
