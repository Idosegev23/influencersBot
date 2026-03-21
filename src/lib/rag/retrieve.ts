/**
 * RAG Retrieval Pipeline
 *
 * retrieveContext({ accountId, userId, query, ... }) -> { sources, debug }
 *
 * Steps:
 * 1. Query classification (structured / unstructured / mixed)
 * 2. Hard filters (account, entity_type, time, metadata)
 * 3. Vector search within filtered candidates
 * 4. Rerank top candidates
 * 5. Build context for LLM
 */

import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { generateEmbedding } from './embeddings';
import { rerankCandidates } from './rerank';
import { getArchetypeConfig } from './archetypes';
import { createLogger } from './logger';
import { cacheWrap } from '@/lib/cache';
import { getMetrics } from '@/lib/metrics/pipeline-metrics';
import { createHash } from 'crypto';

/** Short hash for cache keys */
function queryHash(accountId: string, query: string): string {
  return createHash('md5').update(`${accountId}:${query}`).digest('hex').slice(0, 12);
}
import type {
  EntityType,
  QueryType,
  RetrieveInput,
  RetrievedSource,
  RetrievalDebug,
  RetrievalResult,
  RerankCandidate,
} from './types';

const log = createLogger('retrieve');

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!geminiClient) geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return geminiClient;
}

// ============================================
// Entity type inference from query
// ============================================

const ENTITY_KEYWORDS: Record<EntityType, string[]> = {
  post: ['post', 'caption', 'photo', 'picture', 'image', 'reel', 'carousel', 'פוסט', 'תמונה', 'רילס'],
  transcription: ['video', 'said', 'spoke', 'talk', 'transcription', 'audio', 'סרטון', 'דיבר', 'אמר', 'תמלול'],
  highlight: ['highlight', 'story', 'stories', 'הילייט', 'סטורי'],
  partnership: ['partnership', 'brand', 'collab', 'sponsor', 'deal', 'contract', 'שיתוף', 'מותג', 'חוזה', 'ספונסר'],
  coupon: ['coupon', 'discount', 'code', 'promo', 'sale', 'קופון', 'הנחה', 'קוד', 'מבצע'],
  knowledge_base: ['faq', 'about', 'info', 'question', 'שאלה', 'מידע'],
  document: ['document', 'file', 'pdf', 'contract', 'invoice', 'מסמך', 'קובץ', 'חשבונית'],
  website: ['website', 'site', 'link', 'url', 'page', 'אתר', 'לינק', 'קישור'],
};

// Topic keywords for cross-domain filtering
const TOPIC_KEYWORDS: Record<string, string[]> = {
  food: ['מתכון', 'בישול', 'אוכל', 'מטבח', 'פסטה', 'עוגה', 'מרק', 'סלט', 'בשר', 'עוף', 'דג', 'ירקות',
    'recipe', 'cooking', 'food', 'pasta', 'cake', 'meat', 'chicken', 'fish',
    'סנדוויץ', 'כנאפה', 'פנקייק', 'לחם', 'אורז', 'תבלין', 'שום', 'בצל',
    'סיר', 'מחבת', 'תנור', 'פיצה', 'רוטב', 'לבשל', 'להכין', 'מנה'],
  beauty: ['שיער', 'עור', 'פנים', 'קרם', 'סרום', 'שמפו', 'מרכך', 'מסכה', 'איפור', 'טיפוח',
    'hair', 'skin', 'face', 'cream', 'serum', 'shampoo', 'makeup', 'skincare',
    'לק', 'ציפורניים', 'ריסים', 'גבות'],
  fashion: ['מחטב', 'גרביונים', 'בגד', 'בגדים', 'שמלה', 'חולצה', 'מכנס', 'נעל', 'קפוצ\'ון', 'משקפי שמש',
    'fashion', 'dress', 'shirt', 'pants', 'shoes', 'sunglasses', 'tights',
    'אופנה', 'סטייל', 'לבוש', 'אקססוריז', 'תיק', 'ארנק'],
  home: ['מזרן', 'מיטה', 'כרית', 'שמיכה', 'ריהוט', 'ספה', 'שולחן', 'מדף',
    'mattress', 'furniture', 'bed', 'pillow', 'sofa', 'table'],
  health: ['שיניים', 'מברשת', 'רופא', 'בריאות', 'ספורט', 'כושר', 'ויטמין',
    'dental', 'toothbrush', 'doctor', 'health', 'fitness', 'vitamin',
    'Sonicare', 'Philips'],
  tech: ['טלפון', 'מחשב', 'אפליקציה', 'גאדג\'ט', 'מסך',
    'phone', 'computer', 'app', 'gadget', 'screen', 'tech'],
};

