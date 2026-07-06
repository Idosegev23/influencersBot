#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Beauty Product Review Splitter
 *
 * Takes beauty-related Instagram highlights and uses AI to split them
 * into individual product reviews, saving results to beauty_product_reviews table.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/split-beauty-reviews.ts <account_id> [options]
 *
 * Options:
 *   --dry-run          Show what would happen without saving
 *   --highlight <id>   Process a single highlight only
 *   --force            Re-process highlights that were already split
 *
 * Examples:
 *   # Process the_dekel
 *   npx tsx --tsconfig tsconfig.json scripts/split-beauty-reviews.ts e5a5076a-faaf-4e67-8bdd-61c15153fb20
 *
 *   # Dry run on a specific highlight
 *   npx tsx --tsconfig tsconfig.json scripts/split-beauty-reviews.ts e5a5076a --highlight <highlight_id> --dry-run
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// ─── Config ───
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY!;
const MODEL = 'gemini-3.5-flash';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const gemini = new GoogleGenAI({ apiKey: GEMINI_KEY });

// Highlights to skip (not beauty content)
const SKIP_HIGHLIGHTS = ['📚', 'המרוץ למליון', 'המירוץ למליון', 'אהבת אמת', 'חיזוק', 'זוגיות', 'ילדים', 'ספרים מומלצים'];

interface HighlightWithItems {
  highlightId: string;
  title: string;
  items: {
    id: string;
    itemIndex: number;
    thumbnailUrl: string | null;
    transcription: string;
  }[];
}

interface ProductReview {
  product_name: string;
  brand_name: string;
  category: 'face' | 'hair' | 'body' | 'makeup' | 'fragrance' | 'tools' | 'general';
  summary: string;
  key_ingredients: string[];
  pros: string[];
  cons: string[];
  has_coupon: boolean;
  coupon_code: string | null;
  item_index_start: number;
  item_index_end: number;
}

// ─── Fetch highlights + items + transcriptions ───
async function fetchHighlightsWithItems(accountId: string, highlightId?: string): Promise<HighlightWithItems[]> {
  let query = supabase
    .from('instagram_highlights')
    .select('id, title')
    .eq('account_id', accountId);

  if (highlightId) {
    query = query.eq('id', highlightId);
  }

  const { data: highlights, error } = await query;
  if (error) throw new Error(`Failed to fetch highlights: ${error.message}`);
  if (!highlights?.length) {
    console.log('No highlights found');
    return [];
  }

  // Filter out non-beauty highlights
  const filtered = highlights.filter(h => !SKIP_HIGHLIGHTS.some(skip => h.title?.includes(skip)));
  console.log(`Found ${filtered.length} beauty-relevant highlights (filtered ${highlights.length - filtered.length})`);

  const results: HighlightWithItems[] = [];

  for (const highlight of filtered) {
    // Get items ordered by index
    const { data: items, error: itemsErr } = await supabase
      .from('instagram_highlight_items')
      .select('id, item_index, thumbnail_url')
      .eq('highlight_id', highlight.id)
      .order('item_index', { ascending: true });

    if (itemsErr || !items?.length) continue;

    // Get transcriptions for these items
    const itemIds = items.map(i => i.id);
    const { data: chunks, error: chunksErr } = await supabase
      .from('document_chunks')
      .select('metadata, chunk_text')
      .eq('account_id', accountId)
      .eq('entity_type', 'transcription')
      .in('metadata->>originalSourceId', itemIds);

    if (chunksErr || !chunks?.length) continue;

    // Map transcriptions to items
    const transcriptionMap = new Map<string, string>();
    for (const chunk of chunks) {
      const sourceId = chunk.metadata?.originalSourceId;
      if (sourceId) transcriptionMap.set(sourceId, chunk.chunk_text);
    }

    const itemsWithTranscription = items
      .filter(item => transcriptionMap.has(item.id))
      .map(item => ({
        id: item.id,
        itemIndex: item.item_index,
        thumbnailUrl: item.thumbnail_url,
        transcription: transcriptionMap.get(item.id)!,
      }));

    if (itemsWithTranscription.length < 2) continue;

    results.push({
      highlightId: highlight.id,
      title: highlight.title,
      items: itemsWithTranscription,
    });
  }

  return results;
}

// ─── AI: Split highlight into product reviews ───
async function splitHighlightIntoProducts(highlight: HighlightWithItems): Promise<ProductReview[]> {
  // Build the numbered transcription text
  const transcriptionBlock = highlight.items
    .map((item, i) => `[סטורי ${item.itemIndex}]\n${item.transcription}`)
    .join('\n\n---\n\n');

  // Truncate if too long (Gemini Flash context ~1M tokens, but let's be practical)
  const maxChars = 80000;
  const truncated = transcriptionBlock.length > maxChars
    ? transcriptionBlock.slice(0, maxChars) + '\n\n[...truncated]'
    : transcriptionBlock;

  const prompt = `אתה מנתח תוכן של משפיענית ביוטי/טיפוח באינסטגרם.
להלן תמלול של היילייט בשם "${highlight.title}" שמכיל ${highlight.items.length} סטוריז.

המטרה: לזהות ולפצל את התוכן למוצרים/סקירות בודדות.

כל highlight יכול להכיל:
- הקדמה כללית על מותג
- סקירה של מוצר ספציפי (קרם, סרום, מסכה, שמפו וכו')
- השוואה בין מוצרים
- טיפ/מדריך כללי

לכל מוצר/סקירה שאתה מזהה, החזר:
- product_name: שם המוצר הספציפי (לא שם המותג)
- brand_name: שם המותג
- category: אחד מ: face, hair, body, makeup, fragrance, tools, general
- summary: תקציר של 2-3 משפטים בעברית
- key_ingredients: מרכיבים עיקריים שהוזכרו (מערך, ריק אם לא רלוונטי)
- pros: יתרונות שהוזכרו (מערך)
- cons: חסרונות שהוזכרו (מערך)
- has_coupon: האם הוזכר קוד הנחה (true/false)
- coupon_code: הקוד עצמו או null
- item_index_start: מספר הסטורי הראשון של הסקירה הזו
- item_index_end: מספר הסטורי האחרון של הסקירה הזו

אם יש הקדמה כללית על המותג (לא על מוצר ספציפי), עדיין תכלול אותה כ-product_name: "הכרת המותג" עם category: "general".

חשוב:
- כל סטורי חייב להשתייך למוצר אחד בדיוק
- אל תדלג על סטוריז
- item_index_start/end צריכים לכסות את כל הסטוריז ברצף

החזר JSON בלבד, מערך של אובייקטים. בלי markdown, בלי הסברים.

התמלולים:

${truncated}`;

  const response = await gemini.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const text = response.text?.trim() || '[]';

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Try to extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    console.error(`  ❌ Failed to parse AI response for "${highlight.title}"`);
    console.error(`  Response: ${text.slice(0, 200)}`);
    return [];
  }
}

