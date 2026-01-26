# 🚀 Instagram Scraping Upgrade: Gemini 3 Pro + Reels

## מה שודרג?

שדרגנו את **שתי המערכות** הקיימות עם Gemini 3 Pro + Reels:

1. ✅ `/api/influencer/rescan` - סריקה מחדש מהדשבורד
2. ✅ `/api/admin/scrape` - סריקה ראשונה כשמוסיפים משפיען חדש

### ✅ לפני (OpenAI בלבד)
```typescript
// רק פוסטים רגילים
const { profile, posts } = await scrapeInstagramProfile(username);

// ניתוח OpenAI
const analysis = await analyzeAllPosts(posts);
```

### ✨ אחרי (Gemini 3 Pro + Reels)
```typescript
// פוסטים + ריילס
const posts = await apify.actor('apify/instagram-scraper').call(...);
const reels = await apify.actor('apify/instagram-reel-scraper').call(...);

// ניתוח Gemini 3 Pro (fallback ל-OpenAI)
if (GOOGLE_AI_API_KEY) {
  analysis = await analyzeWithGemini3Pro(allContent);
} else {
  analysis = await analyzeAllPosts(posts); // Legacy
}
```

---

## 🎯 מה זה עושה עכשיו?

### 1. סריקה מורחבת
- ✅ **50 פוסטים רגילים** (כמו קודם)
- ✅ **30 ריילס** (חדש! 🎬)
- ✅ פרופיל אינסטגרם

### 2. ניתוח AI משופר
- **Gemini 3 Pro Preview** (thinking: high)
- מנתח גם reels (transcripts + captions)
- זיהוי מותגים וקופונים טוב יותר
- **Fallback אוטומטי ל-OpenAI** אם אין Google AI key

### 3. שמירה למסד נתונים
- ✅ **`partnerships`** - כל המותגים שזוהו
- ✅ **`coupons`** - כל קודי הקופון
- ✅ **`chatbot_persona`** - persona אוטומטית
- ✅ **`chatbot_knowledge_base`** - knowledge base אוטומטית
- ✅ **`products`** - backward compatibility

---

## 🔧 איך להשתמש?

### מסלול 1: סריקה ראשונה (הוספת משפיען חדש)

1. היכנס ל-Admin: `/admin/add`
2. הזן URL של אינסטגרם
3. המערכת תריץ **אוטומטית** את הסריקה המשודרגת:
   - 📸 50 פוסטים
   - 🎬 30 ריילס  
   - 🤖 ניתוח Gemini 3 Pro
   - 💾 שמירה לכל הטבלאות החדשות
4. המשפיען מוכן מיד! 🎉

### מסלול 2: סריקה מחדש (מהדשבורד)

1. היכנס לדשבורד של המשפיען
2. לחץ על **"🔄 סרוק מחדש מאינסטגרם"**
3. המערכת תריץ את הסריקה המשודרגת
4. אחרי ~1-2 דקות הדשבורד יתעדכן

### מ-Settings

1. היכנס ל-`/influencer/[username]/settings`
2. גלול ל-"סריקה מחדש"
3. לחץ "סרוק מחדש מאינסטגרם"

### API ישיר

```bash
curl -X POST http://localhost:3001/api/influencer/rescan \
  -H "Content-Type: application/json" \
  -d '{"username": "miranbuzaglo"}'
```

---

## 📊 מה נוצר אוטומטית?

### Partnerships (טבלת `partnerships`)
```sql
INSERT INTO partnerships (
  account_id,
  brand_name,
  category,
  brief,
  is_active
) VALUES (
  'influencer-id',
  'RENUAR',
  'Auto',
  'זוהה אוטומטית מאינסטגרם',
  true
);
```

### Coupons (טבלת `coupons`)
```sql
INSERT INTO coupons (
  partnership_id,
  account_id,
  code,
  discount_type,
  discount_value,
  description,
  is_active
) VALUES (
  'partnership-id',
  'influencer-id',
  'MIRANFASHION',
  'percentage',
  15,
  'קופון RENUAR - 15%',
  true
);
```