const STRUCTURED_INDICATORS = [
  'how many', 'count', 'total', 'average', 'sum', 'most', 'least', 'top',
  'number of', 'percentage', 'rate', 'statistics', 'stats',
  'כמה', 'סך הכל', 'ממוצע', 'סטטיסטיקות', 'הכי',
  'when did', 'latest', 'first', 'last', 'newest', 'oldest',
  'מתי', 'אחרון', 'ראשון', 'חדש',
];

// ============================================
// Step 0: Query Expansion
// ============================================

/**
 * Expand query with semantically related terms using Gemini 2.5 Flash Lite.
 * This helps bridge vocabulary gaps, e.g. "פסטה" → includes "רביולי, לזניה, ספגטי".
 * Gemini 2.5 Flash Lite: ~600ms, 100% consistent, supports temperature=0.
 */
async function expandQuery(query: string): Promise<string> {
  try {
    const gemini = getGemini();
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: query,
      config: {
        systemInstruction: `Expand search queries with 8-12 related specific terms for better retrieval.
Return the ORIGINAL query + related terms, comma-separated. ONLY the expanded text — no explanations.

Examples:
"פסטה טובה" → "פסטה טובה, רביולי, לזניה, ספגטי, פנה, ניוקי, פטוצ'יני, טורטליני, קנלוני, מתכון פסטה"
"קרם פנים" → "קרם פנים, סרום, לחות, רטינול, ויטמין C, SPF, טיפוח, שגרת טיפוח, קרם לילה, קרם יום"
"good pasta" → "good pasta, ravioli, lasagna, spaghetti, penne, gnocchi, fettuccine, tortellini, Italian food"`,
        maxOutputTokens: 150,
        temperature: 0,
      },
    });

    const expanded = response.text?.trim();
    if (expanded && expanded.length > query.length) {
      log.info('Query expanded', {
        original: query,
        expanded: expanded.substring(0, 200),
      });
      return expanded;
    }
    return query;
  } catch (err) {
    log.warn('Query expansion failed, using original', {
      error: err instanceof Error ? err.message : String(err),
    });
    return query;
  }
}

// ============================================
// Step 1: Query Classification
// ============================================

