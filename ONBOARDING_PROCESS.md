# תהליך הוספת חשבון חדש — שלב אחר שלב

> מסמך עדכני: 22 במרץ 2026

---

## סקירה כללית

הוספת חשבון חדש למערכת כוללת 7 שלבים עיקריים.
זמן ממוצע: ~15-30 דקות (תלוי בכמות התוכן).

```
1. יצירת חשבון  →  2. סריקת אינסטגרם  →  3. סריקת אתר (אם יש)
     ↓                                              ↓
4. העשרת RAG  →  5. בניית פרסונה  →  6. הגדרת UI  →  7. בדיקה
```

---

## שלב 0: דרישות מקדימות

לפני שמתחילים, צריך:
- **שם משתמש אינסטגרם** של היוצר
- **סוג היוצר**: `food` / `beauty` / `fashion` / `parenting` / `lifestyle` / `tech` / `other`
- **כתובת אתר** (אם יש — לאינפלואנסרים עם בלוג/חנות)
- **קופונים** — רשימת קודי קופון, מותגים, אחוזי הנחה (אם רלוונטי)

### משתני סביבה נדרשים:
```bash
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY        # (Service Role Key)
OPENAI_API_KEY             # embeddings + persona
GEMINI_API_KEY             # transcription + enrichment
SCRAPECREATORS_API_KEY     # Instagram scraping
```

---

## שלב 1: יצירת חשבון בדאטאבייס

### אופציה א׳: אוטומטית (מומלץ — דרך סקריפט הסריקה)
הסקריפט `scan-account.ts` יוצר את החשבון אוטומטית אם לא קיים.

### אופציה ב׳: ידנית (דרך Supabase)
```sql
INSERT INTO accounts (id, type, config) VALUES (
  gen_random_uuid(),
  'creator',
  '{
    "username": "instagram_username",
    "display_name": "שם תצוגה",
    "influencer_type": "food",
    "language": "he"
  }'::jsonb
);
```

> **חשוב**: `type` חייב להיות `'creator'` (לא `'influencer'`).

---

## שלב 2: סריקת אינסטגרם (הפקודה הראשית)

זהו השלב המרכזי — מריץ את כל הצינור האוטומטי:

```bash
npx tsx --tsconfig tsconfig.json scripts/scan-account.ts <username> <account_id>
```

### מה קורה מאחורי הקלעים:
1. **יוצר scan job** בטבלת `scan_jobs`
2. **סורק אינסטגרם** — פרופיל, פוסטים, היילייטס, תגובות (ScrapeCreators)
3. **מתמלל סרטונים** — כל הוידאו מתומלל (Gemini Flash)
4. **בונה RAG** — כל התוכן נחתך ל-chunks עם embeddings
5. **בונה פרסונה** — מחלץ טון, נושאים, מוצרים, מותגים
6. **יוצר tab config** — טאבים, ברכה, כפתורי שאלות

### פלט צפוי:
```
✅ Scan complete
   Duration: 12m 34s
   Videos transcribed: 45
   RAG documents: 320
   Persona built: true
```

### שגיאות נפוצות:
| שגיאה | פתרון |
|--------|--------|
| `SCRAPECREATORS_API_KEY not set` | הוסף ל-.env |
| `Account not found` | צור חשבון קודם (שלב 1) |
| `Rate limit exceeded` | חכה 5 דקות ונסה שוב |

---

## שלב 3: סריקת אתר (אם יש אתר ליוצר)

### 3א: אתר רגיל (חנות, בלוג, שירותים)

```bash
node --env-file=.env scripts/deep-scrape-website.mjs https://example.co.il \
  --account-id <account_id> \
  --name "שם תצוגה" \
  --max-pages 200 \
  --concurrency 3
```

**דגלים שימושיים:**
- `--seeds "/products,/blog"` — התחל מעמודים ספציפיים
- `--exclude "/en,/cart"` — דלג על דפים לא רלוונטיים
- `--clean` — מחק נתונים ישנים לפני סריקה חוזרת
- `--skip-rag` — שמור לDB בלי embeddings (אם רוצים לעשות enrichment בנפרד)

