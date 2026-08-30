import * as cheerio from 'cheerio';
import { createClient } from '@/lib/supabase/server';

// Ported from scripts/deep-scrape-website.mjs (extractProductData) — keep persistence
// column shape identical to that script's savePageToDB (instagram_bio_websites).
type ProductData = {
  name?: string;
  price?: string;
  salePrice?: string;
  description?: string;
  images?: string[];
  category?: string;
  ingredients?: string;
  volume?: string;
};

function extractProductData($: cheerio.CheerioAPI, url: string): ProductData {
  const product: ProductData = {};

  product.name =
    $('h1').first().text().trim() ||
    $('[class*="product-name"], [class*="product-title"]').first().text().trim() ||
    '';

  const priceSelectors = ['[class*="price"]', '.woocommerce-Price-amount', '[data-price]'];
  for (const sel of priceSelectors) {
    const priceText = $(sel).first().text().trim();
    const priceMatch = priceText.match(/[₪$€£]\s*[\d,.]+|[\d,.]+\s*[₪$€£]/);
    if (priceMatch) {
      product.price = priceMatch[0];
      break;
    }
  }

  const saleText = $('[class*="sale"], [class*="discount"], .price del').first().text().trim();
  const saleMatch = saleText.match(/[₪$€£]\s*[\d,.]+|[\d,.]+\s*[₪$€£]/);
  if (saleMatch && saleMatch[0] !== product.price) product.salePrice = saleMatch[0];

  product.description = $('[class*="description"], [class*="product-desc"]')
    .text()
    .trim()
    .slice(0, 1000);

  product.images = [];
  $('[class*="product-image"] img, [class*="gallery"] img, [class*="slider"] img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && src.startsWith('http')) product.images!.push(src);
  });

  const breadcrumb = $('[class*="breadcrumb"]').text().trim();
  if (breadcrumb) product.category = breadcrumb;
  else if (url.includes('/category/')) {
    product.category = decodeURIComponent(url.split('/category/')[1]?.replace(/\/$/, '') || '');
  }

  $('*').each((_, el) => {
    const text = $(el).text();
    if (/ingredients|רכיבים/i.test(text) && text.length < 2000 && text.length > 20) {
      const match = text.match(/(?:ingredients|רכיבים)[:\s]*(.*?)(?:\n|$)/i);
      if (match) product.ingredients = match[1].trim().slice(0, 500);
    }
  });

  const volMatch = $('body')
    .text()
    .match(/(\d+)\s*(מ"ל|ml|מל|ליטר|גרם|gr|g|oz|fl\.?\s*oz)/i);
  if (volMatch) product.volume = volMatch[0];

  return product;
}

function detectPageType($: cheerio.CheerioAPI, url: string, product: ProductData): string {
  if (/\/product[s]?\//i.test(url)) return 'product';
  if (/\/categor(?:y|ies)\//i.test(url)) return 'category';
  if (/\/shop\/?$/i.test(url)) return 'category';
  if (/\/blog\//i.test(url) || /\/post\//i.test(url)) return 'article';
  if (/\/about/i.test(url) || /\/contact/i.test(url)) return 'info';
  if (/\/services?\//i.test(url)) return 'service';
  if (/\/faq/i.test(url)) return 'faq';
  if (product.name && product.price) return 'product';
  return 'page';
}

/**
 * Metadata a transport may already hold that the HTML itself no longer carries.
 *
 * Apify's crawler hands back a page whose `<head>` has been rewritten, so its
 * title, description, JSON-LD and og:image arrive alongside the HTML rather than
 * inside it. Passing them here keeps ONE extraction path for both transports
 * instead of letting a protected site and an unprotected one drift apart.
 */
export interface PageFallbacks {
  title?: string;
  description?: string;
  ogImage?: string;
  structuredData?: unknown[];
  /**
   * Account language. Product fields are prefixed with labels that end up inside
   * `page_content`, so they reach RAG and get rendered in content cards — an
   * English account's crawled pages were showing "שם מוצר:" in their excerpts.
   */
  language?: 'he' | 'en';
}

const PRODUCT_LABELS = {
  he: { name: 'שם מוצר', price: 'מחיר', sale: 'מחיר מבצע', category: 'קטגוריה', desc: 'תיאור', ingredients: 'רכיבים', volume: 'נפח' },
  en: { name: 'Product', price: 'Price', sale: 'Sale price', category: 'Category', desc: 'Description', ingredients: 'Ingredients', volume: 'Size' },
};

/**
 * Parse one page's HTML and persist it to `instagram_bio_websites` (the same table
 * `scripts/deep-scrape-website.mjs` writes to).
 *
 * Split out of `crawlPageBatch` so the Apify transport persists pages through
 * exactly the same product detection, structured-data collection, image gathering
 * and page-type classification as a plain fetch. Returns the same-host links found
 * on the page, for BFS.
 */
export async function persistPageHtml(
  url: string,
  html: string,
  accountId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  fallbacks?: PageFallbacks,
): Promise<{ saved: boolean; discoveredLinks: string[] }> {
  const links: string[] = [];
  try {
    const origin = new URL(url).origin;
    const host = new URL(url).host;
    const $ = cheerio.load(html);

    // Structured data — MUST be collected before the <script> strip below, otherwise
    // cheerio has already detached the ld+json nodes and every page saves an empty array.
    const structuredData: unknown[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        structuredData.push(JSON.parse($(el).html() || ''));
      } catch {
        /* skip malformed */
      }
    });
    // A transport whose HTML no longer carries ld+json supplies it separately.
    if (structuredData.length === 0 && fallbacks?.structuredData?.length) {
      structuredData.push(...fallbacks.structuredData);
    }

    // Remove noise before extraction.
    $('script, style, noscript, iframe, svg').remove();
    $('.cookie-banner, .popup, #cookie-consent, .cookie-notice').remove();
    $('nav, footer, header').remove();

    // Give element boundaries real whitespace before anything calls .text().
    //
    // Cheerio concatenates adjacent elements with NOTHING between them, so a
    // card layout — <span>Aug 26</span><h3>BISC-South in New Orleans</h3> —
    // flattens to "Aug 26BISC-South in New Orleans". ABA's events page produced
    // seven of those, and the assistant read one as a single string and told a
    // member the event was on a different day than it is. A wrong event date
    // from an association is worse than no date at all.
    //
    // Whitespace here can only separate, never join, so this cannot corrupt
    // text that was already correct; the normaliser below collapses any runs.
    $('br').replaceWith(' ');
    $('p,div,li,tr,td,th,h1,h2,h3,h4,h5,h6,section,article,aside,header,footer,span,time,a,label,figcaption,dt,dd').after(' ');

    // Metadata
    const title =
    $('title').text().trim() || $('h1').first().text().trim() || fallbacks?.title?.trim() || '';
    const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    fallbacks?.description ||
    '';
    const ogImage = $('meta[property="og:image"]').attr('content') || fallbacks?.ogImage || '';

    // Product data
    const product = extractProductData($, url);

    // Main content — prefer product fields then rich content selectors, else body.
    let content = '';
    if (product.name) {
      const L = fallbacks?.language === 'en' ? PRODUCT_LABELS.en : PRODUCT_LABELS.he;
      content += `${L.name}: ${product.name}\n`;
      if (product.price) content += `${L.price}: ${product.price}\n`;
      if (product.salePrice) content += `${L.sale}: ${product.salePrice}\n`;
      if (product.category) content += `${L.category}: ${product.category}\n`;
      if (product.description) content += `${L.desc}: ${product.description}\n`;
      if (product.ingredients) content += `${L.ingredients}: ${product.ingredients}\n`;
      if (product.volume) content += `${L.volume}: ${product.volume}\n`;
      content += '\n';
    }
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
    // Take the RICHEST candidate, not the first one over a threshold.
    //
    // This loop used to stop at the first selector yielding more than 200
    // characters. On buses.org/membership/join/ that is `article` — four small
    // blocks, 1,930 characters, no prices — so it broke before ever reaching
    // `main`, which holds 9,570 characters INCLUDING the twelve dues figures
    // ($1,060 … $21,050). ABA asked the assistant what membership costs and were
    // told the information was not available, from a page we had crawled and then
    // discarded four fifths of.
    //
    // Every candidate is measured and the longest wins, with the stripped body as
    // the final candidate rather than a sub-100-character rescue.
    let best = '';
    for (const selector of contentSelectors) {
      const els = $(selector);
      if (els.length === 0) continue;
      let candidate = '';
      els.each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 30) candidate += text + '\n\n';
      });
      if (candidate.length > best.length) best = candidate;
    }
    const bodyText = $('body').text().trim();
    if (bodyText.length > best.length) best = bodyText;
    content += best;
    content = content
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/gm, '')
      .trim();

    // Images
    const imageUrls: string[] = [];
    if (ogImage) imageUrls.push(ogImage);
    if (product.images) imageUrls.push(...product.images);
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.startsWith('http') && !src.includes('data:') && !src.includes('.svg')) {
        imageUrls.push(src);
      }
    });

    // Same-host discovered links (absolute) for BFS fallback.
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.includes('#')) return;
      let abs: string;
      try {
        abs = href.startsWith('/') ? `${origin}${href}` : href;
        if (new URL(abs).host !== host) return;
      } catch {
        return;
      }
      links.push(abs);
    });

    const pageType = detectPageType($, url, product);

    const { error } = await supabase.from('instagram_bio_websites').upsert(
    {
      account_id: accountId,
      url,
      page_title: title,
      page_description: description,
      page_content: content,
      image_urls: [...new Set(imageUrls)].slice(0, 15),
      meta_tags: { title, description, pageType },
      structured_data: structuredData,
      extracted_data: product,
      parent_url: null,
      crawl_depth: 0,
      http_status: 200,
      content_type: 'text/html',
      processing_status: 'completed',
      source_type: 'standalone',
      scraped_at: new Date().toISOString(),
    },
    { onConflict: 'account_id,url' }
    );
    return { saved: !error, discoveredLinks: [...new Set(links)] };
  } catch {
    return { saved: false, discoveredLinks: [] };
  }
}

/**
 * Fetch + parse a batch of page URLs over plain HTTP and persist each.
 *
 * Pure per-batch: no crawl loop, no frontier mutation — the site-crawl step owns
 * BFS/re-enqueue. Returns the number of pages saved and every same-host link
 * discovered (raw, absolute) so the caller can extend the frontier when the
 * sitemap was empty.
 *
 * Sites behind a bot challenge never reach this function: site-discover detects
 * them and routes the crawl through the Apify transport instead.
 */
export async function crawlPageBatch(
  urls: string[],
  accountId: string,
  language?: 'he' | 'en',
): Promise<{ savedPages: number; discoveredLinks: string[] }> {
  const supabase = await createClient();
  let savedPages = 0;
  const links: string[] = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          // Realistic browser UA — bot-marker UAs get 403'd by Akamai/Cloudflare
          // protected sites (e.g. lenovo.com), silently zeroing the crawl.
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;

      const { saved, discoveredLinks } = await persistPageHtml(
        url,
        await res.text(),
        accountId,
        supabase,
        { language },
      );
      if (saved) savedPages++;
      links.push(...discoveredLinks);
    } catch {
      /* skip page */
    }
  }

  return { savedPages, discoveredLinks: [...new Set(links)] };
}
