import { createClient } from '@/lib/supabase/server';
import { setCount } from '@/lib/pipeline/state';
import { BATCH_SIZES } from '../types';
import type { StepContext } from '../types';
import { hasInstagram, enrichSkips, type StepResult } from './index';
// Same transcriber fns used by content-processor-orchestrator.ts. Transcriptions
// are stored in the separate `instagram_transcriptions` table (keyed by
// source_type/source_id) — `instagram_posts` has NO transcription column.
import { transcribeVideo, saveTranscription } from '@/lib/transcription/gemini-transcriber';
import type { TranscriptionInput } from '@/lib/transcription/gemini-transcriber';

// Quote (pre-sales demo) scans transcribe only the N most recent videos — the
// whole point of quote mode is speed/cost, and transcription is the slowest step
// (~15 min for ~40 videos). The persona builds fine from captions + a few reels.
const QUOTE_TRANSCRIBE_CAP = 5;

/** Extract a usable video URL from an `instagram_posts.media_urls` value. */
function extractVideoUrl(mediaUrls: any): string | null {
  if (!mediaUrls) return null;
  if (Array.isArray(mediaUrls)) {
    const first = mediaUrls[0];
    if (!first) return null;
    return typeof first === 'string' ? first : (first.url ?? null);
  }
  return typeof mediaUrls === 'string' ? mediaUrls : null;
}

/** IDs of posts that already have a completed transcription for this account. */
async function completedPostIds(supabase: any, accountId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('instagram_transcriptions')
    .select('source_id')
    .eq('account_id', accountId)
    .eq('source_type', 'post')
    .eq('processing_status', 'completed');
  return new Set((data ?? []).map((r: any) => r.source_id));
}

export async function transcribeStep(ctx: StepContext): Promise<StepResult> {
  if (enrichSkips(ctx, 'instagram')) return { status: 'advance' }; // enriching a different source
  if (!hasInstagram(ctx)) return { status: 'advance' }; // website-only account: no IG videos to transcribe
  if (!ctx.state.options?.transcribe) return { status: 'advance' };

  const supabase = await createClient();

  // All video posts (reels + videos) for this account. Mirror the
  // content-processor: only posts with a usable video URL are transcribable.
  const { data: videoPosts } = await supabase
    .from('instagram_posts')
    .select('id, media_urls, video_duration, posted_at')
    .eq('account_id', ctx.accountId)
    .in('type', ['reel', 'video'])
    .order('posted_at', { ascending: false, nullsFirst: false }); // most recent first

  let posts = (videoPosts ?? [])
    .map((p: any) => ({ id: p.id as string, url: extractVideoUrl(p.media_urls), duration: p.video_duration as number | undefined }))
    .filter((p: { url: string | null }) => !!p.url) as Array<{ id: string; url: string; duration?: number }>;

  // Quote mode: only the N most recent videos (posts are ordered posted_at DESC).
  if (ctx.state.options?.scanMode === 'quote') posts = posts.slice(0, QUOTE_TRANSCRIBE_CAP);

  const total = posts.length;

  if (total === 0) {
    await setCount(ctx.jobId, 'transcribe', { done: 0, total: 0 });
    return { status: 'advance' };
  }

  const transcribed = await completedPostIds(supabase, ctx.accountId);
  const pending = posts.filter((p) => !transcribed.has(p.id));

  if (pending.length === 0) {
    await setCount(ctx.jobId, 'transcribe', { done: total, total });
    return { status: 'advance' };
  }

  // Transcribe the next batch (transcribeVideo + saveTranscription, mirroring
  // content-processor-orchestrator.ts). Per-video failures are non-fatal and are
  // retried on the next re-enqueue.
  const batch = pending.slice(0, BATCH_SIZES.transcribe);
  for (const p of batch) {
    const input: TranscriptionInput = {
      source_type: 'post',
      source_id: p.id,
      video_url: p.url,
      video_duration: p.duration,
    };
    try {
      const output = await transcribeVideo(input);
      await saveTranscription(ctx.accountId, input, output);
    } catch {
      // leave for a later retry
    }
  }

  // Recompute remaining after this batch to decide re-enqueue vs advance.
  const transcribedAfter = await completedPostIds(supabase, ctx.accountId);
  const remaining = posts.filter((p) => !transcribedAfter.has(p.id)).length;

  await setCount(ctx.jobId, 'transcribe', { done: total - remaining, total });
  return remaining > 0 ? { status: 're-enqueue' } : { status: 'advance' };
}
