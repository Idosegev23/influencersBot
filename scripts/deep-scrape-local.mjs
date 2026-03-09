#!/usr/bin/env node
/**
 * Deep local scraper for WordPress sites — fetch + cheerio.
 * Uses sitemap to discover all URLs, then scrapes each page.
 * Saves to instagram_bio_websites + RAG ingestion.
 *
 * Usage: node scripts/deep-scrape-local.mjs
 */

import { load } from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// ============================================
// Config
// ============================================
const ACCOUNT_ID = 'e5a5076a-faaf-4e67-8bdd-61c15153fb20';
const SITE_URL = 'https://thedekel.co.il';
const DOMAIN = 'thedekel.co.il';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars. Run: source .env.local && node scripts/deep-scrape-local.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Skip these URL patterns (not useful for chatbot)
const SKIP_PATTERNS = [
  /\/cart\/?$/,
  /\/checkout\/?$/,
  /\/user-account\/?$/,
  /\/wishlist\/?$/,
  /\/certificate-page\/?$/,
  /\/stm-certificates\//,
  /\/privacy-policy\/?$/,
  /\/accessibility-statement\/?$/,
];

const CONCURRENCY = 3;
const DELAY_MS = 500; // Be polite to the server

// ============================================
// Sitemap parser
// ============================================
async function fetchSitemapUrls() {
  console.log('📍 Fetching sitemap index...');
  const indexRes = await fetch(`${SITE_URL}/sitemap_index.xml`);
  const indexXml = await indexRes.text();
  const $ = load(indexXml, { xmlMode: true });

  const sitemapUrls = [];
  $('sitemap loc').each((_, el) => {
    sitemapUrls.push($(el).text());
  });

  console.log(`   Found ${sitemapUrls.length} sub-sitemaps`);

  const allUrls = [];
  for (const sitemapUrl of sitemapUrls) {
    try {
      const res = await fetch(sitemapUrl);
      const xml = await res.text();
      const $s = load(xml, { xmlMode: true });
      $s('url loc').each((_, el) => {
        const url = $s(el).text();
        // Only include same-domain URLs
        if (url.includes(DOMAIN)) {
          allUrls.push(url);
        }
      });
    } catch (e) {
      console.warn(`   Warning: failed to fetch ${sitemapUrl}: ${e.message}`);
    }
  }

  // Filter out skip patterns
  const filtered = allUrls.filter(url => !SKIP_PATTERNS.some(p => p.test(url)));
  console.log(`   Total URLs: ${allUrls.length}, after filtering: ${filtered.length}`);
  return [...new Set(filtered)]; // dedupe
}

// ============================================
// Page scraper
// ============================================
async function scrapePage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return { url, error: `HTTP ${res.status}`, content: '' };
    }

    const html = await res.text();
    const $ = load(html);

    // Remove noise
    $('script, style, noscript, iframe, svg, nav, footer, header').remove();
    $('.cookie-banner, .popup, #cookie-consent, .elementor-location-header, .elementor-location-footer').remove();
    $('.sidebar, .widget-area, .comments-area, .related-posts').remove();
    $('[class*="menu"], [class*="navigation"], [id*="menu"]').remove();

    // Extract metadata
    const title = $('title').text().trim() || $('h1').first().text().trim() || '';
    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    // Extract main content — try specific WordPress/Elementor selectors first
    let content = '';
    const contentSelectors = [
      '.elementor-widget-container',
      '.entry-content',
      'article',
      '.post-content',
      '.page-content',
      'main',
      '#content',
      '.content-area',
    ];

    for (const selector of contentSelectors) {
      const els = $(selector);
      if (els.length > 0) {
        els.each((_, el) => {
          content += $(el).text().trim() + '\n\n';
        });
        if (content.length > 100) break; // Good enough
      }
    }

    // Fallback to body
    if (content.length < 100) {
      content = $('body').text().trim();
    }

    // Clean up whitespace
    content = content
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/gm, '')
      .trim();

    // Extract images
    const imageUrls = [];
    if (ogImage) imageUrls.push(ogImage);
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.startsWith('http') && !src.includes('data:') && !src.includes('svg')) {
        imageUrls.push(src);
      }
    });

    // Extract links (internal)
    const links = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes(DOMAIN) && !href.includes('#')) {
        links.push(href);
      }
    });

    // Extract structured data
    const structuredData = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        structuredData.push(JSON.parse($(el).html()));
      } catch {}
    });

    const wordCount = content.split(/\s+/).filter(Boolean).length;

    return {
      url,
      title,
      description,
      content,
      imageUrls: [...new Set(imageUrls)].slice(0, 10),
      links: [...new Set(links)],
      structuredData,
      wordCount,
      error: null,
    };
  } catch (e) {
    return { url, error: e.message, content: '', wordCount: 0 };
  }
}