### Chatbot Persona (טבלת `chatbot_persona`)
```sql
INSERT INTO chatbot_persona (
  account_id,
  name,
  tone,
  language,
  greeting_message,
  faq
) VALUES (
  'influencer-id',
  'העוזר של Miran Buzaglo',
  'friendly',
  'he',
  'היי! 👋 אני העוזרת של מירן...',
  '[...]'
);
```

### Knowledge Base (טבלת `chatbot_knowledge_base`)
```sql
INSERT INTO chatbot_knowledge_base (
  account_id,
  knowledge_type,
  title,
  content,
  keywords,
  priority
) VALUES (
  'influencer-id',
  'coupon',
  'קופון רנואר',
  'מותג: רנואר\nקוד: MIRANFASHION\nהנחה: 15%',
  ARRAY['קופון', 'רנואר', 'MIRANFASHION'],
  90
);
```

---

## 🎨 Flow מעודכן

```mermaid
flowchart TD
    A[משתמש לוחץ "סרוק מחדש"] --> B[POST /api/influencer/rescan]
    B --> C[Apify: סריקת פוסטים]
    B --> D[Apify: סריקת ריילס]
    C --> E[איחוד תוכן]
    D --> E
    E --> F{יש Google AI Key?}
    F -->|כן| G[Gemini 3 Pro Analysis]
    F -->|לא| H[OpenAI Analysis]
    G --> I[חילוץ מותגים וקופונים]
    H --> I
    I --> J[שמירת partnerships]
    I --> K[שמירת coupons]
    I --> L[יצירת persona]
    I --> M[יצירת knowledge base]
    J --> N[הדשבורד מתעדכן!]
    K --> N
    L --> N
    M --> N
```

---

## 🔑 Environment Variables

ודא שיש לך את ה-keys הבאים:

```bash
# Apify - לסריקת אינסטגרם (חובה)
APIFY_TOKEN=your_apify_token

# Google AI - לניתוח Gemini 3 Pro (אופציונלי)
GOOGLE_AI_API_KEY=your_google_ai_key

# OpenAI - fallback אם אין Google AI (אופציונלי)
OPENAI_API_KEY=your_openai_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SECRET_KEY=your_service_role_key
```

**אם אין `GOOGLE_AI_API_KEY`** - המערכת תשתמש אוטומטית ב-OpenAI (legacy mode)

---

## 📈 ביצועים

### OpenAI Mode (Legacy)
- סריקה: ~30 שניות
- ניתוח: ~20 שניות
- **סה"כ: ~50 שניות**

### Gemini 3 Pro Mode (New)
- סריקה: ~45 שניות (posts + reels)
- ניתוח: ~30 שניות (thinking: high)
- **סה"כ: ~1.5 דקות**

---

## 🎯 מה השתפר?

### לפני
- ❌ רק פוסטים רגילים
- ❌ OpenAI בלבד
- ❌ לא יוצר persona אוטומטית
- ❌ לא בונה knowledge base

