#!/usr/bin/env node
/**
 * Targeted Playwright scrape for meuhedet.co.il (JS-rendered SPA — the cheerio
 * crawler saved 299 pages with empty page_content). Renders a curated URL list
 * and ingests to the SAME targets as the pipeline:
 *   instagram_bio_websites (page rows) + documents/document_chunks (RAG, website).
 * Embedding: text-embedding-3-large @ 2000 dims (matches src/lib/rag/embeddings.ts).
 * Adapted from scripts/scrape-layoga-spa.mjs (same DB contract).
 *
 * Run: node --env-file=.env.local scripts/scrape-meuhedet-spa.mjs <urls-file>
 */
import { readFileSync } from 'fs';
import { chromium } from 'playwright';
import { load } from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const ACCOUNT_ID = '4214549f-813b-406b-8b71-6550268235bb'; // מאוחדת demo
const SITE = 'https://www.meuhedet.co.il';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
const OPENAI_KEY = process.env.OPENAI_API_KEY;

async function renderPage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500).catch(() => {});
  return page.content();
}

function extract(url, html) {
  const $ = load(html);
  $('script, style, noscript, svg, header nav, footer').remove();
  const title = $('title').first().text().trim() || $('h1').first().text().trim() || url;
  const description = $('meta[name="description"]').attr('content') || '';
  let content = '';
  for (const sel of ['main', 'article', '#__next', '#root', 'body']) {
    const el = $(sel).first();
    if (el.length) {
      content = el.text().replace(/\s+/g, ' ').trim();
      if (content.length > 120) break;
    }
  }
  const imageUrls = $('img[src]').map((_, el) => $(el).attr('src')).get()
    .filter((s) => s && /^https?:/.test(s)).slice(0, 10);
  return { url, title, description, content, wordCount: content.split(/\s+/).filter(Boolean).length, pageType: url === SITE || url === SITE + '/' ? 'homepage' : 'page', imageUrls };
}

function chunkText(text, maxChars = 600, overlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    if (end < text.length) {
      const bp = Math.max(text.lastIndexOf('.', end), text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
      if (bp > start + maxChars * 0.5) end = bp + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 30);
}

async function getEmbeddingBatch(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-large', dimensions: 2000, input: texts.map((t) => t.slice(0, 8000)) }),
    signal: AbortSignal.timeout(300000),
  }).catch((e) => ({ ok: false, status: e.message }));
  if (!res.ok) { console.error(`   embed error: ${res.status}`); return null; }
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

async function savePageToDB(pg, sessionId) {
  const { error } = await supabase.from('instagram_bio_websites').upsert(
    {
      account_id: ACCOUNT_ID,
      url: pg.url,
      page_title: pg.title,
      page_description: pg.description,
      page_content: pg.content,
      image_urls: pg.imageUrls || [],
      meta_tags: { title: pg.title, description: pg.description, pageType: pg.pageType },
      structured_data: [],
      extracted_data: {},
      parent_url: null,
      crawl_depth: 0,
      http_status: 200,
      content_type: 'text/html',
      processing_status: 'completed',
      source_type: 'standalone',
      scraped_at: new Date().toISOString(),
      crawl_session_id: sessionId,
    },
    { onConflict: 'account_id,url' },
  );
  if (error) console.error(`   DB error ${pg.url}: ${error.message}`);
}

async function ingestToRAG(pg) {
  if (!pg.content || pg.content.length < 50) return 0;
  const { data: existing } = await supabase
    .from('documents').select('id')
    .eq('account_id', ACCOUNT_ID).eq('entity_type', 'website').eq('source_id', pg.url).maybeSingle();
  if (existing) {
    await supabase.from('document_chunks').delete().eq('document_id', existing.id);
    await supabase.from('documents').delete().eq('id', existing.id);
  }
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ account_id: ACCOUNT_ID, entity_type: 'website', source_id: pg.url, title: pg.title || pg.url, status: 'active', metadata: { url: pg.url, wordCount: pg.wordCount, pageType: pg.pageType, images: pg.imageUrls?.slice(0, 5) } })
    .select('id').single();
  if (docErr) { console.error(`   RAG doc error: ${docErr.message}`); return 0; }
  const chunks = chunkText(pg.content, 600, 100);
  let created = 0;
  for (let i = 0; i < chunks.length; i += 20) {
    const batch = chunks.slice(i, i + 20);
    const emb = await getEmbeddingBatch(batch);
    if (!emb) continue;
    const rows = batch.map((text, j) => ({ document_id: doc.id, account_id: ACCOUNT_ID, entity_type: 'website', chunk_index: i + j, chunk_text: text, embedding: emb[j], token_count: Math.ceil(text.length / 4), metadata: { url: pg.url, title: pg.title, pageType: pg.pageType } }));
    const { error } = await supabase.from('document_chunks').insert(rows);
    if (error) console.error(`   chunk insert error: ${error.message}`);
    else created += rows.length;
  }
  await supabase.from('documents').update({ chunk_count: created, total_tokens: Math.ceil(pg.content.length / 4) }).eq('id', doc.id);
  return created;
}

async function main() {
  const urlsFile = process.argv[2];
  if (!urlsFile) { console.error('Usage: scrape-meuhedet-spa.mjs <urls-file>'); process.exit(1); }
  const urls = readFileSync(urlsFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const sessionId = crypto.randomUUID();
  console.log(`\n=== meuhedet.co.il targeted SPA scrape: ${urls.length} urls -> ${ACCOUNT_ID} ===`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'he-IL', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  let scraped = 0, chunks = 0, skipped = 0;
  for (const url of urls) {
    const html = await renderPage(page, url);
    const pg = extract(url, html);
    if (pg.wordCount < 30) { skipped++; console.log(`   · skip (${pg.wordCount}w) ${decodeURI(url)}`); continue; }
    await savePageToDB(pg, sessionId);
    const c = await ingestToRAG(pg);
    chunks += c;
    scraped++;
    console.log(`   ✓ [${scraped}] ${decodeURI(url)} — ${pg.wordCount}w, ${c} chunks`);
  }

  await browser.close();
  console.log(`\n=== done: ${scraped} pages, ${chunks} RAG chunks, ${skipped} skipped ===\n`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
