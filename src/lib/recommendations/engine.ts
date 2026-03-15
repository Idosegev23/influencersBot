/**
 * Smart Recommendation Engine
 * Context-aware product recommendations for widget chat.
 *
 * Strategies:
 * 1. need_based — match conversation intent to product benefits/triggers
 * 2. complementary — suggest products from same series or pairing rules
 * 3. upsell — suggest sets/bundles when viewing individual items
 * 4. budget — price-sensitive recommendations
 * 5. featured — store owner promoted products
 */

import { createClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/rag/embeddings';

// ============================================
// Types
// ============================================

export interface RecommendationRequest {
  accountId: string;
  sessionId?: string;
  conversationContext: string; // The user's message or recent conversation summary
  currentProductId?: string; // If user is asking about a specific product
  maxResults?: number;
  strategy?: RecommendationStrategy;
}

export type RecommendationStrategy =
  | 'need_based'
  | 'complementary'
  | 'upsell'
  | 'budget'
  | 'featured'
  | 'auto';

export interface ProductRecommendation {
  id: string;
  name: string;
  description: string;
  price: number | null;
  originalPrice: number | null;
  imageUrl: string | null;
  productUrl: string;
  category: string;
  subcategory: string;
  productLine: string | null;
  isOnSale: boolean;
  volume: string | null;
  keyIngredients: string[];
  aiWhy: string; // Why this product is recommended (from ai_profile)
  strategy: RecommendationStrategy;
  score: number; // Ranking score (0-100)
}

export interface RecommendationResult {
  products: ProductRecommendation[];
  strategy: RecommendationStrategy;
  promptBlock: string; // Ready-to-inject block for system prompt
}

// ============================================
// Core: Get Recommendations
// ============================================

export async function getRecommendations(req: RecommendationRequest): Promise<RecommendationResult> {
  const maxResults = req.maxResults || 3;
  const strategy = req.strategy || 'auto';

  const supabase = await createClient();

  // 1. Load all available products for the account
  const { data: allProducts } = await supabase
    .from('widget_products')
    .select('*')
    .eq('account_id', req.accountId)
    .eq('is_available', true)
    .order('priority', { ascending: false });

  if (!allProducts?.length) {
    return { products: [], strategy: 'auto', promptBlock: '' };
  }

  // 2. Determine strategy
  let effectiveStrategy = strategy;
  if (strategy === 'auto') {
    effectiveStrategy = detectBestStrategy(req.conversationContext, req.currentProductId);
  }

  // 3. Score and rank products
  let scored: ScoredProduct[];
  switch (effectiveStrategy) {
    case 'need_based':
      scored = await scoreNeedBased(allProducts, req.conversationContext);
      break;
    case 'complementary':
      scored = scoreComplementary(allProducts, req.currentProductId);
      break;
    case 'upsell':
      scored = scoreUpsell(allProducts, req.currentProductId);
      break;
    case 'budget':
      scored = scoreBudget(allProducts);
      break;
    case 'featured':
      scored = scoreFeatured(allProducts);
      break;
    default:
      scored = await scoreNeedBased(allProducts, req.conversationContext);
  }

  // 4. Take top N, deduplicate
  const seen = new Set<string>();
  const topProducts: ProductRecommendation[] = [];
  for (const sp of scored.sort((a, b) => b.score - a.score)) {
    if (seen.has(sp.product.id)) continue;
    if (sp.product.id === req.currentProductId) continue; // Don't recommend what they're looking at
    seen.add(sp.product.id);
    topProducts.push(formatRecommendation(sp.product, effectiveStrategy, sp.score));
    if (topProducts.length >= maxResults) break;
  }

  // 5. Build prompt block for system prompt injection
  const promptBlock = buildPromptBlock(topProducts);

  // 6. Track recommendations (fire-and-forget)
  if (topProducts.length > 0 && req.sessionId) {
    trackRecommendations(req.accountId, req.sessionId, topProducts, req.conversationContext)
      .catch(err => console.error('[RecommendationEngine] Track error:', err));
  }

  return { products: topProducts, strategy: effectiveStrategy, promptBlock };
}

// ============================================
// Strategy Detection
// ============================================

function detectBestStrategy(context: string, currentProductId?: string): RecommendationStrategy {
  const lower = context.toLowerCase();

  // Budget signals
  if (/מחיר|זול|משתלם|תקציב|הנחה|מבצע|כמה עולה/.test(lower)) {
    return 'budget';
  }

  // Complementary signals (already looking at a product)
  if (currentProductId) {
    return 'complementary';
  }

  // Upsell signals
  if (/סט |ערכה|חבילה|יחד עם|משהו נוסף/.test(lower)) {
    return 'upsell';
  }

  // Default: need-based (most common and highest quality)
  return 'need_based';
}

// ============================================
// Scoring: Need-Based (Semantic + Keyword)
// ============================================

interface ScoredProduct {
  product: any;
  score: number;
}

async function scoreNeedBased(products: any[], context: string): Promise<ScoredProduct[]> {
  const lower = context.toLowerCase();
  const scored: ScoredProduct[] = [];

  // Try embedding-based similarity first
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await generateEmbedding(context);
  } catch {
    // Fallback to keyword matching only
  }

  for (const product of products) {
    let score = 0;

    // 1. Keyword matching on conversationTriggers (highest weight)
    const triggers = product.ai_profile?.conversationTriggers || [];
    for (const trigger of triggers) {
      if (lower.includes(trigger.toLowerCase())) {
        score += 25;
      }
    }

    // 2. Key ingredient matching
    for (const ing of product.key_ingredients || []) {
      if (lower.includes(ing.toLowerCase())) {
        score += 15;
      }
    }

    // 3. Benefits matching
    for (const benefit of product.benefits || []) {
      if (lower.includes(benefit.toLowerCase())) {
        score += 15;
      }
    }

    // 4. Category/subcategory matching
    const categoryKeywords: Record<string, string[]> = {
      shampoo: ['שמפו', 'לשטוף', 'שטיפה', 'ראש'],
      mask: ['מסיכה', 'מסכה', 'טיפול עומק'],
      serum: ['סרום', 'שמן', 'טיפוח'],
      conditioner: ['מרכך', 'ריכוך'],
      cream: ['קרם', 'לחות'],
      oil: ['שמן', 'אויל'],
      wax: ['ווקס', 'עיצוב'],
      clay: ['חימר', 'clay'],
    };
    for (const [sub, keywords] of Object.entries(categoryKeywords)) {
      if (product.subcategory === sub) {
        for (const kw of keywords) {
          if (lower.includes(kw)) score += 10;
        }
      }
    }

    // 5. Target audience matching
    for (const aud of product.target_audience || []) {
      if (lower.includes(aud.toLowerCase())) {
        score += 10;
      }
    }

    // 6. Embedding similarity (if available)
    if (queryEmbedding && product.embedding) {
      try {
        const similarity = cosineSimilarity(queryEmbedding, product.embedding);
        score += Math.round(similarity * 30); // 0-30 points
      } catch {
        // Skip embedding scoring for this product
      }
    }

    // 7. Priority boost from store owner
    score += (product.priority || 0) * 2;

    // 8. Featured boost
    if (product.is_featured) score += 10;

    // 9. Sale boost (small)
    if (product.is_on_sale) score += 5;

    scored.push({ product, score });
  }

  return scored;
}

