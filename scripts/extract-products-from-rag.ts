#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Extract Products from RAG Website Chunks
 *
 * Scans website RAG chunks for product pages and extracts structured product data
 * into the widget_products table (used by both widget AND chat/content feed).
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/extract-products-from-rag.ts <account_id> [options]
 *
 * Options:
 *   --dry-run       Show what would happen without saving
 *   --force         Re-extract even if products already exist
 *   --limit <n>     Max chunks to process (default: all)
 *
 * Examples:
 *   npx tsx --tsconfig tsconfig.json scripts/extract-products-from-rag.ts 86fc5238-1d5a-4803-b43a-d99bd63d5fa4 --dry-run
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// ─── Config ───
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY!;
const MODEL = 'gemini-3-flash-preview';
const BATCH_SIZE = 15; // chunks per AI call

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const gemini = new GoogleGenAI({ apiKey: GEMINI_KEY });

interface ExtractedProduct {
  name: string;
  name_he: string;
  description: string;
  price: number | null;
  original_price: number | null;
  currency: string;
  category: string;
  subcategory: string;
  product_line: string | null;
  volume: string | null;
  key_ingredients: string[];
  benefits: string[];
  target_audience: string[];
  product_url: string;
  image_url: string | null;
}

interface ChunkData {
  id: string;
  chunk_text: string;
  url: string | null;
}

