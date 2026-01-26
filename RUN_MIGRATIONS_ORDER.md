# 🚀 סדר הרצת מיגרציות - אחת אחת

## ⚠️ חשוב: הרץ לפי הסדר הזה בדיוק!

כל מיגרציה **תלויה** בקודמת. אם תדלג - תקבל שגיאות!

---

## 📋 הסדר המלא (13 מיגרציות):

### ✅ שלב 1: הרץ את המיגרציה הראשונה
```
📁 supabase/migrations/001_add_personalization_fields.sql
```
**זמן:** 10 שניות  
**מה זה עושה:** מוסיף שדות personalization לטבלת influencers

**צפוי:**
```
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
COMMENT
COMMENT
COMMENT
COMMENT
CREATE INDEX (אם לא קיים)
CREATE INDEX (אם לא קיים)
```

---

### ✅ שלב 2: הרץ את המיגרציה השנייה
```
📁 supabase/migrations/002_add_scrape_settings.sql
```
**זמן:** 5 שניות  
**מה זה עושה:** מוסיף scrape_settings לטבלת influencers

**צפוי:**
```
ALTER TABLE
COMMENT
```

---

### ✅ שלב 3: הרץ את המיגרציה השלישית
```
📁 supabase/migrations/003_add_phone_and_whatsapp.sql
```
**זמן:** 5 שניות  
**מה זה עושה:** מוסיף phone_number ו-whatsapp_enabled

**צפוי:**
```
ALTER TABLE
CREATE INDEX
COMMENT
COMMENT
```

---

### ✅ שלב 4: הרץ את המיגרציה הרביעית (חשוב!)
```
📁 supabase/migrations/004_v2_engines.sql
```
**זמן:** 2 דקות  
**מה זה עושה:** יוצר accounts, events, session_locks, idempotency_keys, decision_rules, cost_tracking

**צפוי:**
```
CREATE TABLE accounts
CREATE TABLE events
CREATE TABLE session_locks
CREATE FUNCTION acquire_session_lock
CREATE FUNCTION release_session_lock
CREATE TABLE idempotency_keys
CREATE FUNCTION claim_idempotency_key
CREATE TABLE decision_rules
CREATE TABLE cost_tracking
CREATE FUNCTION increment_cost
ALTER TABLE chat_sessions (אם קיימת)
CREATE POLICY ... (הרבה!)
```

⚠️ **זה קובץ גדול - תן לו זמן!**

---

### ✅ שלב 5: הרץ את המיגרציה השישית
```
📁 supabase/migrations/006_influencer_os_tables.sql
```
**זמן:** 2 דקות  
**מה זה עושה:** יוצר partnerships, tasks, contracts, invoices, calendar_events, notifications

**צפוי:**
```
CREATE TABLE partnerships
CREATE TABLE tasks
CREATE TABLE contracts
CREATE TABLE invoices
CREATE TABLE calendar_events (שים לב - זה calendar_events הישן, לא כמו 014)
CREATE TABLE notifications
CREATE POLICY ... (הרבה!)
CREATE TRIGGER ...
CREATE FUNCTION get_upcoming_tasks
CREATE FUNCTION get_overdue_invoices
```

⚠️ **זה גם קובץ גדול - תן לו זמן!**

---

### 🎯 נקודת ביקורת - האם הכל עבד עד כאן?

**בדיקה מהירה:** Table Editor → וודא שיש:
- ✅ `accounts`
- ✅ `partnerships`
- ✅ `tasks`
- ✅ `invoices`

אם יש - תמשיך! אם לא - עצור ותגיד לי.

---

### ✅ שלב 6: Storage
```
📁 supabase/migrations/010_storage_setup.sql
```
**זמן:** 30 שניות  
**מה זה עושה:** יוצר bucket לקבצים + RLS policies

