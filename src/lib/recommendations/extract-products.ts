/**
 * AI-powered product extraction from scraped e-commerce pages.
 * Parses raw page content into structured widget_products records.
 */

import { createClient } from '@/lib/supabase/server';
import { getVertical, type VerticalId } from '@/lib/catalog/verticals';

// Use dynamic import for Gemini to avoid build issues
async function getGeminiModel() {
  const { getGeminiClient, MODELS } = await import('@/lib/ai/google-client');
  const client = getGeminiClient();
  return { client, model: MODELS.CHAT_FAST };
}

// ============================================
// Types
// ============================================

export interface ExtractedProduct {
  name: string;
  nameHe?: string;
  description?: string;
  price?: number;
  originalPrice?: number;
  category?: string;
  subcategory?: string;
  productLine?: string;
  volume?: string;
  volumeMl?: number;
  ingredients?: string[];
  keyIngredients?: string[];
  benefits?: string[];
  targetAudience?: string[];
  isAvailable: boolean;
  isOnSale: boolean;
  imageUrl?: string;
  productUrl: string;
}

export interface ExtractionResult {
  accountId: string;
  totalPages: number;
  productsExtracted: number;
  seriesDetected: number;
  errors: string[];
  durationMs: number;
}

// ============================================
// Product Extraction from Single Page
// ============================================

/**
 * Assemble the extraction prompt for a market.
 *
 * Everything true of every e-commerce page (price splitting, catalog-page guard, stock
 * wording, JSON envelope) lives here once; everything market-specific — the category enum,
 * the subcategory vocabulary, which attributes matter — comes from the vertical registry.
 * Supporting a new market is therefore a registry entry, never a prompt edit.
 *
 * @see src/lib/catalog/verticals.ts
 */
export function buildExtractionPrompt(verticalId?: VerticalId | string | null): string {
  const v = getVertical(verticalId);
  const categories = Object.keys(v.categories).join(', ');
  const categoryGlossary = Object.entries(v.categories)
    .map(([key, label]) => `   ${key} = ${label.he}`)
    .join('\n');

  const volumeRule = v.attributes.volume
    ? 'חלץ נפח / משקל (מ"ל, ליטר, גרם, ק"ג) ל-volume, והמר ל-volumeMl (מספר) כשמדובר בנוזל.'
    : 'volume ו-volumeMl אינם רלוונטיים בתחום הזה — החזר null בשניהם.';
  const ingredientsRule = v.attributes.ingredients
    ? 'ingredients: רשימת הרכיבים המלאה מהתווית, אם מופיעה בדף.'
    : 'ingredients: החזר [] — בתחום הזה אין רשימת רכיבים.';

  return `אתה מומחה לחילוץ נתוני מוצרים מאתרי איקומרס ישראליים.
תחום האתר: ${v.label.he}.
נתח את תוכן הדף הבא וחלץ מידע על המוצר.

אם מופיע בדף בלוק "נתונים מובנים (schema.org)" — הוא מגיע ישירות מהאתר והוא מקור האמת.
העדף אותו על פני ניחוש מהטקסט החופשי, במיוחד לשם, מחיר, מותג ושיוך הקטגוריה.
"נתיב קטגוריות באתר" הוא ההיררכיה שהאתר עצמו מגדיר — גזור ממנו את category ו-subcategory.

חוקים:
1. חלץ את המחיר מהטקסט (חפש ₪ ואז מספר). אם יש מחיר מבצע ומחיר מקורי — הפרד ביניהם.
2. ${volumeRule}
3. category: בחר בדיוק ערך אחד מתוך: ${categories}
${categoryGlossary}
4. subcategory: ערך אחד שמתאר את סוג הפריט. אוצר המילים המקובל בתחום:
   ${v.subcategories.join(', ')}
   אם שום ערך לא מתאים — other
5. productLine: הסדרה / הקולקציה / קו המוצר, אם קיים.
6. ${ingredientsRule}
7. keyIngredients / benefits / targetAudience: רשימות קצרות בעברית. אם לא ידוע — [].
8. אם הדף הוא עמוד רשימת מוצרים (קטלוג) ולא מוצר בודד — החזר isProductPage: false
9. isAvailable: false אם כתוב "אזל", "SOLD OUT", "לא במלאי"
10. isOnSale: true אם יש מחיר מקורי וגם מחיר מבצע
11. אל תמציא ערכים. שדה שאין לו בסיס בדף — null (או [] לרשימה).

כללים ייחודיים לתחום ${v.label.he}:
${v.extractionRules}

החזר JSON בלבד (ללא markdown):
{
  "isProductPage": true/false,
  "name": "שם המוצר",
  "description": "תיאור קצר",
  "price": 45.90,
  "originalPrice": null,
  "category": "${Object.keys(v.categories)[0]}",
  "subcategory": "${v.subcategories[0]}",
  "productLine": null,
  "volume": null,
  "volumeMl": null,
  "ingredients": [],
  "keyIngredients": [],
  "benefits": [],
  "targetAudience": [],
  "isAvailable": true,
  "isOnSale": false
}`;
}

