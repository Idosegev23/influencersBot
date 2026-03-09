#!/usr/bin/env node
/**
 * Re-scrape highlights (fresh URLs) + transcribe failed/pending videos
 *
 * Usage: node scripts/rescrape-and-transcribe-highlights.mjs <username> <accountId> [--transcribe-only]
 *
 * Steps:
 *   1. Re-scrape highlight details from ScrapeCreators (fresh media URLs)
 *   2. Update media_url in DB for video items
 *   3. Reset failed transcriptions to allow retry
 *   4. Transcribe videos using Gemini 3 Flash
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

// ============================================
// Config
// ============================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCRAPECREATORS_KEY = process.env.SCRAPECREATORS_API_KEY;
const SCRAPECREATORS_BASE = process.env.SCRAPECREATORS_BASE_URL || 'https://api.scrapecreators.com';
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE env vars'); process.exit(1); }
if (!GEMINI_KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1); }

const username = process.argv[2];
const accountId = process.argv[3];
const transcribeOnly = process.argv.includes('--transcribe-only');

if (!username || !accountId) {
  console.error('Usage: node scripts/rescrape-and-transcribe-highlights.mjs <username> <accountId> [--transcribe-only]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const api = axios.create({
  baseURL: SCRAPECREATORS_BASE,
  headers: { 'x-api-key': SCRAPECREATORS_KEY },
  timeout: 60000,
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================
// Step 1: Re-scrape highlights for fresh URLs
// ============================================

async function rescrapeHighlights() {
  console.log('\n📋 Step 1: Fetching highlight list from ScrapeCreators...');

  const { data: listData } = await api.get('/v1/instagram/user/highlights', { params: { handle: username } });
  const highlights = listData?.highlights || listData || [];
  console.log(`   Found ${highlights.length} highlights`);

  if (highlights.length === 0) return 0;

  let updatedItems = 0;

  for (let i = 0; i < highlights.length; i++) {
    const h = highlights[i];
    const highlightId = h.id;
    const title = h.title || '';
    process.stdout.write(`   [${i + 1}/${highlights.length}] "${title}"...`);

    try {
      // Fetch detail with fresh media URLs
      const { data: detail } = await api.get('/v1/instagram/user/highlight/detail', { params: { id: highlightId } });
      const items = detail?.items || [];

      if (items.length === 0) {
        console.log(' 0 items');
        continue;
      }

      // Find matching highlight in DB
      const { data: dbHighlight } = await supabase
        .from('instagram_highlights')
        .select('id')
        .eq('account_id', accountId)
        .eq('highlight_id', highlightId)
        .maybeSingle();

      if (!dbHighlight) {
        console.log(' ✗ not in DB');
        continue;
      }

      // Update media URLs for video items
      let updated = 0;
      for (const item of items) {
        const videoUrl = item.video_versions?.[0]?.url || item.video_url;
        if (!videoUrl) continue; // Skip images

        const storyId = String(item.pk || item.id);

        const { error } = await supabase
          .from('instagram_highlight_items')
          .update({ media_url: videoUrl, scraped_at: new Date().toISOString() })
          .eq('highlight_id', dbHighlight.id)
          .eq('item_id', storyId);

        if (!error) updated++;
      }

      updatedItems += updated;
      console.log(` ✓ ${updated} video URLs refreshed`);
      await sleep(1200); // Rate limit ScrapeCreators
    } catch (err) {
      console.log(` ✗ ${err.message}`);
    }
  }

  console.log(`\n✅ Step 1 done: ${updatedItems} video URLs refreshed\n`);
  return updatedItems;
}

// ============================================
// Step 2: Reset failed transcriptions
// ============================================

async function resetFailedTranscriptions() {
  console.log('🔄 Step 2: Resetting failed transcriptions...');

  // Reset highlight items status
  const { data: failedItems, error } = await supabase
    .from('instagram_highlight_items')
    .update({ transcription_status: 'pending' })
    .eq('account_id', accountId)
    .eq('media_type', 'video')
    .eq('transcription_status', 'failed')
    .select('id');

  if (error) {
    console.error('   ✗ Error resetting items:', error.message);
    return 0;
  }

  // Delete old failed transcription records
  if (failedItems && failedItems.length > 0) {
    const itemIds = failedItems.map(i => i.id);
    await supabase
      .from('instagram_transcriptions')
      .delete()
      .eq('account_id', accountId)
      .eq('source_type', 'highlight_item')
      .eq('processing_status', 'failed')
      .in('source_id', itemIds);
  }

  console.log(`   ✅ Reset ${failedItems?.length || 0} items to pending\n`);
  return failedItems?.length || 0;
}

// ============================================
// Step 3: Transcribe pending videos with Gemini
// ============================================

const TRANSCRIPTION_PROMPT = `אתה מתמלל מקצועי. צפה בסרטון וספק:

1. **transcription_text**: תמלול מלא של כל הדיבור בסרטון (בשפה המקורית)
2. **language**: קוד שפה (he/en/ar/ru/other)
3. **on_screen_text**: רשימת כל הטקסטים שנראים על המסך (כותרות, מתכונים, מוצרים, מחירים)
4. **speakers**: רשימת דוברים עם הטקסט שלהם

החזר JSON בלבד בפורמט:
{
  "transcription_text": "...",
  "language": "he",
  "on_screen_text": ["טקסט 1", "טקסט 2"],
  "speakers": [{"speaker_id": "1", "text": "..."}]
}

אם אין דיבור, החזר transcription_text ריק אבל כלול on_screen_text.
אם אין שום תוכן, החזר הכל ריק.`;

async function transcribeVideo(videoUrl, retries = 2) {
  // Download video
  const response = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = response.headers.get('content-type') || 'video/mp4';

  // Call Gemini
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: contentType, data: base64 } },
        { text: TRANSCRIPTION_PROMPT },
      ],
    }],
  });

  const text = result.response.text();

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Gemini response');

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    transcription_text: parsed.transcription_text || '',
    language: parsed.language || 'he',
    on_screen_text: parsed.on_screen_text || [],
    speakers: parsed.speakers || [],
    tokens_used: result.response.usageMetadata?.totalTokenCount || 0,
  };
}

async function transcribePendingVideos() {
  console.log('🧠 Step 3: Transcribing pending highlight videos with Gemini...');

  // Get pending video items with fresh URLs
  const { data: pendingItems, error } = await supabase
    .from('instagram_highlight_items')
    .select('id, media_url, highlight_id, video_duration')
    .eq('account_id', accountId)
    .eq('media_type', 'video')
    .eq('transcription_status', 'pending')
    .not('media_url', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('   ✗ Error fetching pending items:', error.message);
    return;
  }

  console.log(`   Found ${pendingItems?.length || 0} pending videos to transcribe\n`);
  if (!pendingItems || pendingItems.length === 0) return;

  let success = 0;
  let failed = 0;
  const BATCH_SIZE = 3; // 3 parallel to avoid Gemini rate limits

  for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
    const batch = pendingItems.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(batch.map(async (item) => {
      try {
        // Mark as processing
        await supabase
          .from('instagram_highlight_items')
          .update({ transcription_status: 'processing' })
          .eq('id', item.id);

        const result = await transcribeVideo(item.media_url);

        // Check if transcription already exists (upsert)
        const { data: existing } = await supabase
          .from('instagram_transcriptions')
          .select('id')
          .eq('source_type', 'highlight_item')
          .eq('source_id', item.id)
          .maybeSingle();

        if (existing) {
          // Update existing
          await supabase
            .from('instagram_transcriptions')
            .update({
              video_url: item.media_url,
              transcription_text: result.transcription_text,
              language: result.language,
              on_screen_text: result.on_screen_text,
              speakers: result.speakers,
              processing_status: 'completed',
              processed_at: new Date().toISOString(),
              tokens_used: result.tokens_used,
              error_message: null,
            })
            .eq('id', existing.id);
        } else {
          // Insert new
          await supabase
            .from('instagram_transcriptions')
            .insert({
              account_id: accountId,
              source_type: 'highlight_item',
              source_id: item.id,
              video_url: item.media_url,
              video_duration: item.video_duration,
              transcription_text: result.transcription_text,
              language: result.language,
              on_screen_text: result.on_screen_text,
              speakers: result.speakers,
              processing_status: 'completed',
              processed_at: new Date().toISOString(),
              tokens_used: result.tokens_used,
              gemini_model_used: 'gemini-2.0-flash',
            });
        }

        // Mark item as completed
        await supabase
          .from('instagram_highlight_items')
          .update({ transcription_status: 'completed' })
          .eq('id', item.id);

        return true;
      } catch (err) {
        // Mark as failed
        await supabase
          .from('instagram_highlight_items')
          .update({ transcription_status: 'failed' })
          .eq('id', item.id);

        throw err;
      }
    }));

    for (const r of results) {
      if (r.status === 'fulfilled') success++;
      else { failed++; }
    }

    const total = i + batch.length;
    const pct = Math.round((total / pendingItems.length) * 100);
    console.log(`   [${total}/${pendingItems.length}] ${pct}% — ✓${success} ✗${failed}`);

    if (i + BATCH_SIZE < pendingItems.length) {
      await sleep(2000); // Rate limit between batches
    }
  }

  console.log(`\n✅ Step 3 done: ${success} transcribed, ${failed} failed\n`);
}

// ============================================
// Main
// ============================================

async function main() {
  console.log(`\n🔍 Re-scrape & Transcribe highlights for @${username} (${accountId})\n`);

  if (!transcribeOnly) {
    if (!SCRAPECREATORS_KEY) {
      console.error('Missing SCRAPECREATORS_API_KEY (use --transcribe-only to skip rescrape)');
      process.exit(1);
    }
    await rescrapeHighlights();
    await resetFailedTranscriptions();
  } else {
    console.log('⏩ Skipping rescrape (--transcribe-only mode)\n');
    await resetFailedTranscriptions();
  }

  await transcribePendingVideos();

  console.log(`🎉 All done! @${username} highlights re-scraped & transcribed.\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