async function classifyQuery(query: string): Promise<{
  queryType: QueryType;
  inferredEntityTypes: EntityType[];
  inferredTopics: string[];
  timeHint?: { after?: string; before?: string };
}> {
  const lowerQuery = query.toLowerCase();

  // Check for structured indicators (whole-word match to avoid Hebrew false positives,
  // e.g. "הכי" matching inside "להכין")
  const paddedQuery = ` ${lowerQuery} `;
  const isStructured = STRUCTURED_INDICATORS.some(ind => paddedQuery.includes(` ${ind} `));

  // Infer entity types from keywords
  const inferredTypes: EntityType[] = [];
  for (const [type, keywords] of Object.entries(ENTITY_KEYWORDS)) {
    if (keywords.some(kw => lowerQuery.includes(kw))) {
      inferredTypes.push(type as EntityType);
    }
  }

  // Expand related entity types — coupon ↔ partnership, brand → partnership
  // Coupon/discount content is often stored as partnership (with coupon codes)
  const RELATED_TYPES: Partial<Record<EntityType, EntityType[]>> = {
    coupon: ['partnership'],
    partnership: ['coupon'],
  };
  const expanded = new Set(inferredTypes);
  for (const t of inferredTypes) {
    for (const related of (RELATED_TYPES[t] || [])) {
      expanded.add(related);
    }
  }
  inferredTypes.length = 0;
  inferredTypes.push(...expanded);

  // Time hints
  let timeHint: { after?: string; before?: string } | undefined;
  const now = new Date();

  if (/this week|השבוע/i.test(query)) {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    timeHint = { after: weekAgo.toISOString() };
  } else if (/this month|החודש/i.test(query)) {
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
    timeHint = { after: monthAgo.toISOString() };
  } else if (/last month|חודש שעבר/i.test(query)) {
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    timeHint = { after: lastMonthStart.toISOString(), before: lastMonthEnd.toISOString() };
  } else if (/today|היום/i.test(query)) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    timeHint = { after: todayStart.toISOString() };
  } else if (/yesterday|אתמול/i.test(query)) {
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    timeHint = { after: yesterdayStart.toISOString(), before: yesterdayEnd.toISOString() };
  }

  // Infer topics from keywords (word-boundary matching to avoid false positives like "לק" in "לקנות")
  const inferredTopics: string[] = [];
  const queryWordsForTopic = lowerQuery.replace(/[?!.,؟"']/g, '').split(/\s+/);
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => {
      const kwLower = kw.toLowerCase();
      // For short keywords (≤2 chars), require exact word match
      if (kwLower.length <= 2) {
        return queryWordsForTopic.includes(kwLower);
      }
      // For longer keywords, substring match is OK (handles Hebrew prefixes)
      return lowerQuery.includes(kwLower);
    })) {
      inferredTopics.push(topic);
    }
  }

  // Determine query type
  // "structured" only when we have both structured indicators AND specific entity types.
  // Without entity types, FTS has nothing to target — vector search is always better.
  let queryType: QueryType;
  if (isStructured && inferredTypes.length > 0) {
    queryType = 'mixed';
  } else {
    queryType = 'unstructured';
  }

  return { queryType, inferredEntityTypes: inferredTypes, inferredTopics, timeHint };
}

// ============================================
// Step 2: Structured Query Handler
// ============================================

async function handleStructuredQuery(
  accountId: string,
  query: string
): Promise<RetrievedSource[]> {
  const supabase = createClient();

  // Use FTS for structured queries since we have good indexed search
  const { data: results } = await supabase
    .rpc('search_everything', {
      p_account_id: accountId,
      p_query: query,
      p_limit: 10,
    });

  if (!results?.length) return [];

  return results.map((r: any, i: number) => ({
    sourceId: r.id,
    documentId: r.id,
    entityType: r.content_type as EntityType,
    title: truncate(r.content_text, 120),
    excerpt: truncate(r.content_text, 500),
    updatedAt: r.created_at,
    confidence: Math.max(0, Math.min(1, r.relevance)),
    chunkIndex: 0,
    metadata: r.metadata || {},
  }));
}

// ============================================
// Main Retrieval Function
// ============================================