// ============================================
// Scoring: Complementary
// ============================================

function scoreComplementary(products: any[], currentProductId?: string): ScoredProduct[] {
  if (!currentProductId) return scoreFeatured(products);

  const current = products.find((p: any) => p.id === currentProductId);
  if (!current) return scoreFeatured(products);

  const complementaryIds = new Set(current.complementary_ids || []);

  return products.map((p: any) => {
    let score = 0;

    // Direct complementary match
    if (complementaryIds.has(p.id)) score += 50;

    // Same series
    if (current.series_id && p.series_id === current.series_id) score += 30;

    // Same product line
    if (current.product_line && p.product_line === current.product_line) score += 20;

    // Priority & featured
    score += (p.priority || 0) * 2;
    if (p.is_featured) score += 5;

    return { product: p, score };
  });
}

// ============================================
// Scoring: Upsell (sets & bundles)
// ============================================

function scoreUpsell(products: any[], currentProductId?: string): ScoredProduct[] {
  return products.map((p: any) => {
    let score = 0;

    // Prefer sets/kits
    if (p.category === 'sets' || p.subcategory === 'kit') score += 40;

    // Prefer higher price items (more value)
    if (p.price && p.price > 70) score += 15;

    // On sale = great upsell opportunity
    if (p.is_on_sale) score += 20;

    // Has original price (discount visible)
    if (p.original_price && p.price && p.original_price > p.price) {
      const discount = ((p.original_price - p.price) / p.original_price) * 100;
      score += Math.round(discount / 2); // Up to 25 points for 50% off
    }

    score += (p.priority || 0) * 2;
    if (p.is_featured) score += 10;

    return { product: p, score };
  });
}

