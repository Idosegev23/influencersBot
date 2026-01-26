-- Partnership Documents Table
-- Stores uploaded documents (contracts, quotes, briefs, etc.) with AI parsing

CREATE TABLE IF NOT EXISTS partnership_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partnership_id UUID REFERENCES partnerships(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  
  -- File info
  filename TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  
  -- Document type
  document_type TEXT CHECK (document_type IN ('quote', 'contract', 'brief', 'invoice', 'receipt', 'other')) DEFAULT 'other',
  
  -- AI Parsing
  parsing_status TEXT CHECK (parsing_status IN ('pending', 'processing', 'completed', 'failed', 'manual')) DEFAULT 'pending',
  parsed_data JSONB,
  confidence_score DECIMAL(3, 2), -- 0.00 to 1.00
  ai_model TEXT, -- 'gemini', 'claude', 'openai', 'manual'
  parsing_error TEXT,
  parsed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  uploaded_by UUID,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Full-text search
  search_vector TSVECTOR
);

-- Indexes
CREATE INDEX idx_partnership_documents_partnership ON partnership_documents(partnership_id);
CREATE INDEX idx_partnership_documents_account ON partnership_documents(account_id);
CREATE INDEX idx_partnership_documents_type ON partnership_documents(document_type);
CREATE INDEX idx_partnership_documents_status ON partnership_documents(parsing_status);
CREATE INDEX idx_partnership_documents_search ON partnership_documents USING GIN(search_vector);

-- Update timestamp trigger
CREATE TRIGGER update_partnership_documents_updated_at
  BEFORE UPDATE ON partnership_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update search vector trigger
CREATE OR REPLACE FUNCTION update_partnership_documents_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.filename, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.document_type, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.parsed_data::text, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_partnership_documents_search_vector_trigger
  BEFORE INSERT OR UPDATE OF filename, document_type, parsed_data
  ON partnership_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_partnership_documents_search_vector();

-- RLS Policies
ALTER TABLE partnership_documents ENABLE ROW LEVEL SECURITY;

-- Users can view documents for their partnerships
CREATE POLICY "Users can view their partnership documents"
  ON partnership_documents FOR SELECT
  USING (
    partnership_id IN (
      SELECT id FROM partnerships 
      WHERE account_id IN (
        SELECT id FROM accounts WHERE owner_user_id = auth.uid()
      )
    )
    OR account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Users can upload documents for their partnerships
CREATE POLICY "Users can upload partnership documents"
  ON partnership_documents FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Users can update their documents
CREATE POLICY "Users can update their partnership documents"
  ON partnership_documents FOR UPDATE
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Users can delete their documents
CREATE POLICY "Users can delete their partnership documents"
  ON partnership_documents FOR DELETE
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Storage bucket for documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('partnership-documents', 'partnership-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload their documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'partnership-documents' 
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'partnership-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'partnership-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM accounts WHERE owner_user_id = auth.uid()
    )
  );