// ============================================
// DB save
// ============================================
async function savePageToDB(page) {
  const { error } = await supabase.from('instagram_bio_websites').upsert(
    {
      account_id: ACCOUNT_ID,
      url: page.url,
      page_title: page.title,
      page_description: page.description,
      page_content: page.content,
      image_urls: page.imageUrls || [],
      meta_tags: { title: page.title, description: page.description },
      structured_data: page.structuredData || [],
      extracted_data: {},
      parent_url: null,
      crawl_depth: 0,
      http_status: 200,
      content_type: 'text/html',
      processing_status: 'completed',
      source_type: 'standalone',
      scraped_at: new Date().toISOString(),
      crawl_session_id: `local_deep_${Date.now()}`,
    },
    { onConflict: 'account_id,url' }
  );

  if (error) {
    console.error(`   DB error for ${page.url}: ${error.message}`);
    return false;
  }
  return true;
}

// ============================================
// RAG ingestion
// ============================================
async function ingestToRAG(page) {
  if (!page.content || page.content.length < 50) return 0;

  // Check if document already exists
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('account_id', ACCOUNT_ID)
    .eq('entity_type', 'website')
    .eq('source_id', page.url)
    .single();

  // Delete old chunks if document exists
  if (existing) {
    await supabase.from('document_chunks').delete().eq('document_id', existing.id);
    await supabase.from('documents').delete().eq('id', existing.id);
  }

  // Create document record
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      account_id: ACCOUNT_ID,
      entity_type: 'website',
      source_id: page.url,
      title: page.title || page.url,
      status: 'active',
      metadata: { url: page.url, wordCount: page.wordCount },
    })
    .select('id')
    .single();

  if (docErr) {
    console.error(`   RAG doc error: ${docErr.message}`);
    return 0;
  }

  // Chunk the content (600 chars with 100 overlap)
  const chunks = chunkText(page.content, 600, 100);
  let created = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Generate embedding
    const embedding = await getEmbedding(chunk);
    if (!embedding) continue;

    const { error: chunkErr } = await supabase.from('document_chunks').insert({
      document_id: doc.id,
      account_id: ACCOUNT_ID,
      entity_type: 'website',
      chunk_index: i,
      chunk_text: chunk,
      embedding,
      token_count: Math.ceil(chunk.length / 4),
      metadata: { url: page.url, title: page.title },
    });

    if (!chunkErr) created++;
  }

  // Update chunk count
  await supabase.from('documents').update({ chunk_count: created, total_tokens: Math.ceil(page.content.length / 4) }).eq('id', doc.id);

  return created;
}

function chunkText(text, maxChars = 600, overlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + maxChars * 0.5) {
        end = breakPoint + 1;
      }
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter(c => c.length > 30);
}

async function getEmbedding(text) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    console.error('Missing OPENAI_API_KEY');
    return null;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`   Embedding error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.data[0].embedding;
  } catch (e) {
    console.error(`   Embedding exception: ${e.message}`);
    return null;
  }
}

// ============================================
// Parallel executor
// ============================================
async function processInBatches(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + concurrency < items.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  return results;
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('🔍 Deep Local Scraper for', SITE_URL);
  console.log('Account:', ACCOUNT_ID);
  console.log('');

  // 1. Get all URLs from sitemap
  const urls = await fetchSitemapUrls();
  console.log(`\n📄 ${urls.length} pages to scrape\n`);

  // 2. Scrape all pages
  let scraped = 0;
  let failed = 0;
  let totalWords = 0;
  const allPages = [];

  console.log('--- Scraping ---');
  const pages = await processInBatches(urls, async (url) => {
    const page = await scrapePage(url);
    if (page.error) {
      console.log(`   ❌ ${decodeURIComponent(url.replace(SITE_URL, ''))} — ${page.error}`);
      failed++;
    } else {
      console.log(`   ✅ ${decodeURIComponent(url.replace(SITE_URL, ''))} — ${page.wordCount} words`);
      scraped++;
      totalWords += page.wordCount;
    }
    return page;
  }, CONCURRENCY);

  const validPages = pages.filter(p => !p.error && p.content.length > 50);
  console.log(`\n📊 Scraped: ${scraped} OK, ${failed} failed, ${totalWords} total words`);

  // 3. Save to DB
  console.log('\n--- Saving to DB ---');
  let saved = 0;
  for (const page of validPages) {
    const ok = await savePageToDB(page);
    if (ok) saved++;
  }
  console.log(`   💾 Saved ${saved}/${validPages.length} pages`);

  // 4. RAG ingestion
  console.log('\n--- RAG Ingestion ---');
  let totalChunks = 0;
  for (let i = 0; i < validPages.length; i++) {
    const page = validPages[i];
    const shortUrl = decodeURIComponent(page.url.replace(SITE_URL, '') || '/');
    process.stdout.write(`   [${i + 1}/${validPages.length}] ${shortUrl}...`);
    const chunks = await ingestToRAG(page);
    totalChunks += chunks;
    console.log(` ${chunks} chunks`);
  }

  console.log(`\n✅ Done!`);
  console.log(`   Pages scraped: ${scraped}`);
  console.log(`   Pages saved: ${saved}`);
  console.log(`   Total words: ${totalWords}`);
  console.log(`   RAG chunks: ${totalChunks}`);
}

main().catch(console.error);
