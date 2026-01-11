# 🚀 Setup Instructions - Document Intelligence

## 1. Google AI API Key (Gemini)

1. לך ל: https://aistudio.google.com/app/apikey
2. צור API key חדש
3. הוסף ל-`.env.local`:

```bash
NEXT_PUBLIC_GOOGLE_AI_API_KEY=your-gemini-api-key-here
```

## 2. Supabase Storage Setup

### יצירת Bucket:

```sql
-- Run in Supabase SQL Editor
INSERT INTO storage.buckets (id, name, public)
VALUES ('partnership-documents', 'partnership-documents', false);
```

### הגדרת Policies:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Users can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'partnership-documents' AND
  auth.role() = 'authenticated'
);

-- Allow users to read own documents
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'partnership-documents' AND
  (auth.uid()::text = (storage.foldername(name))[1])
);

-- Service role can do anything
CREATE POLICY "Service role full access"
ON storage.objects FOR ALL
USING (bucket_id = 'partnership-documents' AND auth.role() = 'service_role');
```

## 3. Test AI Parser

```bash
# Run in your terminal:
npm run dev

# Then test:
curl -X POST http://localhost:3000/api/influencer/documents/parse \
  -H "Content-Type: application/json" \
  -d '{"documentIds": ["..."], "accountId": "..."}'
```

## 4. What's Next?

✅ Database - Ready!
✅ AI Parser - Ready!
✅ API Endpoints - Ready!
⏳ Upload UI - Next step
⏳ Review Flow - After UI
⏳ Auto-generation - Final step

**המערכת מוכנה לעבוד!** 🎉