/**
 * Flatten schema.org JSON-LD into a compact Hebrew-labelled block for the extractor prompt.
 *
 * Most e-commerce platforms (Magento, Shopify, WooCommerce) emit a complete `Product` node
 * plus a `BreadcrumbList` spelling out the site's own category hierarchy. That is strictly
 * better ground truth than the page's free text — especially for SPA storefronts whose
 * server-rendered text is mostly navigation chrome.
 *
 * Returns '' when the page has no Product/BreadcrumbList, so the caller can omit the block.
 */
function schemaNodes(structuredData: unknown): any[] {
  const nodes: any[] = [];
  const visit = (node: unknown, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 4) return;
    if (Array.isArray(node)) {
      node.forEach(n => visit(n, depth + 1));
      return;
    }
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) (obj['@graph'] as unknown[]).forEach(n => visit(n, depth + 1));
    if (obj['@type']) nodes.push(obj);
  };
  visit(structuredData);
  return nodes;
}

// Magento writes the literal string "null" for unset attributes.
const cleanSchemaValue = (v: unknown): string => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  return s === 'null' || s === 'undefined' ? '' : s;
};

const schemaType = (n: any): string => (Array.isArray(n?.['@type']) ? n['@type'][0] : n?.['@type']) || '';

/**
 * The Product node's primary image. Preferred over `image_urls[0]`, which is whichever
 * <img> the crawler saw first — on SPA storefronts with no og:image that is typically a
 * navigation logo, not the product.
 */
export function structuredProductImage(structuredData: unknown): string | null {
  const product = schemaNodes(structuredData).find(n => schemaType(n) === 'Product');
  if (!product) return null;
  const raw = Array.isArray(product.image) ? product.image[0] : product.image;
  const url = cleanSchemaValue(typeof raw === 'object' && raw ? (raw as any).url : raw);
  return url.startsWith('http') ? url : null;
}

export function summarizeStructuredData(structuredData: unknown): string {
  const nodes = schemaNodes(structuredData);
  const clean = cleanSchemaValue;
  const typeOf = schemaType;

  const lines: string[] = [];

  const product = nodes.find(n => typeOf(n) === 'Product');
  if (product) {
    const push = (label: string, value: unknown) => {
      const v = clean(value);
      if (v) lines.push(`${label}: ${v}`);
    };
    push('שם המוצר', product.name);
    push('תיאור', product.description);
    push('מותג', product.brand?.name ?? product.brand);
    push('מק"ט', product.sku);
    push('צבע', product.color);
    push('חומר', product.material);

    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    if (offer && typeof offer === 'object') {
      push('מחיר', (offer as any).price);
      push('מטבע', (offer as any).priceCurrency);
      push('זמינות', (offer as any).availability);
    }
    const image = Array.isArray(product.image) ? product.image[0] : product.image;
    push('תמונה', image);
  }

  const crumbs = nodes.find(n => typeOf(n) === 'BreadcrumbList');
  if (crumbs && Array.isArray(crumbs.itemListElement)) {
    const trail = crumbs.itemListElement
      .map((el: any) => clean(el?.item?.name ?? el?.name))
      // The home crumb carries no category signal and misleads the model.
      .filter((name: string) => name && !/^(דף הבית|home|בית)$/i.test(name));
    if (trail.length) lines.push(`נתיב קטגוריות באתר: ${trail.join(' > ')}`);
  }

  return lines.length ? lines.join('\n') : '';
}

