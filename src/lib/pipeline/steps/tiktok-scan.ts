import { createClient } from '@/lib/supabase/server';
import { setCount } from '@/lib/pipeline/state';
import { getTiktokProfile, getTiktokVideos, getTiktokTranscript } from '@/lib/scraping/tiktokScraper';
import type { StepContext } from '../types';
import type { StepResult } from './index';

const QUOTE_VIDEO_CAP = 10;
const FULL_VIDEO_CAP = 25;

/**
 * TikTok scan step. If the account has a TikTok handle (`options.tiktok`), scrape
 * the profile + recent videos + transcripts via ScrapeCreators, store them
 * platform-tagged in `instagram_posts` / `instagram_transcriptions` (so RAG +
 * persona pick them up), and stash profile metadata in `config.tiktok`. No
 * handle → skip.
 */
export async function tiktokScanStep(ctx: StepContext): Promise<StepResult> {
  const handle = ctx.state.options?.tiktok;
  if (!handle) return { status: 'advance' };

  const supabase = await createClient();

  const profile = await getTiktokProfile(handle);
  if (profile) {
    const { data } = await supabase.from('accounts').select('config').eq('id', ctx.accountId).single();
    const cfg: Record<string, any> = { ...(data?.config ?? {}) };
    cfg.tiktok = {
      id: profile.id,
      uniqueId: profile.uniqueId,
      nickname: profile.nickname,
      followers: profile.followers,
      videoCount: profile.videoCount,
    };
    await supabase.from('accounts').update({ config: cfg }).eq('id', ctx.accountId);
  }

  const cap = ctx.state.options?.scanMode === 'quote' ? QUOTE_VIDEO_CAP : FULL_VIDEO_CAP;
  const videos = await getTiktokVideos(handle, cap);
  await setCount(ctx.jobId, 'tiktok-scan', { done: 0, total: videos.length });

  let done = 0;
  for (const v of videos) {
    try {
      await supabase.from('instagram_posts').upsert(
        {
          account_id: ctx.accountId,
          platform: 'tiktok',
          shortcode: `tt_${v.id}`,
          post_url: v.shareUrl,
          type: 'video',
          caption: (v.desc || '').slice(0, 5000),
          media_urls: [v.shareUrl],
          likes_count: v.views ?? 0,
        },
        { onConflict: 'account_id,shortcode' },
      );

      const transcript = await getTiktokTranscript(v.shareUrl);
      if (transcript) {
        await supabase.from('instagram_transcriptions').upsert(
          {
            account_id: ctx.accountId,
            platform: 'tiktok',
            source_type: 'post',
            source_id: `tt_${v.id}`,
            video_url: v.shareUrl,
            transcription_text: transcript,
            processing_status: 'completed',
          },
          { onConflict: 'source_type,source_id' },
        );
      }
    } catch (e: any) {
      console.error(`[tiktok-scan] video ${v.id} failed:`, e?.message || e);
    }
    done++;
    if (done % 5 === 0) await setCount(ctx.jobId, 'tiktok-scan', { done, total: videos.length });
  }

  await setCount(ctx.jobId, 'tiktok-scan', { done: videos.length, total: videos.length });
  return { status: 'advance' };
}