// ============================================
// Scoring: Budget
// ============================================

function scoreBudget(products: any[]): ScoredProduct[] {
  return products.map((p: any) => {
    let score = 0;

    // Lower price = higher score
    if (p.price) {
      score += Math.max(0, 50 - p.price); // ₪10 → 40pts, ₪50 → 0pts
    }

    // On sale = always good for budget
    if (p.is_on_sale) score += 30;

    // Sets that save money
    if (p.original_price && p.price && p.original_price > p.price) {
      score += 20;
    }

    score += (p.priority || 0) * 2;

    return { product: p, score };
  });
}

// ============================================
// Scoring: Featured
// ============================================

function scoreFeatured(products: any[]): ScoredProduct[] {
  return products.map((p: any) => {
    let score = 0;
    if (p.is_featured) score += 50;
    score += (p.priority || 0) * 5;
    if (p.is_on_sale) score += 15;
    return { product: p, score };
  });
}

// ============================================
// Format Recommendation
// ============================================

function formatRecommendation(product: any, strategy: RecommendationStrategy, score: number): ProductRecommendation {
  const profile = product.ai_profile || {};
  const aiWhy = profile.sellingPoints?.[0] || profile.whatItDoes || product.description || '';

  return {
    id: product.id,
    name: product.name,
    description: aiWhy,
    price: product.price ? parseFloat(product.price) : null,
    originalPrice: product.original_price ? parseFloat(product.original_price) : null,
    imageUrl: product.image_url,
    productUrl: product.product_url,
    category: product.category,
    subcategory: product.subcategory,
    productLine: product.product_line,
    isOnSale: product.is_on_sale,
    volume: product.volume,
    keyIngredients: product.key_ingredients || [],
    aiWhy,
    strategy,
    score,
  };
}

// ============================================
// Build Prompt Block (injected into system prompt)
// ============================================

function buildPromptBlock(products: ProductRecommendation[]): string {
  if (products.length === 0) return '';

  const lines = ['🛍️ מוצרים מומלצים שאתה יכול להציע ללקוח:'];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const priceStr = p.price
      ? (p.isOnSale && p.originalPrice
        ? `~~₪${p.originalPrice}~~ ₪${p.price}`
        : `₪${p.price}`)
      : '';
    lines.push(`${i + 1}. **${p.name}** ${p.volume ? `(${p.volume})` : ''} — ${priceStr}`);
    lines.push(`   ${p.description}`);
    lines.push(`   קישור: ${p.productUrl}`);
    if (p.imageUrl) {
      lines.push(`   תמונה: ${p.imageUrl}`);
    }
  }

  lines.push('');
  lines.push('כשאתה ממליץ על מוצרים, שלב אותם בצורה טבעית בתשובה. הסבר למה המוצר מתאים. אם הלקוח לא שאל על מוצרים — אל תדחוף, אבל אם יש הזדמנות טבעית — הצע.');

  return lines.join('\n');
}

// ============================================
// Track Recommendations
// ============================================

async function trackRecommendations(
  accountId: string,
  sessionId: string,
  products: ProductRecommendation[],
  context: string
) {
  const supabase = await createClient();
  const records = products.map((p, i) => ({
    account_id: accountId,
    session_id: sessionId,
    product_id: p.id,
    product_name: p.name,
    strategy: p.strategy,
    conversation_context: context.substring(0, 500),
    position: i + 1,
  }));

  await supabase.from('widget_recommendations').insert(records);
}

// ============================================
// Track Click (called from widget)
// ============================================

export async function trackRecommendationClick(
  recommendationId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('widget_recommendations')
    .update({ was_clicked: true, clicked_at: new Date().toISOString() })
    .eq('id', recommendationId);
  return !error;
}

// ============================================
// Helpers
// ============================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