### 3ב: אתר מתכונים (Foody / WordPress)

```bash
node --env-file=.env scripts/scrape-foody-recipes.mjs \
  --account-id <account_id> \
  --concurrency 3
```

**לבדיקה ראשונה:**
```bash
node --env-file=.env scripts/scrape-foody-recipes.mjs \
  --account-id <account_id> \
  --max 5 \
  --dry-run
```

> **הערה**: סקריפט המתכונים משתמש ב-Playwright (דפדפן) כי Foody טוען תוכן דינמית.
> הוא מחלץ JSON-LD (מרכיבים, זמנים, קלוריות) + הוראות הכנה מהטקסט.

### מתי לסרוק אתר?
| סוג יוצר | אתר נדרש? | סקריפט |
|-----------|-----------|--------|
| food + בלוג מתכונים | כן | `scrape-foody-recipes.mjs` |
| beauty + חנות מוצרים | כן | `deep-scrape-website.mjs` |
| fashion + חנות | כן | `deep-scrape-website.mjs` |
| lifestyle ללא אתר | לא | — |
| brand עם אתר | כן | `deep-scrape-website.mjs` |

---

## שלב 4: העשרת RAG (Enrichment)

אחרי שכל התוכן ב-DB, מריצים העשרה:

```bash
npx tsx --tsconfig tsconfig.json scripts/enrich-rag-chunks.ts <account_id>
```

### מה זה עושה:
1. **תרגום/סיכום עברית** — סיכום עברי לכל chunk (Gemini Flash)
2. **שאילתות סינתטיות** — שאלות חיפוש חלופיות לכל chunk (OpenAI)
3. **ניקוי** — מחיקת chunks קטנים מדי (פחות מ-40 תווים)
4. **העשרת שותפויות** — חילוץ metadata של מותגים ושותפויות

### דגלים:
```bash
--dry-run           # תצוגה מקדימה בלי שינויים
--skip-translation  # דלג על סיכומי עברית
--skip-queries      # דלג על שאילתות סינתטיות
--skip-cleanup      # דלג על ניקוי chunks קטנים
--skip-partnerships # דלג על העשרת שותפויות
--all               # הרץ על כל החשבונות (לא רק אחד)
```

### בדיקת איכות אחרי enrichment:
```sql
-- כמה chunks עם embeddings?
SELECT count(*),
  CASE WHEN embedding IS NOT NULL THEN 'embedded' ELSE 'missing' END as status
FROM document_chunks
WHERE account_id = '<account_id>'
GROUP BY status;

-- כמה עם סיכום עברי?
SELECT count(*),
  CASE WHEN metadata->>'he_summary' IS NOT NULL THEN 'has_summary' ELSE 'no_summary' END
FROM document_chunks
WHERE account_id = '<account_id>'
GROUP BY 2;
```

---

## שלב 5: בניית/עדכון פרסונה

> **בד"כ לא נדרש ידנית** — `scan-account.ts` כבר בונה פרסונה.

### אם צריך לבנות מחדש:

**אופציה א׳: דרך האורקסטרייטור (מלא):**
```bash
npx tsx --tsconfig tsconfig.json scripts/rebuild-persona-orchestrator.ts <account_id>
```
מריץ: preprocess → coupons → RAG → persona → chat config → commerce sync

**אופציה ב׳: רק פרסונה (מהיר, דורש preprocessing_data קיים):**
```bash
npx tsx scripts/rebuild-persona-gpt54.ts <account_id>
```

### בדיקת פרסונה:
```sql
SELECT name,
  persona->'identity'->>'entity_type' as entity_type,
  persona->'tone'->>'primary' as tone,
  jsonb_array_length(persona->'core_topics') as topics_count,
  jsonb_array_length(COALESCE(persona->'products', '[]'::jsonb)) as products_count
FROM chatbot_persona
WHERE account_id = '<account_id>';
```

---

## שלב 6: הגדרת UI (טאבים וברכה)

