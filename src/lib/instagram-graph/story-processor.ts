/**
 * Instagram Story Processor
 * Fetches new stories via Graph API → saves to DB → transcribes → indexes to RAG
 *
 * Called by:
 * 1. Cron job (every 30 min) — polls for new stories
 * 2. Webhook story_insights — saves insights when story expires
 */

import { createClient } from '@/lib/supabase/server';

const GRAPH_API_BASE = 'https://graph.instagram.com/v22.0';

interface StoryProcessResult {
  storiesFetched: number;
  storiesNew: number;
  storiesTranscribed: number;
  errors: string[];
}

/**
 * Poll all connected accounts for new stories, transcribe, and index
 */
export async function pollAndProcessNewStories(): Promise<StoryProcessResult> {
  const supabase = await createClient();
  const result: StoryProcessResult = {
    storiesFetched: 0,
    storiesNew: 0,
    storiesTranscribed: 0,
    errors: [],
  };

  // Get all active Graph API connections
  const { data: connections, error: connErr } = await supabase
    .from('ig_graph_connections')
    .select('account_id, ig_business_account_id, ig_username, access_token, token_expires_at')
    .eq('is_active', true);

  if (connErr || !connections?.length) {
    console.log('[Story Processor] No active Graph API connections');
    return result;
  }

  console.log(`[Story Processor] Checking ${connections.length} connected accounts for new stories`);

  for (const conn of connections) {
    // Skip expired tokens
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
      console.warn(`[Story Processor] Token expired for @${conn.ig_username}, skipping`);
      continue;
    }

    try {
      const accountResult = await processAccountStories(
        conn.account_id,
        conn.ig_business_account_id,
        conn.access_token,
        conn.ig_username
      );
      result.storiesFetched += accountResult.storiesFetched;
      result.storiesNew += accountResult.storiesNew;
      result.storiesTranscribed += accountResult.storiesTranscribed;
      result.errors.push(...accountResult.errors);
    } catch (err: any) {
      result.errors.push(`@${conn.ig_username}: ${err.message}`);
    }
  }

  console.log(`[Story Processor] Done: ${result.storiesNew} new stories, ${result.storiesTranscribed} transcribed`);
  return result;
}

/**
 * Process stories for a single account
 */
async function processAccountStories(
  accountId: string,
  igUserId: string,
  accessToken: string,
  username: string
): Promise<StoryProcessResult> {
  const supabase = await createClient();
  const result: StoryProcessResult = {
    storiesFetched: 0,
    storiesNew: 0,
    storiesTranscribed: 0,
    errors: [],
  };

  // 1. Fetch active stories from Graph API
  const storiesUrl = `${GRAPH_API_BASE}/${igUserId}/stories?fields=id,media_type,media_url,timestamp`;
  const res = await fetch(`${storiesUrl}&access_token=${accessToken}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Graph API error: ${err?.error?.message || res.status}`);
  }

  const { data: stories } = await res.json();
  result.storiesFetched = stories?.length || 0;

  if (!stories?.length) {
    console.log(`[Story Processor] @${username}: no active stories`);
    return result;
  }

  console.log(`[Story Processor] @${username}: found ${stories.length} active stories`);

  // 2. Check which stories we already have
  const storyIds = stories.map((s: any) => s.id);
  const { data: existing } = await supabase
    .from('instagram_stories')
    .select('story_id')
    .eq('account_id', accountId)
    .in('story_id', storyIds);

  const existingIds = new Set((existing || []).map((e: any) => e.story_id));

  // 3. Process new stories
  for (const story of stories) {
    if (existingIds.has(story.id)) continue; // Already processed

    result.storiesNew++;
    const mediaType = story.media_type === 'VIDEO' ? 'video' : 'image';
    const expiresAt = new Date(new Date(story.timestamp).getTime() + 24 * 60 * 60 * 1000);

    // Save to DB
    const { data: savedStory, error: saveErr } = await supabase
      .from('instagram_stories')
      .insert({
        account_id: accountId,
        story_id: story.id,
        media_type: mediaType,
        media_url: story.media_url,
        posted_at: story.timestamp,
        expires_at: expiresAt.toISOString(),
        scraped_at: new Date().toISOString(),
        transcription_status: 'pending',
      })
      .select('id')
      .single();

    if (saveErr) {
      if (saveErr.message.includes('duplicate')) continue;
      result.errors.push(`Save story ${story.id}: ${saveErr.message}`);
      continue;
    }

    console.log(`[Story Processor] @${username}: new story ${story.id} (${mediaType})`);

    // 4. Transcribe immediately
    try {
      await transcribeStory(accountId, savedStory!.id, story.id, story.media_url, mediaType);
      result.storiesTranscribed++;
    } catch (err: any) {
      result.errors.push(`Transcribe story ${story.id}: ${err.message}`);
    }
  }

  // 5. Index new stories into RAG (fire-and-forget for speed)
  if (result.storiesNew > 0) {
    indexStoriesToRag(accountId).catch(err => {
      console.error(`[Story Processor] RAG indexing failed for ${accountId}:`, err.message);
    });
  }

  return result;
}