### אחרי
- ✅ פוסטים **+ ריילס** (קופונים בד"כ בריילס!)
- ✅ **Gemini 3 Pro** (AI מתקדם יותר)
- ✅ יוצר **persona** אוטומטית
- ✅ בונה **knowledge base** אוטומטית
- ✅ שומר ל-**partnerships** + **coupons** (טבלאות חדשות)
- ✅ **Backward compatible** - עדיין שומר ל-`products`

---

## 🧪 בדיקה

### בדיקה ידנית

1. היכנס לדשבורד: `/influencer/miranbuzaglo/dashboard`
2. לחץ "סרוק מחדש מאינסטגרם"
3. חכה ~1.5 דקות
4. בדוק:
   - ✅ יש partnerships חדשים?
   - ✅ יש coupons חדשים?
   - ✅ הצ'אטבוט מראה קופונים?

### בדיקת API

```bash
# 1. הרץ rescan
curl -X POST http://localhost:3001/api/influencer/rescan \
  -H "Content-Type: application/json" \
  -d '{"username": "miranbuzaglo"}'

# 2. בדוק partnerships
# פתח: http://localhost:3001/influencer/miranbuzaglo/partnerships

# 3. בדוק chatbot
# פתח: http://localhost:3001/chat/miranbuzaglo
# שאל: "יש קופון לרנואר?"
```

---

## 🔧 Troubleshooting

### שגיאה: "APIFY_TOKEN missing"
**פתרון:** הוסף את ה-token ל-`.env`

### לא מזהה ריילס
**סיבה:** Apify reel scraper דורש `username` כ-array  
**פתרון:** הקוד כבר תוקן - `username: [username]`

### Gemini לא עובד
**פתרון:** המערכת תעבור אוטומטית ל-OpenAI (legacy mode)

### לא נמצאו קופונים
**אפשרויות:**
1. המשפיען לא מפרסם קופונים בפוסטים/ריילס
2. הקופונים בביו או בלינק חיצוני
3. הפורמט לא מוכר ל-AI

**פתרון:** הוסף קופונים ידנית דרך הדשבורד

---

## 📚 קבצים ששונו

```
✅ src/app/api/influencer/rescan/route.ts
   - הוספת Gemini 3 Pro + fallback לOpenAI
   - הוספת reels scraping (בנוסף לפוסטים)
   - הוספת partnerships + coupons
   - הוספת persona + knowledge base
   
✅ src/app/api/admin/scrape/route.ts
   - הוספת Gemini 3 Pro + fallback לOpenAI
   - הוספת reels scraping (בנוסף לפוסטים)
   - הוספת partnerships + coupons
   - הוספת persona + knowledge base
   
✅ src/lib/supabase.ts
   - תיקון getPartnershipsByInfluencer (JOIN coupons)
   
✅ src/lib/cache-l2.ts
   - תיקון cacheDel → cacheDelete
```

---

## 🎉 סיכום

**שתי המערכות שודרגו:**

### 1️⃣ סריקה ראשונה (`/api/admin/scrape`)
✅ **Gemini 3 Pro** - AI מתקדם יותר  
✅ **Reels Scraping** - קופונים בריילס!  
✅ **Auto Partnerships** - זיהוי מותגים אוטומטי  
✅ **Auto Coupons** - חילוץ קופונים אוטומטי  
✅ **Auto Persona** - chatbot persona אוטומטית  
✅ **Auto Knowledge** - knowledge base אוטומטית  
✅ **Smart Fallback** - OpenAI אם אין Gemini  

### 2️⃣ סריקה מחדש (`/api/influencer/rescan`)
✅ **Gemini 3 Pro** - AI מתקדם יותר  
✅ **Reels Scraping** - קופונים בריילס!  
✅ **Auto Partnerships** - זיהוי מותגים אוטומטי  
✅ **Auto Coupons** - חילוץ קופונים אוטומטי  
✅ **Auto Persona** - chatbot persona אוטומטית  
✅ **Auto Knowledge** - knowledge base אוטומטית  
✅ **Backward Compatible** - עדיין עובד עם products  
✅ **Smart Fallback** - OpenAI אם אין Gemini  

---

## 🎯 תוצאה סופית

✨ **כל משפיען חדש** שמוסיפים דרך Admin מקבל אוטומטית:
- 📸 50 פוסטים + 🎬 30 ריילס
- 🤖 ניתוח Gemini 3 Pro (או OpenAI)
- 🏢 זיהוי מותגים → partnerships
- 🎫 חילוץ קופונים → coupons
- 🎭 יצירת persona
- 📚 בניית knowledge base

✨ **כל לחיצה על "סרוק מחדש"** בדשבורד עושה את אותו הדבר!

**המערכת מוכנה מקצה לקצה! 🚀**
