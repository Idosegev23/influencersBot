/**
 * AI-powered product extraction from scraped e-commerce pages.
 * Parses raw page content into structured widget_products records.
 */

import { createClient } from '@/lib/supabase/server';

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

const EXTRACTION_PROMPT = `אתה מומחה לחילוץ נתוני מוצרים מאתרי איקומרס ישראליים.
נתח את תוכן הדף הבא וחלץ מידע על המוצר.

חוקים:
1. חלץ את המחיר מהטקסט (חפש ₪ ואז מספר). אם יש מחיר מבצע ומחיר מקורי — הפרד ביניהם.
2. חלץ נפח ממ"ל, גר', מ"ל — המר ל-volumeMl (מספר).
3. category: אחד מ: hair_care, body_care, face_care, men, lip_care, nails, accessories, sets, other
4. subcategory: shampoo, conditioner, mask, serum, oil, cream, gel, wax, clay, spray, brush, towel, kit, lip_oil, other
5. productLine: הסדרה (למשל "קיק", "חומצה היאלורונית", "ארגן", "סילבר אסאי", "אובליפיכה")
6. keyIngredients: רכיבים עיקריים בעברית (["שמן קיק", "קרטין"])
7. benefits: יתרונות (["שיער יבש", "לחות", "חיזוק"])
8. targetAudience: קהל יעד (["שיער פגום", "שיער צבוע", "גברים"])
9. אם הדף הוא עמוד רשימת מוצרים (קטלוג) ולא מוצר בודד — החזר isProductPage: false
10. isAvailable: false אם כתוב "אזל", "SOLD OUT", "לא במלאי"
11. isOnSale: true אם יש מחיר מקורי וגם מחיר מבצע

החזר JSON בלבד (ללא markdown):
{
  "isProductPage": true/false,
  "name": "שם המוצר",
  "description": "תיאור קצר",
  "price": 45.90,
  "originalPrice": null,
  "category": "hair_care",
  "subcategory": "shampoo",
  "productLine": "קיק",
  "volume": "450 מ\"ל",
  "volumeMl": 450,
  "ingredients": ["Aqua", "Sodium Laureth Sulfate", ...],
  "keyIngredients": ["שמן קיק", "קרטין"],
  "benefits": ["שיער יבש", "חיזוק"],
  "targetAudience": ["שיער פגום"],
  "isAvailable": true,
  "isOnSale": false
}`;

export async function extractProductFromPage(page: {
  url: string;
  page_title: string;
  page_content: string;
  extracted_data?: any;
  image_urls?: string[];
}): Promise<ExtractedProduct | null> {
  try {
    const { client, model } = await getGeminiModel();

    const pageContext = `
כותרת: ${page.page_title || ''}
URL: ${page.url}
תוכן:
${(page.page_content || '').substring(0, 3000)}
`;

    const response = await client.models.generateContent({
      model,
      contents: pageContext,
      config: {
        systemInstruction: EXTRACTION_PROMPT,
        temperature: 0.1,
        maxOutputTokens: 1000,
      },
    });

    const text = response.text || '';
    console.log(`[ExtractProducts] Gemini response for ${page.url.split('/').pop()?.substring(0, 40)}:`, text.substring(0, 200));

    // Parse JSON from response (handle markdown fences)
    const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    const data = JSON.parse(jsonStr);

    // Skip catalog/listing pages
    if (data.isProductPage === false) {
      console.log(`[ExtractProducts] Skipped (not product page): ${page.url.split('/').pop()?.substring(0, 40)}`);
      return null;
    }

    // Skip if no name extracted
    if (!data.name || data.name === 'כל המוצרים') {
      console.log(`[ExtractProducts] Skipped (no name): ${page.url.split('/').pop()?.substring(0, 40)}`);
      return null;
    }

    // Pick best image
    const imageUrl =
      page.extracted_data?.images?.[0] ||
      page.image_urls?.[0] ||
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

export async function extractAllProducts(accountId: string): Promise<ExtractionResult> {
  const start = Date.now();
  const errors: string[] = [];
  const supabase = await createClient();

  console.log(`[ExtractProducts] Starting extraction for account ${accountId}`);

  // 1. Fetch all scraped product pages
  const { data: pages, error } = await supabase
    .from('instagram_bio_websites')
    .select('id, url, page_title, page_content, extracted_data, image_urls')
    .eq('account_id', accountId)
    .eq('processing_status', 'completed');

  if (error || !pages) {
    return { accountId, totalPages: 0, productsExtracted: 0, seriesDetected: 0, errors: [error?.message || 'No pages found'], durationMs: Date.now() - start };
  }

  // Filter to product pages only (heuristic: URL contains /product)
  const productPages = pages.filter((p: any) =>
    p.url?.includes('/product') &&
    !p.url?.endsWith('/products') &&
    !p.url?.includes('/category')
  );

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
      batch.map((page: any) => extractProductFromPage(page))
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