**צפוי:**
```
INSERT INTO storage.buckets (או UPDATE אם קיים)
CREATE POLICY ... (4 policies)
CREATE FUNCTION get_account_id_from_storage_path
GRANT EXECUTE
✅ [010] Storage bucket created successfully!
```

---

### ✅ שלב 7: Notification Engine
```
📁 supabase/migrations/011_notification_engine.sql
```
**זמן:** 1 דקה  
**מה זה עושה:** מנוע התראות - notification_rules, follow_ups, in_app_notifications

**צפוי:**
```
CREATE TABLE notification_rules
CREATE TABLE follow_ups
CREATE TABLE in_app_notifications
CREATE INDEX ... (7 indexes)
CREATE POLICY ... (8 policies)
INSERT INTO notification_rules (8 default rules)
CREATE FUNCTION create_follow_up_from_rule
✅ [011] Notification Engine created successfully!
```

---

### ✅ שלב 8: Coupons & ROI
```
📁 supabase/migrations/012_coupons_roi.sql
```
**זמן:** 1 דקה  
**מה זה עושה:** קופונים ומעקב ROI

**צפוי:**
```
CREATE TABLE coupons
CREATE TABLE coupon_usages
CREATE TABLE roi_tracking
CREATE INDEX ... (8 indexes)
CREATE POLICY ... (6 policies)
CREATE FUNCTION increment_coupon_usage
CREATE TRIGGER trigger_increment_coupon_usage
CREATE FUNCTION sync_roi_metrics
✅ [012] Coupons & ROI tracking created successfully!
```

---

### ✅ שלב 9: Brand Communications
```
📁 supabase/migrations/013_brand_communications.sql
```
**זמן:** 2 דקות  
**מה זה עושה:** תקשורת עם מותגים - threads, messages, alerts

**צפוי:**
```
CREATE TABLE brand_communications
CREATE TABLE communication_messages
CREATE TABLE communication_alerts
CREATE TABLE communication_templates
CREATE INDEX ... (10+ indexes)
CREATE POLICY ... (10+ policies)
CREATE FUNCTION update_communication_counters
CREATE FUNCTION mark_message_as_read
CREATE FUNCTION create_communication_alerts
CREATE TRIGGER ...
INSERT INTO communication_templates (4 templates)
✅ Brand Communications Hub tables created!
```

---

### ✅ שלב 10: Calendar Integration
```
📁 supabase/migrations/014_calendar_integration.sql
```
**זמן:** 1 דקה  
**מה זה עושה:** אינטגרציה ליומן Google

**צפוי:**
```
CREATE TABLE calendar_connections
CREATE TABLE calendar_events (החדש - שונה מזה של 006!)
CREATE TABLE calendar_sync_log
CREATE INDEX ... (9 indexes)
CREATE POLICY ... (7 policies)
CREATE FUNCTION needs_token_refresh
✅ [014] Calendar Integration created successfully!
```

⚠️ **שים לב:** יש שתי טבלאות בשם דומה:
- `calendar_events` (מ-006) - לו"ז פנימי
- `calendar_events` (מ-014) - סנכרון Google

אם יש **conflict**, זה אומר ש-006 כבר יצר טבלה בשם הזה. אמור להיות OK עם `IF NOT EXISTS`.

---

### ✅ שלב 11: Chatbot Upgrades
```
📁 supabase/migrations/015_chatbot_upgrades.sql
```
**זמן:** 2 דקות  
**מה זה עושה:** פרסונת צ'אטבוט + Social Listening

**צפוי:**
```
CREATE TABLE chatbot_persona
CREATE TABLE chatbot_knowledge_base
CREATE TABLE chatbot_conversations_v2
CREATE TABLE chatbot_messages_v2
CREATE TABLE chatbot_data_collection
CREATE TABLE social_listening_mentions
CREATE TABLE social_listening_alerts
CREATE INDEX ... (15+ indexes)
CREATE POLICY ... (12+ policies)
CREATE FUNCTION sync_chatbot_knowledge_from_partnerships
CREATE FUNCTION calculate_engagement_score
✅ [015] Chatbot Upgrades + Social Listening created successfully!
```

