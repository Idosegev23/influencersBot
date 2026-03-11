#!/usr/bin/env node
/**
 * Universal deep scraper for website widget setup.
 * Discovers all pages by link-crawling, extracts content, images, products.
 * Saves to DB + RAG ingestion for the widget chatbot.
 *
 * Usage:
 *   node --env-file=.env scripts/deep-scrape-website.mjs <url> [options]
 *
 * Examples:
 *   node --env-file=.env scripts/deep-scrape-website.mjs https://example.com
 *   node --env-file=.env scripts/deep-scrape-website.mjs https://shop.co.il --max-pages 100 --name "My Shop" --color "#d4a853"
 *   node --env-file=.env scripts/deep-scrape-website.mjs https://clinic.co.il --seeds "/services,/about,/doctors" --skip-rag
 *
 * Options:
 *   --max-pages <n>    Maximum pages to scrape (default: 200)
 *   --name <name>      Display name for the account (default: domain)
 *   --color <hex>      Widget primary color (default: #6366f1)
 *   --welcome <msg>    Widget welcome message
 *   --seeds <paths>    Comma-separated seed paths to start crawling from
 *   --concurrency <n>  Parallel requests (default: 3)
 *   --delay <ms>       Delay between batches (default: 400)
 *   --skip-rag         Skip RAG ingestion (just save to DB)
 *   --clean            Clean old data before scraping
 *   --account-id <id>  Use existing account ID instead of creating/finding one
 */

import { load } from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// ============================================
// Parse CLI args
// ============================================
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.log(`
Usage: node --env-file=.env scripts/deep-scrape-website.mjs <url> [options]

Options:
  --max-pages <n>    Maximum pages to scrape (default: 200)
  --name <name>      Display name for the account
  --color <hex>      Widget primary color (default: #6366f1)
  --welcome <msg>    Widget welcome message
  --seeds <paths>    Comma-separated seed paths (e.g. "/products,/about")
  --concurrency <n>  Parallel requests (default: 3)
  --delay <ms>       Delay between batches (default: 400)
  --skip-rag         Skip RAG ingestion
  --clean            Clean old data before scraping
  --account-id <id>  Use existing account ID
  `);
  process.exit(0);
}

function getArg(name, defaultValue = undefined) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

