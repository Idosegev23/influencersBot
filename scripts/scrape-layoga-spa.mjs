#!/usr/bin/env node
/**
 * Headless crawler for layoga.co.il (Vue SPA — static HTML is a 47-word shell,
 * so deep-scrape-website.mjs gets nothing). Renders each route with Playwright,
 * extracts visible text, and ingests to the SAME targets as deep-scrape-website.mjs:
 *   instagram_bio_websites (page rows) + documents/document_chunks (RAG, website).
 * Embedding: text-embedding-3-large @ 2000 dims (matches src/lib/rag/embeddings.ts).
 * Config-safe: only account_id is used to attach; accounts.config is never written.
 *
 * Run: node --env-file=.env.local scripts/scrape-layoga-spa.mjs
 */
import { chromium } from 'playwright';
import { load } from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51'; // Miran Buzaglo
const SITE = 'https://layoga.co.il';
const MAX_PAGES = 40;
// Public marketing routes (the /plan/* member area needs login). Hash routes render
// content the homepage anchors don't expose (e.g. /#/about = the method write-up).
const SEEDS = ['/', '/#/about', '/landing', '/old-version', '/plan/choose-plan', '/plan/conscious', '/contact'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const SKIP = /\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|pdf|mp4|woff2?|ttf)(\?|$)/i;

function normalize(href) {
  if (!href) return null;
  try {
    const u = new URL(href, SITE + '/');
    if (u.host !== new URL(SITE).host) return null;
    if (SKIP.test(u.pathname)) return null;
    u.hash = u.hash && u.hash.startsWith('#/') ? u.hash : ''; // keep hash-router routes, drop anchors
    u.search = '';
    let s = u.origin + u.pathname + u.hash;
    return s.replace(/\/$/, '') || SITE;
  } catch {
    return null;
  }
}

async function renderPage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500).catch(() => {});
  const html = await page.content();
  const links = await page
    .$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
    .catch(() => []);
  return { html, links };
}

function extract(url, html) {
  const $ = load(html);
  $('script, style, noscript, svg').remove();
  const title = $('title').first().text().trim() || $('h1').first().text().trim() || url;
  const description = $('meta[name="description"]').attr('content') || '';
  let content = '';
  for (const sel of ['main', 'article', '#app', 'body']) {
    const el = $(sel).first();
    if (el.length) {
      content = el.text().replace(/\s+/g, ' ').trim();
      if (content.length > 80) break;
    }
  }
  const imageUrls = $('img[src]')
    .map((_, el) => $(el).attr('src'))
    .get()
    .filter((s) => s && /^https?:/.test(s))
    .slice(0, 10);
  return { url, title, description, content, wordCount: content.split(/\s+/).filter(Boolean).length, pageType: url === SITE ? 'homepage' : 'page', imageUrls };
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
  if (!res.ok) {
    console.error(`   embed error: ${res.status}`);
    return null;
  }
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

async function savePageToDB(page, sessionId) {
  const { error } = await supabase.from('instagram_bio_websites').upsert(
    {
      account_id: ACCOUNT_ID,
      url: page.url,
      page_title: page.title,
      page_description: page.description,
      page_content: page.content,
      image_urls: page.imageUrls || [],
      meta_tags: { title: page.title, description: page.description, pageType: page.pageType },
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
  if (error) console.error(`   DB error ${page.url}: ${error.message}`);
}

async function ingestToRAG(page) {
  if (!page.content || page.content.length < 50) return 0;
  const { data: existing } = await supabase
    .from('documents').select('id')
    .eq('account_id', ACCOUNT_ID).eq('entity_type', 'website').eq('source_id', page.url).maybeSingle();
  if (existing) {
    await supabase.from('document_chunks').delete().eq('document_id', existing.id);
    await supabase.from('documents').delete().eq('id', existing.id);
  }
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ account_id: ACCOUNT_ID, entity_type: 'website', source_id: page.url, title: page.title || page.url, status: 'active', metadata: { url: page.url, wordCount: page.wordCount, pageType: page.pageType, images: page.imageUrls?.slice(0, 5) } })
    .select('id').single();
  if (docErr) { console.error(`   RAG doc error: ${docErr.message}`); return 0; }
  const chunks = chunkText(page.content, 600, 100);
  let created = 0;
  for (let i = 0; i < chunks.length; i += 20) {
    const batch = chunks.slice(i, i + 20);
    const emb = await getEmbeddingBatch(batch);
    if (!emb) continue;
    const rows = batch.map((text, j) => ({ document_id: doc.id, account_id: ACCOUNT_ID, entity_type: 'website', chunk_index: i + j, chunk_text: text, embedding: emb[j], token_count: Math.ceil(text.length / 4), metadata: { url: page.url, title: page.title, pageType: page.pageType } }));
    const { error } = await supabase.from('document_chunks').insert(rows);
    if (error) console.error(`   chunk insert error: ${error.message}`);
    else created += rows.length;
  }
  await supabase.from('documents').update({ chunk_count: created, total_tokens: Math.ceil(page.content.length / 4) }).eq('id', doc.id);
  return created;
}

async function main() {
  const sessionId = crypto.randomUUID();
  console.log(`\n=== layoga.co.il SPA crawl -> Miran (${ACCOUNT_ID}) ===`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'he-IL', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const seen = new Set();
  const queue = SEEDS.map((s) => (s === '/' ? SITE : SITE + s));
  let scraped = 0, chunks = 0;

  while (queue.length && scraped < MAX_PAGES) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const { html, links } = await renderPage(page, url);
    const pg = extract(url, html);
    if (pg.wordCount < 8) { console.log(`   · ${url} — ${pg.wordCount} words (skip)`); }
    else {
      await savePageToDB(pg, sessionId);
      const c = await ingestToRAG(pg);
      chunks += c;
      scraped++;
      console.log(`   ✓ [${scraped}] ${url} — ${pg.wordCount} words, ${c} chunks`);
    }
    for (const l of links) {
      const n = normalize(l);
      if (n && !seen.has(n) && !queue.includes(n) && queue.length + scraped < MAX_PAGES * 2) queue.push(n);
    }
  }

  await browser.close();
  console.log(`\n=== done: ${scraped} pages, ${chunks} RAG chunks ===\n`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
