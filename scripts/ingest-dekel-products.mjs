#!/usr/bin/env node
/**
 * Ingest Dekel's scraped product catalog into widget_products + RAG (document_chunks).
 *
 * Reads:  scripts/.dekel-cache/products.jsonl  (output of scrape-dekel-catalog.mjs)
 * Writes: widget_products  (one row per product, upsert by (account_id, slug))
 *         documents + document_chunks (entity_type='product', for RAG retrieval)
 *
 * Usage:
 *   node --env-file=.env scripts/ingest-dekel-products.mjs              # full
 *   node --env-file=.env scripts/ingest-dekel-products.mjs --limit 5    # test
 *   node --env-file=.env scripts/ingest-dekel-products.mjs --skip-rag   # DB only
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));
const JSONL = join(ROOT, 'scripts', '.dekel-cache', 'products.jsonl');

const ACCOUNT_ID = 'e5a5076a-faaf-4e67-8bdd-61c15153fb20'; // the_dekel
const args = process.argv.slice(2);
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity;
})();
const SKIP_RAG = args.includes('--skip-rag');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase env');
  process.exit(1);
}
if (!OPENAI_KEY && !SKIP_RAG) {
  console.error('Missing OPENAI_API_KEY (use --skip-rag to skip embeddings)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- helpers ----------

function loadJsonl() {
  const text = readFileSync(JSONL, 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.ok && r.slug && r.productName) rows.push(r);
    } catch {}
  }
  // Deduplicate by slug — keep last occurrence
  const map = new Map();
  for (const r of rows) map.set(r.slug, r);
  return [...map.values()];
}

// Parse "Hebrew name - explanation" lines into { name, note }
function parseKeyIngredients(arr) {
  const out = [];
  for (let raw of arr || []) {
    raw = String(raw).replace(/^[✔✓✔\s]+/, '').trim();
    if (!raw) continue;
    const m = raw.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (m) out.push({ name: m[1].trim(), note: m[2].trim() });
    else out.push({ name: raw, note: null });
  }
  return out;
}

function buildSummary(p) {
  const lines = [];
  lines.push(`מוצר: ${p.productName}`);
  if (p.brand) lines.push(`מותג: ${p.brand}`);
  if (p.category) lines.push(`קטגוריה: ${p.category}`);
  if (Array.isArray(p.claims) && p.claims.length) {
    lines.push(`תגיות: ${p.claims.join(', ')}`);
  }
  if (p.usage) lines.push(`אופן שימוש: ${p.usage}`);
  if (p.description) {
    // Description already includes the full body from scraper. Truncate.
    lines.push('');
    lines.push(p.description.slice(0, 2500));
  }
  if (Array.isArray(p.inci) && p.inci.length) {
    lines.push('');
    lines.push(`רשימת רכיבים (INCI): ${p.inci.slice(0, 60).join(', ')}`);
  }
  lines.push('');
  lines.push(`מקור: ${p.url || p.link}`);
  return lines.join('\n').slice(0, 8000);
}

async function getEmbeddings(texts) {
  if (!texts.length) return [];
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      dimensions: 2000,
      input: texts.map((t) => t.slice(0, 8000)),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// ---------- ingestion ----------

async function ensureProductDocuments() {
  // Single "documents" row that owns all product chunks.
  // Schema: documents (id, account_id, entity_type, source_id, title, source, status, ...).
  const SOURCE_ID = 'thedekel-products-catalog';
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('account_id', ACCOUNT_ID)
    .eq('entity_type', 'product_catalog')
    .eq('source_id', SOURCE_ID)
    .maybeSingle();
  if (existing?.id) {
    // Clear old chunks so we can reinsert cleanly (no unique constraint to upsert on)
    const { error: delErr } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', existing.id);
    if (delErr) throw new Error(`clear chunks: ${delErr.message}`);
    return existing.id;
  }

  const { data: doc, error } = await supabase
    .from('documents')
    .insert({
      account_id: ACCOUNT_ID,
      entity_type: 'product_catalog',
      source_id: SOURCE_ID,
      title: 'TheDekel — מילון תכשירים',
      source: 'https://thedekel.co.il/products-company/',
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw new Error(`documents insert: ${error.message}`);
  return doc.id;
}

async function upsertProduct(p, embedding) {
  const keyIngredientsParsed = parseKeyIngredients(p.keyIngredients);
  const keyIngredientNames = keyIngredientsParsed.map((k) => k.name);

  const aiProfile = {
    slug: p.slug,
    detail_url: p.url || p.link,
    promo_percent: p.promoPercent ?? null,
    has_promo: !!p.hasPromo,
    verified: !!p.verified,
    key_ingredients_detailed: keyIngredientsParsed,
    ingredient_ratings: p.ingredientItems || [],
    raw_image_alt: p.imgAlt,
    source: 'thedekel.co.il',
  };

  const row = {
    account_id: ACCOUNT_ID,
    slug: p.slug,
    name: p.productName,
    name_he: p.productName,
    brand: p.brand || null,
    category: p.category || null,
    description: p.description ? p.description.slice(0, 4000) : null,
    usage: p.usage || null,
    claims: Array.isArray(p.claims) ? p.claims : [],
    ingredients: Array.isArray(p.inci) ? p.inci : [],
    key_ingredients: keyIngredientNames,
    image_url: p.imgSrc || null, // base64 data URL — renders directly in <img>
    product_url: p.url || p.link || null,
    is_available: true,
    is_on_sale: !!p.promoPercent,
    is_featured: false,
    ai_profile: aiProfile,
    // NOTE: skipping widget_products.embedding (1536-dim legacy column).
    // The 2000-dim embedding is stored on document_chunks where the chat's
    // RAG retrieval reads from.
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('widget_products')
    .upsert(row, { onConflict: 'account_id,slug' });
  if (error) throw new Error(`widget_products upsert ${p.slug}: ${error.message}`);
}

async function insertChunks(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('document_chunks').insert(rows);
  if (error) throw new Error(`document_chunks insert: ${error.message}`);
}

function buildChunkRow(documentId, p, summary, embedding, idx) {
  // entity_type='product' so retrieval can filter / boost product matches separately
  return {
    document_id: documentId,
    account_id: ACCOUNT_ID,
    entity_type: 'product',
    chunk_index: idx,
    chunk_text: summary,
    embedding,
    token_count: Math.ceil(summary.length / 4),
    topic: 'beauty',
    metadata: {
      slug: p.slug,
      name: p.productName,
      brand: p.brand,
      category: p.category,
      claims: p.claims,
      product_url: p.url || p.link,
      // image_url intentionally omitted — too large for metadata; UI fetches from widget_products
    },
  };
}

async function run() {
  const all = loadJsonl();
  console.log(`[load] ${all.length} valid products from JSONL`);
  const items = LIMIT === Infinity ? all : all.slice(0, LIMIT);
  console.log(`[ingest] processing ${items.length}`);

  const docId = SKIP_RAG ? null : await ensureProductDocuments();
  if (docId) console.log(`[doc] product catalog document_id = ${docId}`);

  // Process in batches of 20 (matches embedding API batch size)
  let okCount = 0;
  let failCount = 0;
  for (let i = 0; i < items.length; i += 20) {
    const batch = items.slice(i, i + 20);
    const summaries = batch.map(buildSummary);
    let embeddings = [];
    if (!SKIP_RAG) {
      try {
        embeddings = await getEmbeddings(summaries);
      } catch (e) {
        console.error(`[batch ${i}] embeddings failed: ${e.message}`);
        // continue, store products without embeddings
      }
    }
    const chunkRows = [];
    for (let j = 0; j < batch.length; j++) {
      const p = batch[j];
      const emb = embeddings[j] || null;
      try {
        await upsertProduct(p, emb);
        if (docId && emb) {
          chunkRows.push(buildChunkRow(docId, p, summaries[j], emb, i + j));
        }
        okCount++;
      } catch (e) {
        failCount++;
        console.error(`[ingest ${p.slug}] ${e.message}`);
      }
    }
    if (chunkRows.length) {
      try {
        await insertChunks(chunkRows);
      } catch (e) {
        console.error(`[chunks batch ${i}] ${e.message}`);
      }
    }
    console.log(`[batch] ${Math.min(i + 20, items.length)}/${items.length} (ok=${okCount}, fail=${failCount})`);
  }

  console.log(`\n[done] ok=${okCount} fail=${failCount} total=${items.length}`);
  // Update document chunk count
  if (docId) {
    await supabase
      .from('documents')
      .update({ chunk_count: okCount, total_tokens: okCount * 500 })
      .eq('id', docId);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