// Parse URL
const inputUrl = args[0];
let SITE_URL;
try {
  const parsed = new URL(inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`);
  SITE_URL = `${parsed.protocol}//${parsed.host}`;
} catch {
  console.error(`Invalid URL: ${inputUrl}`);
  process.exit(1);
}

const DOMAIN = new URL(SITE_URL).hostname;
const MAX_PAGES = parseInt(getArg('--max-pages', '200'));
const CONCURRENCY = parseInt(getArg('--concurrency', '3'));
const DELAY_MS = parseInt(getArg('--delay', '400'));
const DISPLAY_NAME = getArg('--name', DOMAIN);
const PRIMARY_COLOR = getArg('--color', '#6366f1');
const WELCOME_MSG = getArg('--welcome', `שלום! איך אפשר לעזור?`);
const SEED_PATHS = getArg('--seeds', '')?.split(',').filter(Boolean) || [];
const EXCLUDE_PATHS = getArg('--exclude', '')?.split(',').filter(Boolean) || [];
const SKIP_RAG = hasFlag('--skip-rag');
const CLEAN_OLD = hasFlag('--clean');
const EXISTING_ACCOUNT_ID = getArg('--account-id');

// ============================================
// Environment
// ============================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY)');
  process.exit(1);
}
if (!OPENAI_KEY && !SKIP_RAG) {
  console.error('Missing OPENAI_API_KEY (use --skip-rag to skip RAG ingestion)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// Skip patterns
// ============================================
const SKIP_PATTERNS = [
  /\/cart\/?$/,
  /\/checkout\/?$/,
  /\/user-account/,
  /\/wishlist/,
  /\/login/,
  /\/register/,
  /\/api\//,
  /\/admin\//,
  /\/dashboard\//,
  /\.(jpg|jpeg|png|gif|svg|pdf|zip|css|js|woff|woff2|ttf|eot|ico)$/i,
  /\/privacy/,
  /\/accessibility/,
  /\/cookie/,
  /\/terms/,
  /\?/,          // Skip query params
  /#/,           // Skip hash links
  /\/feed\/?$/,
  /\/rss\/?$/,
  /\/sitemap/,
  // User-defined exclude paths (--exclude flag)
  ...EXCLUDE_PATHS.map(p => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
];

// ============================================
// Account management
// ============================================
async function ensureAccount() {
  if (EXISTING_ACCOUNT_ID) {
    const { data } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', EXISTING_ACCOUNT_ID)
      .single();
    if (!data) {
      console.error(`Account ${EXISTING_ACCOUNT_ID} not found`);
      process.exit(1);
    }
    console.log(`   Using existing account: ${EXISTING_ACCOUNT_ID}`);
    return EXISTING_ACCOUNT_ID;
  }

  // Check if account exists (username stored in config.username)
  const { data: existing } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('config->>username', DOMAIN)
    .maybeSingle();

  if (existing) {
    console.log(`   Account found: ${existing.id}`);
    return existing.id;
  }

  // Create new account
  const subdomain = DOMAIN.replace(/\./g, '').replace(/-/g, '');
  const { data: newAccount, error } = await supabase
    .from('accounts')
    .insert({
      type: 'creator',
      config: {
        username: DOMAIN,
        display_name: DISPLAY_NAME,
        subdomain,
        widget: {
          primaryColor: PRIMARY_COLOR,
          welcomeMessage: WELCOME_MSG,
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
    console.error('Failed to create account:', error.message);
    process.exit(1);
  }

  console.log(`   Account created: ${newAccount.id}`);
  return newAccount.id;
}

// ============================================
// Link crawler — discover all pages
// ============================================
async function discoverPages() {
  console.log('   Discovering pages by link crawling...');
  const visited = new Set();
  const queue = [SITE_URL, `${SITE_URL}/`];
  const discovered = [];

  // Add seed paths
  for (const p of SEED_PATHS) {
    const path = p.startsWith('/') ? p : `/${p}`;
    queue.push(`${SITE_URL}${path}`);
  }

  // Try sitemap first
  try {
    const sitemapRes = await fetch(`${SITE_URL}/sitemap.xml`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SiteBot/1.0)' },
    });
    if (sitemapRes.ok) {
      const sitemapXml = await sitemapRes.text();
      const urlMatches = sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g);
      let sitemapCount = 0;
      for (const match of urlMatches) {
        const url = match[1].trim();
        if (url.includes(DOMAIN)) {
          queue.push(url);
          sitemapCount++;
        }
      }
      if (sitemapCount > 0) {
        console.log(`   Found ${sitemapCount} URLs from sitemap.xml`);
      }
    }
  } catch {
    // No sitemap — will discover via link crawling
  }

  while (queue.length > 0 && discovered.length < MAX_PAGES) {
    const url = queue.shift();
    const normalizedUrl = normalizeUrl(url);

    if (visited.has(normalizedUrl)) continue;
    if (!normalizedUrl.includes(DOMAIN)) continue;
    if (SKIP_PATTERNS.some(p => p.test(normalizedUrl))) continue;

    visited.add(normalizedUrl);
    discovered.push(normalizedUrl);

    // Fetch page and extract links
    try {
      const res = await fetch(normalizedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });

      if (!res.ok) continue;
      const html = await res.text();
      const $ = load(html);

      $('a[href]').each((_, el) => {
        let href = $(el).attr('href');
        if (!href) return;

        if (href.startsWith('/')) href = `${SITE_URL}${href}`;
        if (!href.startsWith('http')) return;

        const norm = normalizeUrl(href);
        if (norm.includes(DOMAIN) && !visited.has(norm) && !SKIP_PATTERNS.some(p => p.test(norm))) {
          queue.push(norm);
        }
      });

      if (discovered.length % 10 === 0) {
        process.stdout.write(`\r   Found ${discovered.length} pages (queue: ${queue.length})...`);
      }

      await sleep(200);
    } catch {
      // Skip failed pages during discovery
    }
  }

  console.log(`\n   Discovered ${discovered.length} unique pages`);
  return discovered;
}

// ============================================
// Page scraper — deep content extraction
// ============================================
async function scrapePage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    const html = await res.text();
    const $ = load(html);

    // Remove noise
    $('script, style, noscript, iframe, svg').remove();
    $('.cookie-banner, .popup, #cookie-consent, .cookie-notice').remove();
    $('nav, footer, header').remove();

    // --- Metadata ---
    const title = $('title').text().trim() || $('h1').first().text().trim() || '';
    const description =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    // --- Product data ---
    const product = extractProductData($, url);

    // --- Main content ---
    let content = '';

    // Build rich content string from product data
    if (product.name) {
      content += `שם מוצר: ${product.name}\n`;
      if (product.price) content += `מחיר: ${product.price}\n`;
      if (product.salePrice) content += `מחיר מבצע: ${product.salePrice}\n`;
      if (product.category) content += `קטגוריה: ${product.category}\n`;
      if (product.description) content += `תיאור: ${product.description}\n`;
      if (product.ingredients) content += `רכיבים: ${product.ingredients}\n`;
      if (product.usage) content += `אופן שימוש: ${product.usage}\n`;
      if (product.volume) content += `נפח: ${product.volume}\n`;
      content += '\n';
    }

    // General page content
    const contentSelectors = [
      '.product-description',
      '.product-info',
      '.product-details',
      '[data-product]',
      '.category-description',
      'article',
      '.page-content',
      'main',
      '.content',
      '.entry-content',
      '#content',
      '.post-content',
      '.page-body',
    ];

    for (const selector of contentSelectors) {
      const els = $(selector);
      if (els.length > 0) {
        els.each((_, el) => {
          const text = $(el).text().trim();
          if (text.length > 30) content += text + '\n\n';
        });
        if (content.length > 200) break;
      }
    }

    // Fallback
    if (content.length < 100) {
      content = $('body').text().trim();
    }

    // Clean whitespace
    content = content
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/gm, '')
      .trim();

    // --- Images ---
    const imageUrls = [];
    if (ogImage) imageUrls.push(ogImage);
    if (product.images) imageUrls.push(...product.images);
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.startsWith('http') && !src.includes('data:') && !src.includes('.svg')) {
        imageUrls.push(src);
      }
    });

    // --- Structured data ---
    const structuredData = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        structuredData.push(JSON.parse($(el).html()));
      } catch {}
    });

    // --- Links ---
    const links = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && (href.includes(DOMAIN) || href.startsWith('/')) && !href.includes('#')) {
        links.push(href.startsWith('/') ? `${SITE_URL}${href}` : href);
      }
    });

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const pageType = detectPageType(url, $, product);

    return {
      url,
      title,
      description,
      content,
      imageUrls: [...new Set(imageUrls)].slice(0, 15),
      links: [...new Set(links)],
      structuredData,
      wordCount,
      product,
      pageType,
      error: null,
    };
  } catch (e) {
    return { url, error: e.message, content: '', wordCount: 0 };
  }
}

