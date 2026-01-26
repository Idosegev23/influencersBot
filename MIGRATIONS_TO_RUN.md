# 🚀 הרצת 3 מיגרציות חדשות

## הוראות הרצה:

1. **פתח את Supabase Dashboard**: https://supabase.com/dashboard/project/zwmlqlzfjiminrokzcse
2. **לך ל-SQL Editor** (בתפריט צד שמאל)
3. **העתק והרץ כל מיגרציה בנפרד:**

---

## Migration 010: Storage Setup 📦

```sql
-- ==================================================
-- Migration 010: Supabase Storage Setup
-- ==================================================

-- Create Storage Bucket for partnership documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partnership-documents',
  'partnership-documents',
  false,
  52428800,
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

-- RLS Policies
CREATE POLICY "Influencers and agents can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'partnership-documents' AND
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('influencer', 'agent', 'admin')
  )
);

CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
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
    OR
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

GRANT EXECUTE ON FUNCTION public.get_account_id_from_storage_path(text) TO authenticated;
```

✅ **הרץ את הקוד למעלה** ולאחר מכן עבור למיגרציה הבאה.

---

## Migration 011: Notification Engine 🔔

**העתק את הקובץ המלא:** `supabase/migrations/011_notification_engine.sql`

(הקובץ ארוך מדי לכאן - 278 שורות)

---

## Migration 012: Coupons & ROI 💰

**העתק את הקובץ המלא:** `supabase/migrations/012_coupons_roi.sql`

(הקובץ ארוך מדי לכאן - 310 שורות)

---

## אימות

לאחר הרצת כל 3 המיגרציות, בדוק:

```sql
-- בדוק שה-tables נוצרו
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'notification_rules', 
  'follow_ups', 
  'in_app_notifications',
  'coupons',
  'coupon_usages',
  'roi_tracking'
);

-- בדוק Storage bucket
SELECT * FROM storage.buckets WHERE id = 'partnership-documents';

-- בדוק Notification Rules
SELECT COUNT(*) FROM public.notification_rules;
```

צריך לראות:
- ✅ 6 טבלאות חדשות
- ✅ 1 Storage bucket
- ✅ 8 notification rules

---

**📝 הערה:** אחרי ההרצה תוכל למחוק את הקובץ הזה.
