# מדריך הוספת משפיען חדש

## סקירה כללית

כל משפיען עובר תהליך של 5 שלבים. סדר הפעולות חשוב!

```
1. יצירת חשבון ← 2. סריקת אינסטגרם ← 3. תמלול + RAG ← 4. עיבוד תוכן (לפי סוג) ← 5. בניית פרסונה
```

## שלב 1: יצירת חשבון

```bash
# ב-Supabase
INSERT INTO accounts (type, config, plan, status)
VALUES ('creator', '{"username": "instagram_handle"}', 'free', 'active');
```

או דרך ה-dashboard אם יש כזה.

## שלב 2: סריקת אינסטגרם

```bash
npx tsx --tsconfig tsconfig.json scripts/scan-account.ts <account_id>
```

הסקריפט סורק:
- פרופיל
- פוסטים (עד 50 אחרונים)
- היילייטים + כל ה-items
- קומנטים
- תמלולים (Gemini Flash — וידאו/תמונה → טקסט)
- RAG chunking + embeddings

⏱️ זמן: ~10-30 דקות (תלוי בכמות תוכן)

## שלב 3: העשרת RAG

```bash
npx tsx --tsconfig tsconfig.json scripts/enrich-rag-chunks.ts <account_id>
```

- תרגום/סיכום לעברית
- שאילתות סינתטיות
- העשרת שותפויות
- ניקוי chunks קטנים

## שלב 4: עיבוד תוכן — לפי סוג המשפיען

### 🍳 אוכל (food)

התוכן מבוסס על `document_chunks` עם `topic = 'food'` ותמלולים.

**לא צריך סקריפט נוסף** — ה-content-feed API שולף ישירות מה-chunks.

כדאי לוודא:
- שיש chunks עם `topic = 'food'` (בדרך כלל AI classifier מסווג בזמן RAG)
- שהתמלולים מכילים שמות מתכונים, מרכיבים

### 👗 אופנה (fashion)

התוכן מבוסס על `instagram_highlight_items` + `instagram_posts` ישירות.

**לא צריך סקריפט נוסף** — ה-content-feed API שולף:
- Highlight items → LookCards (כל item = לוק נפרד)
- Posts → PostCards
- תמלולים מ-document_chunks (join על originalSourceId)

כדאי לוודא:
- ש-highlights קיימים עם שמות מותגים (TFS x SAP, PANDORA, וכו')
- שיש thumbnail_url ל-highlight items
- שיש transcriptions מחוברות ל-items

### 💄 ביוטי/טיפוח (beauty)

התוכן מבוסס על `beauty_product_reviews` — טבלה שנוצרת ע"י AI splitting.

**צריך להריץ סקריפט נוסף!**

```bash
# dry run קודם לוודא שהכל נראה טוב
npx tsx --tsconfig tsconfig.json scripts/split-beauty-reviews.ts <account_id> --dry-run

# הרצה אמיתית
npx tsx --tsconfig tsconfig.json scripts/split-beauty-reviews.ts <account_id>
```

הסקריפט:
1. לוקח כל highlight עם תמלולים
2. שולח ל-Gemini Flash לפיצול לפי מוצרים
3. שומר ל-`beauty_product_reviews` עם: שם מוצר, מותג, קטגוריה (face/hair/body/makeup), תקציר, מרכיבים, יתרונות/חסרונות, קוד קופון

⏱️ זמן: ~1-2 דקות לכל highlight (תלוי בכמות)

אפשרויות:
- `--dry-run` — רק מציג מה יקרה
- `--highlight <id>` — מעבד highlight ספציפי
- `--force` — מעבד מחדש highlights שכבר עובדו

### 🏪 מותגים (חשבון מותג, לא משפיען)

מותגים צריכים קטלוג מוצרים. הסקריפט מחלץ מוצרים מ-website RAG chunks:

```bash
# dry run
npx tsx --tsconfig tsconfig.json scripts/extract-products-from-rag.ts <account_id> --dry-run

# הרצה אמיתית
npx tsx --tsconfig tsconfig.json scripts/extract-products-from-rag.ts <account_id>
```

**דרישה:** האתר חייב להיות סרוק קודם (שלב 6 — deep-scrape-website).

הסקריפט:
1. סורק website chunks שנראים כדפי מוצר (מחיר, שם מוצר, URL)
2. שולח ל-Gemini Flash ב-batches של 15 chunks
3. מחלץ: שם, מחיר, קטגוריה, מרכיבים, יתרונות, URL
4. שומר ל-`widget_products` (משמש גם צ'אט/content feed, לא רק widget)

אפשרויות:
- `--dry-run` — רק מציג
- `--force` — מוחק קיימים ומחלץ מחדש
- `--limit N` — מגביל כמות chunks לעיבוד

### 🏋️ כושר (fitness) / 🧳 טיולים (travel) / 👶 הורות (parenting) / 💻 טכנולוגיה (tech)

כרגע משתמשים ב-GenericCard — שולפים מ-document_chunks עם topic מתאים.
לא צריך סקריפט נוסף.

## שלב 5: בניית פרסונה

```bash
npx tsx --tsconfig tsconfig.json scripts/rebuild-persona-gpt54.ts <account_id>
```

**דרישות:** צריך `preprocessing_data` בטבלת `chatbot_persona` — נוצר אוטומטית בסריקה (שלב 2).

הפרסונה כוללת: טון דיבור, סגנון, נושאים, voice rules, boundaries.

## שלב 6 (אופציונלי): אתר + ווידג'ט

אם למשפיען יש אתר:

```bash
# סריקת אתר
node scripts/deep-scrape-website.mjs <domain>

# הווידג'ט יעבוד אוטומטית אחרי הסריקה
```

## קביעת סוג המשפיען

הסוג נקבע ב-`config.influencerType` בטבלת `accounts`:

```sql
UPDATE accounts
SET config = config || '{"influencerType": "beauty"}'::jsonb
WHERE id = '<account_id>';
```

סוגים אפשריים: `food`, `fashion`, `beauty`, `fitness`, `tech`, `travel`, `parenting`, `lifestyle`

**חשוב:** הסוג קובע איזה כרטיס תוכן מוצג בצ'אט (RecipeCard, LookCard, BeautyCard, וכו').

## צ'קליסט מהיר

| שלב | פקודה | חובה? |
|------|--------|--------|
| יצירת חשבון | SQL / dashboard | ✅ |
| סריקת אינסטגרם | `scan-account.ts` | ✅ |
| העשרת RAG | `enrich-rag-chunks.ts` | ✅ |
| **פיצול ביוטי** | `split-beauty-reviews.ts` | רק beauty |
| **חילוץ מוצרים** | `extract-products-from-rag.ts` | רק מותגים |
| בניית פרסונה | `rebuild-persona-gpt54.ts` | ✅ |
| קביעת סוג | SQL update | ✅ |
| סריקת אתר | `deep-scrape-website.mjs` | אופציונלי (חובה למותגים) |

## פתרון בעיות

- **אין תמלולים**: ודא שב-scan-account הופעל שלב transcription
- **אין chunks**: ודא שהופעל RAG ingestion
- **beauty products ריקים**: הרץ `split-beauty-reviews.ts`
- **הצ'אטבוט לא מכיר את המשפיען**: ודא שנבנתה persona (שלב 5)
- **תמונות לא מוצגות**: בדוק ש-thumbnail_url קיים ב-highlight_items
- **קופונים חסרים**: בדוק טבלת coupons + שדות brand_name, brand_link
