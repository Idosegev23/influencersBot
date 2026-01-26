# הרצת Migration 019 - Partnership Documents

## מה ה-migration הזה עושה?
יוצר טבלת `partnership_documents` לאחסון מסמכים (חוזים, הצעות מחיר, בריפים) עם AI parsing.

## איך להריץ?

### אפשרות 1: דרך Supabase Dashboard (מומלץ)
1. לך ל: https://supabase.com/dashboard
2. בחר את הפרויקט שלך
3. SQL Editor
4. העתק את כל התוכן מ-`supabase/migrations/019_partnership_documents.sql`
5. הדבק והרץ

### אפשרות 2: דרך CLI
```bash
# בתיקיית הפרויקט
supabase db push

# או ספציפית:
supabase db execute -f supabase/migrations/019_partnership_documents.sql
```

### אפשרות 3: דרך psql
```bash
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  -f supabase/migrations/019_partnership_documents.sql
```

## איך לבדוק שזה עבד?
```sql
-- בדיקה 1: הטבלה נוצרה
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'partnership_documents';

-- בדיקה 2: הבאקט נוצר
SELECT * FROM storage.buckets WHERE id = 'partnership-documents';

-- בדיקה 3: ה-policies קיימות
SELECT * FROM pg_policies WHERE tablename = 'partnership_documents';
```

## אחרי ההרצה
- ✅ העלאת מסמכים תעבוד
- ✅ AI parsing יוכל לשמור נתונים
- ✅ Storage bucket יהיה מוכן

## בעיות אפשריות?
- אם יש שגיאה על `uuid_generate_v4()` - וודא ש-extension קיים:
  ```sql
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  ```
