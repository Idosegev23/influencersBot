/**
 * Pipeline Metrics — lightweight per-request instrumentation.
 *
 * Uses AsyncLocalStorage (Node built-in) so any function in the call stack
 * can record metrics without parameter threading.
 *
 * Usage:
 *   // In route handler:
 *   const m = createPipelineMetrics(requestId, accountId);
 *   const result = await withMetrics(m, () => processRequest());
 *   logPipelineMetrics(m);
 *
 *   // Anywhere deeper:
 *   const m = getMetrics();
 *   m?.mark('embedding_start');
 *   ... await generateEmbedding(...);
 *   m?.measure('embeddingMs', 'embedding_start');
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// ============================================
// Types
// ============================================

export interface PipelineMetricsData {
  requestId: string;
  accountId: string;

  // Top-level timing (ms)
  totalMs: number;
  ttftMs: number;
  knowledgeRetrievalMs: number;
  openaiStreamMs: number;

  // Retrieval breakdown (ms)
  embeddingMs: number;
  matchDocChunksMs: number;
  expandQueryMs: number;
  keywordSupplementMs: number;
  heuristicRerankMs: number;
  llmRerankMs: number;

  // Understanding
  understandingMs: number;
  nanoAttempted: boolean;
  nanoSucceeded: boolean;
  nanoTimedOut: boolean;
  regexFallback: boolean;

  // Decision gates
  expandQueryCalled: boolean;
  expandQuerySkippedConfident: boolean;
  keywordSupplementCalled: boolean;
  keywordSupplementSkipped: boolean;
  thresholdUsed: '0.4' | '0.25_fallback' | '0.4+0.25_expanded';
  chunksReturned: number;
  topSimilarity: number;
  suggestionFallbackTriggered: boolean;

  // Path
  retrievalPath: 'rag' | 'fts' | 'greeting_skip' | 'followup_skip';
  archetype: string;
}

// ============================================
// Metrics Class
// ============================================

export class PipelineMetrics {
  data: PipelineMetricsData;
  private marks = new Map<string, number>();

  constructor(requestId: string, accountId: string) {
    this.data = {
      requestId,
      accountId,
      totalMs: 0,
      ttftMs: 0,
      knowledgeRetrievalMs: 0,
      openaiStreamMs: 0,
      embeddingMs: 0,
      matchDocChunksMs: 0,
      expandQueryMs: 0,
      keywordSupplementMs: 0,
      heuristicRerankMs: 0,
      llmRerankMs: 0,
      understandingMs: 0,
      nanoAttempted: false,
      nanoSucceeded: false,
      nanoTimedOut: false,
      regexFallback: false,
      expandQueryCalled: false,
      expandQuerySkippedConfident: false,
      keywordSupplementCalled: false,
      keywordSupplementSkipped: false,
      thresholdUsed: '0.4',
      chunksReturned: 0,
      topSimilarity: 0,
      suggestionFallbackTriggered: false,
      retrievalPath: 'rag',
      archetype: 'general',
    };
  }

  mark(name: string): void {
    this.marks.set(name, Date.now());
  }

  measure(field: keyof PipelineMetricsData, markName: string): number {
    const start = this.marks.get(markName);
    if (start == null) return 0;
    const elapsed = Date.now() - start;
    (this.data as any)[field] = elapsed;
    return elapsed;
  }

  set<K extends keyof PipelineMetricsData>(field: K, value: PipelineMetricsData[K]): void {
    this.data[field] = value;
  }

  inc(field: keyof PipelineMetricsData): void {
    (this.data as any)[field] = true;
  }

  /** Single JSON log line — truncates user content */
  toJSON(): string {
    return JSON.stringify(this.data);
  }
}

// ============================================
// AsyncLocalStorage for request-scoped metrics
// ============================================

const store = new AsyncLocalStorage<PipelineMetrics>();