function extractProductData($, url) {
  const product = {};

  // Product name
  product.name =
    $('h1').first().text().trim() ||
    $('[class*="product-name"], [class*="product-title"]').first().text().trim() ||
    '';

  // Price — try multiple patterns
  const priceSelectors = ['[class*="price"]', '.woocommerce-Price-amount', '[data-price]'];
  for (const sel of priceSelectors) {
    const priceText = $(sel).first().text().trim();
    const priceMatch = priceText.match(/[₪$€£]\s*[\d,.]+|[\d,.]+\s*[₪$€£]/);
    if (priceMatch) {
      product.price = priceMatch[0];
      break;
    }
  }

  // Sale price
  const saleText = $('[class*="sale"], [class*="discount"], .price del').first().text().trim();
  const saleMatch = saleText.match(/[₪$€£]\s*[\d,.]+|[\d,.]+\s*[₪$€£]/);
  if (saleMatch && saleMatch[0] !== product.price) product.salePrice = saleMatch[0];

  // Description
  product.description = $('[class*="description"], [class*="product-desc"]')
    .text()
    .trim()
    .slice(0, 1000);

  // Images
  product.images = [];
  $('[class*="product-image"] img, [class*="gallery"] img, [class*="slider"] img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && src.startsWith('http')) product.images.push(src);
  });

  // Category from breadcrumb or URL
  const breadcrumb = $('[class*="breadcrumb"]').text().trim();
  if (breadcrumb) product.category = breadcrumb;
  else if (url.includes('/category/')) {
    product.category = decodeURIComponent(url.split('/category/')[1]?.replace(/\/$/, '') || '');
  }

  // Ingredients
  $('*').each((_, el) => {
    const text = $(el).text();
    if (/ingredients|רכיבים/i.test(text) && text.length < 2000 && text.length > 20) {
      const match = text.match(/(?:ingredients|רכיבים)[:\s]*(.*?)(?:\n|$)/si);
      if (match) product.ingredients = match[1].trim().slice(0, 500);
    }
  });

  // Volume/size
  const volMatch = $('body')
    .text()
    .match(/(\d+)\s*(מ"ל|ml|מל|ליטר|גרם|gr|g|oz|fl\.?\s*oz)/i);
  if (volMatch) product.volume = volMatch[0];

  return product;
}

function detectPageType(url, $, product) {
  if (/\/product[s]?\//i.test(url)) return 'product';
  if (/\/categor[y|ies]\//i.test(url)) return 'category';
  if (/\/shop\/?$/i.test(url)) return 'category';
  if (/\/blog\//i.test(url) || /\/post\//i.test(url)) return 'article';
  if (/\/about/i.test(url) || /\/contact/i.test(url)) return 'info';
  if (/\/services?\//i.test(url)) return 'service';
  if (/\/faq/i.test(url)) return 'faq';
  if (url === SITE_URL || url === `${SITE_URL}/`) return 'homepage';
  if (product.name && product.price) return 'product';
  return 'page';
}

// ============================================
// DB save
// ============================================
async function savePageToDB(accountId, page, sessionId) {
  const { error } = await supabase.from('instagram_bio_websites').upsert(
    {
      account_id: accountId,
      url: page.url,
      page_title: page.title,
      page_description: page.description,
      page_content: page.content,
      image_urls: page.imageUrls || [],
      meta_tags: { title: page.title, description: page.description, pageType: page.pageType },
      structured_data: page.structuredData || [],
      extracted_data: page.product || {},
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

  if (error) {
    console.error(`   DB error for ${page.url}: ${error.message}`);
    return false;
  }
  return true;
}

// ============================================
// RAG ingestion
// ============================================
async function ingestToRAG(accountId, page) {
  if (!page.content || page.content.length < 50) return 0;

  // Delete old data for this URL
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('account_id', accountId)
    .eq('entity_type', 'website')
    .eq('source_id', page.url)
    .single();

  if (existing) {
    await supabase.from('document_chunks').delete().eq('document_id', existing.id);
    await supabase.from('documents').delete().eq('id', existing.id);
  }

  // Create document
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      account_id: accountId,
      entity_type: 'website',
      source_id: page.url,
      title: page.title || page.url,
      status: 'active',
      metadata: {
        url: page.url,
        wordCount: page.wordCount,
        pageType: page.pageType,
        images: page.imageUrls?.slice(0, 5),
      },
    })
    .select('id')
    .single();

  if (docErr) {
    console.error(`   RAG doc error: ${docErr.message}`);
    return 0;
  }

  // Chunk content
  const chunks = chunkText(page.content, 600, 100);
  let created = 0;

  // Batch embeddings for efficiency (up to 20 at a time)
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
      metadata: { url: page.url, title: page.title, pageType: page.pageType },
    }));

    const { error } = await supabase.from('document_chunks').insert(rows);
    if (!error) created += rows.length;
  }

  await supabase
    .from('documents')
    .update({ chunk_count: created, total_tokens: Math.ceil(page.content.length / 4) })
    .eq('id', doc.id);

  return created;
}

function chunkText(text, maxChars = 600, overlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + maxChars * 0.5) end = breakPoint + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 30);
}

