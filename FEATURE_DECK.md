# Feature Deck — bestieAI Platform

**גרסה:** 1.0 | **תאריך:** מרץ 2026
**מוצר:** פלטפורמת SaaS לניהול משפיענים עם AI
**קהל יעד למצגת:** מותגים, סוכנויות שיווק, משפיענים

---

## 1. סקירה כללית — מה זה?

פלטפורמה מבוססת AI לניהול משפיענים מקצה לקצה: מ-Scraping אוטומטי של אינסטגרם, דרך צ'אטבוט חכם שמדבר בקול המשפיען, ניהול שיתופי פעולה ומסמכים, ועד אנליטיקס ו-ROI — הכל במקום אחד.

**ערך מרכזי:** המשפיען מקבל עוזר AI שמנהל את הנוכחות הדיגיטלית שלו 24/7 — עונה לעוקבים, מנהל שת"פים, עוקב אחרי ביצועים.

---

## 2. פיצ'רים ראשיים

---

### 2.1 AI Chatbot — צ'אטבוט חכם בסגנון המשפיען

**ערך עסקי:** העוקבים מקבלים חוויה אישית — הצ'אטבוט מדבר בדיוק כמו המשפיען, עונה על שאלות לגבי תוכן, מוצרים וקופונים.

**יכולות:**
- **Persona מותאם אישית** — AI לומד את סגנון הדיבור, הביטויים והאופי של המשפיען מתוך כל התוכן שלו (פוסטים, סטוריז, תמלולי וידאו)
- **Hybrid Multi-Stage Retrieval** — אלגוריתם 4 שלבים שמוצא בדיוק את התוכן הרלוונטי:
  1. Full-Text Search מאונדקס על כל התוכן
  2. AI בוחר אילו פריטים להביא בפירוט
  3. שליפה ממוקדת (רק מה שנדרש)
  4. תשובה סופית עם קונטקסט מלא
- **זיכרון שיחה (Memory V2)** — הצ'אטבוט זוכר מה דובר בשיחות קודמות, סיכומים מתגלגלים
- **Streaming בזמן אמת** — תשובות מופיעות מילה-מילה כמו ChatGPT
- **תמיכה רב-שפתית** — עברית, אנגלית, ערבית, רוסית
- **קופונים ומוצרים** — הצ'אטבוט מכיר את כל המוצרים והקופונים של המשפיען ומציע אותם בהקשר נכון
- **Smart Menu** — קרוסלה אינטראקטיבית עם נושאים/מותגים שהעוקב יכול לבחור
- **Support Flow** — מסלול תמיכה מובנה לפניות מורכבות

**מודלים:** GPT-5.4 (ראשי), GPT-5.2 (גיבוי), Gemini 3 Flash (תמלול + OCR)

**דף משתמש:** `chat/[username]` — דף צ'אט ציבורי לכל משפיען

---

### 2.2 Instagram DM Integration — אוטומציית הודעות ישירות

**ערך עסקי:** הצ'אטבוט עונה אוטומטית על DMs באינסטגרם — 24/7, בסגנון המשפיען.

**יכולות:**
- **חיבור רשמי ל-Instagram Graph API** — OAuth flow מלא, webhook מאומת
- **עיבוד הודעות נכנסות** — כל DM שנכנס מעובד אוטומטית דרך ה-AI
- **תגובות חכמות** — אותו מנוע Persona + Knowledge שמפעיל את הצ'אטבוט באתר
- **Smart Menu בתוך DM** — קרוסלות, כפתורים ותגובות עשירות ישירות באינסטגרם
- **Issue Flow** — זיהוי פניות תמיכה ומסלול טיפול ייעודי עם בחירת מותג
- **HMAC Signature Verification** — אבטחת webhook ברמה הגבוהה ביותר

---

### 2.3 Instagram Scraping & Analysis — איסוף וניתוח תוכן

**ערך עסקי:** כל התוכן של המשפיען נאסף, מתומלל ומנותח אוטומטית — בסיס הידע של ה-AI.

**יכולות:**
- **סריקה מלאה (Full Scan)** — פרופיל, פוסטים, סטוריז, Highlights, Reels, תגובות
- **סריקה מצטברת (Incremental)** — רק תוכן חדש מהסריקה האחרונה
- **תמלול אוטומטי** — כל וידאו ו-Story מתומלל באמצעות AI (Gemini 3 Flash)
- **בניית Persona אוטומטית** — AI מנתח את כל התוכן ובונה פרופיל אישיות מפורט
- **RAG Embedding** — כל התוכן מקבל vector embeddings לחיפוש סמנטי
- **Cron Jobs אוטומטיים:**
  - סריקה יומית (01:00 UTC) — תוכן חדש
  - עדכון Persona יומי (02:00 UTC)
  - ניתוח שיחות (06:00 UTC)

