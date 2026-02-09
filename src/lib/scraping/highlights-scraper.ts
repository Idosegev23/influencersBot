/**
 * Highlights & Stories Scraper
 * גריפת הילייטס וסטוריז מאינסטגרם באמצעות Apify
 */

import { createClient } from '@/lib/supabase/server';

const APIFY_TOKEN = process.env.APIFY_TOKEN;

// Actor specifically for highlights scraping
const HIGHLIGHTS_STORIES_ACTOR = 'datavoyantlab/instagram-highlights-scraper-api-by-url';

// ============================================
// Type Definitions
// ============================================

export interface HighlightData {
  highlight_id: string;
  title: string;
  cover_image_url?: string;
  items_count: number;
  items: HighlightItemData[];
}

export interface HighlightItemData {
  item_id: string;
  item_index: number;
  media_type: 'image' | 'video';
  media_url: string;
  thumbnail_url?: string;
  video_duration?: number;
  posted_at?: string;
}

export interface StoryData {
  story_id: string;
  media_type: 'image' | 'video';
  media_url: string;
  thumbnail_url?: string;
  video_duration?: number;
  has_audio?: boolean;
  mentioned_users?: string[];
  hashtags?: string[];
  posted_at?: string;
  expires_at?: string;
}

export interface ScrapeHighlightsResult {
  highlights: HighlightData[];
  stories: StoryData[];
  raw_data: any;
}

// ============================================
// Apify API Functions
// ============================================

async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<any> {
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN is not configured');
  }

  const encodedActorId = actorId.replace('/', '~');
  const url = `https://api.apify.com/v2/acts/${encodedActorId}/runs?token=${APIFY_TOKEN}`;
  const maxRetries = 3;

  console.log(`[Highlights Scraper] Starting actor: ${actorId}`);

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 502 || response.status === 503) {
          throw new Error(`Apify API temporarily unavailable (${response.status})`);
        }
        console.error('[Highlights Scraper] Error:', errorBody);
        throw new Error(`Apify API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const runId = result.data.id;

      console.log(`[Highlights Scraper] Run started: ${runId}`);
      return await waitForRun(runId);
    } catch (error: any) {
      if (retry === maxRetries - 1) {
        console.error(`[Highlights Scraper] Failed after ${maxRetries} retries:`, error.message);
        throw error;
      }
      const retryWait = 3000 * (retry + 1);
      console.warn(`[Highlights Scraper] Retry ${retry + 1}/${maxRetries} after ${retryWait}ms:`, error.message);
      await new Promise((resolve) => setTimeout(resolve, retryWait));
    }
  }

  throw new Error('Failed to start actor after retries');
}

async function waitForRun(runId: string, maxWaitTime: number = 10 * 60 * 1000): Promise<any> {
  const pollInterval = 5000;
  const startTime = Date.now();
  const maxRetries = 3;

  console.log(`[Highlights Scraper] Waiting for run: ${runId}`);

  while (Date.now() - startTime < maxWaitTime) {
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const response = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
          { signal: AbortSignal.timeout(15000) }
        );

        if (!response.ok) {
          if (response.status === 502 || response.status === 503) {
            throw new Error(`Apify API temporarily unavailable (${response.status})`);
          }
          throw new Error(`Failed to check run status: ${response.status}`);
        }

        const result = await response.json();
        const run = result.data;
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        console.log(`[Highlights Scraper] Status: ${run.status} (${elapsed}s)`);

        if (run.status === 'SUCCEEDED') {
          return run;
        }

        if (run.status === 'FAILED' || run.status === 'ABORTED') {
          throw new Error(`Apify run ${run.status}`);
        }

        break;
      } catch (error: any) {
        if (retry === maxRetries - 1) {
          throw error;
        }
        const retryWait = 2000 * (retry + 1);
        await new Promise((resolve) => setTimeout(resolve, retryWait));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Apify run timeout after ${maxWaitTime / 1000}s`);
}