export async function retrieveContext(input: RetrieveInput): Promise<RetrievalResult> {
  const startMs = Date.now();
  const {
    accountId,
    query,
    conversationSummary,
    topK = 8,
    entityTypes: inputEntityTypes,
    timeWindow: inputTimeWindow,
    metadataFilter,
    archetype,
  } = input;

  const stages = {
    classificationMs: 0,
    filterMs: 0,
    vectorSearchMs: 0,
    rerankMs: 0,
    contextBuildMs: 0,
  };

  // --- Step 1: Classify query ---
  const classStart = Date.now();
  const classification = await classifyQuery(query);
  stages.classificationMs = Date.now() - classStart;

  log.info('Query classified', {
    query: query.substring(0, 100),
    queryType: classification.queryType,
    inferredEntityTypes: classification.inferredEntityTypes,
    inferredTopics: classification.inferredTopics,
    timeHint: classification.timeHint,
  }, accountId);

  // --- Structured-only queries: use SQL/FTS ---
  if (classification.queryType === 'structured') {
    const structuredSources = await handleStructuredQuery(accountId, query);
    return {
      sources: structuredSources.slice(0, topK),
      debug: buildDebug({
        queryType: 'structured',
        accountId,
        entityTypes: inputEntityTypes || null,
        timeWindow: inputTimeWindow || null,
        metadataFilter: metadataFilter || null,
        candidateCount: structuredSources.length,
        candidates: structuredSources,
        similarityScores: {},
        rerankScores: {},
        finalSources: structuredSources.slice(0, topK),
        stages,
        startMs,
      }),
    };
  }

  // --- Step 2: Build filters ---
  const filterStart = Date.now();
  const entityTypes = inputEntityTypes || (classification.inferredEntityTypes.length > 0
    ? classification.inferredEntityTypes
    : null);

  const timeWindow = inputTimeWindow || classification.timeHint || null;

  // Topic inference — used for heuristic scoring (penalty for off-topic chunks)
  // NOT used for RPC filtering (too aggressive, removes relevant results)
  const inferredTopics = classification.inferredTopics;
  stages.filterMs = Date.now() - filterStart;

  // --- Step 3: Vector search + BM25 supplement ---
  const vectorStart = Date.now();

  const supabase = createClient();

  // Step 3a: Embed ORIGINAL query first (no expansion — saves ~600ms when confident)
  const pm = getMetrics();
  const baseEnrichedQuery = conversationSummary
    ? `${query}\n\nContext: ${conversationSummary}`
    : query;
  pm?.mark('embed_start');
  const baseEmbedding = await generateEmbedding(baseEnrichedQuery);
  pm?.measure('embeddingMs', 'embed_start');

  // If embedding timed out (null), skip vector search entirely — fall through to BM25 fallback
  let initialResults: any[] | null = null;
  let vectorError: any = null;

  type CandidateRow = {
    id: string;
    document_id: string;
    entity_type: string;
    chunk_index: number;
    chunk_text: string;
    token_count: number;
    metadata: Record<string, unknown>;
    similarity: number;
    updated_at: string;
    topic: string | null;
  };

  if (baseEmbedding) {
    // Step 3b: Vector search (threshold 0.3 — lower for Hebrew brand names)
    pm?.mark('rpc_start');
    const cacheKey = `rag:vecs:${queryHash(accountId, baseEnrichedQuery)}`;
    const cachedVecResult = await cacheWrap<{ data: any[] | null; error: any }>(
      cacheKey,
      async () => {
        const res = await supabase
          .rpc('match_document_chunks', {
            p_account_id: accountId,
            p_embedding: JSON.stringify(baseEmbedding),
            p_match_count: 20,
            p_match_threshold: 0.3,
            p_entity_types: entityTypes,
            p_updated_after: timeWindow?.after || null,
            p_topics: null,
          });
        return { data: res.data, error: res.error };
      },
      { ttlMs: 180_000 } // 3 minutes
    );
    initialResults = cachedVecResult.value.data;
    vectorError = cachedVecResult.value.error;
    pm?.measure('matchDocChunksMs', 'rpc_start');
  } else {
    log.warn('Embedding returned null (timeout) — skipping vector search, using BM25 fallback', {}, accountId);
  }

  if (vectorError) {
    log.error('Vector search failed', { error: vectorError.message }, accountId);
  }

  let candidates = (initialResults || []) as CandidateRow[];
  const initialTopSimilarity = candidates[0]?.similarity || 0;

  // Step 3c: Conditional query expansion — only when:
  // - Top similarity < 0.6 (not confident)
  // - We actually HAVE some results (expansion can't help if index has nothing)
  let expandedQuery = query;
  if (initialTopSimilarity < 0.6 && candidates.length > 0 && query.length <= 100) {
    pm?.inc('expandQueryCalled');
    pm?.mark('expand_start');
    expandedQuery = await expandQuery(query);
    pm?.measure('expandQueryMs', 'expand_start');
    if (expandedQuery !== query) {
      const expandedEnriched = conversationSummary
        ? `${expandedQuery}\n\nContext: ${conversationSummary}`
        : expandedQuery;
      const expandedEmbedding = await generateEmbedding(expandedEnriched);
      if (!expandedEmbedding) {
        log.warn('Expanded embedding timed out — skipping expansion search', {}, accountId);
      }

      const { data: expandedResults } = expandedEmbedding ? await supabase
        .rpc('match_document_chunks', {
          p_account_id: accountId,
          p_embedding: JSON.stringify(expandedEmbedding),
          p_match_count: 20,
          p_match_threshold: 0.25,
          p_entity_types: entityTypes,
          p_updated_after: timeWindow?.after || null,
          p_topics: null,
        }) : { data: null };

      if (expandedResults?.length) {
        const existingIds = new Set(candidates.map(c => c.id));
        for (const r of expandedResults as CandidateRow[]) {
          if (!existingIds.has(r.id)) {
            candidates.push(r);
          }
        }
        log.info('Expanded search merged', {
          initialCount: initialResults?.length || 0,
          expandedNew: candidates.length - (initialResults?.length || 0),
        }, accountId);
      }
    }
  } else if (candidates.length === 0) {
    pm?.inc('expandQuerySkippedNoResults');
    pm?.set('expandQueryMs', 0);
    log.info('Skipped query expansion (zero vector results — go straight to BM25 supplement)', {}, accountId);
  } else if (initialTopSimilarity >= 0.6) {
    pm?.inc('expandQuerySkippedConfident');
    log.info('Skipped query expansion (confident match)', {
      topSimilarity: initialTopSimilarity,
    }, accountId);
  }

  // Step 3d: Fallback to lower threshold if zero results at 0.3
  if (candidates.length === 0 && expandedQuery === query && baseEmbedding) {
    pm?.set('thresholdUsed', '0.25_fallback');
    log.info('Zero results at 0.3 threshold, retrying at 0.25', {}, accountId);
    const { data: fallbackResults } = await supabase
      .rpc('match_document_chunks', {
        p_account_id: accountId,
        p_embedding: JSON.stringify(baseEmbedding),
        p_match_count: 20,
        p_match_threshold: 0.25,
        p_entity_types: entityTypes,
        p_updated_after: timeWindow?.after || null,
        p_topics: null,
      });
    if (fallbackResults?.length) {
      candidates = fallbackResults as CandidateRow[];
    }
  }

  stages.vectorSearchMs = Date.now() - vectorStart;

  log.info('Vector search results', {
    candidateCount: candidates.length,
    topSimilarity: candidates[0]?.similarity,
    bottomSimilarity: candidates[candidates.length - 1]?.similarity,
  }, accountId);

  // --- Step 3e: BM25 keyword supplement (replaces old ILIKE queries) ---
  // Uses tsvector GIN index for fast full-text search with Hebrew prefix stripping
  // Only when vector search isn't confident enough
  let keywordSupplementAdded = false;
  const topSimilarityFinal = candidates[0]?.similarity || 0;
  if (topSimilarityFinal >= 0.65 && candidates.length >= 3) {
    pm?.inc('keywordSupplementSkipped');
    log.info('Skipped keyword supplement (confident vector results)', {
      topSimilarity: topSimilarityFinal,
      candidateCount: candidates.length,
    }, accountId);
  } else {
    pm?.inc('keywordSupplementCalled');
    pm?.mark('kw_start');
    const existingIds = new Set(candidates.map(c => c.id));
    let added = 0;

    // BM25 search via tsvector GIN index — single indexed query replaces multiple ILIKEs
    // Hebrew prefix stripping handled in the RPC (ב,ל,מ,ה,ו,כ,ש)
    // Strip enrichment-template words that match nearly all chunks and dilute ranking
    const BM25_STOP = new Set([
      'יש', 'לך', 'את', 'מה', 'על', 'עם', 'של', 'זה', 'לא', 'גם', 'כל', 'אם', 'כי', 'או', 'אל',
      'שיתוף', 'פעולה', 'שותפות', 'אינסטגרם', 'באינסטגרם', 'קמפיין',
      'המלצה', 'ממליצה', 'ממליץ', 'חושבת', 'יודעת', 'יודע',
      'איך', 'מכינים', 'מכינה',
    ]);
    const bm25Query = query
      .replace(/[?!.,؟]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !BM25_STOP.has(w))
      .join(' ') || query; // fallback to original if all words stripped

    const { data: bm25Results } = await supabase
      .rpc('match_chunks_bm25', {
        p_account_id: accountId,
        p_query_text: bm25Query,
        p_limit: 15,
        p_entity_types: entityTypes,
        p_topics: null,
      });

    if (bm25Results?.length) {
      for (const kr of bm25Results) {
        if (!existingIds.has(kr.id)) {
          existingIds.add(kr.id);
          // BM25 matches get 0.50 base similarity
          candidates.push({ ...kr, similarity: 0.50 });
          added++;
        } else {
          // Boost existing candidates also found by BM25
          const existing = candidates.find(c => c.id === kr.id);
          if (existing) {
            existing.similarity += 0.05;
          }
        }
      }
    }

    if (added > 0) {
      keywordSupplementAdded = true;
      log.info('BM25 supplement added candidates', { added }, accountId);
    }
    pm?.measure('keywordSupplementMs', 'kw_start');
  }

  // --- Handle time "before" filter client-side (Supabase RPC only has "after") ---
  let filtered = candidates;
  if (timeWindow?.before) {
    const beforeDate = new Date(timeWindow.before);
    filtered = candidates.filter(c => new Date(c.updated_at) <= beforeDate);
  }

  // Apply metadata filters client-side
  if (metadataFilter && Object.keys(metadataFilter).length > 0) {
    filtered = filtered.filter(c => {
      for (const [key, value] of Object.entries(metadataFilter)) {
        if ((c.metadata as any)?.[key] !== value) return false;
      }
      return true;
    });
  }

  // --- Heuristic reranking: boost recency + chunk position + keyword match + archetype ---
  // Save raw top similarity BEFORE bonuses — used for skip-rerank decision
  const rawTopSimilarity = filtered[0]?.similarity || 0;
  const archetypeConfig = getArchetypeConfig(archetype);
  const now = Date.now();
  const queryLower = query.toLowerCase();
  // Split query into content words (3+ chars) for partial matching
  // Hebrew stop words (יש, לך, את, מה, על, גם, עם, כל, אם, לא) are 2 chars — filter them out
  const STOP_WORDS = new Set(['יש', 'לך', 'את', 'מה', 'על', 'גם', 'עם', 'כל', 'אם', 'לא', 'של', 'הם', 'זה', 'כי', 'או', 'אל']);
  const queryWords = queryLower.replace(/[?!.,؟]/g, '').split(/\s+/).filter(w => w.length >= 3 || (w.length === 2 && !STOP_WORDS.has(w)));
  for (const c of filtered) {
    // Recency bonus: content from last 30 days gets +0.05
    const ageMs = now - new Date(c.updated_at).getTime();
    let recencyBonus = 0;
    if (ageMs < 30 * 24 * 60 * 60 * 1000) {
      recencyBonus = 0.05;
      // Apply archetype recency multiplier (e.g. media_news = 3x)
      if (archetypeConfig.recencyMultiplier) {
        recencyBonus *= archetypeConfig.recencyMultiplier;
      }
      c.similarity += recencyBonus;
    }
    // First chunk bonus: chunk_index 0 usually has the most important content
    if (c.chunk_index === 0) {
      c.similarity += 0.03;
    }
    // Exact phrase match bonus: if the chunk contains the full query phrase, boost significantly
    const chunkLower = c.chunk_text.toLowerCase();
    if (chunkLower.includes(queryLower)) {
      c.similarity += 0.25;
    } else {
      // Partial keyword bonus: boost by how many query words appear in the chunk
      const matchedWords = queryWords.filter(w => chunkLower.includes(w));
      const matchRatio = matchedWords.length / queryWords.length;
      if (matchRatio >= 0.8) {
        c.similarity += 0.15;
      } else if (matchRatio >= 0.5) {
        c.similarity += 0.08;
      }
    }
    // Archetype type weight: boost/penalize by entity_type
    const typeWeight = archetypeConfig.typeWeights[c.entity_type as EntityType] || 0;
    if (typeWeight !== 0) {
      c.similarity += typeWeight;
    }
    // Topic scoring: penalize chunks from clearly different domains
    // Only when query has a confident topic
    if (inferredTopics.length > 0) {
      const CROSS_DOMAIN: Record<string, Set<string>> = {
        food: new Set(['beauty', 'fashion', 'tech', 'health']),
        beauty: new Set(['food', 'tech', 'business', 'home']),
        fashion: new Set(['food', 'tech', 'business', 'health']),
        health: new Set(['food', 'fashion', 'home']),
        tech: new Set(['food', 'beauty', 'fashion', 'home']),
        home: new Set(['food', 'beauty', 'fashion', 'tech']),
        coupon: new Set([]), // coupons are cross-cutting, don't penalize
        business: new Set(['food', 'beauty', 'fashion']),
      };

      if (c.topic) {
        const chunkTopic = c.topic.toLowerCase();
        const isOnTopic = inferredTopics.some(qt => qt === chunkTopic);
        if (isOnTopic) {
          c.similarity += 0.05; // Small boost for on-topic chunks
        } else {
          const isCrossDomain = inferredTopics.some(qt =>
            CROSS_DOMAIN[qt]?.has(chunkTopic)
          );
          if (isCrossDomain) {
            c.similarity -= 0.25;
          }
        }
      }
    }
  }

  // Re-sort after heuristic adjustments
  filtered.sort((a, b) => b.similarity - a.similarity);

  // Drop chunks that fell below minimum threshold after penalties
  const POST_PENALTY_THRESHOLD = 0.35;
  filtered = filtered.filter(c => c.similarity >= POST_PENALTY_THRESHOLD);

  // --- Chunk dedup + diversity (archetype-aware caps) ---
  const perSource = new Map<string, number>();
  const perType = new Map<string, number>();
  filtered = filtered.filter(c => {
    const srcCount = perSource.get(c.document_id) || 0;
    const typeCount = perType.get(c.entity_type) || 0;
    const docCap = archetypeConfig.docCap;
    const typeCap = archetypeConfig.typeCaps[c.entity_type as EntityType] ?? 8;
    if (srcCount >= docCap || typeCount >= typeCap) return false;
    perSource.set(c.document_id, srcCount + 1);
    perType.set(c.entity_type, typeCount + 1);
    return true;
  });

  // --- Precision V2: Dynamic threshold (gated) ---
  if (process.env.MEMORY_V2_ENABLED === 'true') {
    const topSim = filtered[0]?.similarity || 0;
    if (topSim > 0.8) {
      filtered = filtered.filter(c => c.similarity >= 0.5 || c.id === filtered[0].id);
    }
  }

  // --- Step 4: Rerank (conditional — skip when confident) ---
  const rerankStart = Date.now();

  const rerankCandidatesList: RerankCandidate[] = filtered.map(c => ({
    id: c.id,
    text: c.chunk_text,
    similarity: c.similarity,
    metadata: c.metadata,
  }));

  // Skip LLM rerank when:
  // - RAW similarity > 0.65 (before heuristic bonuses) AND no keyword supplement
  //   Use raw similarity to avoid heuristic bonuses (+0.03 to +0.25) causing
  //   cross-domain noise to skip reranking
  // - Precision V2 + dominant result (>0.85 raw) AND no keyword supplement
  let reranked;
  const skipRerank = filtered.length > 0 && !keywordSupplementAdded && (
    rawTopSimilarity > 0.65 ||
    (process.env.MEMORY_V2_ENABLED === 'true' && rawTopSimilarity > 0.85)
  );

  if (skipRerank) {
    // Take top results directly by similarity — no LLM rerank needed
    pm?.mark('heuristic_rerank_start');
    reranked = rerankCandidatesList
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map(c => ({
        id: c.id,
        score: c.similarity,
      }));
    pm?.measure('heuristicRerankMs', 'heuristic_rerank_start');
    log.info('Skipped rerank (confident results)', {
      topSimilarity: rawTopSimilarity,
      candidateCount: filtered.length,
    }, accountId);
  } else {
    // Only rerank when results are uncertain — use expanded query for hints
    pm?.mark('llm_rerank_start');
    const rerankQuery = expandedQuery !== query
      ? `${query} (related: ${expandedQuery})`
      : query;
    reranked = await rerankCandidates(rerankQuery, rerankCandidatesList, { finalK: topK });
    pm?.measure('llmRerankMs', 'llm_rerank_start');
  }
  stages.rerankMs = Date.now() - rerankStart;

  // --- Step 5: Build context ---
  const contextStart = Date.now();

  const rerankedIds = new Set(reranked.map(r => r.id));
  const selectedCandidates = filtered.filter(c => rerankedIds.has(c.id));

  // Sort by rerank score
  const rerankMap = new Map(reranked.map((r: any) => [r.id, r]));
  selectedCandidates.sort((a, b) => {
    const scoreA = (rerankMap.get(a.id) as any)?.score || 0;
    const scoreB = (rerankMap.get(b.id) as any)?.score || 0;
    return scoreB - scoreA;
  });

  // Fetch document titles for context
  const docIds = [...new Set(selectedCandidates.map(c => c.document_id))];
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, entity_type, source_id')
    .in('id', docIds);

  const docMap = new Map((docs || []).map((d: any) => [d.id, d]));

  const sources: RetrievedSource[] = selectedCandidates.map(c => {
    const doc = docMap.get(c.document_id);
    const rerank = rerankMap.get(c.id);
    return {
      sourceId: c.id,
      documentId: c.document_id,
      entityType: c.entity_type as EntityType,
      title: doc?.title || `${c.entity_type} chunk`,
      excerpt: c.chunk_text.substring(0, 3000),
      updatedAt: c.updated_at,
      confidence: (rerank as any)?.score || c.similarity,
      chunkIndex: c.chunk_index,
      metadata: c.metadata,
    };
  });

  stages.contextBuildMs = Date.now() - contextStart;

  // Build similarity and rerank score maps for debug
  const similarityScores: Record<string, number> = {};
  const rerankScores: Record<string, number> = {};
  for (const c of filtered) {
    similarityScores[c.id] = c.similarity;
  }
  for (const r of reranked) {
    rerankScores[r.id] = r.score;
  }

  const debug = buildDebug({
    queryType: classification.queryType,
    accountId,
    entityTypes: entityTypes || null,
    timeWindow: timeWindow || null,
    metadataFilter: metadataFilter || null,
    candidateCount: filtered.length,
    candidates: filtered.map(c => ({
      sourceId: c.id,
      documentId: c.document_id,
    })),
    similarityScores,
    rerankScores,
    finalSources: sources,
    stages,
    startMs,
  });

  // Record final metrics
  pm?.set('chunksReturned', sources.length);
  pm?.set('topSimilarity', sources[0]?.confidence || 0);
  if (expandedQuery !== query && candidates.length > (initialResults?.length || 0)) {
    pm?.set('thresholdUsed', '0.4+0.25_expanded');
  }

  log.info('Retrieval complete', {
    queryType: classification.queryType,
    candidateCount: filtered.length,
    finalCount: sources.length,
    durationMs: debug.durationMs,
  }, accountId);

  return { sources, debug };
}

