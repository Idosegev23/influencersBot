/**
 * Highlights & Stories Scraper
 * גריפת הילייטס וסטוריז מאינסטגרם באמצעות ScrapeCreators API
 */

import { createClient } from '@/lib/supabase/server';
import { getScrapeCreatorsClient } from './scrapeCreatorsClient';

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
// Main Scraping Functions
// ============================================

/**
 * Scrape highlights and stories for a username
 */
export async function scrapeHighlightsAndStories(
  username: string
): Promise<ScrapeHighlightsResult> {
  console.log(`[Highlights Scraper] Starting scrape for @${username}`);

  // Use ScrapeCreators API instead of Apify
  const client = getScrapeCreatorsClient();
  const result = await client.getHighlightSamples(username, 999, 100); // Get all items from up to 100 highlights
  
  const items = result.samples;

  if (items.length === 0) {
    console.log(`[Highlights Scraper] No data found for @${username}`);
    return { highlights: [], stories: [], raw_data: [] };
  }

  // Parse ScrapeCreators API response
  const highlights: HighlightData[] = [];
  const stories: StoryData[] = [];

  // Map highlights from ScrapeCreators format
  for (const sample of items) {
    const highlightData = result.highlights.find(h => h.highlight_id === sample.highlightId);
    
    const highlightItems: HighlightItemData[] = sample.items.map((item: any, index: number) => ({
      item_id: item.story_id,
      item_index: index,
      media_type: item.media_type,
      media_url: item.media_url,
      thumbnail_url: item.thumbnail_url,
      video_duration: item.video_url ? 15 : undefined, // Estimate duration for videos
      posted_at: item.timestamp,
    }));

    highlights.push({
      highlight_id: sample.highlightId,
      title: highlightData?.title || 'Untitled',
      cover_image_url: highlightData?.cover_url,
      items_count: highlightItems.length,
      items: highlightItems,
    });
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
