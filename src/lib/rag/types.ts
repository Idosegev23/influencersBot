/**
 * RAG Pipeline Types
 * Shared types for ingestion, retrieval, reranking, and answering.
 */

// ============================================
// Entity types matching our content sources
// ============================================

export type EntityType =
  | 'post'
  | 'transcription'
  | 'highlight'
  | 'partnership'
  | 'coupon'
  | 'knowledge_base'
  | 'document'
  | 'website';

export const ENTITY_TYPE_SOURCE_TABLE: Record<EntityType, string> = {
  post: 'instagram_posts',
  transcription: 'instagram_transcriptions',
  highlight: 'instagram_highlights',
  partnership: 'partnerships',
  coupon: 'coupons',
  knowledge_base: 'chatbot_knowledge_base',
  document: 'partnership_documents',
  website: 'instagram_bio_websites',
};

// ============================================
// Document & Chunk
// ============================================

export interface RagDocument {
  id: string;
  account_id: string;
  owner_id?: string | null;
  entity_type: EntityType;
  source_id?: string | null;
  title: string;
  source?: string | null;
  status: 'active' | 'archived' | 'deleted';
  chunk_count: number;
  total_tokens: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RagChunk {
  id: string;
  document_id: string;
  account_id: string;
  entity_type: EntityType;
  chunk_index: number;
  chunk_text: string;
  embedding?: number[] | null;
  token_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================
// Ingestion
// ============================================

export interface IngestInput {
  accountId: string;
  entityType: EntityType;
  sourceId?: string;
  title: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface IngestResult {
  documentId: string;
  chunksCreated: number;
  totalTokens: number;
  durationMs: number;
}

// ============================================
// Retrieval
// ============================================

export type QueryType = 'structured' | 'unstructured' | 'mixed';

export interface RetrieveInput {
  accountId: string;
  userId?: string;
  query: string;
  conversationSummary?: string;
  topK?: number;
  entityTypes?: EntityType[];
  timeWindow?: { after?: string; before?: string };
  metadataFilter?: Record<string, unknown>;
}

export interface RetrievedSource {
  sourceId: string;
  documentId: string;
  entityType: EntityType;
  title: string;
  excerpt: string;
  updatedAt: string;
  confidence: number;
  chunkIndex: number;
  metadata: Record<string, unknown>;
}

export interface RetrievalDebug {
  queryType: QueryType;
  appliedFilters: {
    accountId: string;
    entityTypes: EntityType[] | null;
    timeWindow: { after?: string; before?: string } | null;
    metadataFilter: Record<string, unknown> | null;
  };
  candidateCount: number;
  candidateIds: string[];
  similarityScores: Record<string, number>;
  rerankScores: Record<string, number>;
  finalSourceIds: string[];
  durationMs: number;
  stages: {
    classificationMs: number;
    filterMs: number;
    vectorSearchMs: number;
    rerankMs: number;
    contextBuildMs: number;
  };
}

export interface RetrievalResult {
  sources: RetrievedSource[];
  debug: RetrievalDebug;
}

// ============================================
// Answering
// ============================================

export interface AnswerInput {
  accountId: string;
  userId?: string;
  query: string;
  conversationSummary?: string;
}

export interface AnswerResult {
  answer: string;
  sources: RetrievedSource[];
  debug: RetrievalDebug;
  noSourcesFound: boolean;
  followUpQuestion?: string;
}

// ============================================
// Reranking
// ============================================

export interface RerankCandidate {
  id: string;
  text: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface RerankResult {
  id: string;
  score: number;
  originalSimilarity: number;
}