export function createPipelineMetrics(requestId: string, accountId: string): PipelineMetrics {
  return new PipelineMetrics(requestId, accountId);
}

export function withMetrics<T>(metrics: PipelineMetrics, fn: () => Promise<T>): Promise<T> {
  return store.run(metrics, fn);
}

export function getMetrics(): PipelineMetrics | undefined {
  return store.getStore();
}

// ============================================
// Logging
// ============================================

export function logPipelineMetrics(m: PipelineMetrics): void {
  console.log(`[PIPELINE_METRICS] ${m.toJSON()}`);
}

// ============================================
// Aggregator — collects across requests for summary
// ============================================

const WINDOW_SIZE = 100; // Keep last N requests
const history: PipelineMetricsData[] = [];

export function recordMetrics(m: PipelineMetrics): void {
  history.push({ ...m.data });
  if (history.length > WINDOW_SIZE) history.shift();
}

export function getAggregatedSummary(): Record<string, unknown> {
  if (history.length === 0) return { requestCount: 0 };

  const n = history.length;
  const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const p = (arr: number[], pct: number) => {
    const s = sorted(arr);
    const idx = Math.min(Math.floor(s.length * pct), s.length - 1);
    return s[idx];
  };

  const totalMs = history.map(h => h.totalMs);
  const ttftMs = history.map(h => h.ttftMs);
  const krMs = history.map(h => h.knowledgeRetrievalMs);
  const chunks = history.map(h => h.chunksReturned);

  const expandCalled = history.filter(h => h.expandQueryCalled).length;
  const expandSkipped = history.filter(h => h.expandQuerySkippedConfident).length;
  const kwCalled = history.filter(h => h.keywordSupplementCalled).length;
  const kwSkipped = history.filter(h => h.keywordSupplementSkipped).length;
  const fallbackThreshold = history.filter(h => h.thresholdUsed !== '0.4').length;
  const nanoAttempted = history.filter(h => h.nanoAttempted).length;
  const nanoSucceeded = history.filter(h => h.nanoSucceeded).length;
  const nanoTimedOut = history.filter(h => h.nanoTimedOut).length;
  const sugFallback = history.filter(h => h.suggestionFallbackTriggered).length;

  return {
    requestCount: n,
    latency: {
      total: { p50: p(totalMs, 0.5), p95: p(totalMs, 0.95) },
      ttft: { p50: p(ttftMs, 0.5), p95: p(ttftMs, 0.95) },
      knowledgeRetrieval: { p50: p(krMs, 0.5), p95: p(krMs, 0.95) },
    },
    chunks: {
      avg: (chunks.reduce((s, c) => s + c, 0) / n).toFixed(1),
      p50: p(chunks, 0.5),
      p95: p(chunks, 0.95),
    },
    gates: {
      expandQueryCalled: expandCalled,
      expandQuerySkipped: expandSkipped,
      expandQueryReductionPct: n > 0 ? ((expandSkipped / Math.max(1, expandCalled + expandSkipped)) * 100).toFixed(1) + '%' : '0%',
      keywordSupplementCalled: kwCalled,
      keywordSupplementSkipped: kwSkipped,
      fallbackThresholdUsed: fallbackThreshold,
      fallbackThresholdPct: ((fallbackThreshold / n) * 100).toFixed(1) + '%',
    },
    understanding: {
      nanoAttempted,
      nanoSucceeded,
      nanoTimedOut,
      nanoSuccessRate: nanoAttempted > 0 ? ((nanoSucceeded / nanoAttempted) * 100).toFixed(1) + '%' : 'N/A',
    },
    suggestions: {
      fallbackTriggered: sugFallback,
      complianceRate: ((1 - sugFallback / n) * 100).toFixed(1) + '%',
    },
  };
}

/** Get raw history for debug endpoint */
export function getRawHistory(): PipelineMetricsData[] {
  return [...history];
}

/** Reset aggregator (for tests) */
export function resetAggregator(): void {
  history.length = 0;
}
