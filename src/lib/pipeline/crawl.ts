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
 * Fetch + parse a batch of page URLs and persist each to `instagram_bio_websites`
 * (the same table `scripts/deep-scrape-website.mjs` writes to). Pure per-batch:
 * no crawl loop, no frontier mutation — the site-crawl step owns BFS/re-enqueue.
 * Returns the number of pages saved and every same-host link discovered (raw,
 * absolute) so the caller can extend the frontier when the sitemap was empty.
 */
export async function crawlPageBatch(
  urls: string[],
  accountId: string
): Promise<{ savedPages: number; discoveredLinks: string[] }> {
  const supabase = await createClient();
  let savedPages = 0;
  const links: string[] = [];

  for (const url of urls) {
    try {
      const origin = new URL(url).origin;
      const host = new URL(url).host;

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

      const html = await res.text();
      const $ = cheerio.load(html);

      // Remove noise before extraction.
      $('script, style, noscript, iframe, svg').remove();
      $('.cookie-banner, .popup, #cookie-consent, .cookie-notice').remove();
      $('nav, footer, header').remove();

      // Metadata
      const title = $('title').text().trim() || $('h1').first().text().trim() || '';
      const description =
        $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        '';
      const ogImage = $('meta[property="og:image"]').attr('content') || '';

      // Product data
      const product = extractProductData($, url);

      // Main content — prefer product fields then rich content selectors, else body.
      let content = '';
      if (product.name) {
        content += `שם מוצר: ${product.name}\n`;
        if (product.price) content += `מחיר: ${product.price}\n`;
        if (product.salePrice) content += `מחיר מבצע: ${product.salePrice}\n`;
        if (product.category) content += `קטגוריה: ${product.category}\n`;
        if (product.description) content += `תיאור: ${product.description}\n`;
        if (product.ingredients) content += `רכיבים: ${product.ingredients}\n`;
        if (product.volume) content += `נפח: ${product.volume}\n`;
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
      if (content.length < 100) content = $('body').text().trim();
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

      // Structured data
      const structuredData: unknown[] = [];
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          structuredData.push(JSON.parse($(el).html() || ''));
        } catch {
          /* skip malformed */
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
      if (!error) savedPages++;
    } catch {
      /* skip page */
    }
  }

  return { savedPages, discoveredLinks: [...new Set(links)] };
}