export async function extractProductFromPage(page: {
  url: string;
  page_title: string;
  page_content: string;
  extracted_data?: any;
  structured_data?: unknown;
  image_urls?: string[];
}, verticalId?: VerticalId | string | null): Promise<ExtractedProduct | null> {
  try {
    const { client, model } = await getGeminiModel();

    const schema = summarizeStructuredData(page.structured_data);
    const pageContext = `
כותרת: ${page.page_title || ''}
URL: ${page.url}
${schema ? `\nנתונים מובנים (schema.org) — מקור אמת מהאתר:\n${schema}\n` : ''}
תוכן:
${(page.page_content || '').substring(0, 3000)}
`;

    const response = await client.models.generateContent({
      model,
      contents: pageContext,
      config: {
        systemInstruction: buildExtractionPrompt(verticalId),
        temperature: 0.1,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const text = response.text || '';
    // Parse JSON from response (handle markdown fences)
    let jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    let data: any;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      // Fix unescaped Hebrew abbreviation quotes (מ"ל, ק"ג, ס"מ)
      jsonStr = jsonStr.replace(/([\u0590-\u05FF])"([\u0590-\u05FF])/g, '$1\u05F4$2');
      data = JSON.parse(jsonStr);
    }

    // Skip catalog/listing pages
    if (data.isProductPage === false) return null;

    // Skip if no name extracted
    if (!data.name || data.name === 'כל המוצרים') return null;

    // Pick best image — the schema.org Product image first (image_urls[0] is whichever
    // <img> came first in the DOM, which on og:image-less SPA pages is often a nav logo).
    const imageUrl =
      structuredProductImage(page.structured_data) ||
      (Array.isArray(page.image_urls) && page.image_urls.length > 0 ? page.image_urls[0] : null) ||
      page.extracted_data?.images?.[0] ||
      null;

    return {
      name: data.name,
      nameHe: data.name, // Already Hebrew for Israeli sites
      description: data.description || null,
      price: data.price ? parseFloat(data.price) : null,
      originalPrice: data.originalPrice ? parseFloat(data.originalPrice) : null,
      category: data.category || 'other',
      subcategory: data.subcategory || 'other',
      productLine: data.productLine || null,
      volume: data.volume || null,
      volumeMl: data.volumeMl ? parseInt(data.volumeMl) : null,
      ingredients: data.ingredients || [],
      keyIngredients: data.keyIngredients || [],
      benefits: data.benefits || [],
      targetAudience: data.targetAudience || [],
      isAvailable: data.isAvailable !== false,
      isOnSale: data.isOnSale === true,
      imageUrl,
      productUrl: page.url,
    } as ExtractedProduct;
  } catch (err: any) {
    console.error(`[ExtractProducts] Failed to extract from ${page.url}:`, err.message);
    return null;
  }
}

// ============================================
// Batch Extract All Products for an Account
// ============================================

export async function extractAllProducts(
  accountId: string,
  options?: { maxPages?: number; vertical?: VerticalId | string | null }
): Promise<ExtractionResult> {
  const start = Date.now();
  const errors: string[] = [];
  const supabase = await createClient();

  // Which market's taxonomy to extract against. Explicit option wins (the scan that is
  // running now knows best); otherwise fall back to what the account was last scanned as.
  let vertical = options?.vertical;
  if (!vertical) {
    const { data: account } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', accountId)
      .single();
    vertical = (account?.config as any)?.product_vertical || null;
  }
  const resolved = getVertical(vertical);

  console.log(`[ExtractProducts] Starting extraction for account ${accountId} (vertical: ${resolved.id})`);

  // 1. Fetch all scraped product pages
  const { data: pages, error } = await supabase
    .from('instagram_bio_websites')
    .select('id, url, page_title, page_content, extracted_data, structured_data, image_urls')
    .eq('account_id', accountId)
    .eq('processing_status', 'completed');

  if (error || !pages) {
    return { accountId, totalPages: 0, productsExtracted: 0, seriesDetected: 0, errors: [error?.message || 'No pages found'], durationMs: Date.now() - start };
  }

  // Product pages, in order of signal strength:
  //  1. schema.org/Product in the page's JSON-LD — the platform declaring it itself. The
  //     strongest signal, and the only one that survives SPA storefronts whose prices are
  //     rendered client-side and therefore never reach extracted_data.
  //  2. the crawl extracted a price into extracted_data.price (site-agnostic — Carolina
  //     Lemke uses root-level SKU slugs like /cl3606-01 with no "/product" in the URL).
  //  3. the URL looks like a product page (backward-compat for QuickShop /product/ sites).
  let productPages = pages.filter((p: any) => {
    const hasProductSchema = /"@type"\s*:\s*(\[\s*)?"Product"/.test(
      JSON.stringify(p.structured_data ?? '')
    );
    const price = p.extracted_data?.price;
    const hasPrice = price != null && String(price).trim() !== '';
    const urlMatch =
      p.url?.includes('/product') &&
      !p.url?.endsWith('/products') &&
      !p.url?.includes('/category');
    return hasProductSchema || hasPrice || urlMatch;
  });

  // Optional cap (serverless time budget): large catalogs (Carolina ~1,444) would
  // exceed maxDuration if every page went through Gemini extraction. Log the cap —
  // never silently truncate.
  if (options?.maxPages && productPages.length > options.maxPages) {
    console.log(`[ExtractProducts] Capping ${productPages.length} product pages to ${options.maxPages} (time budget)`);
    productPages = productPages.slice(0, options.maxPages);
  }

  console.log(`[ExtractProducts] Found ${productPages.length} product pages out of ${pages.length} total`);

  // 2. Clear existing products for this account (fresh extraction)
  await supabase.from('widget_products').delete().eq('account_id', accountId);
  await supabase.from('widget_product_series').delete().eq('account_id', accountId);

  // 3. Extract products in batches (rate limit: ~15 RPM for Gemini)
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 2000;
  const products: ExtractedProduct[] = [];

  for (let i = 0; i < productPages.length; i += BATCH_SIZE) {
    const batch = productPages.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((page: any) => extractProductFromPage(page, resolved.id))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled' && result.value) {
        products.push(result.value);
      } else if (result.status === 'rejected') {
        errors.push(`Page ${batch[j]?.url}: ${result.reason?.message || 'unknown'}`);
      }
    }

    console.log(`[ExtractProducts] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${products.length} products extracted so far`);

    // Rate limit delay between batches
    if (i + BATCH_SIZE < productPages.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`[ExtractProducts] Extracted ${products.length} products total`);

  // 4. Detect product series
  const seriesMap = new Map<string, string[]>();
  for (const product of products) {
    if (product.productLine) {
      const key = product.productLine.toLowerCase().trim();
      if (!seriesMap.has(key)) seriesMap.set(key, []);
      seriesMap.get(key)!.push(product.name);
    }
  }

  // Create series records (only for groups of 2+)
  const seriesRecords = new Map<string, string>(); // productLine → series_id
  for (const [line, productNames] of seriesMap) {
    if (productNames.length >= 2) {
      const { data: series } = await supabase
        .from('widget_product_series')
        .insert({
          account_id: accountId,
          name: `סדרת ${line}`,
          key_ingredient: line,
        })
        .select('id')
        .single();
      if (series) {
        seriesRecords.set(line, series.id);
      }
    }
  }

  console.log(`[ExtractProducts] Detected ${seriesRecords.size} product series`);

  // 5. Insert products into DB
  let insertedCount = 0;
  for (const product of products) {
    const seriesId = product.productLine
      ? seriesRecords.get(product.productLine.toLowerCase().trim()) || null
      : null;

    // Find source page ID
    const sourcePage = productPages.find((p: any) => p.url === product.productUrl);

    const { error: insertErr } = await supabase
      .from('widget_products')
      .insert({
        account_id: accountId,
        source_page_id: sourcePage?.id || null,
        name: product.name,
        name_he: product.nameHe,
        description: product.description,
        price: product.price,
        original_price: product.originalPrice,
        currency: 'ILS',
        category: product.category,
        subcategory: product.subcategory,
        product_line: product.productLine,
        series_id: seriesId,
        volume: product.volume,
        volume_ml: product.volumeMl,
        ingredients: product.ingredients,
        key_ingredients: product.keyIngredients,
        benefits: product.benefits,
        target_audience: product.targetAudience,
        image_url: product.imageUrl,
        product_url: product.productUrl,
        is_available: product.isAvailable,
        is_on_sale: product.isOnSale,
        is_featured: false,
        priority: 0,
      });

    if (insertErr) {
      errors.push(`Insert ${product.name}: ${insertErr.message}`);
    } else {
      insertedCount++;
    }
  }

  console.log(`[ExtractProducts] Inserted ${insertedCount} products into DB`);

  return {
    accountId,
    totalPages: productPages.length,
    productsExtracted: insertedCount,
    seriesDetected: seriesRecords.size,
    errors,
    durationMs: Date.now() - start,
  };
}
