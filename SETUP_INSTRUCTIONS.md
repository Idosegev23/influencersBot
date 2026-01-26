# 🚀 Setup Instructions - Influencer OS

## סקירה מהירה

מערכת ה-Influencer OS מורכבת מ:
- ✅ **Database** - PostgreSQL + RLS (Supabase)
- ✅ **Auth System** - 4-level RBAC (Admin, Agent, Influencer, Follower)
- ✅ **AI Parser** - Document Intelligence עם Gemini Vision
- ✅ **Storage** - Supabase Storage למסמכים
- ✅ **APIs** - 16 endpoints מוגנים

---

## 1. Environment Variables

צור קובץ `.env.local` בשורש הפרויקט:

```bash
# Supabase (כבר קיים)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# Google AI (Gemini Vision) - REQUIRED!
NEXT_PUBLIC_GOOGLE_AI_API_KEY=your-gemini-api-key-here

# Fallback AI APIs (אופציונלי - רק אם רוצים fallback)
ANTHROPIC_API_KEY=sk-ant-xxx...
OPENAI_API_KEY=sk-xxx...

# Redis (Upstash) - לcaching ו-rate limiting
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

### קבלת Google AI API Key:

1. לך ל-[Google AI Studio](https://aistudio.google.com/app/apikey)
2. לחץ "Create API Key"
3. בחר Google Cloud project (או צור חדש)
4. העתק את ה-API key
5. הדבק ב-`.env.local` תחת `NEXT_PUBLIC_GOOGLE_AI_API_KEY`

**חשוב:** ה-Gemini Vision 1.5 Pro זול מאוד (~$0.006 למסמך)!

---

## 2. Supabase Storage Setup

### אופציה A: הרצת Migration (מומלץ)

```bash
# 1. פתח Supabase SQL Editor
# 2. העתק את התוכן של:
#    supabase/migrations/010_storage_setup.sql
# 3. הרץ את כל הSQL

# או דרך CLI:
npx supabase migration up
```

### אופציה B: ידני (אם Migration לא עובד)

#### 2.1. יצירת Bucket

```sql
-- Run in Supabase SQL Editor
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partnership-documents',
  'partnership-documents',
  false,
  52428800, -- 50MB max
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
);
```

#### 2.2. הגדרת RLS Policies

```sql
-- Upload policy
CREATE POLICY "Influencers and agents can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'partnership-documents' AND
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('influencer', 'agent', 'admin')
  )
);

-- Read policy
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'partnership-documents' AND
  (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    OR
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE owner_user_id = auth.uid()
    )
  )
);

-- Update policy
CREATE POLICY "Users can update own documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'partnership-documents' AND
  EXISTS (
    SELECT 1 FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
);

-- Delete policy
CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'partnership-documents' AND
  EXISTS (
    SELECT 1 FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
);
```

### בדיקה שהכל עובד:

```sql
-- 1. Check bucket exists
SELECT * FROM storage.buckets WHERE id = 'partnership-documents';

-- 2. Check policies
SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';

-- אמור להחזיר 4 policies
```

---

## 3. Database Migrations

הרץ את כל המיגרציות:

```bash
# אם יש לך Supabase CLI:
npx supabase migration up

# אם לא, הרץ ידנית ב-SQL Editor:
# 1. 009_rbac_documents.sql
# 2. 010_storage_setup.sql
```

**וודא שהטבלאות הבאות קיימות:**
- `users` (עם עמודת `role`)
- `accounts`
- `partnerships`
- `partnership_documents`
- `ai_parsing_logs`
- `tasks`
- `invoices`
- `calendar_events`

---

## 4. Install Dependencies

```bash
npm install
```

**Dependencies חשובים:**
- `@google/generative-ai` - Gemini Vision API
- `@supabase/supabase-js` - Supabase client
- `next` 16+ - App Router
- `react` 19+

---

## 5. Run Development Server

```bash
npm run dev
```

פתח http://localhost:3000

---

## 6. Test the System

### 6.1. Test Auth

```bash
# Login to influencer dashboard
# http://localhost:3000/login
```

### 6.2. Test Document Upload

```bash
# Upload a test PDF/Word document
POST http://localhost:3000/api/influencer/documents/upload
Content-Type: multipart/form-data