async function getDatasetItems<T>(datasetId: string): Promise<T[]> {
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`;
  const maxRetries = 3;

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        if (response.status === 502 || response.status === 503) {
          throw new Error(`Apify API temporarily unavailable (${response.status})`);
        }
        throw new Error(`Failed to get dataset: ${response.status}`);
      }

      return response.json();
    } catch (error: any) {
      if (retry === maxRetries - 1) {
        throw error;
      }
      const retryWait = 2000 * (retry + 1);
      await new Promise((resolve) => setTimeout(resolve, retryWait));
    }
  }

  throw new Error('Failed to get dataset after retries');
}

// ============================================
// Main Scraping Functions
// ============================================

/**
 * Scrape highlights and stories for a username
 */
export async function scrapeHighlightsAndStories(
  username: string
): Promise<ScrapeHighlightsResult> {
  console.log(`[Highlights Scraper] Starting scrape for @${username}`);

  const run = await runApifyActor(HIGHLIGHTS_STORIES_ACTOR, {
    links: [`https://www.instagram.com/${username}/`], // Fixed: Actor expects 'links' array, not 'profileUrl'
  });

  const items = await getDatasetItems<any>(run.defaultDatasetId);

  if (items.length === 0) {
    console.log(`[Highlights Scraper] No data found for @${username}`);
    return { highlights: [], stories: [], raw_data: items };
  }

  // Parse the raw data  
  // apify/instagram-scraper with resultsType='highlights' returns each highlight as a top-level item
  const highlights: HighlightData[] = [];
  const stories: StoryData[] = [];

  for (const item of items) {
    // If item IS a highlight (direct from resultsType='highlights')
    if (item.id || item.highlightId) {
      const highlightItems: HighlightItemData[] = [];
      
      // Parse items within highlight
      const items_array = item.items || item.media || [];
      if (Array.isArray(items_array)) {
        items_array.forEach((hItem: any, index: number) => {
          highlightItems.push({
            item_id: hItem.id || hItem.pk || hItem.storyId || `${item.id}_${index}`,
            item_index: index,
            media_type: hItem.type === 'video' || hItem.media_type === 2 || hItem.__typename === 'GraphVideo' ? 'video' : 'image',
            media_url: hItem.videoUrl || hItem.video_url || hItem.imageUrl || hItem.image_url || hItem.displayUrl || hItem.display_url || '',
            thumbnail_url: hItem.thumbnailUrl || hItem.thumbnail_url || hItem.displayUrl || hItem.display_url,
            video_duration: hItem.videoDuration || hItem.video_duration,
            posted_at: hItem.takenAt || hItem.taken_at ? new Date((hItem.takenAt || hItem.taken_at) * 1000).toISOString() : undefined,
          });
        });
      }

      highlights.push({
        highlight_id: String(item.id || item.highlightId || item.pk || ''),
        title: item.title || item.name || 'Untitled',
        cover_image_url: item.coverMediaUrl || item.cover_media?.cropped_image_version?.url || item.cover_image_url,
        items_count: highlightItems.length,
        items: highlightItems,
      });
    }
    
    // If item HAS highlights array (nested structure)
    else if (item.highlights && Array.isArray(item.highlights)) {
      for (const h of item.highlights) {
        const highlightItems: HighlightItemData[] = [];
        
        if (h.items && Array.isArray(h.items)) {
          h.items.forEach((hItem: any, index: number) => {
            highlightItems.push({
              item_id: hItem.id || hItem.pk || `${h.id}_${index}`,
              item_index: index,
              media_type: hItem.media_type === 2 || hItem.is_video ? 'video' : 'image',
              media_url: hItem.video_url || hItem.image_url || hItem.display_url || '',
              thumbnail_url: hItem.thumbnail_url || hItem.display_url,
              video_duration: hItem.video_duration,
              posted_at: hItem.taken_at ? new Date(hItem.taken_at * 1000).toISOString() : undefined,
            });
          });
        }

        highlights.push({
          highlight_id: h.id || h.pk || '',
          title: h.title || 'Untitled',
          cover_image_url: h.cover_media?.cropped_image_version?.url || h.cover_image_url,
          items_count: highlightItems.length,
          items: highlightItems,
        });
      }
    }

    // Parse stories (if present)
    if (item.stories && Array.isArray(item.stories)) {
      for (const s of item.stories) {
        stories.push({
          story_id: s.id || s.pk || '',
          media_type: s.media_type === 2 || s.is_video ? 'video' : 'image',
          media_url: s.video_url || s.image_url || s.display_url || '',
          thumbnail_url: s.thumbnail_url || s.display_url,
          video_duration: s.video_duration,
          has_audio: s.has_audio,
          mentioned_users: s.reel_mentions?.map((m: any) => m.user?.username).filter(Boolean) || [],
          hashtags: s.story_hashtags?.map((h: any) => h.hashtag?.name).filter(Boolean) || [],
          posted_at: s.taken_at ? new Date(s.taken_at * 1000).toISOString() : undefined,
          expires_at: s.expiring_at ? new Date(s.expiring_at * 1000).toISOString() : undefined,
        });
      }
    }
  }

  console.log(`[Highlights Scraper] Found ${highlights.length} highlights, ${stories.length} stories`);

  return { highlights, stories, raw_data: items };
}

// ============================================
// Database Save Functions
// ============================================

/**
 * Save highlights and stories to database
 */