// ============================================
// Helpers
// ============================================

function truncate(text: string | null, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

function buildDebug(params: {
  queryType: QueryType;
  accountId: string;
  entityTypes: EntityType[] | null;
  timeWindow: { after?: string; before?: string } | null;
  metadataFilter: Record<string, unknown> | null;
  candidateCount: number;
  candidates: Array<{ sourceId: string; documentId?: string }>;
  similarityScores: Record<string, number>;
  rerankScores: Record<string, number>;
  finalSources: RetrievedSource[];
  stages: RetrievalDebug['stages'];
  startMs: number;
}): RetrievalDebug {
  return {
    queryType: params.queryType,
    appliedFilters: {
      accountId: params.accountId,
      entityTypes: params.entityTypes,
      timeWindow: params.timeWindow,
      metadataFilter: params.metadataFilter,
    },
    candidateCount: params.candidateCount,
    candidateIds: params.candidates.map(c => c.sourceId),
    similarityScores: params.similarityScores,
    rerankScores: params.rerankScores,
    finalSourceIds: params.finalSources.map(s => s.sourceId),
    durationMs: Date.now() - params.startMs,
    stages: params.stages,
  };
}

// ============================================
// Context Formatter (for LLM)
// ============================================

export function formatSourcesForLLM(sources: RetrievedSource[]): string {
  if (sources.length === 0) return '';

  let context = `<sources>\n`;
  for (const source of sources) {
    context += `<source id="${source.sourceId}" type="${source.entityType}" confidence="${source.confidence.toFixed(2)}">\n`;
    context += `  <title>${source.title}</title>\n`;
    context += `  <updated>${source.updatedAt}</updated>\n`;
    context += `  <content>${source.excerpt}</content>\n`;
    context += `</source>\n`;
  }
  context += `</sources>\n`;

  return context;
}
