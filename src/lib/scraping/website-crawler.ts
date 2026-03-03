/**
 * Website Crawler - סורק אתרים עם Apify Website Content Crawler
 * תומך בסריקה מביו של משפיען (bio_link) וסריקה עצמאית (standalone)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const WEBSITE_CRAWLER_ACTOR = 'apify/website-content-crawler';

// ============================================
// Type Definitions
// ============================================

export interface WebsiteData {
  url: string;
  title: string;
  pages: Array<{
    url: string;
    title: string;
    content: string;
  }>;
}

export interface CrawledPage {
  url: string;
  title: string;
  description: string;
  content: string;
  imageUrls: string[];
  metaTags: Record<string, string>;
  structuredData: any[];
  httpStatus: number;
  contentType: string;
  crawlDepth: number;
  parentUrl: string | null;
  wordCount: number;
}

export interface WebsiteCrawlConfig {
  maxPages: number;
  maxDepth: number;
  crawlerType: 'playwright' | 'cheerio';
}

export interface WebsiteCrawlResult {
  rootUrl: string;
  domain: string;
  pages: CrawledPage[];
  stats: {
    pagesAttempted: number;
    pagesSucceeded: number;
    pagesFailed: number;
    totalWords: number;
    totalImages: number;
    durationMs: number;
  };
  errors: Array<{ url: string; error: string }>;
}

const DEFAULT_CRAWL_CONFIG: WebsiteCrawlConfig = {
  maxPages: 50,
  maxDepth: 3,
  crawlerType: 'playwright',
};

// ============================================
// Apify API Helpers (same pattern as apify-actors.ts)
// ============================================

async function runApifyWebsiteCrawler(
  input: Record<string, unknown>,
): Promise<any> {
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN is not configured');
  }

  const encodedActorId = WEBSITE_CRAWLER_ACTOR.replace('/', '~');
  const url = `https://api.apify.com/v2/acts/${encodedActorId}/runs?token=${APIFY_TOKEN}`;
  const maxRetries = 3;

  console.log(`[Website Crawler] Starting Apify actor: ${WEBSITE_CRAWLER_ACTOR}`);

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        if (response.status === 502 || response.status === 503) {
          throw new Error(`Apify API temporarily unavailable (${response.status})`);
        }
        const errorBody = await response.text();
        console.error('[Website Crawler] Apify error:', errorBody);
        throw new Error(`Apify API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const runId = result.data.id;
      console.log(`[Website Crawler] Run started: ${runId}`);

      return await waitForApifyRun(runId);
    } catch (error: any) {
      if (retry === maxRetries - 1) {
        console.error(`[Website Crawler] Failed after ${maxRetries} retries:`, error.message);
        throw error;
      }
      const retryWait = 3000 * (retry + 1);
      console.warn(`[Website Crawler] Retry ${retry + 1}/${maxRetries} after ${retryWait}ms:`, error.message);
      await new Promise((resolve) => setTimeout(resolve, retryWait));
    }
  }

  throw new Error('Failed to start website crawler after retries');
}

async function waitForApifyRun(runId: string, maxWaitTime: number = 10 * 60 * 1000): Promise<any> {
  const pollInterval = 5000;
  const startTime = Date.now();
  const maxRetries = 3;

  console.log(`[Website Crawler] Waiting for run: ${runId} (max ${maxWaitTime / 1000}s)`);

  while (Date.now() - startTime < maxWaitTime) {
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const response = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
          { signal: AbortSignal.timeout(15000) }
        );

        if (!response.ok) {
          if (response.status === 502 || response.status === 503) {
            throw new Error(`Apify API temporarily unavailable (${response.status})`);
          }
          throw new Error(`Failed to check run status: ${response.status}`);
        }

        const result = await response.json();
        const run = result.data;
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        console.log(`[Website Crawler] Status: ${run.status} (${elapsed}s elapsed)`);

        if (run.status === 'SUCCEEDED') {
          console.log(`[Website Crawler] Completed in ${elapsed}s`);
          return run;
        }

        if (run.status === 'FAILED' || run.status === 'ABORTED') {
          throw new Error(`Apify run ${run.status}`);
        }

        break; // Success polling - exit retry loop
      } catch (error: any) {
        if (retry === maxRetries - 1) throw error;
        const retryWait = 2000 * (retry + 1);
        console.warn(`[Website Crawler] Poll retry ${retry + 1}:`, error.message);
        await new Promise((resolve) => setTimeout(resolve, retryWait));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Website crawler timeout after ${maxWaitTime / 1000}s`);
}

async function getApifyDatasetItems<T>(datasetId: string): Promise<T[]> {
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`;
  const maxRetries = 3;

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        if (response.status === 502 || response.status === 503) {
          throw new Error(`Apify API temporarily unavailable (${response.status})`);
        }
        throw new Error(`Failed to get dataset: ${response.status}`);
      }

      return response.json();
    } catch (error: any) {
      if (retry === maxRetries - 1) throw error;
      const retryWait = 2000 * (retry + 1);
      console.warn(`[Website Crawler] Dataset retry ${retry + 1}:`, error.message);
      await new Promise((resolve) => setTimeout(resolve, retryWait));
    }
  }

  throw new Error('Failed to get dataset after retries');
}

// ============================================
// Main Crawl Function
// ============================================

/**
 * סריקת אתר מלאה דרך Apify Website Content Crawler
 * תומך באתרים דינמיים (SPA, React) דרך Playwright
 */