export async function saveHighlightsAndStories(
  accountId: string,
  data: ScrapeHighlightsResult,
  scrapeSessionId?: string
): Promise<{
  highlightsSaved: number;
  highlightItemsSaved: number;
  storiesSaved: number;
}> {
  const supabase = await createClient();
  let highlightsSaved = 0;
  let highlightItemsSaved = 0;
  let storiesSaved = 0;

  // Save raw data first
  if (data.raw_data) {
    const { error: rawError } = await supabase
      .from('influencer_raw_data')
      .insert({
        account_id: accountId,
        data_type: 'highlights',
        raw_json: data.raw_data,
        source_actor: HIGHLIGHTS_STORIES_ACTOR,
        scrape_session_id: scrapeSessionId,
      });

    if (rawError) {
      console.error('[Highlights Scraper] Error saving raw data:', rawError);
    }
  }

  // Save highlights
  for (const highlight of data.highlights) {
    const { data: savedHighlight, error: highlightError } = await supabase
      .from('instagram_highlights')
      .upsert({
        account_id: accountId,
        highlight_id: highlight.highlight_id,
        title: highlight.title,
        cover_image_url: highlight.cover_image_url,
        items_count: highlight.items_count,
        scraped_at: new Date().toISOString(),
      }, {
        onConflict: 'account_id,highlight_id',
      })
      .select('id')
      .single();

    if (highlightError) {
      console.error('[Highlights Scraper] Error saving highlight:', highlightError);
      continue;
    }

    highlightsSaved++;

    // Save highlight items
    if (savedHighlight && highlight.items.length > 0) {
      const itemsToInsert = highlight.items.map(item => ({
        highlight_id: savedHighlight.id,
        account_id: accountId,
        item_id: item.item_id,
        item_index: item.item_index,
        media_type: item.media_type,
        media_url: item.media_url,
        thumbnail_url: item.thumbnail_url,
        video_duration: item.video_duration,
        posted_at: item.posted_at,
        scraped_at: new Date().toISOString(),
      }));

      const { error: itemsError } = await supabase
        .from('instagram_highlight_items')
        .upsert(itemsToInsert, {
          onConflict: 'highlight_id,item_id',
        });

      if (itemsError) {
        console.error('[Highlights Scraper] Error saving highlight items:', itemsError);
      } else {
        highlightItemsSaved += itemsToInsert.length;
      }
    }
  }

  // Save stories
  if (data.stories.length > 0) {
    // Save raw stories data
    const { error: rawStoriesError } = await supabase
      .from('influencer_raw_data')
      .insert({
        account_id: accountId,
        data_type: 'stories',
        raw_json: data.stories,
        source_actor: HIGHLIGHTS_STORIES_ACTOR,
        scrape_session_id: scrapeSessionId,
      });

    if (rawStoriesError) {
      console.error('[Highlights Scraper] Error saving raw stories data:', rawStoriesError);
    }

    const storiesToInsert = data.stories.map(story => ({
      account_id: accountId,
      story_id: story.story_id,
      media_type: story.media_type,
      media_url: story.media_url,
      thumbnail_url: story.thumbnail_url,
      video_duration: story.video_duration,
      has_audio: story.has_audio,
      mentioned_users: story.mentioned_users,
      hashtags: story.hashtags,
      posted_at: story.posted_at,
      expires_at: story.expires_at,
      scraped_at: new Date().toISOString(),
    }));

    const { error: storiesError } = await supabase
      .from('instagram_stories')
      .upsert(storiesToInsert, {
        onConflict: 'account_id,story_id',
      });

    if (storiesError) {
      console.error('[Highlights Scraper] Error saving stories:', storiesError);
    } else {
      storiesSaved = storiesToInsert.length;
    }
  }

  console.log(`[Highlights Scraper] Saved: ${highlightsSaved} highlights, ${highlightItemsSaved} items, ${storiesSaved} stories`);

  return { highlightsSaved, highlightItemsSaved, storiesSaved };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get video items pending transcription
 */
export async function getPendingVideoItems(accountId: string, limit: number = 10): Promise<{
  source_type: string;
  source_id: string;
  video_url: string;
  video_duration?: number;
}[]> {
  const supabase = await createClient();

  // Get pending highlight items
  const { data: highlightItems } = await supabase
    .from('instagram_highlight_items')
    .select('id, media_url, video_duration')
    .eq('account_id', accountId)
    .eq('media_type', 'video')
    .eq('transcription_status', 'pending')
    .limit(limit);

  // Get pending stories
  const { data: stories } = await supabase
    .from('instagram_stories')
    .select('id, media_url, video_duration')
    .eq('account_id', accountId)
    .eq('media_type', 'video')
    .eq('transcription_status', 'pending')
    .limit(limit);

  const results: {
    source_type: string;
    source_id: string;
    video_url: string;
    video_duration?: number;
  }[] = [];

  if (highlightItems) {
    for (const item of highlightItems) {
      if (item.media_url) {
        results.push({
          source_type: 'highlight_item',
          source_id: item.id,
          video_url: item.media_url,
          video_duration: item.video_duration,
        });
      }
    }
  }

  if (stories) {
    for (const story of stories) {
      if (story.media_url) {
        results.push({
          source_type: 'story',
          source_id: story.id,
          video_url: story.media_url,
          video_duration: story.video_duration,
        });
      }
    }
  }

  return results.slice(0, limit);
}

/**
 * Update transcription status
 */
export async function updateTranscriptionStatus(
  sourceType: string,
  sourceId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed'
): Promise<void> {
  const supabase = await createClient();

  const table = sourceType === 'highlight_item' 
    ? 'instagram_highlight_items' 
    : sourceType === 'story' 
      ? 'instagram_stories' 
      : null;

  if (table) {
    await supabase
      .from(table)
      .update({ transcription_status: status })
      .eq('id', sourceId);
  }
}
