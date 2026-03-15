/**
 * AI-powered product enrichment:
 * - Generate ai_profile for each product
 * - Detect complementary products
 * - Generate embeddings for semantic search
 */

import { createClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/rag/embeddings';

async function getGeminiModel() {
  const { getGeminiClient, MODELS } = await import('@/lib/ai/google-client');
  const client = getGeminiClient();
  return { client, model: MODELS.CHAT_FAST };
}

// ============================================
// Types
// ============================================

export interface AIProfile {
  whatItDoes: string;
  bestFor: string[];
  pairsWith: string[];
  sellingPoints: string[];
  conversationTriggers: string[];
}

export interface EnrichmentResult {
  accountId: string;
  productsEnriched: number;
  embeddingsGenerated: number;
  complementaryMapped: number;
  errors: string[];
  durationMs: number;
}

// ============================================
// Enrich a Single Product with AI Profile
// ============================================

const ENRICHMENT_PROMPT = `אתה מומחה טיפוח ויופי. נתח את המוצר הבא וצור פרופיל AI.

החזר JSON בלבד:
{
  "whatItDoes": "תיאור של מה המוצר עושה במשפט אחד",
  "bestFor": ["מי צריך את המוצר — 2-4 סוגי לקוחות"],
  "pairsWith": ["שמות סוגי מוצרים משלימים — לא מותגים, סוגים: מסיכה, סרום, מרכך..."],
  "sellingPoints": ["3 יתרונות מכירתיים קצרים"],
  "conversationTriggers": ["4-6 ביטויים שלקוח ישתמש שמצביעים על צורך במוצר הזה"]
}

דוגמה לconversationTriggers: ["שיער יבש", "שיער נושר", "לחות לשיער", "שיער פגום אחרי צבע"]`;

async function enrichSingleProduct(product: any): Promise<AIProfile | null> {
  try {
    const { client, model } = await getGeminiModel();

    const productContext = `
שם: ${product.name}
תיאור: ${product.description || 'לא זמין'}
קטגוריה: ${product.category} / ${product.subcategory}
סדרה: ${product.product_line || 'לא ידוע'}
מחיר: ${product.price ? `₪${product.price}` : 'לא ידוע'}
רכיבים עיקריים: ${product.key_ingredients?.join(', ') || 'לא ידוע'}
יתרונות: ${product.benefits?.join(', ') || 'לא ידוע'}
קהל יעד: ${product.target_audience?.join(', ') || 'לא ידוע'}
`;

    const response = await client.models.generateContent({
      model,
      contents: productContext,
      config: {
        systemInstruction: ENRICHMENT_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const text = response.text || '';
    let jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(jsonStr) as AIProfile;
    } catch {
      // Fix unescaped Hebrew abbreviation quotes (מ"ל, ק"ג, ס"מ)
      jsonStr = jsonStr.replace(/([\u0590-\u05FF])"([\u0590-\u05FF])/g, '$1\u05F4$2');
      return JSON.parse(jsonStr) as AIProfile;
    }
  } catch (err: any) {
    console.error(`[EnrichProducts] Failed to enrich ${product.name}:`, err.message);
    return null;
  }
}

// ============================================
// Generate embedding for a product
// ============================================

function buildEmbeddingText(product: any): string {
  const parts = [
    product.name,
    product.description,
    product.category,
    product.subcategory,
    product.product_line,
    ...(product.key_ingredients || []),
    ...(product.benefits || []),
    ...(product.target_audience || []),
    product.ai_profile?.whatItDoes,
    ...(product.ai_profile?.conversationTriggers || []),
  ].filter(Boolean);
  return parts.join(' ');
}

// ============================================
// Detect complementary products
// ============================================

function detectComplementary(products: any[]): Map<string, string[]> {
  const complementaryMap = new Map<string, string[]>();

  // Rule 1: Same series/product_line → complementary
  const byLine = new Map<string, any[]>();
  for (const p of products) {
    if (p.product_line) {
      const key = p.product_line.toLowerCase();
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key)!.push(p);
    }
  }

  for (const [, lineProducts] of byLine) {
    for (const product of lineProducts) {
      const others = lineProducts
        .filter((p: any) => p.id !== product.id)
        .map((p: any) => p.id);
      complementaryMap.set(product.id, others);
    }
  }

  // Rule 2: Subcategory pairing (shampoo ↔ conditioner ↔ mask ↔ serum)
  const pairingRules: Record<string, string[]> = {
    shampoo: ['conditioner', 'mask', 'serum'],
    conditioner: ['shampoo', 'mask', 'serum'],
    mask: ['shampoo', 'conditioner', 'serum'],
    serum: ['shampoo', 'mask', 'oil'],
    oil: ['serum', 'cream', 'mask'],
    cream: ['gel', 'oil', 'serum'],
    wax: ['clay', 'shampoo'],
    clay: ['wax', 'shampoo'],
  };

  for (const product of products) {
    const pairs = pairingRules[product.subcategory] || [];
    if (pairs.length === 0) continue;

    const existing = complementaryMap.get(product.id) || [];
    const newPairs = products
      .filter((p: any) =>
        p.id !== product.id &&
        pairs.includes(p.subcategory) &&
        !existing.includes(p.id)
      )
      .slice(0, 5) // Limit cross-category pairs
      .map((p: any) => p.id);

    complementaryMap.set(product.id, [...existing, ...newPairs]);
  }

  return complementaryMap;
}

// ============================================
// Main Enrichment Pipeline
// ============================================

export async function enrichAllProducts(accountId: string): Promise<EnrichmentResult> {
  const start = Date.now();
  const errors: string[] = [];
  const supabase = await createClient();

  console.log(`[EnrichProducts] Starting enrichment for account ${accountId}`);

  // 1. Fetch all products
  const { data: products, error } = await supabase
    .from('widget_products')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_available', true);

  if (error || !products?.length) {
    return { accountId, productsEnriched: 0, embeddingsGenerated: 0, complementaryMapped: 0, errors: [error?.message || 'No products found'], durationMs: Date.now() - start };
  }

  console.log(`[EnrichProducts] Enriching ${products.length} products`);

  // 2. AI enrichment in batches
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 2000;
  let enrichedCount = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((p: any) => enrichSingleProduct(p))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const product = batch[j];
      if (result.status === 'fulfilled' && result.value) {
        const { error: updateErr } = await supabase
          .from('widget_products')
          .update({ ai_profile: result.value })
          .eq('id', product.id);
        if (updateErr) {
          errors.push(`Enrich ${product.name}: ${updateErr.message}`);
        } else {
          product.ai_profile = result.value;
          enrichedCount++;
        }
      }
    }

    if (i + BATCH_SIZE < products.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`[EnrichProducts] AI profiles: ${enrichedCount}/${products.length}`);

  // 3. Generate embeddings
  let embeddingCount = 0;
  for (const product of products) {
    try {
      const embText = buildEmbeddingText(product);
      if (!embText || embText.length < 10) continue;

      const embedding = await generateEmbedding(embText);
      const { error: embErr } = await supabase
        .from('widget_products')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', product.id);

      if (!embErr) embeddingCount++;
    } catch (err: any) {
      errors.push(`Embedding ${product.name}: ${err.message}`);
    }
  }

  console.log(`[EnrichProducts] Embeddings: ${embeddingCount}/${products.length}`);

  // 4. Map complementary products
  const complementaryMap = detectComplementary(products);
  let compCount = 0;
  for (const [productId, compIds] of complementaryMap) {
    if (compIds.length === 0) continue;
    const { error: compErr } = await supabase
      .from('widget_products')
      .update({ complementary_ids: compIds })
      .eq('id', productId);
    if (!compErr) compCount++;
  }

  console.log(`[EnrichProducts] Complementary mappings: ${compCount}`);

  return {
    accountId,
    productsEnriched: enrichedCount,
    embeddingsGenerated: embeddingCount,
    complementaryMapped: compCount,
    errors,
    durationMs: Date.now() - start,
  };
}
