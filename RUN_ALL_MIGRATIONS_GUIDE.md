# 🚀 מדריך להרצת כל המיגרציות

## ⏱️ זמן כולל: **15 דקות**

---

## 📋 סדר ההרצה (13 מיגרציות):

יש לך **13 מיגרציות** שצריך להריץ **לפי הסדר הזה**:

```
001 → 002 → 003 → 004 → 006 → 010 → 011 → 012 → 013 → 014 → 015 → 016 → 017
```

---

## 🎯 דרך 1: הרצה מהירה (מומלצת!)

### פתח Supabase Dashboard
1. https://supabase.com/dashboard
2. בחר את הפרויקט שלך
3. **SQL Editor** → **+ New Query**

### הרץ לפי קבוצות:

#### קבוצה 1: מיגרציות בסיסיות (001-003) ⏱️ 1 דקה
```sql
-- העתק והדבק את כל 3 המיגרציות ביחד:

-- [001] Personalization
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS greeting_message TEXT;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS suggested_questions JSONB DEFAULT '[]';
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS hide_branding BOOLEAN DEFAULT false;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS custom_logo_url TEXT;
CREATE INDEX IF NOT EXISTS idx_influencers_username ON influencers(username);
CREATE INDEX IF NOT EXISTS idx_influencers_subdomain ON influencers(subdomain);

-- [002] Scrape Settings  
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS scrape_settings JSONB DEFAULT '{"posts_limit": 50, "content_types": ["image", "video", "reel", "carousel"], "include_comments": false, "include_hashtags": true}'::jsonb;

-- [003] Phone & WhatsApp
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS phone_number TEXT, ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_influencers_phone ON influencers(phone_number);
```
לחץ **Run** → ✅ צפוי: הצלחה

---

#### קבוצה 2: מיגרציה 004 (v2 Engines) ⏱️ 2 דקות
פתח את הקובץ: `supabase/migrations/004_v2_engines.sql`

- העתק **הכל** (Cmd+A → Cmd+C)
- הדבק ב-SQL Editor
- לחץ **Run**
- ✅ צפוי: "Accounts, Events, Session Locks, Idempotency, Decision Rules, Cost Tracking"

---

#### קבוצה 3: מיגרציה 006 (Influencer OS Tables) ⏱️ 2 דקות
פתח את הקובץ: `supabase/migrations/006_influencer_os_tables.sql`

- העתק **הכל**
- הדבק ב-SQL Editor
- לחץ **Run**
- ✅ צפוי: "Partnerships, Tasks, Contracts, Invoices, Calendar Events, Notifications"

---

#### קבוצה 4: מיגרציות 010-015 (Core Features) ⏱️ 5 דקות
פתח את הקובץ: `RUN_ALL_MIGRATIONS.sql` (הקובץ הקיים!)

- העתק **הכל**
- הדבק ב-SQL Editor
- לחץ **Run**
- המתן **15-20 שניות**
- ✅ צפוי:
  ```
  ✅ [010] Storage bucket created
  ✅ [011] Notification Engine created
  ✅ [012] Coupons & ROI created
  ✅ [014] Calendar Integration created
  ✅ [015] Chatbot Upgrades + Social Listening created
  🎉 כל 5 המיגרציות הורצו בהצלחה!
  ```

---

#### קבוצה 5: מיגרציה 013 (Brand Communications) ⏱️ 2 דקות
פתח את הקובץ: `supabase/migrations/013_brand_communications.sql`

- העתק **הכל**
- הדבק ב-SQL Editor
- לחץ **Run**
- ✅ צפוי: "✅ Brand Communications Hub tables created!"

---

#### קבוצה 6: מיגרציות 016-017 (New Features) ⏱️ 3 דקות

**מיגרציה 016:**
- פתח: `supabase/migrations/016_add_copy_tracking.sql`
- העתק הכל
- הדבק ב-SQL Editor
- לחץ **Run**
- ✅ צפוי: "✅ Copy tracking added to coupons!"

**מיגרציה 017:**
- פתח: `supabase/migrations/017_satisfaction_surveys.sql`
- העתק הכל
- הדבק ב-SQL Editor
- לחץ **Run**
- ✅ צפוי: "✅ Satisfaction surveys system created!"

---

## 🎉 סיימת!

כל 13 המיגרציות רצו בהצלחה! 

---

## ✅ איך לבדוק שהכל עבד?

### בדיקה מהירה:
1. **Table Editor** → וודא שיש לך את הטבלאות האלה:
   - ✅ `accounts`
   - ✅ `events`
   - ✅ `partnerships`
   - ✅ `tasks`
   - ✅ `invoices`
   - ✅ `coupons`
   - ✅ `coupon_copies` (חדש!)
   - ✅ `satisfaction_surveys` (חדש!)
   - ✅ `brand_communications` (חדש!)
   - ✅ `notification_rules`
   - ✅ `chatbot_persona`
   - ✅ `social_listening_mentions`
   - ✅ `calendar_connections`

2. **SQL Query:**
```sql
-- ספירת כל הטבלאות
SELECT COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema = 'public';
-- צריך להיות לפחות 20 טבלאות
```

---

## 🔍 טבלת סיכום:

| מס' | שם | תיאור | זמן | סטטוס |
|-----|-----|--------|------|--------|
| 001 | Personalization | שדות התאמה אישית | 10 שניות | ⬜ |
| 002 | Scrape Settings | הגדרות scraping | 5 שניות | ⬜ |
| 003 | Phone & WhatsApp | טלפון ו-WhatsApp | 5 שניות | ⬜ |
| 004 | v2 Engines | מנועי Event Sourcing | 2 דקות | ⬜ |
| 006 | Influencer OS | שת"פים, משימות, חשבוניות | 2 דקות | ⬜ |
| 010 | Storage Setup | Bucket לקבצים | 30 שניות | ⬜ |
| 011 | Notification Engine | מנוע התראות | 1 דקה | ⬜ |
| 012 | Coupons & ROI | קופונים ו-ROI | 1 דקה | ⬜ |
| 013 | Brand Communications | תקשורת עם מותגים | 2 דקות | ⬜ |
| 014 | Calendar Integration | אינטגרציה ליומן | 1 דקה | ⬜ |
| 015 | Chatbot Upgrades | פרסונה + Social Listening | 2 דקות | ⬜ |
| 016 | Copy Tracking | מעקב העתקות קופון | 1 דקה | ⬜ |
| 017 | Satisfaction Surveys | סקרי שביעות רצון | 1 דקה | ⬜ |

**סה"כ:** 13 מיגרציות | ~15 דקות

---

## 🐛 אם יש שגיאה:

### "relation already exists"
✅ **זה בסדר!** המיגרציה כבר רצה. תמשיך הלאה.

### "relation does not exist"
❌ **בעיה!** דלגת על מיגרציה. חזור ל migrate הקודמת.

### "permission denied"
❌ **בעיה!** ודא שאתה מחובר כ-postgres/service_role.

---

## 🎯 אחרי שסיימת:

**יש לך עכשיו:**
- ✅ 20+ טבלאות
- ✅ 60+ indexes
- ✅ 50+ RLS policies
- ✅ 15+ helper functions
- ✅ **מערכת מלאה ב-100%!** 🚀

**המערכת מוכנה לשימוש מלא!** 💯

---

## 📞 צריך עזרה?

אם משהו לא עובד:
1. ✅ שלח לי את השגיאה
2. ✅ ציין באיזו מיגרציה זה קרה
3. ✅ צילום מסך (אם אפשר)

**בהצלחה!** 💪