**מקור נתונים:** ScrapeCreators API

---

### 2.4 Website Widget — צ'אטבוט להטמעה באתרים

**ערך עסקי:** אותו צ'אטבוט חכם — מוטמע באתר הלקוח (חנות, בלוג, לנדינג).

**יכולות:**
- **Widget JS להטמעה** — שורת קוד אחת באתר הלקוח
- **RAG + Keyword + FTS** — חיפוש מרובה שכבות על תוכן האתר
- **Deep Scrape** — סריקת כל דפי האתר + המרה ל-RAG chunks
- **עיצוב מותאם** — צבעים, לוגו ותימה מותאמים לכל לקוח
- **Product Recommendations** — המלצות מוצרים חכמות עם מעקב קליקים
- **Management Console** — ממשק ניהול לבעל האתר (settings, knowledge, products, pages)

---

### 2.5 Discovery — גילוי משפיענים באמצעות AI

**ערך עסקי:** מותגים מוצאים משפיענים רלוונטיים לקמפיין שלהם — רשימות מותאמות שנוצרות ע"י AI.

**יכולות:**
- **AI-Generated Lists** — רשימות משפיענים מותאמות אישית שנוצרות אוטומטית
- **קטגוריות** — סיווג לפי תחום (ספורט, אוכל, אופנה, טכנולוגיה...)
- **שאלון חכם** — מותג עונה על שאלות ומקבל רשימה ממוקדת
- **כל הרשימות** — מאגר רשימות קיימות לגלישה

---

### 2.6 Partnership Management — ניהול שיתופי פעולה

**ערך עסקי:** ניהול מלא של שיתופי פעולה עם מותגים — מהצעה ועד תשלום.

**יכולות:**
- **CRUD מלא** — יצירה, צפייה, עריכה, מחיקה של שת"פים
- **Pipeline View** — תצוגת pipeline לפי סטטוס (Draft → Active → Completed)
- **Revenue Tracking** — מעקב הכנסות לפי חודש ולפי שת"פ
- **Calendar** — לוח שנה עם דדליינים (tasks, invoices, milestones)
- **Library** — ספריית מסמכים מקושרת לכל שת"פ
- **Brand Logos** — ניהול לוגואים של מותגים
- **יצירה מפורסת מסמך** — AI קורא חוזה ויוצר שת"פ אוטומטית

---

### 2.7 AI Document Intelligence — ניתוח מסמכים חכם

**ערך עסקי:** העלאת חוזה/הצעה/חשבונית → AI מפענח את הכל אוטומטית.

**יכולות:**
- **העלאת מסמכים** — Drag & Drop, PDF/Word/Excel/Images
- **Multi-Model AI Parsing** — שרשרת fallback: Gemini Flash → Claude → GPT-4o
- **סוגי מסמכים:** Partnership Agreement, Invoice, Brief, Proposal, General
- **Confidence Scoring** — ציון ביטחון לכל שדה שנחלץ (Low/Medium/High/Very High)
- **Review Flow** — ממשק סקירה לאישור/תיקון נתונים שה-AI חילץ
- **Manual Fallback** — טופס ידני כשה-AI לא בטוח (מתחת ל-75%)
- **Inline Edit** — עריכה מהירה של כל שדה ישירות בממשק הסקירה
- **רב-שפתי** — תמיכה בעברית, אנגלית, ערבית, רוסית

---

### 2.8 Coupons & ROI — ניהול קופונים ומדידת ROI

**ערך עסקי:** כל שת"פ מקבל קוד קופון ייחודי + מעקב ROI אוטומטי.

**יכולות:**
- **ניהול קופונים** — יצירה, מעקב, סוגי הנחה (%, סכום קבוע, משלוח חינם)
- **Tracking URL** — UTM parameters למעקב מקור
- **Usage Tracking** — מעקב אחרי כל שימוש בקופון
- **ROI Dashboard:**
  - השקעה vs. הכנסה
  - ROI% (חישוב אוטומטי)
  - Conversion Rate
  - CTR (Click-Through Rate)
  - Revenue breakdown: קופון vs. אורגני
  - גרף שימוש לאורך זמן

---

### 2.9 Analytics Dashboards — דשבורדים ואנליטיקס

