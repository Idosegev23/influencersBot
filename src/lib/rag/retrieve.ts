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
import { createLogger } from './logger';
import { cacheWrap, CacheTTL } from '@/lib/cache';
import { getMetrics } from '@/lib/metrics/pipeline-metrics';
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
  timeHint?: { after?: string; before?: string };
}> {
  const lowerQuery = query.toLowerCase();

  // Check for structured indicators
  const isStructured = STRUCTURED_INDICATORS.some(ind => lowerQuery.includes(ind));

  // Infer entity types from keywords
  const inferredTypes: EntityType[] = [];
  for (const [type, keywords] of Object.entries(ENTITY_KEYWORDS)) {
    if (keywords.some(kw => lowerQuery.includes(kw))) {
      inferredTypes.push(type as EntityType);
    }
  }

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

  // Determine query type
  let queryType: QueryType;
  if (isStructured && inferredTypes.length === 0) {
    queryType = 'structured';
  } else if (isStructured) {
    queryType = 'mixed';
  } else {
    queryType = 'unstructured';
  }

  return { queryType, inferredEntityTypes: inferredTypes, timeHint };
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
  stages.filterMs = Date.now() - filterStart;

  // --- Step 3: Vector search ---
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

  // Step 3b: Vector search (threshold 0.3 — lower for Hebrew brand names)
  pm?.mark('rpc_start');
  const { data: initialResults, error: vectorError } = await supabase
    .rpc('match_document_chunks', {
      p_account_id: accountId,
      p_embedding: JSON.stringify(baseEmbedding),
      p_match_count: 20,
      p_match_threshold: 0.3,
      p_entity_types: entityTypes,
      p_updated_after: timeWindow?.after || null,
    });
  pm?.measure('matchDocChunksMs', 'rpc_start');

  if (vectorError) {
    log.error('Vector search failed', { error: vectorError.message }, accountId);
  }

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
  };

  let candidates = (initialResults || []) as CandidateRow[];
  const initialTopSimilarity = candidates[0]?.similarity || 0;

  // Step 3c: Conditional query expansion — only when top similarity < 0.6
  // Saves ~600ms Gemini API call on confident matches
  let expandedQuery = query;
  if (initialTopSimilarity < 0.6 && query.length <= 100) {
    pm?.inc('expandQueryCalled');
    pm?.mark('expand_start');
    expandedQuery = await expandQuery(query);
    pm?.measure('expandQueryMs', 'expand_start');
    if (expandedQuery !== query) {
      // Re-embed with expanded terms and search at lower threshold
      const expandedEnriched = conversationSummary
        ? `${expandedQuery}\n\nContext: ${conversationSummary}`
        : expandedQuery;
      const expandedEmbedding = await generateEmbedding(expandedEnriched);

      const { data: expandedResults } = await supabase
        .rpc('match_document_chunks', {
          p_account_id: accountId,
          p_embedding: JSON.stringify(expandedEmbedding),
          p_match_count: 20,
          p_match_threshold: 0.25,
          p_entity_types: entityTypes,
          p_updated_after: timeWindow?.after || null,
        });

      // Merge: add new results not already in candidates
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
  } else if (initialTopSimilarity >= 0.6) {
    pm?.inc('expandQuerySkippedConfident');
    log.info('Skipped query expansion (confident match)', {
      topSimilarity: initialTopSimilarity,
    }, accountId);
  }

  // Step 3d: Fallback to lower threshold if zero results at 0.4
  if (candidates.length === 0) {
    pm?.set('thresholdUsed', '0.25_fallback');
    log.info('Zero results at 0.4 threshold, retrying at 0.25', {}, accountId);
    const { data: fallbackResults } = await supabase
      .rpc('match_document_chunks', {
        p_account_id: accountId,
        p_embedding: JSON.stringify(baseEmbedding),
        p_match_count: 20,
        p_match_threshold: 0.25,
        p_entity_types: entityTypes,
        p_updated_after: timeWindow?.after || null,
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

  // --- Step 3e: Keyword supplement (hybrid search) ---
  // ALWAYS run — ensures brand names, Hebrew terms, and specific phrases are found
  // even when vector search returns confident but off-topic results
  let keywordSupplementAdded = false;
  const topSimilarityFinal = candidates[0]?.similarity || 0;
  {
    pm?.inc('keywordSupplementCalled');
    pm?.mark('kw_start');
    const existingIds = new Set(candidates.map(c => c.id));
    let added = 0;

    // Search expanded key terms (if query was expanded)
    const keyTerms = extractKeyTerms(query, expandedQuery);
    if (keyTerms.length > 0) {
      const searches = keyTerms.slice(0, 10).map(term =>
        supabase
          .from('document_chunks')
          .select('id, document_id, entity_type, chunk_index, chunk_text, token_count, metadata, updated_at')
          .eq('account_id', accountId)
          .ilike('chunk_text', `%${term}%`)
          .limit(5)
      );
      const results = await Promise.all(searches);

      for (const { data } of results) {
        if (!data) continue;
        for (const kr of data) {
          if (!existingIds.has(kr.id)) {
            existingIds.add(kr.id);
            candidates.push({ ...kr, similarity: 0.45 });
            added++;
          }
        }
      }
    }

    // Always search original query terms via ILIKE (catches brand names, Hebrew terms)
    const originalTerms = query.replace(/[?!.,؟]/g, '').split(/\s+/).filter(w => w.length > 2);

    // For Hebrew morphology: also search shorter prefixes of long words
    // e.g. "פנטניות" (6 chars) → also search "פנטני" (5), "פנטנ" (4)
    // This handles Hebrew suffixes like ות, ים, ה etc.
    const allSearchTerms = new Set<string>();
    for (const term of originalTerms.slice(0, 5)) {
      allSearchTerms.add(term);
      // Add shorter prefixes for Hebrew words (3+ chars prefix)
      if (term.length >= 5) {
        const prefix4 = term.slice(0, 4);
        allSearchTerms.add(prefix4);
      }
      if (term.length >= 6) {
        const prefix5 = term.slice(0, 5);
        allSearchTerms.add(prefix5);
      }
    }

    // Run all ILIKE searches in parallel for performance
    const originalSearches = [...allSearchTerms].map(term =>
      supabase
        .from('document_chunks')
        .select('id, document_id, entity_type, chunk_index, chunk_text, token_count, metadata, updated_at')
        .eq('account_id', accountId)
        .ilike('chunk_text', `%${term}%`)
        .limit(8)
    );
    const originalResults = await Promise.all(originalSearches);
    for (const { data } of originalResults) {
      if (!data) continue;
      for (const kr of data) {
        if (!existingIds.has(kr.id)) {
          existingIds.add(kr.id);
          candidates.push({ ...kr, similarity: 0.45 });
          added++;
        }
      }
    }

    if (added > 0) {
      keywordSupplementAdded = true;
      log.info('Keyword supplement added candidates', { added, keyTerms, originalTerms }, accountId);
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

  // --- Heuristic reranking: boost recency + chunk position ---
  const now = Date.now();
  for (const c of filtered) {
    // Recency bonus: content from last 30 days gets +0.05
    const ageMs = now - new Date(c.updated_at).getTime();
    if (ageMs < 30 * 24 * 60 * 60 * 1000) {
      c.similarity += 0.05;
    }
    // First chunk bonus: chunk_index 0 usually has the most important content
    if (c.chunk_index === 0) {
      c.similarity += 0.03;
    }
  }
  // Re-sort after heuristic adjustments
  filtered.sort((a, b) => b.similarity - a.similarity);

  // --- Chunk dedup + diversity (always active) ---
  // Max 2 chunks per document, max 6 per entity_type (raised for transcription-heavy accounts)
  const perSource = new Map<string, number>();
  const perType = new Map<string, number>();
  filtered = filtered.filter(c => {
    const srcCount = perSource.get(c.document_id) || 0;
    const typeCount = perType.get(c.entity_type) || 0;
    if (srcCount >= 2 || typeCount >= 6) return false;
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
  // - Top similarity > 0.5 AND no keyword supplement was added
  //   (keyword supplements need reranking since their 0.40 baseline may outrank
  //    higher-similarity but less-relevant vector results)
  // - Precision V2 + dominant result (>0.85) AND no keyword supplement
  let reranked;
  const topSimilarity = filtered[0]?.similarity || 0;
  const skipRerank = filtered.length > 0 && !keywordSupplementAdded && (
    topSimilarity > 0.5 ||
    (process.env.MEMORY_V2_ENABLED === 'true' && topSimilarity > 0.85)
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
      topSimilarity,
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
  const rerankMap = new Map(reranked.map(r => [r.id, r]));
  selectedCandidates.sort((a, b) => {
    const scoreA = rerankMap.get(a.id)?.score || 0;
    const scoreB = rerankMap.get(b.id)?.score || 0;
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
      excerpt: c.chunk_text.substring(0, 800),
      updatedAt: c.updated_at,
      confidence: rerank?.score || c.similarity,
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

/**
 * Extract key terms that were added by query expansion.
 * Returns the new terms (not in original query) that are meaningful words.
 */
function extractKeyTerms(originalQuery: string, expandedQuery: string): string[] {
  const originalWords = new Set(
    originalQuery.toLowerCase().replace(/[?!.,?؟]/g, '').split(/\s+/).filter(w => w.length > 1)
  );
  const expandedTerms = expandedQuery
    .split(/[,،]+/)  // Split by commas first
    .map(t => t.trim().replace(/^[(\[{]+|[)\]}.!?:]+$/g, ''))  // Strip surrounding punctuation
    .filter(t => {
      if (t.length < 2) return false;
      if (originalWords.has(t.toLowerCase())) return false;
      // Filter out noise: terms with parentheses, brackets, or mostly punctuation
      if (/[()[\]{}]/.test(t)) return false;
      // Must contain at least 2 actual word characters
      const wordChars = t.replace(/[^a-zA-Zא-ת\u0600-\u06FF]/g, '');
      return wordChars.length >= 2;
    });

  // Return unique terms, max 12
  return [...new Set(expandedTerms)].slice(0, 12);
}

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