---

### ✅ שלב 12: Copy Tracking (חדש!)
```
📁 supabase/migrations/016_add_copy_tracking.sql
```
**זמן:** 1 דקה  
**מה זה עושה:** מעקב אחרי העתקות קופון

**צפוי:**
```
ALTER TABLE coupons ADD COLUMN copy_count
CREATE INDEX idx_coupons_copy_count
CREATE TABLE coupon_copies
CREATE INDEX ... (3 indexes)
CREATE POLICY ... (2 policies)
CREATE FUNCTION increment_coupon_copy_count
CREATE TRIGGER trigger_increment_coupon_copy_count
CREATE FUNCTION mark_copy_as_converted
CREATE TRIGGER trigger_mark_copy_converted
✅ Copy tracking added to coupons!
```

---

### ✅ שלב 13: Satisfaction Surveys (חדש!)
```
📁 supabase/migrations/017_satisfaction_surveys.sql
```
**זמן:** 1 דקה  
**מה זה עושה:** סקרי NPS/CSAT

**צפוי:**
```
CREATE TABLE satisfaction_surveys
CREATE INDEX ... (5 indexes)
CREATE POLICY ... (3 policies)
CREATE FUNCTION calculate_nps
CREATE FUNCTION calculate_csat
GRANT EXECUTE ... (2)
INSERT INTO notification_rules (1 rule)
✅ Satisfaction surveys system created!
```

---

## 🎉 סיימת!

אם הגעת לכאן - **כל 13 המיגרציות רצו בהצלחה!**

---

## ✅ בדיקה סופית:

הרץ בSQL Editor:

```sql
-- ספירת כל הטבלאות
SELECT COUNT(*) as total_tables
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE';
-- צריך להיות לפחות 25 טבלאות

-- רשימת כל הטבלאות
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

**טבלאות חשובות שצריכות להיות:**
- ✅ accounts
- ✅ partnerships
- ✅ tasks
- ✅ invoices
- ✅ coupons
- ✅ coupon_copies ⭐
- ✅ coupon_usages
- ✅ notification_rules
- ✅ follow_ups
- ✅ in_app_notifications
- ✅ brand_communications ⭐
- ✅ communication_messages
- ✅ calendar_connections ⭐
- ✅ calendar_events (יכול להיות 2!)
- ✅ chatbot_persona ⭐
- ✅ chatbot_knowledge_base
- ✅ social_listening_mentions ⭐
- ✅ satisfaction_surveys ⭐

---

## 🐛 אם יש שגיאה במיגרציה מסוימת:

### "relation already exists"
✅ **זה OK!** המיגרציה כבר רצה. המשך הלאה.

### "relation does not exist"
❌ **בעיה!** חזור למיגרציה הקודמת - היא לא רצה נכון.

### "permission denied"
❌ **בעיה!** ודא שאתה מחובר ב-Supabase Dashboard (לא דרך API).

---

## 📞 אם משהו לא עובד:

1. ✅ עצור במיגרציה שנכשלה
2. ✅ העתק את השגיאה המדויקת
3. ✅ ספר לי באיזו מיגרציה זה קרה
4. ✅ אני אעזור לתקן!

---

## 🎯 טיפים:

- ✅ **אל תדלג על אף מיגרציה!**
- ✅ **המתן עד שכל מיגרציה מסתיימת לפני שאתה עובר לבאה**
- ✅ **אם יש שגיאה - תפסיק ותגיד לי מיד**
- ✅ **שמור את הטאב פתוח - תצטרך אותו!**

---

**בהצלחה! אתה עושה מעולה!** 💪

יש לך את **כל 13 הקבצים** בתיקייה `supabase/migrations/` - פשוט הרץ אותם לפי הסדר שכתבתי למעלה!