**ערך עסקי:** תמונה מלאה של ביצועי המשפיען — קהל, מעורבות, שת"פים, ROI.

**דשבורדים:**

**Audience Dashboard:**
- גידול עוקבים (7/30/90 ימים)
- דמוגרפיה (גיל, מגדר, מיקום)
- מדדי מעורבות (likes, comments, shares, saves)
- תוכן מוביל (Top 10 by engagement)
- Trending indicators

**Partnership Dashboard:**
- Pipeline (by status)
- Revenue (by month)
- Calendar (deadlines)
- Library (documents)

**Conversations Dashboard:**
- סטטיסטיקות שיחות
- היסטוריית צ'אט
- ניתוח שיחות (cron אוטומטי)

**Coupon Analytics:**
- ביצועי קופונים
- שימוש לפי זמן
- ROI per partnership

---

### 2.10 Notification Engine — מערכת התראות חכמה

**ערך עסקי:** המשפיען לא מפספס דדליין — התראות אוטומטיות לפי כללים.

**יכולות:**
- **8 סוגי טריגרים:**
  - Task Deadline (3 ימים לפני, יום לפני)
  - Task Overdue
  - Partnership Starting/Ending Soon (7 ימים)
  - Invoice Due (3 ימים)
  - Milestone Completed
  - Document Uploaded
- **3 ערוצים:** Email, WhatsApp, In-App
- **NotificationBell** — פעמון התראות בממשק עם ספירת unread
- **Template System** — תבניות עם placeholders דינמיים
- **כללים מותאמים** — Admin יכול ליצור כללים חדשים

---

### 2.11 Communications Hub — תקשורת עם מותגים

**ערך עסקי:** מקום מרכזי לנהל את כל ההתכתבויות עם מותגים.

**יכולות:**
- **רשימת תקשורות** — כל ההתכתבויות במקום אחד
- **יצירת תקשורת חדשה** — פתיחת thread חדש
- **צפייה בתקשורת** — היסטוריית הודעות

---

### 2.12 Chatbot Settings & Persona — הגדרות צ'אטבוט

**ערך עסקי:** המשפיען שולט על האופי, הסגנון והידע של הצ'אטבוט שלו.