// ─── Save reviews to DB ───
async function saveReviews(
  accountId: string,
  highlight: HighlightWithItems,
  reviews: ProductReview[],
  dryRun: boolean
): Promise<number> {
  let saved = 0;

  for (const review of reviews) {
    // Find which items belong to this review
    const reviewItems = highlight.items.filter(
      item => item.itemIndex >= review.item_index_start && item.itemIndex <= review.item_index_end
    );

    if (reviewItems.length === 0) {
      console.warn(`  ⚠️  No items found for "${review.product_name}" (index ${review.item_index_start}-${review.item_index_end})`);
      continue;
    }

    // Combine transcriptions
    const fullTranscription = reviewItems
      .map(item => item.transcription)
      .join('\n\n');

    // Pick thumbnail from first item
    const thumbnailUrl = reviewItems[0]?.thumbnailUrl || null;

    const row = {
      account_id: accountId,
      highlight_id: highlight.highlightId,
      product_name: review.product_name,
      brand_name: review.brand_name || highlight.title,
      category: review.category || 'general',
      summary: review.summary || null,
      key_ingredients: review.key_ingredients?.length ? review.key_ingredients : null,
      pros: review.pros?.length ? review.pros : null,
      cons: review.cons?.length ? review.cons : null,
      has_coupon: review.has_coupon || false,
      coupon_code: review.coupon_code || null,
      item_ids: reviewItems.map(i => i.id),
      item_index_start: review.item_index_start,
      item_index_end: review.item_index_end,
      full_transcription: fullTranscription,
      thumbnail_url: thumbnailUrl,
    };

    if (dryRun) {
      console.log(`  📋 [DRY RUN] Would save: "${review.product_name}" (${review.category}) — ${reviewItems.length} items`);
      if (review.summary) console.log(`     ${review.summary.slice(0, 100)}...`);
      saved++;
      continue;
    }

    const { error } = await supabase
      .from('beauty_product_reviews')
      .insert(row);

    if (error) {
      console.error(`  ❌ Failed to save "${review.product_name}": ${error.message}`);
    } else {
      console.log(`  ✅ Saved: "${review.product_name}" (${review.category}) — ${reviewItems.length} items`);
      saved++;
    }
  }

  return saved;
}

// ─── Main ───
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const highlightIdx = args.indexOf('--highlight');
  const highlightId = highlightIdx >= 0 ? args[highlightIdx + 1] : undefined;

  const accountId = args.find(a => !a.startsWith('--'));
  if (!accountId) {
    console.error('Usage: npx tsx scripts/split-beauty-reviews.ts <account_id> [--dry-run] [--highlight <id>] [--force]');
    process.exit(1);
  }

  console.log(`\n🧴 Beauty Product Review Splitter`);
  console.log(`Account: ${accountId}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Force: ${force}\n`);

  // Check which highlights were already processed
  let processedHighlightIds = new Set<string>();
  if (!force) {
    const { data: existing } = await supabase
      .from('beauty_product_reviews')
      .select('highlight_id')
      .eq('account_id', accountId);

    if (existing?.length) {
      processedHighlightIds = new Set(existing.map(e => e.highlight_id));
      console.log(`⏭️  Skipping ${processedHighlightIds.size} already-processed highlights (use --force to re-process)\n`);
    }
  }

  // Fetch all highlights with items
  const highlights = await fetchHighlightsWithItems(accountId, highlightId);
  console.log(`\n📦 ${highlights.length} highlights with transcriptions\n`);

  let totalReviews = 0;

  for (const highlight of highlights) {
    if (processedHighlightIds.has(highlight.highlightId) && !force) {
      console.log(`⏭️  "${highlight.title}" — already processed, skipping`);
      continue;
    }

    console.log(`\n🔍 Processing: "${highlight.title}" (${highlight.items.length} items)`);

    // If force, delete existing reviews for this highlight
    if (force && !dryRun) {
      await supabase
        .from('beauty_product_reviews')
        .delete()
        .eq('highlight_id', highlight.highlightId);
    }

    // AI split
    const reviews = await splitHighlightIntoProducts(highlight);
    console.log(`  🤖 AI identified ${reviews.length} products`);

    if (reviews.length === 0) continue;

    // Save
    const saved = await saveReviews(accountId, highlight, reviews, dryRun);
    totalReviews += saved;

    // Rate limit — be kind to Gemini
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n✅ Done! ${totalReviews} product reviews ${dryRun ? 'would be' : ''} saved.\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