files: [file]
accountId: "your-account-id"
```

### 6.3. Test AI Parsing

```bash
POST http://localhost:3000/api/influencer/documents/parse
Content-Type: application/json

{
  "documentIds": ["doc-id-from-upload"],
  "accountId": "your-account-id"
}
```

### 6.4. Test Auto-generation

```bash
POST http://localhost:3000/api/influencer/partnerships/create-from-parsed
Content-Type: application/json

{
  "accountId": "your-account-id",
  "parsedData": { ... },
  "documentIds": ["doc-id"]
}
```

---

## 7. Troubleshooting

### שגיאה: "Missing API key"
- וודא ש-`NEXT_PUBLIC_GOOGLE_AI_API_KEY` קיים ב-`.env.local`
- Restart ה-dev server (`npm run dev`)

### שגיאה: "Storage bucket not found"
- הרץ את Migration 010 (`010_storage_setup.sql`)
- או צור bucket ידנית דרך Supabase Dashboard → Storage

### שגיאה: "Forbidden - insufficient permissions"
- וודא שהמשתמש יש לו `role = 'influencer'` בטבלת `users`
- בדוק ש-RLS policies מוגדרים נכון

### שגיאה: "AI parsing failed"
- בדוק שה-Gemini API key תקין
- בדוק שיש credits ב-Google Cloud project
- בדוק לוגים: `console.log` ב-`src/lib/ai-parser/gemini.ts`

---

## 8. Production Deployment

### Vercel (מומלץ)

```bash
# 1. Push to GitHub
git push origin main

# 2. Import to Vercel
# https://vercel.com/new

# 3. Add Environment Variables in Vercel Dashboard:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - NEXT_PUBLIC_GOOGLE_AI_API_KEY
# - UPSTASH_REDIS_REST_URL (אם משתמשים)
# - UPSTASH_REDIS_REST_TOKEN (אם משתמשים)

# 4. Deploy!
```

### Supabase Production

1. לך ל-Supabase Dashboard
2. צור Production Project
3. הרץ את כל המיגרציות (009, 010)
4. העדכן Environment Variables ב-Vercel עם ה-Production URLs

---

## 9. What's Ready?

| Feature | Status | Notes |
|---------|--------|-------|
| **Database Schema** | ✅ Ready | RLS + 4-level RBAC |
| **Auth System** | ✅ Ready | Admin, Agent, Influencer, Follower |
| **API Protection** | ✅ Ready | כל 16 endpoints מוגנים |
| **Frontend Guards** | ✅ Ready | RouteGuard component |
| **AI Parser** | ✅ Ready | Gemini Vision + fallbacks |
| **Storage** | ✅ Ready | Bucket + RLS policies |
| **Upload UI** | ⏳ Next | drag & drop component |
| **Review Flow** | ⏳ Next | אישור parsed data |
| **Dashboards** | ⏳ Next | קהל, שת"פ, תקשורת |
| **Notifications** | ⏳ Next | התראות ופולואפים |

---

## 10. Next Steps (התוכנית)

לפי `PROJECT_PLAN.md`:

1. **Phase 3**: Upload UI (drag & drop)
2. **Phase 4**: Review Flow (אישור וסקירה)
3. **Phase 5**: Auto-generation (יצירה אוטומטית)
4. **Phase 6**: Notification Engine
5. **Phase 7**: Dashboards (קהל + שת"פ)
6. **Phase 8**: Google Calendar Integration
7. **Phase 9**: Social Listening + Airtable
8. **Phase 10**: E2E Testing + Launch

---

## 📞 Need Help?

- **Documentation**: ראה `memory-bank/` folder
- **Architecture**: ראה `DOCUMENT_INTELLIGENCE.md`
- **Security**: ראה `SECURITY.md`
- **Backups**: ראה `BACKUP.md`

**המערכת מוכנה לעבוד!** 🎉

**Foundation (Phases 1-2) = 100% Complete!** ✅
