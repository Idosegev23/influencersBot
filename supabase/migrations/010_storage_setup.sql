-- ==================================================
-- Migration 010: Supabase Storage Setup
-- ==================================================
-- תיאור: הקמת Storage bucket + RLS policies למסמכי שת"פ
-- תאריך: 2026-01-14
--
-- שימוש:
-- 1. העתק את כל הקוד
-- 2. הדבק ב-Supabase SQL Editor
-- 3. הרץ
-- ==================================================

-- Create Storage Bucket for partnership documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partnership-documents',
  'partnership-documents',
  false, -- Not public, require authentication
  52428800, -- 50MB max file size
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ==================================================
-- RLS Policies for Storage
-- ==================================================

-- Policy 1: Upload - influencer, agent, admin can upload
CREATE POLICY "Influencers and agents can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'partnership-documents' AND
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('influencer', 'agent', 'admin')
  )
);

-- Policy 2: Read own files
-- File structure: {account_id}/documents/{timestamp}_{filename}
-- Parse account_id from path
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'partnership-documents' AND
  (
    -- Admin sees everything
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR
    -- Influencer sees own account files
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE 
        owner_user_id = auth.uid() AND
        name LIKE (
          SELECT split_part(name, '/', 1) 
          FROM storage.objects 
          WHERE id = objects.id
        ) || '%'
    )
    OR
    -- Agent sees assigned influencer files
    EXISTS (
      SELECT 1 
      FROM public.agent_influencers ai
      JOIN public.accounts a ON a.id = ai.influencer_account_id
      WHERE 
        ai.agent_id = auth.uid() AND
        name LIKE (
          SELECT split_part(name, '/', 1) 
          FROM storage.objects 
          WHERE id = objects.id
        ) || '%'
    )
  )
);

-- Policy 3: Update - only own files
CREATE POLICY "Users can update own documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'partnership-documents' AND
  (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE 
        owner_user_id = auth.uid() AND
        name LIKE (
          SELECT split_part(name, '/', 1) 
          FROM storage.objects 
          WHERE id = objects.id
        ) || '%'
    )
  )
);

-- Policy 4: Delete - only own files
CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'partnership-documents' AND
  (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE 
        owner_user_id = auth.uid() AND
        name LIKE (
          SELECT split_part(name, '/', 1) 
          FROM storage.objects 
          WHERE id = objects.id
        ) || '%'
    )
  )
);

-- ==================================================
-- Helper Function: Get account from storage path
-- ==================================================

CREATE OR REPLACE FUNCTION public.get_account_id_from_storage_path(storage_path text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id 
  FROM accounts 
  WHERE id::text = split_part(storage_path, '/', 1)
  LIMIT 1;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_account_id_from_storage_path(text) TO authenticated;

-- ==================================================
-- Verification Queries
-- ==================================================

-- Run these to verify setup:
/*
-- 1. Check bucket exists
SELECT * FROM storage.buckets WHERE id = 'partnership-documents';

-- 2. Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';

-- 3. Test upload (run from client):
-- const { data, error } = await supabase.storage
--   .from('partnership-documents')
--   .upload('test-file.pdf', file);
*/

-- ==================================================
-- Success Message
-- ==================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Storage bucket "partnership-documents" created successfully!';
  RAISE NOTICE '✅ RLS policies configured';
  RAISE NOTICE '✅ Helper functions created';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '1. Add NEXT_PUBLIC_GOOGLE_AI_API_KEY to .env.local';
  RAISE NOTICE '2. Test upload from client';
  RAISE NOTICE '3. Run integration tests';
END$$;