**יכולות:**
- **Persona Editor** — עריכת אישיות הצ'אטבוט (סגנון, טון, ביטויים)
- **Knowledge Base** — ניהול בסיס הידע (מה הצ'אטבוט יודע)
- **Bot Content** — ניהול תכנים שהצ'אטבוט מציג (מוצרים, מותגים, הגדרות)
- **Greeting Regeneration** — יצירה מחדש של הודעת פתיחה
- **Chatbot Settings** — הגדרות טכניות ותצורה

---

### 2.13 Admin Panel — ממשק ניהול מערכת

**ערך עסקי:** ניהול מרכזי של כל המשפיענים, החשבונות והמערכת.

**יכולות:**
- **Dashboard** — סטטיסטיקות כלליות
- **Accounts Management** — יצירה, עריכה, בדיקת סטטוס חשבונות
- **Influencer Management** — ניהול משפיענים (פרופיל, סריקה, persona)
- **Onboarding** — תהליך הוספת משפיען חדש
- **Full Scan** — הפעלת סריקה מלאה לחשבון
- **Scrape Progress** — מעקב אחרי סריקות בזמן אמת
- **Brand Logos** — ניהול מאגר לוגואים
- **Coupons** — ניהול קופונים ברמת מערכת
- **Websites** — ניהול אתרים + widget
- **Recommendations** — ניהול המלצות מוצרים
- **Experiments** — ניהול ניסויים
- **Rules** — כללי התראות ומדיניות
- **Re-embed** — יצירת embeddings מחדש
- **Documents** — ניהול מסמכים ברמת מערכת

---

## 3. ארכיטקטורה טכנית (תמצית)

| שכבה | טכנולוגיה |
|------|-----------|
| **Frontend** | Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 |
| **Backend** | Next.js API Routes (Serverless) |
| **Database** | Supabase (PostgreSQL + RLS) — Multi-tenant |
| **Cache** | Upstash Redis |
| **AI Models** | GPT-5.4, GPT-5.2, Gemini 3 Flash, Claude |
| **Scraping** | ScrapeCreators API |
| **Hosting** | Vercel (Edge + Serverless) |
| **Auth** | Cookie-based + 4-tier RBAC |
| **Storage** | Supabase Storage (50MB per file) |

---

## 4. אבטחה ותאימות

- **Multi-Tenant Isolation** — Row-Level Security (RLS) ברמת DB, כל חשבון רואה רק את הנתונים שלו
- **4-Tier RBAC** — Admin > Agent > Influencer > Follower
- **Rate Limiting** — Upstash Redis, מותאם לכל endpoint:
  - Chat: 100 req/min
  - Auth: 50 req/min
  - Influencer: 200 req/min
  - Admin: 20 req/min
- **HMAC Webhook Verification** — חתימת Instagram webhooks
- **GDPR Compliance** — מחיקת נתונים (`/api/gdpr/delete-data`), דף פרטיות
- **Input Validation** — בכל endpoint
- **Service Role Separation** — מפתח שירות נפרד לפעולות admin

---

## 5. Message Processing Pipeline — מנוע עיבוד הודעות

כל הודעה נכנסת עוברת 3 שלבי עיבוד:

```
[הודעה נכנסת]
     |
     v
[Understanding Engine] — חילוץ כוונה, entities, דגלי סיכון
     |
     v
[Decision Engine] — ניתוב לפעולה, כללי עלות/אבטחה/פרסונליזציה
     |
     v
[Policy Engine] — rate limiting, בדיקות אבטחה
     |
     v
[Action] — תשובת צ'אטבוט / יצירת משימה / etc.
```

---

## 6. תמחור ו-Unit Economics (להשלמה ע"י PM)

| מדד | ערך |
|------|------|
| עלות AI per chat query | ~$0.001 (Hybrid) vs ~$0.004 (Legacy) |
| חיסכון AI | ~75% הפחתה בעלויות |
| זמן תגובה | 1-3 שניות (Streaming) |
| זמן סריקה ראשונית | ~5 דקות (כולל תמלול) |
| מס' שפות | 4 (עברית, אנגלית, ערבית, רוסית) |

---

## 7. קהלי יעד

### למשפיענים:
- צ'אטבוט אישי שעונה לעוקבים 24/7
- ניהול שת"פים ומסמכים במקום אחד
- אנליטיקס מפורט על הקהל והתוכן
- מעקב ROI אוטומטי על כל שת"פ

### למותגים / סוכנויות:
- Discovery — מציאת משפיענים רלוונטיים
- מעקב ביצועים ו-ROI של שת"פים
- ניהול מרכזי של מספר משפיענים (Agent role)
- ניתוח שיחות ו-engagement

### לבעלי אתרים:
- Widget חכם להטמעה באתר
- המלצות מוצרים אוטומטיות
- ניהול ידע ותוכן של הצ'אטבוט

---

## 8. Differentiators — מה מבדל אותנו

| פיצ'ר | אנחנו | מתחרים |
|-------|--------|--------|
| **Persona AI** | לומד מהתוכן האמיתי של המשפיען | תבניות גנריות |
| **Hybrid Retrieval** | 4 שלבים, חיסכון 75% בעלויות AI | שליפת הכל (יקר ואיטי) |
| **Instagram DM** | מענה אוטומטי + Smart Menu | אין |
| **Document Intelligence** | Multi-model fallback + 4 שפות | ידני |
| **Multi-Tenant** | RLS ברמת DB + 4-tier RBAC | בדיקת קוד בלבד |
| **Widget** | RAG + FTS + Keyword — 3 שכבות חיפוש | חיפוש בסיסי |
| **End-to-End** | סריקה → AI → צ'אט → שת"פ → ROI | כלים נפרדים |

---

## 9. Roadmap — מה בדרך

| פיצ'ר | סטטוס | תיאור |
|-------|--------|--------|
| Google Calendar Sync | Planned | סנכרון דו-כיווני של דדליינים |
| Social Listening | Planned | ניטור mentions ו-hashtags |
| Airtable Integration | Planned | סנכרון דו-כיווני |
| WhatsApp Bot | Planned | אותו AI דרך וואטסאפ |
| Advanced Analytics | Planned | predictive analytics, benchmarks |
| Mobile App | Future | אפליקציה ייעודית |

---

## 10. מספרים מרכזיים (להשלמה ע"י PM)

- [ ] מספר משפיענים פעילים
- [ ] מספר שיחות חודשיות
- [ ] ממוצע הודעות per session
- [ ] זמן תגובה ממוצע
- [ ] % שביעות רצון
- [ ] ARR / MRR
- [ ] עלות per user

---

*מסמך זה נוצר אוטומטית מניתוח קוד המערכת. מיועד כבסיס למצגת מכירות — יש להתאים תוכן שיווקי, מספרים ועיצוב.*