// ─── Step 1: Find product-like chunks ───
async function fetchProductChunks(accountId: string, limit?: number, sourceTypes?: string[]): Promise<ChunkData[]> {
  const entityTypes = sourceTypes || ['website'];

  let query = supabase
    .from('document_chunks')
    .select('id, chunk_text, metadata')
    .eq('account_id', accountId)
    .in('entity_type', entityTypes)
    .order('created_at', { ascending: true });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch chunks: ${error.message}`);
  if (!data?.length) return [];

  // Filter to chunks that look like product pages/content
  const productChunks = data.filter(chunk => {
    const text = chunk.chunk_text || '';
    const url = chunk.metadata?.url || '';

    // Heuristics: product pages typically have price, product name patterns, or product URLs
    const hasPrice = /₪|ש"ח|מחיר|price/i.test(text);
    const hasProductUrl = /\/product[s]?\//i.test(url) || /\/collections\//i.test(url);
    const hasProductKeywords = /שם מוצר|נפח|מ"ל|ml|רכיבים|ingredients/i.test(text);
    const hasProductStructure = /Title:.*\n.*Description:/i.test(text);
    // Instagram heuristics: product mentions in transcriptions/posts
    const hasInstagramProduct = /לצפייה במוצרים|סדרת|market|חנות|מארז|טעמים|בטעם/i.test(text);
    const hasSpecificProducts = /טחינה|חלבה|ממרח|ריבה|חומץ|שמן|יין|בירה|קפה|עוגה|מאפ/i.test(text);

    return hasPrice || hasProductUrl || hasProductKeywords || hasProductStructure || hasInstagramProduct || hasSpecificProducts;
  });

  return productChunks.map(c => ({
    id: c.id,
    chunk_text: c.chunk_text,
    url: c.metadata?.url || null,
  }));
}

// ─── Step 2: AI extraction in batches ───
async function extractProductsFromBatch(chunks: ChunkData[], accountUsername: string): Promise<ExtractedProduct[]> {
  const chunksText = chunks.map((c, i) => {
    return `--- CHUNK ${i + 1} (URL: ${c.url || 'unknown'}) ---\n${c.chunk_text.slice(0, 2000)}`;
  }).join('\n\n');

  const prompt = `אתה מחלץ מוצרים מדפי אתר של מותג "${accountUsername}".

להלן ${chunks.length} קטעי טקסט מדפי האתר. חלקם דפי מוצרים, חלקם דפי קטגוריה, חלקם דפים אחרים.

המטרה: לחלץ מוצרים בודדים בלבד (לא קטגוריות, לא דפי מידע כללי).

לכל מוצר שאתה מזהה, החזר:
- name: שם המוצר באנגלית (אם יש)
- name_he: שם המוצר בעברית
- description: תיאור קצר (1-2 משפטים בעברית)
- price: מחיר מספרי (null אם לא ידוע)
- original_price: מחיר לפני הנחה (null אם אין)
- currency: "ILS"
- category: קטגוריה ראשית (hair_care, face_care, body_care, makeup, fragrance, food, spices, paint, tools, sets, general)
- subcategory: תת-קטגוריה (shampoo, conditioner, mask, serum, cream, oil, spray, cleanser, moisturizer, sunscreen, foundation, mascara, lipstick, spice_blend, sauce, color, primer, וכו')
- product_line: שם קו המוצרים (null אם לא ידוע)
- volume: נפח/משקל כטקסט (null אם לא ידוע)
- key_ingredients: מרכיבים עיקריים (מערך, עד 5)
- benefits: יתרונות עיקריים (מערך, עד 3)
- target_audience: קהל יעד (מערך, למשל ["שיער יבש", "שיער מתולתל"])
- product_url: URL של דף המוצר
- image_url: null (אין לנו תמונות מה-RAG)

חשוב:
- אל תחלץ קטגוריות/קולקציות — רק מוצרים בודדים
- אם chunk מכיל כמה מוצרים, חלץ את כולם
- אם chunk הוא לא דף מוצר, החזר מערך ריק עבורו
- אל תכפיל מוצרים שמופיעים בכמה chunks

החזר JSON בלבד — מערך של אובייקטים. בלי markdown.

${chunksText}`;

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
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    console.error(`  ❌ Failed to parse AI response`);
    return [];
  }
}

// ─── Step 3: Deduplicate by name + URL ───
function deduplicateProducts(products: ExtractedProduct[]): ExtractedProduct[] {
  const seen = new Map<string, ExtractedProduct>();

  for (const p of products) {
    // Key by normalized name or URL
    const key = (p.name_he || p.name || '').toLowerCase().trim();
    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, p);
    } else {
      // Merge: prefer the one with more data
      const existing = seen.get(key)!;
      if (!existing.price && p.price) seen.set(key, { ...existing, ...p });
      if (!existing.product_url && p.product_url) existing.product_url = p.product_url;
    }
  }

  return Array.from(seen.values());
}

// ─── Step 4: Save to DB ───
async function saveProducts(accountId: string, products: ExtractedProduct[], dryRun: boolean): Promise<number> {
  let saved = 0;

  for (const p of products) {
    if (dryRun) {
      const priceStr = p.price ? `₪${p.price}` : 'N/A';
      console.log(`  📋 [DRY] ${p.name_he || p.name} | ${p.category}/${p.subcategory} | ${priceStr}`);
      if (p.key_ingredients?.length) console.log(`     מרכיבים: ${p.key_ingredients.slice(0, 3).join(', ')}`);
      saved++;
      continue;
    }

    // Upsert by account + name
    const { error } = await supabase
      .from('widget_products')
      .upsert({
        account_id: accountId,
        name: p.name || p.name_he,
        name_he: p.name_he || p.name,
        description: p.description || null,
        price: p.price || null,
        original_price: p.original_price || null,
        currency: p.currency || 'ILS',
        category: p.category || 'general',
        subcategory: p.subcategory || null,
        product_line: p.product_line || null,
        volume: p.volume || null,
        key_ingredients: p.key_ingredients?.length ? p.key_ingredients : null,
        benefits: p.benefits?.length ? p.benefits : null,
        target_audience: p.target_audience?.length ? p.target_audience : null,
        image_url: p.image_url || null,
        product_url: p.product_url || null,
        is_available: true,
      }, {
        onConflict: 'account_id,name',
        ignoreDuplicates: false,
      });

    if (error) {
      // If upsert fails (no unique constraint), try insert
      const { error: insertErr } = await supabase
        .from('widget_products')
        .insert({
          account_id: accountId,
          name: p.name || p.name_he,
          name_he: p.name_he || p.name,
          description: p.description || null,
          price: p.price || null,
          original_price: p.original_price || null,
          currency: p.currency || 'ILS',
          category: p.category || 'general',
          subcategory: p.subcategory || null,
          product_line: p.product_line || null,
          volume: p.volume || null,
          key_ingredients: p.key_ingredients?.length ? p.key_ingredients : null,
          benefits: p.benefits?.length ? p.benefits : null,
          target_audience: p.target_audience?.length ? p.target_audience : null,
          image_url: p.image_url || null,
          product_url: p.product_url || null,
          is_available: true,
        });

      if (insertErr) {
        console.error(`  ❌ Failed: "${p.name_he}": ${insertErr.message}`);
        continue;
      }
    }

    console.log(`  ✅ ${p.name_he || p.name} (${p.category}/${p.subcategory}) ${p.price ? '₪' + p.price : ''}`);
    saved++;
  }

  return saved;
}

// ─── Main ───
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : undefined;

  // --source: comma-separated entity types (default: website)
  const sourceIdx = args.indexOf('--source');
  const sourceTypes = sourceIdx >= 0 ? args[sourceIdx + 1].split(',') : undefined;

  const accountId = args.find(a => !a.startsWith('--') && a.length > 10 && !args[args.indexOf(a) - 1]?.startsWith('--'));
  if (!accountId) {
    console.error('Usage: npx tsx scripts/extract-products-from-rag.ts <account_id> [--dry-run] [--force] [--limit N] [--source website,transcription,post]');
    process.exit(1);
  }

  // Get account info
  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();

  const username = account?.config?.username || accountId;

  console.log(`\n🏭 Product Extractor from RAG`);
  console.log(`Account: ${username} (${accountId})`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // Check existing products
  if (!force) {
    const { count } = await supabase
      .from('widget_products')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId);

    if (count && count > 0) {
      console.log(`\n⚠️  Already has ${count} products. Use --force to re-extract.`);
      process.exit(0);
    }
  }

  // If force, clear existing
  if (force && !dryRun) {
    const { count } = await supabase
      .from('widget_products')
      .delete({ count: 'exact' })
      .eq('account_id', accountId);

    if (count) console.log(`🗑️  Deleted ${count} existing products`);
  }

  // Fetch product-like chunks
  const srcLabel = sourceTypes ? sourceTypes.join(', ') : 'website';
  console.log(`\n📄 Scanning ${srcLabel} chunks...`);
  const chunks = await fetchProductChunks(accountId, limit, sourceTypes);
  console.log(`Found ${chunks.length} product-like chunks`);

  if (chunks.length === 0) {
    console.log('No product chunks found. Try --source transcription,post for Instagram content.');
    process.exit(0);
  }

  // Process in batches
  let allProducts: ExtractedProduct[] = [];
  const batches = Math.ceil(chunks.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const batch = chunks.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    console.log(`\n🤖 Batch ${i + 1}/${batches} (${batch.length} chunks)...`);

    try {
      const products = await extractProductsFromBatch(batch, username);
      console.log(`  → Extracted ${products.length} products`);
      allProducts.push(...products);
    } catch (err: any) {
      console.error(`  ❌ Batch failed: ${err.message}`);
    }

    // Rate limit
    if (i < batches - 1) await new Promise(r => setTimeout(r, 1500));
  }

  // Deduplicate
  const unique = deduplicateProducts(allProducts);
  console.log(`\n📦 Total: ${allProducts.length} extracted → ${unique.length} unique products`);

  // Save
  console.log(`\n💾 Saving...`);
  const saved = await saveProducts(accountId, unique, dryRun);

  console.log(`\n✅ Done! ${saved} products ${dryRun ? 'would be' : ''} saved for ${username}.\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
