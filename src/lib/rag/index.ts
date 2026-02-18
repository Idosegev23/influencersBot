/**
 * RAG Pipeline - Public API
 *
 * Usage:
 *   import { ingestDocument, retrieveContext, answerQuestion } from '@/lib/rag';
 */

// Ingestion
export { ingestDocument, ingestAllForAccount } from './ingest';

// Retrieval
export { retrieveContext, formatSourcesForLLM } from './retrieve';

// Answering
export { answerQuestion } from './answer';

// Reranking
export { rerankCandidates } from './rerank';

// Chunking (useful for testing)
export { chunkText, normalizeText, estimateTokens } from './chunker';

// Embeddings
export { generateEmbedding, generateEmbeddings } from './embeddings';

// Types
export type {
  EntityType,
  QueryType,
  RagDocument,
  RagChunk,
  IngestInput,
  IngestResult,
  RetrieveInput,
  RetrievedSource,
  RetrievalDebug,
  RetrievalResult,
  AnswerInput,
  AnswerResult,
  RerankCandidate,
  RerankResult,
} from './types';

// Logger
export { createLogger } from './logger';