> **בד"כ אוטומטי** — `scan-account.ts` מייצר tab config.

### בדיקה:
```sql
SELECT config->'tabs' as tabs,
       config->'greeting' as greeting,
       config->'subtitle' as subtitle
FROM chatbot_persona
WHERE account_id = '<account_id>';
```

### עדכון ידני (אם צריך):
```sql
UPDATE chatbot_persona
SET config = config || '{
  "tabs": [
    {"id": "chat", "label": "צ׳אט"},
    {"id": "discover", "label": "גלו"},
    {"id": "content_feed", "label": "מתכונים"}
  ]
}'::jsonb
WHERE account_id = '<account_id>';
```

### טאבים זמינים:
| Tab ID | תיאור | מתי להוסיף |
|--------|--------|-----------|
| `chat` | צ'אט ראשי | תמיד |
| `discover` | גלו — תוכן מומלץ | תמיד |
| `content_feed` | פיד תוכן (מתכונים/טיפוח/לוקים) | כשיש website chunks |
| `coupons` | קופונים | כשיש קופונים |
| `partnerships` | שותפויות | כשיש partnerships |

---

## שלב 7: בדיקה סופית

### צ'קליסט:

```bash
# 1. בדוק שהחשבון קיים
SELECT id, config->>'username', config->>'influencer_type'
FROM accounts WHERE id = '<account_id>';

# 2. בדוק כמויות chunks
SELECT entity_type, count(*),
  count(*) FILTER (WHERE embedding IS NOT NULL) as with_embed
FROM document_chunks
WHERE account_id = '<account_id>'
GROUP BY entity_type;

# 3. בדוק פרסונה
SELECT name, persona->>'identity' IS NOT NULL as has_identity
FROM chatbot_persona WHERE account_id = '<account_id>';

# 4. בדוק tab config
SELECT config->'tabs' FROM chatbot_persona
WHERE account_id = '<account_id>';

# 5. בדוק שהצ'אט עובד
# פתח: https://your-domain.com/chat/<username>
```

### ערכי יעד (benchmarks):
| מדד | מינימום | טוב | מצוין |
|------|---------|-----|-------|
| Posts | 10 | 50+ | 100+ |
| Transcriptions | 20 | 100+ | 500+ |
| Website chunks | 0 | 100+ | 500+ |
| Embeddings coverage | 95% | 99% | 100% |
| Full recipes (food) | 10 | 100+ | 200+ |

---

## תהליך מקוצר — פקודה אחת

למי שרוצה להריץ הכל ברצף:

```bash
# שלב 1+2: סריקה מלאה (יוצר חשבון + סורק + RAG + פרסונה + tabs)
npx tsx --tsconfig tsconfig.json scripts/scan-account.ts <username> <account_id>

# שלב 3: אתר (אם יש)
node --env-file=.env scripts/deep-scrape-website.mjs https://site.co.il --account-id <account_id>

# שלב 4: העשרה
npx tsx --tsconfig tsconfig.json scripts/enrich-rag-chunks.ts <account_id>

# שלב 5: בנייה מחדש של פרסונה (אם סרקנו אתר אחרי scan-account)
npx tsx --tsconfig tsconfig.json scripts/rebuild-persona-orchestrator.ts <account_id>
```

---

## טיפול בבעיות נפוצות

| בעיה | פתרון |
|------|--------|
| Chunks בלי embeddings | `npx tsx scripts/enrich-rag-chunks.ts <id>` |
| פרסונה לא נבנתה | `npx tsx scripts/rebuild-persona-orchestrator.ts <id>` |
| מתכונים בלי מרכיבים | `node --env-file=.env scripts/scrape-foody-recipes.mjs --account-id <id>` |
| אתר לא נסרק | `node --env-file=.env scripts/deep-scrape-website.mjs <url> --account-id <id>` |
| Tabs חסרים | עדכון ידני ב-SQL (שלב 6) |
| `he_summary = "null"` | באג ישן, הenrichment החדש מתקן |
| Chunks כפולים | הסקריפטים מטפלים ב-dedup אוטומטית |