export async function crawlWebsiteFull(
  rootUrl: string,
  config: Partial<WebsiteCrawlConfig> = {},
): Promise<WebsiteCrawlResult> {
  const fullConfig = { ...DEFAULT_CRAWL_CONFIG, ...config };
  const startTime = Date.now();
  const domain = new URL(rootUrl).hostname;

  console.log(`[Website Crawler] Starting full crawl of ${rootUrl} (max ${fullConfig.maxPages} pages)`);

  const run = await runApifyWebsiteCrawler({
    startUrls: [{ url: rootUrl }],
    maxCrawlPages: fullConfig.maxPages,
    maxCrawlDepth: fullConfig.maxDepth,
    crawlerType: fullConfig.crawlerType,
    // Stay on the same domain
    globs: [{ glob: `https://${domain}/**` }, { glob: `http://${domain}/**` }],
    // Extract all useful content
    htmlTransformer: 'readableText',
    removeElementsCssSelector: 'nav, footer, header, .cookie-banner, .popup, #cookie-consent',
    // Save screenshots = false (we only need content)
    saveScreenshots: false,
    saveHtml: false,
    saveMarkdown: true,
  });

  const items = await getApifyDatasetItems<any>(run.defaultDatasetId);

  console.log(`[Website Crawler] Got ${items.length} pages from Apify`);

  const pages: CrawledPage[] = [];
  const errors: Array<{ url: string; error: string }> = [];
  let totalWords = 0;
  let totalImages = 0;

  for (const item of items) {
    try {
      const content = item.text || item.markdown || '';
      const imageUrls = extractImageUrls(item);
      const wordCount = content.split(/\s+/).filter(Boolean).length;

      pages.push({
        url: item.url || '',
        title: item.metadata?.title || item.title || '',
        description: item.metadata?.description || '',
        content,
        imageUrls,
        metaTags: item.metadata || {},
        structuredData: item.jsonLd || [],
        httpStatus: item.httpStatusCode || 200,
        contentType: 'text/html',
        crawlDepth: item.depth || 0,
        parentUrl: item.referrerUrl || null,
        wordCount,
      });

      totalWords += wordCount;
      totalImages += imageUrls.length;
    } catch (error: any) {
      errors.push({ url: item.url || 'unknown', error: error.message });
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Website Crawler] Crawl complete: ${pages.length} pages, ${totalWords} words, ${totalImages} images in ${durationMs}ms`);

  return {
    rootUrl,
    domain,
    pages,
    stats: {
      pagesAttempted: items.length,
      pagesSucceeded: pages.length,
      pagesFailed: errors.length,
      totalWords,
      totalImages,
      durationMs,
    },
    errors,
  };
}

/**
 * חילוץ URLs של תמונות מתוצאת Apify
 */
function extractImageUrls(item: any): string[] {
  const urls: string[] = [];

  // From metadata og:image
  if (item.metadata?.ogImage) {
    urls.push(item.metadata.ogImage);
  }

  // From structured data
  if (item.jsonLd) {
    for (const ld of Array.isArray(item.jsonLd) ? item.jsonLd : [item.jsonLd]) {
      if (ld.image) {
        const images = Array.isArray(ld.image) ? ld.image : [ld.image];
        for (const img of images) {
          if (typeof img === 'string') urls.push(img);
          else if (img.url) urls.push(img.url);
        }
      }
    }
  }

  // From screenshotUrl if available
  if (item.screenshotUrl) {
    urls.push(item.screenshotUrl);
  }

  return [...new Set(urls)];
}

// ============================================
// Legacy API (backward-compatible with existing imports)
// ============================================

/**
 * חילוץ URLs מביו
 */
export function extractUrlsFromBio(bio: string, bioLinks?: string[] | null): string[] {
  const urls: string[] = [];

  if (bioLinks && Array.isArray(bioLinks)) {
    urls.push(...bioLinks);
  }

  if (bio) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = bio.match(urlRegex);
    if (matches) {
      urls.push(...matches);
    }
  }

  return [...new Set(urls)];
}

/**
 * סריקת אתר — backward-compatible wrapper
 * משמש את newScanOrchestrator לסריקת bio links
 */
export async function crawlWebsite(url: string, maxPages: number): Promise<WebsiteData> {
  console.log(`[Website Crawler] Crawling ${url} (max ${maxPages} pages)`);

  try {
    const result = await crawlWebsiteFull(url, { maxPages, maxDepth: 2 });

    return {
      url: result.rootUrl,
      title: result.pages[0]?.title || 'Untitled',
      pages: result.pages.map((p) => ({
        url: p.url,
        title: p.title,
        content: p.content,
      })),
    };
  } catch (error: any) {
    console.error(`[Website Crawler] Crawl failed for ${url}:`, error.message);
    // Fallback to basic fetch if Apify fails
    return crawlWebsiteBasic(url);
  }
}

/**
 * Fallback basic crawl (fetch + parse HTML) for when Apify is unavailable
 */
async function crawlWebsiteBasic(url: string): Promise<WebsiteData> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InfluencerBot/1.0)' },
    });

    if (!response.ok) {
      return { url, title: 'Unreachable', pages: [] };
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    // Basic text extraction: strip HTML tags
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000);

    return {
      url,
      title,
      pages: [{ url, title, content: textContent }],
    };
  } catch (error: any) {
    console.error(`[Website Crawler] Basic crawl failed for ${url}:`, error.message);
    return { url, title: 'Error', pages: [] };
  }
}

/**
 * שמירת נתוני אתר ל-Supabase
 */
export async function saveWebsiteData(
  supabase: SupabaseClient | string,
  accountId: string,
  websiteData: WebsiteData,
  sessionId?: string,
): Promise<boolean> {
  console.log(`[Website Crawler] Saving ${websiteData.pages.length} pages for account ${accountId}`);

  try {
    // Get supabase client
    let client: SupabaseClient;
    if (typeof supabase === 'string') {
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
      client = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
    } else {
      client = supabase;
    }

    for (const page of websiteData.pages) {
      const { error } = await client.from('instagram_bio_websites').upsert(
        {
          account_id: accountId,
          url: page.url,
          page_title: page.title,
          page_content: page.content,
          parent_url: page.url === websiteData.url ? null : websiteData.url,
          crawl_depth: page.url === websiteData.url ? 0 : 1,
          processing_status: 'completed',
          source_type: 'bio_link',
          scraped_at: new Date().toISOString(),
          crawl_session_id: sessionId,
        },
        { onConflict: 'account_id,url' },
      );

      if (error) {
        console.error(`[Website Crawler] Error saving page ${page.url}:`, error.message);
      }
    }

    return true;
  } catch (error: any) {
    console.error(`[Website Crawler] Save failed:`, error.message);
    return false;
  }
}

/**
 * שמירת תוצאות סריקה מלאה (standalone) ל-Supabase
 */
export async function saveFullCrawlResults(
  accountId: string,
  crawlResult: WebsiteCrawlResult,
  sessionId: string,
): Promise<{ saved: number; failed: number }> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let saved = 0;
  let failed = 0;

  for (const page of crawlResult.pages) {
    const { error } = await supabase.from('instagram_bio_websites').upsert(
      {
        account_id: accountId,
        url: page.url,
        page_title: page.title,
        page_description: page.description,
        page_content: page.content,
        image_urls: page.imageUrls,
        meta_tags: page.metaTags,
        structured_data: page.structuredData,
        extracted_data: {},
        parent_url: page.parentUrl,
        crawl_depth: page.crawlDepth,
        http_status: page.httpStatus,
        content_type: page.contentType,
        processing_status: 'completed',
        source_type: 'standalone',
        scraped_at: new Date().toISOString(),
        crawl_session_id: sessionId,
      },
      { onConflict: 'account_id,url' },
    );

    if (error) {
      console.error(`[Website Crawler] Error saving ${page.url}:`, error.message);
      failed++;
    } else {
      saved++;
    }
  }

  console.log(`[Website Crawler] Saved ${saved}/${crawlResult.pages.length} pages (${failed} failed)`);
  return { saved, failed };
}
