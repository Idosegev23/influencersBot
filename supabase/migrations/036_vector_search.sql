-- Migration 036: Vector Search (pgvector + RAG tables)
-- Enables semantic search via embeddings for all influencer content.
-- Works with the existing RAG pipeline in /src/lib/rag/

-- ============================================
-- 1. Enable pgvector extension
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 2. Documents table (content registry)
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  source TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_account_id
  ON documents(account_id);
CREATE INDEX IF NOT EXISTS idx_documents_account_type
  ON documents(account_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_documents_account_source
  ON documents(account_id, entity_type, source_id);
CREATE INDEX IF NOT EXISTS idx_documents_status
  ON documents(account_id, status);

-- Unique constraint for upserts (one document per source)
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_unique_source
  ON documents(account_id, entity_type, source_id)
  WHERE source_id IS NOT NULL;

-- ============================================
-- 3. Document chunks table (with vector column)
-- ============================================
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  token_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- B-tree indexes
CREATE INDEX IF NOT EXISTS idx_chunks_document_id
  ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_account_id
  ON document_chunks(account_id);
CREATE INDEX IF NOT EXISTS idx_chunks_account_type
  ON document_chunks(account_id, entity_type);

-- HNSW vector index (fast approximate nearest-neighbor search)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================
-- 4. match_document_chunks RPC function
-- ============================================
CREATE OR REPLACE FUNCTION match_document_chunks(
  p_account_id UUID,
  p_embedding TEXT,
  p_match_count INTEGER DEFAULT 20,
  p_match_threshold FLOAT DEFAULT 0.25,
  p_entity_types TEXT[] DEFAULT NULL,
  p_updated_after TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  entity_type TEXT,
  chunk_index INTEGER,
  chunk_text TEXT,
  token_count INTEGER,
  metadata JSONB,
  similarity FLOAT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.entity_type,
    dc.chunk_index,
    dc.chunk_text,
    dc.token_count,
    dc.metadata,
    (1 - (dc.embedding <=> p_embedding::vector))::FLOAT AS similarity,
    dc.updated_at
  FROM document_chunks dc
  INNER JOIN documents d ON d.id = dc.document_id
  WHERE dc.account_id = p_account_id
    AND d.status = 'active'
    AND dc.embedding IS NOT NULL
    AND (1 - (dc.embedding <=> p_embedding::vector)) > p_match_threshold
    AND (p_entity_types IS NULL OR dc.entity_type = ANY(p_entity_types))
    AND (p_updated_after IS NULL OR dc.updated_at >= p_updated_after)
  ORDER BY dc.embedding <=> p_embedding::vector
  LIMIT p_match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_document_chunks(UUID, TEXT, INTEGER, FLOAT, TEXT[], TIMESTAMPTZ)
  TO authenticated, anon;

-- ============================================
-- 5. RLS Policies
-- ============================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Documents policies
CREATE POLICY "documents_select_own" ON documents FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "documents_insert_own" ON documents FOR INSERT
  WITH CHECK (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "documents_update_own" ON documents FOR UPDATE
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "documents_delete_own" ON documents FOR DELETE
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

-- Document chunks policies
CREATE POLICY "chunks_select_own" ON document_chunks FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "chunks_insert_own" ON document_chunks FOR INSERT
  WITH CHECK (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "chunks_update_own" ON document_chunks FOR UPDATE
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "chunks_delete_own" ON document_chunks FOR DELETE
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

-- ============================================
-- 6. Updated_at triggers (reuse existing function)
-- ============================================
DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS document_chunks_updated_at ON document_chunks;
CREATE TRIGGER document_chunks_updated_at
  BEFORE UPDATE ON document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. Analyze
-- ============================================
ANALYZE documents;
ANALYZE document_chunks;

COMMENT ON TABLE documents IS 'RAG document registry — maps source content to chunked embeddings';
COMMENT ON TABLE document_chunks IS 'RAG chunks with vector(1536) embeddings for semantic search';
COMMENT ON FUNCTION match_document_chunks IS 'Vector similarity search via pgvector HNSW index';