async function getEmbeddingBatch(texts) {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts.map((t) => t.slice(0, 8000)),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`   Embedding error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch (e) {
    console.error(`   Embedding exception: ${e.message}`);
    return null;
  }
}

// ============================================
// Clean old data
// ============================================
async function cleanOldData(accountId) {
  console.log('   Cleaning old data...');

  const { count: pagesDeleted } = await supabase
    .from('instagram_bio_websites')
    .delete({ count: 'exact' })
    .eq('account_id', accountId);
  console.log(`   Deleted ${pagesDeleted || 0} old pages`);

  const { data: docs } = await supabase
    .from('documents')
    .select('id')
    .eq('account_id', accountId)
    .eq('entity_type', 'website');

  if (docs && docs.length > 0) {
    for (const doc of docs) {
      await supabase.from('document_chunks').delete().eq('document_id', doc.id);
    }
    await supabase
      .from('documents')
      .delete()
      .eq('account_id', accountId)
      .eq('entity_type', 'website');
    console.log(`   Deleted ${docs.length} old RAG documents`);
  }
}

// ============================================
// Helpers
// ============================================
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================
// Main
// ============================================
async function main() {
  console.log(`\n  Deep Website Scraper`);
  console.log(`  ${SITE_URL} (${DOMAIN})`);
  console.log(`  Max pages: ${MAX_PAGES} | Concurrency: ${CONCURRENCY} | RAG: ${!SKIP_RAG}`);
  console.log(`  ================================================\n`);

  // 1. Ensure account exists
  console.log('  Step 1: Account setup');
  const accountId = await ensureAccount();
  console.log('');

  // 2. Clean old data (if requested)
  if (CLEAN_OLD) {
    console.log('  Step 2: Cleaning old data');
    await cleanOldData(accountId);
    console.log('');
  }

  // 3. Discover pages
  console.log('  Step 2: Page discovery');
  const urls = await discoverPages();
  console.log('');

  // 4. Scrape all pages
  console.log(`  Step 3: Scraping ${urls.length} pages`);
  let scraped = 0,
    failed = 0,
    totalWords = 0;
  const pages = [];

  for (let i = 0; i < urls.length; i++) {
    const page = await scrapePage(urls[i]);
    if (page.error) {
      failed++;
    } else {
      scraped++;
      totalWords += page.wordCount;
      pages.push(page);
      const shortUrl = decodeURIComponent(urls[i].replace(SITE_URL, '') || '/');
      console.log(
        `   [${i + 1}/${urls.length}] ${shortUrl} — ${page.wordCount} words, ${page.imageUrls.length} imgs [${page.pageType}]`,
      );
    }
    if (i % 5 === 0 && i > 0) await sleep(DELAY_MS);
  }

  const validPages = pages.filter((p) => p.content.length > 50);
  console.log(`\n  Scraped: ${scraped} OK, ${failed} failed, ${totalWords} total words`);

  const typeCounts = {};
  for (const p of pages) {
    typeCounts[p.pageType] = (typeCounts[p.pageType] || 0) + 1;
  }
  console.log(`  Page types: ${Object.entries(typeCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  console.log('');

  // 5. Save to DB
  console.log(`  Step 4: Saving ${validPages.length} pages to DB`);
  const sessionId = `deep_${DOMAIN.replace(/\./g, '_')}_${Date.now()}`;
  let saved = 0;
  for (const page of validPages) {
    const ok = await savePageToDB(accountId, page, sessionId);
    if (ok) saved++;
  }
  console.log(`  Saved ${saved}/${validPages.length} pages\n`);

  // 6. RAG ingestion
  let totalChunks = 0;
  if (!SKIP_RAG) {
    console.log(`  Step 5: RAG ingestion (${validPages.length} pages)`);
    for (let i = 0; i < validPages.length; i++) {
      const page = validPages[i];
      const shortUrl = decodeURIComponent(page.url.replace(SITE_URL, '') || '/');
      process.stdout.write(`   [${i + 1}/${validPages.length}] ${shortUrl}...`);
      const chunks = await ingestToRAG(accountId, page);
      totalChunks += chunks;
      console.log(` ${chunks} chunks`);
    }
  }

  // Summary
  console.log(`\n  ================================================`);
  console.log(`  Done!`);
  console.log(`  Account ID: ${accountId}`);
  console.log(`  Domain: ${DOMAIN}`);
  console.log(`  Pages scraped: ${scraped}`);
  console.log(`  Pages saved: ${saved}`);
  console.log(`  Total words: ${totalWords}`);
  if (!SKIP_RAG) console.log(`  RAG chunks: ${totalChunks}`);
  console.log(
    `\n  Widget embed code:`,
  );
  console.log(
    `  <script src="https://influencers-bot.vercel.app/widget.js" data-account-id="${accountId}"></script>`,
  );
}

main().catch(console.error);
