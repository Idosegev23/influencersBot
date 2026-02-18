# RAG Pipeline Architecture

## Overview

A hybrid retrieval-augmented generation (RAG) system built on Supabase (Postgres + pgvector) that provides accurate, fast, and grounded answers from influencer content.

```
User Query
    │
    ▼
┌──────────────────────┐
│  Query Classification │  ← Structured / Unstructured / Mixed
└──────────┬───────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐  ┌──────────────┐
│SQL/FTS │  │ Hard Filters  │  ← account_id, entity_type, time, metadata
│(struct)│  │              │
└────┬───┘  └──────┬───────┘
     │             │
     │             ▼
     │      ┌──────────────┐
     │      │ Vector Search │  ← pgvector HNSW (cosine similarity)
     │      │  top 20      │
     │      └──────┬───────┘
     │             │
     │             ▼
     │      ┌──────────────┐
     │      │   Rerank     │  ← LLM-based scoring (GPT-4.1 Nano)
     │      │  top 3-6     │
     │      └──────┬───────┘
     │             │
     └──────┬──────┘
            │
            ▼
     ┌──────────────┐
     │Context Builder│  ← Machine-readable XML format
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │  LLM Answer  │  ← Strict grounding + citations
     └──────────────┘
```

## Data Model

### Tables

| Table | Purpose |
|-------|---------|
| `documents` | Registry of all content sources (posts, transcriptions, partnerships, etc.) |
| `document_chunks` | Chunked text with vector embeddings (1536-dim, OpenAI text-embedding-3-small) |

### Key Fields

**documents:**
- `account_id` — tenant isolation
- `entity_type` — content type (post, transcription, partnership, coupon, etc.)
- `source_id` — FK to the original source table
- `status` — active/archived/deleted

**document_chunks:**
- `document_id` — parent document
- `chunk_text` — the text content
- `embedding` — vector(1536) for semantic search
- `token_count` — for budget management

### Indexes

- HNSW vector index on `document_chunks.embedding` (cosine distance)
- B-tree indexes on `account_id`, `entity_type`, `updated_at`, `status`
- Unique constraint on `(account_id, entity_type, source_id)` for upserts

## Ingestion Pipeline

```
Source Table → Normalize → Chunk → Embed → Store
```

1. **Source extraction**: Reads from existing tables (instagram_posts, transcriptions, partnerships, etc.)
2. **Normalization**: Whitespace cleanup, null byte removal, line break normalization
3. **Chunking**: 250-500 tokens per chunk, 12% overlap, smart boundary detection (paragraphs > sentences > clauses > words)
4. **Embedding**: OpenAI text-embedding-3-small (batched, 1536 dimensions)
5. **Storage**: Upsert to documents + document_chunks (replaces old if source_id exists)

### Supported Entity Types

| Type | Source Table | Content |
|------|-------------|---------|
| `post` | instagram_posts | Captions + hashtags |
| `transcription` | instagram_transcriptions | Video transcriptions + on-screen text |
| `partnership` | partnerships | Brand name, brief, scope, deliverables |
| `coupon` | coupons | Code, discount details, brand info |
| `knowledge_base` | chatbot_knowledge_base | Custom FAQ and info |
| `website` | instagram_bio_websites | Scraped website content |
| `document` | partnership_documents | Uploaded PDFs/contracts |
| `highlight` | instagram_highlights | Highlight titles + items |

## Retrieval Pipeline

### Step 1: Query Classification

Classifies queries as:
- **Structured**: Numeric/aggregate questions → uses SQL/FTS
- **Unstructured**: Semantic questions → uses vector search
- **Mixed**: Both → combines SQL facts + vector context

Also infers:
- Entity type hints from keywords (English + Hebrew)
- Time window from temporal phrases

### Step 2: Hard Filters

Pre-filters before vector search:
- `account_id` (tenant isolation, always applied)
- `entity_type` (inferred or user-specified)
- `updated_after` (time window)
- Metadata filters (key-value match)

### Step 3: Vector Search

Uses Supabase RPC `match_document_chunks`:
- Searches within pre-filtered set
- Cosine similarity via HNSW index
- Returns top 20 candidates above threshold (0.25)

### Step 4: Rerank

LLM-based reranking with GPT-4.1 Nano:
- Scores each candidate 0-10 for relevance
- Combines: `0.4 × similarity + 0.6 × rerank_score`
- Returns top 3-6 results
- Graceful fallback to similarity-only if LLM fails

### Step 5: Context Builder

Formats sources as machine-readable XML:
```xml
<sources>
  <source id="..." type="post" confidence="0.87">
    <title>...</title>
    <updated>...</updated>
    <content>...</content>
  </source>
</sources>
```

## Answering Wrapper

1. Calls `retrieveContext()` for sources
2. If no sources: returns "I don't have enough information" + one precise follow-up question
3. If sources found: calls LLM with strict context + citation requirement
4. Returns answer with source IDs as citations

## Caching

Leverages existing L1 (in-memory LRU) + L2 (Redis) cache:
- Query normalization results cached
- Account/user settings cached
- Repeated retrieval calls keyed by `accountId + normalized query`
- Short TTL with invalidation on document updates

## CLI

```bash
# Ingest all content for an account
npx tsx scripts/rag-cli.ts ingest --account <id>

# Ingest specific types
npx tsx scripts/rag-cli.ts ingest --account <id> --types post,transcription

# Ingest a file
npx tsx scripts/rag-cli.ts ingest-file --account <id> --file doc.txt --title "My Doc"

# Ask a question
npx tsx scripts/rag-cli.ts ask --account <id> --query "what coupons are available?"

# Run evaluation
npx tsx scripts/rag-cli.ts eval --account <id>

# Show stats
npx tsx scripts/rag-cli.ts stats --account <id>
```

## File Structure

```
src/lib/rag/
├── index.ts          # Public API exports
├── types.ts          # Shared types
├── logger.ts         # Structured JSON logging with PII redaction
├── chunker.ts        # Text normalization and chunking
├── embeddings.ts     # OpenAI embedding generation
├── ingest.ts         # Ingestion pipeline
├── retrieve.ts       # Retrieval pipeline (classify → filter → search → rerank)
├── rerank.ts         # LLM-based reranking
├── answer.ts         # Answering wrapper with citations
└── RAG_ARCHITECTURE.md  # This file

scripts/
└── rag-cli.ts        # CLI for ingest, ask, eval, stats

tests/unit/
├── rag-chunker.test.ts   # Chunking tests
└── rag-retrieve.test.ts  # Classification and filter tests
```

## Performance Characteristics

| Operation | Expected Latency |
|-----------|-----------------|
| Embedding generation (single) | ~100ms |
| Vector search (20 results) | ~50-100ms |
| Reranking (20 candidates) | ~200-400ms |
| Full retrieval pipeline | ~500-800ms |
| Full answer pipeline | ~1-2s |

## Integration Points

- **Existing hybrid retrieval**: The RAG pipeline can replace or complement the existing `hybrid-retrieval.ts` FTS-based system
- **Existing cache**: Uses `@/lib/cache` (L1) for query caching
- **Existing Supabase client**: Uses `@/lib/supabase/server` for DB access
- **Existing engines**: Can be integrated into the Understanding → Decision → Policy pipeline
