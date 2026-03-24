#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Enrich Products CLI
 * Generates AI profiles + embeddings for widget_products
 *
 * Usage:
 *   npx tsx scripts/enrich-products.ts <account_id> [--dry-run] [--only-missing]
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY!;
const OPENAI_KEY = process.env.OPENAI_API_KEY!;
const MODEL = 'gemini-3-flash-preview';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const gemini = new GoogleGenAI({ apiKey: GEMINI_KEY });
const openai = new OpenAI({ apiKey: OPENAI_KEY });

const ENRICHMENT_PROMPT = `אתה מומחה מוצרים. נתח את המוצר הבא וצור פרופיל AI.
התאם את הניתוח לסוג המוצר — בין אם זה טיפוח, אוכל, צבע, תבלינים, שירות או כל מוצר אחר.

החזר JSON בלבד:
{
  "whatItDoes": "תיאור של מה המוצר עושה/מה הוא במשפט אחד",
  "bestFor": ["מי צריך/ירצה את המוצר — 2-4 סוגי לקוחות/שימושים"],
  "pairsWith": ["סוגי מוצרים משלימים — לא מותגים, סוגים כלליים"],
  "sellingPoints": ["3 יתרונות מכירתיים קצרים"],
  "conversationTriggers": ["4-6 ביטויים בעברית שלקוח ישתמש שמצביעים על צורך במוצר הזה"]
}`;

// ─── AI Profile ───
async function enrichProduct(product: any): Promise<any | null> {
  const context = `שם: ${product.name_he || product.name}
תיאור: ${product.description || 'לא זמין'}
קטגוריה: ${product.category} / ${product.subcategory || ''}
סדרה: ${product.product_line || 'לא ידוע'}
מחיר: ${product.price ? `₪${product.price}` : 'לא ידוע'}
מרכיבים: ${product.key_ingredients?.join(', ') || 'לא ידוע'}
יתרונות: ${product.benefits?.join(', ') || 'לא ידוע'}`;

  try {
    const response = await gemini.models.generateContent({
      model: MODEL,
      contents: context,
      config: {
        systemInstruction: ENRICHMENT_PROMPT,
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text?.trim() || '';
    return JSON.parse(text);
  } catch (err: any) {
    console.error(`  ❌ AI failed for "${product.name_he}": ${err.message}`);
    return null;
  }
}

// ─── Embedding ───
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const resp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    });
    return resp.data[0].embedding;
  } catch (err: any) {
    console.error(`  ❌ Embedding failed: ${err.message}`);
    return null;
  }
}

function buildEmbeddingText(product: any): string {
  return [
    product.name_he || product.name,
    product.description,
    product.category,
    product.subcategory,
    product.product_line,
    ...(product.key_ingredients || []),
    ...(product.benefits || []),
    ...(product.target_audience || []),
    product.ai_profile?.whatItDoes,
    ...(product.ai_profile?.conversationTriggers || []),
  ].filter(Boolean).join(' ');
}

// ─── Main ───
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyMissing = args.includes('--only-missing');
  const accountId = args.find(a => !a.startsWith('--') && a.length > 10);

  if (!accountId) {
    console.error('Usage: npx tsx scripts/enrich-products.ts <account_id> [--dry-run] [--only-missing]');
    process.exit(1);
  }

  const { data: account } = await supabase.from('accounts').select('config').eq('id', accountId).single();
  const username = account?.config?.username || accountId;

  console.log(`\n🧪 Product Enrichment`);
  console.log(`Account: ${username} (${accountId})`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}${onlyMissing ? ' (only missing)' : ''}`);

  // Fetch products
  let query = supabase
    .from('widget_products')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_available', true);

  if (onlyMissing) {
    query = query.is('ai_profile', null);
  }

  const { data: products, error } = await query;
  if (error || !products?.length) {
    console.log(`No products found. ${error?.message || ''}`);
    process.exit(0);
  }

  console.log(`\n📦 ${products.length} products to enrich\n`);

  // Step 1: AI profiles
  const BATCH_SIZE = 5;
  let enriched = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    console.log(`🤖 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(products.length / BATCH_SIZE)} — AI profiles...`);

    const results = await Promise.allSettled(batch.map(p => enrichProduct(p)));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const product = batch[j];
      if (result.status === 'fulfilled' && result.value) {
        if (!dryRun) {
          await supabase.from('widget_products').update({ ai_profile: result.value }).eq('id', product.id);
        }
        product.ai_profile = result.value;
        console.log(`  ✅ ${product.name_he || product.name}`);
        enriched++;
      }
    }

    if (i + BATCH_SIZE < products.length) await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n📊 AI profiles: ${enriched}/${products.length}`);

  // Step 2: Embeddings
  console.log(`\n🔢 Generating embeddings...`);
  let embCount = 0;

  for (const product of products) {
    const text = buildEmbeddingText(product);
    if (!text || text.length < 10) continue;

    const embedding = await generateEmbedding(text);
    if (!embedding) continue;

    if (!dryRun) {
      const { error: embErr } = await supabase
        .from('widget_products')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', product.id);
      if (!embErr) embCount++;
    } else {
      embCount++;
    }
  }

  console.log(`📊 Embeddings: ${embCount}/${products.length}`);
  console.log(`\n✅ Done! Enriched ${enriched} profiles + ${embCount} embeddings for ${username}.\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