/**
 * Transcribe a single story using Gemini vision (image OCR or video transcription)
 */
async function transcribeStory(
  accountId: string,
  dbStoryId: string,
  storyId: string,
  mediaUrl: string,
  mediaType: 'image' | 'video'
) {
  const supabase = await createClient();

  // Update status to processing
  await supabase
    .from('instagram_stories')
    .update({ transcription_status: 'processing' })
    .eq('id', dbStoryId);

  try {
    const { transcribeVideo, transcribeImage, saveTranscription } = await import('@/lib/transcription/gemini-transcriber');

    let output;
    if (mediaType === 'video') {
      output = await transcribeVideo({
        source_type: 'story',
        source_id: dbStoryId,
        video_url: mediaUrl,
      });
    } else {
      output = await transcribeImage({
        source_type: 'story',
        source_id: dbStoryId,
        image_url: mediaUrl,
      });
    }

    if (!output.success) {
      throw new Error(output.error || 'Transcription failed');
    }

    // Save transcription to DB
    await saveTranscription(
      accountId,
      mediaType === 'video'
        ? { source_type: 'story', source_id: dbStoryId, video_url: mediaUrl }
        : { source_type: 'story', source_id: dbStoryId, video_url: mediaUrl }, // saveTranscription expects TranscriptionInput
      output
    );

    // Update status
    await supabase
      .from('instagram_stories')
      .update({ transcription_status: 'completed' })
      .eq('id', dbStoryId);

    const textLen = output.transcription?.transcription_text?.length || 0;
    console.log(`[Story Processor] Transcribed story ${storyId}: ${textLen} chars`);
  } catch (err: any) {
    await supabase
      .from('instagram_stories')
      .update({ transcription_status: 'failed' })
      .eq('id', dbStoryId);
    throw err;
  }
}

/**
 * Index stories into RAG for the chatbot
 */
async function indexStoriesToRag(accountId: string) {
  try {
    const { ingestAllForAccount } = await import('@/lib/rag/ingest');
    await ingestAllForAccount(accountId);
    console.log(`[Story Processor] RAG re-indexed for ${accountId}`);
  } catch (err: any) {
    console.error(`[Story Processor] RAG failed: ${err.message}`);
  }
}

/**
 * Save story insights from webhook (called when story expires)
 */
export async function saveStoryInsights(
  igAccountId: string,
  insights: {
    media_id: string;
    impressions?: number;
    reach?: number;
    replies?: number;
    exits?: number;
    taps_forward?: number;
    taps_back?: number;
  }
) {
  const supabase = await createClient();

  // Find the account by IG business account ID
  const { data: conn } = await supabase
    .from('ig_graph_connections')
    .select('account_id')
    .eq('ig_business_account_id', igAccountId)
    .single();

  if (!conn) {
    console.warn(`[Story Processor] No connection found for IG account ${igAccountId}`);
    return;
  }

  // Update the story record with insights
  const { error } = await supabase
    .from('instagram_stories')
    .update({
      // Store insights in a JSONB column or individual columns if they exist
      // For now, log them
    })
    .eq('account_id', conn.account_id)
    .eq('story_id', insights.media_id);

  if (error) {
    console.warn(`[Story Processor] Failed to save insights: ${error.message}`);
  }

  console.log(
    `[Story Processor] Story ${insights.media_id} insights: ` +
    `${insights.impressions || 0} impressions, ${insights.reach || 0} reach, ${insights.replies || 0} replies`
  );
}
