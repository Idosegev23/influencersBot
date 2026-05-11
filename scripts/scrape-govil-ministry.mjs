#!/usr/bin/env node
/**
 * Playwright-based scraper for 3 government ministry sites.
 * Uses fresh browser context per page to bypass Cloudflare session-level blocking.
 * Strict in-scope filter: only pages belonging to the configured ministry.
 *
 * Usage:
 *   node --env-file=.env scripts/scrape-govil-ministry.mjs <key> [options]
 *
 * Keys: civic-service | road-safety | mod-scholarship | all
 *
 * Options:
 *   --max-pages <n>    Default 200
 *   --concurrency <n>  Default 2 (gentle on Cloudflare)
 *   --dry-run          Crawl + classify only — do NOT touch the DB
 *   --skip-rag         Save pages but skip embeddings
 *   --clean            Delete prior pages + RAG docs for this ministry first
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// ============================================
// CLI parsing
// ============================================
const args = process.argv.slice(2);
const key = args[0];
function getArg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const hasFlag = (name) => args.includes(`--${name}`);

const MAX_PAGES = parseInt(getArg('max-pages', '200'), 10);
const CONCURRENCY = parseInt(getArg('concurrency', '2'), 10);
const DRY_RUN = hasFlag('dry-run');
const SKIP_RAG = hasFlag('skip-rag');
const CLEAN = hasFlag('clean');

// ============================================
// Ministry configs
// ============================================
const CONFIGS = {
  'civic-service': {
    domain: 'civic-service.gov.il',
    displayName: 'רשות השירות הלאומי-אזרחי',
    welcomeMsg: 'שלום, אני עוזר חכם של רשות השירות הלאומי-אזרחי. במה אפשר לעזור?',
    color: '#0068f5',
    seeds: ['https://www.gov.il/he/departments/authority_for_national_civic_service/govil-landing-page'],
    officeId: '1195ce53-2541-4214-8ad1-72d5273b4626',
    pathPrefix: '/he/departments/authority_for_national_civic_service',
    host: 'www.gov.il',
  },
  'road-safety': {
    domain: 'road-safety.gov.il',
    displayName: 'הרשות הלאומית לבטיחות בדרכים',
    welcomeMsg: 'שלום, אני עוזר חכם של הרשות הלאומית לבטיחות בדרכים. במה אפשר לעזור?',
    color: '#0068f5',
    seeds: ['https://www.gov.il/he/departments/israel_national_road_safety_authority/govil-landing-page'],
    officeId: '53321058-5a80-431e-ac67-969171fcc841',
    pathPrefix: '/he/departments/israel_national_road_safety_authority',
    host: 'www.gov.il',
  },
  'mod-scholarship': {
    domain: 'hachvana.mod.gov.il',
    displayName: 'מלגות מקרנות וגופים חיצוניים — אגף הכוונה',
    welcomeMsg: 'שלום, אני עוזר חכם בענייני מלגות לחיילים משוחררים. במה אפשר לעזור?',
    color: '#0068f5',
    seeds: ['https://www.hachvana.mod.gov.il/MainEducation/Scholarship/Pages/default.aspx'],
    officeId: null,
    pathPrefix: '/MainEducation/Scholarship',
    host: 'www.hachvana.mod.gov.il',
  },
};

if (!key || (!CONFIGS[key] && key !== 'all')) {
  console.log('Usage: node --env-file=.env scripts/scrape-govil-ministry.mjs <key> [options]');
  console.log('Keys: civic-service | road-safety | mod-scholarship | all');
  process.exit(1);
}

// ============================================
// Env + Supabase
// ============================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  process.exit(1);
}
if (!DRY_RUN && !SKIP_RAG && !OPENAI_KEY) {
  console.error('Missing OPENAI_API_KEY (or use --skip-rag)');
  process.exit(1);
}

const supabase = DRY_RUN ? null : createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SKIP_PATTERNS = [
  /\.(jpg|jpeg|png|gif|webp|svg|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|mp4|mp3)$/i,
  /\/cdn-cgi\//i,
  /\/api\//i,
];

// ============================================
// Scope + URL normalization
// ============================================
// Strong scope: pages we are CERTAIN belong to this ministry (path-prefix or OfficeId match)
function isStrongScope(u, cfg) {
  if (u.hostname !== cfg.host) return false;
  if (cfg.host === 'www.gov.il' && !u.pathname.startsWith('/he/')) return false;
  if (u.pathname.toLowerCase().startsWith(cfg.pathPrefix.toLowerCase())) return true;
  if (cfg.officeId) {
    const oid = (u.searchParams.get('OfficeId') || u.searchParams.get('officeId') || '').toLowerCase();
    if (oid === cfg.officeId.toLowerCase()) return true;
  }
  return false;
}

// Weak scope: looks like a content item (newsletter, article, dynamic collector). Only safe
// to follow when discovered from a strong-scope parent — otherwise we'd scrape content
// belonging to other ministries from shared navigation links.
function isWeakItemPath(u, cfg) {
  if (u.hostname !== cfg.host) return false;
  if (cfg.host !== 'www.gov.il') return false; // MOD site only uses path scope
  if (!u.pathname.startsWith('/he/')) return false;
  const p = u.pathname.toLowerCase();
  if (p.startsWith('/he/pages/')) return true;
  if (p.startsWith('/he/departments/dynamiccollectors/')) return true;
  return false;
}

function isInScope(u, cfg, parentStrongScope = false) {
  if (isStrongScope(u, cfg)) return true;
  if (parentStrongScope && isWeakItemPath(u, cfg)) return true;
  return false;
}

function normalizeUrl(u, cfg) {
  const out = new URL(u.toString());
  // Drop hash + ALL query params except OfficeId
  out.hash = '';
  const oid = out.searchParams.get('OfficeId') || out.searchParams.get('officeId');
  out.search = '';
  if (cfg.officeId && oid && oid.toLowerCase() === cfg.officeId.toLowerCase()) {
    out.searchParams.set('OfficeId', cfg.officeId);
  }
  // Trim trailing slash for consistency
  if (out.pathname.length > 1 && out.pathname.endsWith('/')) {
    out.pathname = out.pathname.replace(/\/$/, '');
  }
  return out.toString();
}

function parseUrl(href, base) {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('javascript:')) return null;
  if (!trimmed.startsWith('/') && !trimmed.startsWith('http')) return null;
  try { return new URL(trimmed, base); } catch { return null; }
}

// ============================================
// Per-page fetch (fresh context per page)
// ============================================
async function fetchPage(browser, url) {
  const ctx = await browser.newContext({ userAgent: UA, locale: 'he-IL', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  let status = null;
  let error = null;
  try {
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    status = r?.status();
  } catch (e) {
    error = e.message;
  }
  // Allow Angular hydration. ASPX pages don't need it but it doesn't hurt.
  await page.waitForTimeout(2500).catch(() => {});

  let result = { status, error, url, title: '', text: '', hrefs: [], images: [], cfBlocked: false };
  try {
    result.title = await page.title();
    result.cfBlocked = result.title.includes('Cloudflare') || result.title.includes('Attention Required');
    if (!result.cfBlocked) {
      const data = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter(Boolean);
        const imgs = [...document.querySelectorAll('img[src]')]
          .map((i) => ({ src: i.getAttribute('src'), alt: i.getAttribute('alt') || '' }))
          .filter((i) => i.src && !i.src.startsWith('data:'));
        const desc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
        return { text, hrefs, imgs, desc };
      });
      result.text = data.text;
      result.hrefs = data.hrefs;
      result.images = data.imgs;
      result.description = data.desc;
    }
  } catch (e) {
    result.error = result.error || e.message;
  }
  await ctx.close().catch(() => {});
  return result;
}

// ============================================
// Scrape one ministry
// ============================================
async function scrapeMinistry(browser, cfg, keyName) {
  console.log(`\n========== ${keyName} ==========`);
  console.log(`  Domain: ${cfg.domain}  Host: ${cfg.host}  OfficeId: ${cfg.officeId || '(none)'}  Prefix: ${cfg.pathPrefix}`);

  // 1. Account
  let accountId = null;
  if (!DRY_RUN) {
    accountId = await ensureAccount(cfg);
    if (CLEAN) await cleanOldData(accountId, cfg.domain);
  }

  // 2. BFS crawl — queue holds { url, strongParent } so weak-scope items only follow strong parents
  const queue = cfg.seeds.map((s) => ({ url: normalizeUrl(new URL(s), cfg), strongParent: true }));
  const enqueued = new Set(queue.map((q) => q.url));
  const scraped = new Map();
  let countCF = 0, countOOS = 0, countErr = 0;

  while (queue.length > 0 && scraped.size < MAX_PAGES) {
    const batch = queue.splice(0, CONCURRENCY);
    const results = await Promise.all(batch.map((q) => fetchPage(browser, q.url).then((r) => ({ ...r, _strongParent: q.strongParent }))));

    for (const r of results) {
      if (r.cfBlocked) { countCF++; console.log(`  🚫CF  ${r.url}`); continue; }
      if (r.error && !r.status) { countErr++; console.log(`  ⚠️ERR ${r.url}  ${r.error?.slice(0, 60)}`); continue; }
      const words = r.text.split(/\s+/).filter(Boolean).length;
      scraped.set(r.url, { ...r, wordCount: words });
      console.log(`  ✅ [${r.status}] words=${String(words).padStart(4)}  imgs=${String(r.images.length).padStart(3)}  ${r.url}`);

      // This page's "strong" status determines whether we follow weak-item children
      const thisStrong = isStrongScope(new URL(r.url), cfg);
      for (const h of r.hrefs) {
        const child = parseUrl(h, r.url);
        if (!child) continue;
        if (SKIP_PATTERNS.some((re) => re.test(child.toString()))) continue;
        if (!isInScope(child, cfg, thisStrong)) { countOOS++; continue; }
        const norm = normalizeUrl(child, cfg);
        if (enqueued.has(norm)) continue;
        if (scraped.size + queue.length >= MAX_PAGES) break;
        enqueued.add(norm);
        queue.push({ url: norm, strongParent: isStrongScope(new URL(norm), cfg) });
      }
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\n  Crawl summary: ${scraped.size} scraped, ${countCF} CF-blocked, ${countErr} errors, ${countOOS} out-of-scope refs`);

  // 3. DB save + RAG
  if (DRY_RUN) {
    console.log('  --dry-run: skipping DB writes');
    return { scraped: scraped.size, saved: 0, ragChunks: 0 };
  }

  const sessionId = crypto.randomUUID();
  let saved = 0;
  let chunkTotal = 0;
  for (const [url, r] of scraped) {
    if (r.wordCount < 5) continue;
    const ok = await savePageToDB(accountId, r, sessionId, cfg);
    if (ok) {
      saved++;
      if (!SKIP_RAG) chunkTotal += await ingestToRAG(accountId, r);
    }
  }
  console.log(`  Saved ${saved} pages, ${chunkTotal} RAG chunks. Account ID: ${accountId}`);
  return { scraped: scraped.size, saved, ragChunks: chunkTotal, accountId };
}

// ============================================
// DB: account
// ============================================
async function ensureAccount(cfg) {
  const { data: existing } = await supabase
    .from('accounts')
    .select('id')
    .eq('config->>username', cfg.domain)
    .maybeSingle();
  if (existing) {
    console.log(`  Account exists: ${existing.id}`);
    return existing.id;
  }
  const subdomain = cfg.domain.replace(/\./g, '').replace(/-/g, '');
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      type: 'creator',
      config: {
        username: cfg.domain,
        display_name: cfg.displayName,
        subdomain,
        widget: {
          primaryColor: cfg.color,
          welcomeMessage: cfg.welcomeMsg,
          placeholder: 'שאלו משהו...',
          position: 'bottom-right',
        },
      },
      plan: 'free',
      status: 'active',
      timezone: 'Asia/Jerusalem',
      language: 'he',
      allowed_channels: { web: true, whatsapp: false },
      features: { chatbot: true, analytics: true },
    })
    .select('id')
    .single();
  if (error) {
    console.error('Account create failed:', error.message);
    process.exit(1);
  }
  console.log(`  Account created: ${data.id}`);
  return data.id;
}

// ============================================
// DB: page save
// ============================================
async function savePageToDB(accountId, r, sessionId, cfg) {
  const { error } = await supabase.from('instagram_bio_websites').upsert(
    {
      account_id: accountId,
      url: r.url,
      page_title: r.title,
      page_description: r.description || '',
      page_content: r.text,
      image_urls: r.images.slice(0, 30).map((i) => {
        try { return new URL(i.src, r.url).toString(); } catch { return null; }
      }).filter(Boolean),
      meta_tags: { title: r.title, description: r.description, source: 'gov.il', ministry: cfg.displayName },
      structured_data: [],
      extracted_data: {},
      parent_url: null,
      crawl_depth: 0,
      http_status: r.status || 200,
      content_type: 'text/html',
      processing_status: 'completed',
      source_type: 'standalone',
      scraped_at: new Date().toISOString(),
      crawl_session_id: sessionId,
    },
    { onConflict: 'account_id,url' },
  );
  if (error) {
    console.error(`  DB error ${r.url}: ${error.message}`);
    return false;
  }
  return true;
}

// ============================================
// RAG ingest (mirrors deep-scrape-website.mjs)
// ============================================
async function ingestToRAG(accountId, r) {
  if (!r.text || r.text.length < 50) return 0;
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('account_id', accountId)
    .eq('entity_type', 'website')
    .eq('source_id', r.url)
    .maybeSingle();
  if (existing) {
    await supabase.from('document_chunks').delete().eq('document_id', existing.id);
    await supabase.from('documents').delete().eq('id', existing.id);
  }
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      account_id: accountId,
      entity_type: 'website',
      source_id: r.url,
      title: r.title || r.url,
      status: 'active',
      metadata: { url: r.url, wordCount: r.wordCount, images: r.images.slice(0, 5).map((i) => i.src) },
    })
    .select('id')
    .single();
  if (docErr) {
    console.error(`  RAG doc err ${r.url}: ${docErr.message}`);
    return 0;
  }
  const chunks = chunkText(r.text, 600, 100);
  let created = 0;
  for (let i = 0; i < chunks.length; i += 20) {
    const batch = chunks.slice(i, i + 20);
    const embeddings = await getEmbeddingBatch(batch);
    if (!embeddings) continue;
    const rows = batch.map((text, j) => ({
      document_id: doc.id,
      account_id: accountId,
      entity_type: 'website',
      chunk_index: i + j,
      chunk_text: text,
      embedding: embeddings[j],
      token_count: Math.ceil(text.length / 4),
      metadata: { url: r.url, title: r.title },
    }));
    const { error } = await supabase.from('document_chunks').insert(rows);
    if (error) console.error(`  chunk insert err: ${error.message}`);
    else created += rows.length;
  }
  await supabase
    .from('documents')
    .update({ chunk_count: created, total_tokens: Math.ceil(r.text.length / 4) })
    .eq('id', doc.id);
  return created;
}

function chunkText(text, maxChars = 600, overlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    if (end < text.length) {
      const lp = text.lastIndexOf('.', end);
      const ln = text.lastIndexOf('\n', end);
      const bp = Math.max(lp, ln);
      if (bp > start + maxChars * 0.5) end = bp + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece.length > 20) chunks.push(piece);
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

async function getEmbeddingBatch(texts) {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        dimensions: 2000,
        input: texts.map((t) => t.slice(0, 8000)),
      }),
      signal: AbortSignal.timeout(300000),
    });
    if (!res.ok) {
      console.error(`  Embedding err: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch (e) {
    console.error(`  Embedding ex: ${e.message}`);
    return null;
  }
}

// ============================================
// Clean prior data for this ministry
// ============================================
async function cleanOldData(accountId, domain) {
  console.log(`  Cleaning prior data for ${domain}...`);
  const { count: pagesDeleted } = await supabase
    .from('instagram_bio_websites')
    .delete({ count: 'exact' })
    .eq('account_id', accountId);
  console.log(`    Deleted ${pagesDeleted || 0} pages`);
  const { data: docs } = await supabase
    .from('documents')
    .select('id')
    .eq('account_id', accountId)
    .eq('entity_type', 'website');
  if (docs && docs.length > 0) {
    for (const d of docs) await supabase.from('document_chunks').delete().eq('document_id', d.id);
    await supabase.from('documents').delete().eq('account_id', accountId).eq('entity_type', 'website');
    console.log(`    Deleted ${docs.length} RAG documents`);
  }
}

// ============================================
// Main
// ============================================
(async () => {
  const browser = await chromium.launch({ headless: true });
  const t0 = Date.now();
  const keys = key === 'all' ? Object.keys(CONFIGS) : [key];
  const results = {};
  for (const k of keys) {
    try {
      results[k] = await scrapeMinistry(browser, CONFIGS[k], k);
    } catch (e) {
      console.error(`Ministry ${k} failed:`, e.message);
      results[k] = { error: e.message };
    }
  }
  await browser.close();
  console.log(`\n=============================`);
  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(JSON.stringify(results, null, 2));
})();
