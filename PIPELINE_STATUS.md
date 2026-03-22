# Pipeline Status — תמונת מצב מלאה

> עדכון אחרון: 2026-03-19

---

## 1. זרימת נתונים: מאינסטגרם עד תשובה בצ'אט

```
┌─────────────────────────────────────────────────────────┐
│                   DATA INGESTION                         │
│                                                          │
│  Instagram ──► ScrapeCreators API ──► DB Tables          │
│    ├─ Profile        → instagram_profile_history         │
│    ├─ Posts (50)      → instagram_posts                  │
│    ├─ Highlights (15) → instagram_highlights/items       │
│    ├─ Comments        → instagram_comments               │
│    └─ Bio Links       → website_data (crawl)             │
│                                                          │
│  Website ──► deep-scrape-website.mjs ──► website_data    │
│    └─ Cheerio crawl, max pages configurable              │
│                                                          │
│  Video/Reel Audio ──► Gemini Flash ──► transcriptions    │
│    └─ + OCR for on-screen text                           │
│                                                          │
│  ┌──────────────────────────────────────────┐             │
│  │         RAG INGESTION (ingest.ts)        │             │
│  │                                          │             │
│  │  Raw Content                             │             │
│  │    ↓ normalizeText()                     │             │
│  │  Clean Text                              │             │
│  │    ↓ chunkText() [400 tokens, 12% overlap]│            │
│  │  Chunks                                  │             │
│  │    ↓ generateEmbeddings() [OpenAI]       │             │
│  │  Vectors (1536-dim)                      │             │
│  │    ↓ upsert                              │             │
│  │  documents + document_chunks (Supabase)  │             │
│  └──────────────────────────────────────────┘             │
│                                                          │
│  ┌──────────────────────────────────────────┐             │
│  │       ENRICHMENT (enrich.ts)             │             │
│  │                                          │             │
│  │  1. מחיקת chunks זעירים (<20 tokens)     │             │
│  │  2. תרגום/סיכום עברי לתוכן אנגלי        │             │
│  │  3. Synthetic queries (3-5 שאלות per chunk)│            │
│  │  4. קישור partnerships לתוכן             │             │
│  └──────────────────────────────────────────┘             │
│                                                          │
│  ┌──────────────────────────────────────────┐             │
│  │       PERSONA (rebuild-persona)          │             │
│  │                                          │             │
│  │  All content ──► GPT-5.4 ──► chatbot_persona         │
│  │    ├─ voice_rules (tone, identity, firstPerson)       │
│  │    ├─ knowledge_map (topics, subtopics, keyPoints)    │
│  │    ├─ boundaries (discussed, uncertainAreas)          │
│  │    └─ response_policy (refuse, cautious, style)       │
│  └──────────────────────────────────────────┘             │
│                                                          │
│  Coupons ──► auto-extract from posts/partnerships        │
│    → coupons table (brand, code, discount, link)         │
└─────────────────────────────────────────────────────────┘
```

---

## 2. צינור הצ'אט: מהודעת משתמש עד תשובה

```
User sends message
       ↓
┌─ Phase 0: Parse + Sanitize ──────────────────────┐
│  sanitizeChatMessage(), sanitizeUsername()         │
└──────────────────────────────────────────────────┘
       ↓
┌─ Phase 1: Early Cache Check ─────────────────────┐
│  fromSuggestion?                                  │
│    → getCachedSuggestionResponse()                │
│    → If hit + no lead: stream cached (~50ms) ✅    │
│    → If miss: continue pipeline                   │
└──────────────────────────────────────────────────┘
       ↓
┌─ Phase 2-4: Parallel Loading ────────────────────┐
│  Promise.all([                                    │
│    loadInfluencer (profile, config)               │
│    loadBrands (active partnerships)               │
│    loadHistory (last 10 messages from DB)         │
│    buildPersonalityFromDB (L1 cache, 5min TTL)    │
│    understandMessageFast (regex intent detection)  │
│    acquireLock (session lock)                      │
│  ])                                               │
└──────────────────────────────────────────────────┘
       ↓
┌─ Phase 5: Decision Engine ───────────────────────┐
│  → handler: 'chat' | 'support_flow'              │
│  → modelStrategy: { tier: nano|standard|full }    │
│  → uiDirectives (cards, quick actions)            │
└──────────────────────────────────────────────────┘
       ↓
┌─ Phase 6: SandwichBot ───────────────────────────┐
│                                                   │
│  LAYER 2A — Route to Archetype                    │
│    routeToArchetype() → cooking/skincare/general  │
│    Returns: archetype + confidence                │
│                                                   │
│  LAYER 2B — Retrieve Knowledge                    │
│    ┌─────────────────────────────────────┐         │
│    │ Query Enrichment:                   │         │
│    │   if msg < 80 chars:                │         │
│    │     + last 2-3 user messages        │         │
│    │     + rolling summary (if exists)   │         │
│    │   → enriched query for RAG          │         │
│    └─────────────────────────────────────┘         │
│    ┌─────────────────────────────────────┐         │
│    │ retrieveKnowledge():                │         │
│    │   1. Query expansion (Gemini)       │         │
│    │   2. Vector search (pgvector)       │         │
│    │      → top 12 chunks by cosine sim  │         │
│    │   3. Keyword supplement (+20 more)  │         │
│    │   4. Rerank (BM25 + freshness)      │         │
│    │   5. Direct DB: coupons, partners   │         │
│    │   → KnowledgeBase object            │         │
│    └─────────────────────────────────────┘         │
│    ┌─────────────────────────────────────┐         │
│    │ compactKnowledgeContext():           │         │
│    │   Coupons (never truncated)         │         │
│    │   + Posts (max 8, 1500 chars each)  │         │
│    │   + Transcriptions (max 8)          │         │
│    │   + Highlights (max 6)              │         │
│    │   + Partnerships (max 15)           │         │
│    │   + Websites (max 10)               │         │
│    │   → Dedup → Hard cap 30K chars      │         │
│    └─────────────────────────────────────┘         │
│                                                   │
│  LAYER 2+3 — Archetype + Guardrails              │
│    1. Check guardrails (banned keywords)          │
│    2. Build system prompt:                        │
│       [Identity + Gender]                         │
│       [Conversation context rules]                │
│       [Personality block]                         │
│       [Persona context]                           │
│       [Knowledge base]                            │
│       [Banned phrases]                            │
│       [Suggestion format]                         │
│    3. Call LLM (streaming)                        │
│    4. Stream tokens via onToken callback          │
│                                                   │
│  LAYER 1 — Personality (baked in system prompt)   │
│    ✓ Not applied post-hoc                         │
│                                                   │
│  Fallback: if no <<SUGGESTIONS>> → add per-archetype│
└──────────────────────────────────────────────────┘
       ↓
┌─ Phase 8: Policy Check ─────────────────────────┐
│  Rate limiting, content filtering, PII redaction  │
└──────────────────────────────────────────────────┘
       ↓
┌─ Phase 9-10: Stream to Client ───────────────────┐
│  NDJSON events: meta → delta (tokens) → done     │
└──────────────────────────────────────────────────┘
       ↓
┌─ Phase 11-12: After (non-blocking) ─────────────┐
│  Save messages → Update session                   │
│  Cache response → Prewarm next suggestions        │
│  Update rolling summary (if msg_count % 20 == 0)  │
└──────────────────────────────────────────────────┘
```

---

## 3. מודלים — מי עושה מה

| מודל | שימוש | קובץ | הערות |
|------|--------|------|-------|
| **GPT-5.4** | צ'אט ראשי (primary) | `baseArchetype.ts:22` | מודל מלא, איכות גבוהה בעברית |
| **GPT-5.4-mini** | צ'אט fallback | `baseArchetype.ts:23` | x1.9 מהיר, איכות נמוכה יותר |
| **GPT-5.4-nano** | צ'אט לשאלות פשוטות (tier=nano) | `baseArchetype.ts:25` | x2.3 מהיר, TTFT מצוין |
| **GPT-5.4** | בניית פרסונה | `rebuild-persona-gpt54.ts` | ניתוח טון, נושאים, גבולות |
| **Gemini 2.5 Flash** | Query expansion | `retrieve.ts:~90` | הרחבת שאילתא (8-12 מונחים) |
| **Gemini Flash** | תמלול וידאו + OCR | `content-processor` | Audio→Text, Image→Text |
| **Gemini Flash** | Enrichment (סיכום עברי, synthetic queries) | `enrich.ts` | תרגום + יצירת שאלות |
| **OpenAI text-embedding-3-small** | Embeddings (1536-dim) | `embeddings.ts` | RAG vectors + query vectors |
| **Gemini** (via routeToArchetype) | סיווג archetype | `intentRouter.ts` | cooking/skincare/general/etc |

### סיכום עלויות מודלים per-message:

```
הודעה רגילה (standard tier):
  1x Gemini Flash Lite — query expansion (~0.001$)
  1x OpenAI embedding — query vector (~0.0001$)
  1x GPT-5.4 — response generation (~0.01-0.03$)
  ─────────────────────────────────
  Total: ~$0.01-0.03 per message

Suggestion prewarm (background, per suggestion):
  Same as above × 3 suggestions = ~$0.03-0.09

Nano tier (simple questions):
  1x GPT-5.4-nano instead of 5.4 = ~$0.003-0.005
```

---

## 4. Widget vs Social Chat — הבדלים

| היבט | Social Chat (`/chat/[username]`) | Widget (`widget.js`) |
|------|----------------------------------|---------------------|
| **API** | `/api/chat/stream` | `/api/widget/chat` |
| **Mode** | `social` | `widget` |
| **Suggestions** | `<<SUGGESTIONS>>` parsed + shown as buttons | Stripped, not shown |
| **Recommendations** | לא | כן — `getRecommendations()` injected |
| **Lead capture** | Popup אחרי 4 הודעות | אין |
| **Support flow** | State machine (brand→name→order→problem→phone) | אין |
| **History** | 10 הודעות אחרונות מ-DB | 10 הודעות אחרונות מ-DB |
| **System prompt** | Personality + knowledge | Personality + knowledge + widget config (FAQ, tone, focus) |
| **CTA** | Suggestions buttons | CTA טבעי בטקסט |
| **Typing indicator** | 3 נקודות מקפצות | 3 נקודות מקפצות |

---

## 5. Caching — 3 שכבות

| שכבה | מה | TTL | מהירות |
|------|-----|-----|--------|
| **L1 Memory** | personality config, entity keywords | 5 דקות | <1ms |
| **L2 Redis** | suggestion cache, account config, session state | 30min-24h | 5-50ms |
| **L3 Supabase** | הכל (persistent) | ∞ | 50-500ms |

### Suggestion Cache Flow:
```
User clicks suggestion
  → Check Redis cache (MD5 hash of normalized query)
  → Hit + no lead_id? Return cached response (~50ms)
  → Miss? Run full pipeline (~2-3s)
  → Cache result for next time

After response streamed:
  → Extract <<SUGGESTIONS>> from response
  → Prewarm each in background (fire-and-forget)
  → Pass conversationHistory for context
```

---

## 6. בניית System Prompt — מבנה

```
┌──────────────────────────────────────────────────┐
│  "אתה {influencerName}, יוצר/ת תוכן..."         │
│                                                   │
│  ⚠️ מגדר: [dynamic — נקבה/זכר/ניטרלי]           │
│  ⚠️ אל תפתח עם כינויי חיבה                      │
│                                                   │
│  📜 הקשר שיחה: תמיד תבין הפניות להיסטוריה       │
│                                                   │
│  🎯 תפקיד: {archetype.name}                      │
│  📝 {archetype.description}                       │
│  📋 תבניות תשובה (per archetype)                  │
│                                                   │
│  🎭 סגנון אישיות:                                │
│     narrativePerspective, sassLevel, emoji...      │
│     voiceRules, knowledgeMap, boundaries           │
│                                                   │
│  📚 בסיס הידע:                                    │
│     💰 קופונים (תמיד מוצגים, לא נחתכים)          │
│     📸 פוסטים רלוונטיים                           │
│     🎬 תמלולים                                    │
│     ⭐ highlights                                  │
│     🤝 partnerships                                │
│     🌐 תוכן אתר                                  │
│                                                   │
│  📌 Suggestions format (not in widget)             │
│                                                   │
│  🚨 דיוק: אל תמציא                               │
│  🔎 שימוש בידע: שמות ספציפיים, לא "הסדרות שלהם"  │
│  🚫 ביטויים אסורים: "מה יש לנו פה", "מהמידע..."  │
│                                                   │
│  ⚠️ כללים: ברכות, עניין אישי, out-of-scope        │
│                                                   │
│  [conversationHistory — last 10 messages]          │
│  [userMessage]                                     │
└──────────────────────────────────────────────────┘
```

---

## 7. בעיות ידועות 🔴🟡🟢

### 🔴 קריטי — משפיע על איכות תשובות

| # | בעיה | פירוט | קובץ/מיקום |
|---|-------|--------|------------|
| 1 | **RAG noise — "שערות קדאיף" מזהם חיפוש "שיער"** | chunks של מתכונים מכילים מילים כמו "שערות", "שמפוררים" שנתפסים כתוצאות לשאלות על שיער. 6 chunks אמיתיים של La Beaute (שמפו, מסכה, ספריי) טובעים ברעש | `retrieve.ts`, `document_chunks` |
| 2 | **מגדר לא מזוהה — firstPerson="גוף ראשון יחיד"** | הregex שלנו מחפש "נקבה" אבל הערך בDB הוא "גוף ראשון יחיד" (ניטרלי). דניאל עמית עדיין מדברת בסלאש "יכול/ה" | `baseArchetype.ts:373`, `chatbot_persona.voice_rules` |
| 3 | **קופונים עם שם "מותג" גנרי** | 5 קופונים מוצגים כ-"מותג" במקום שם אמיתי. ה-display fallback בקוד מציג "מותג" כשחסר שם | `compact-knowledge-context.ts`, `coupons` table |
| 4 | **הבוט אומר "אין לי מידע" כשיש** | שאלה "מוצרים לשיער?" → "אין לי שמות ספציפיים" — אבל ב-RAG יש La Beaute עם שמפו, מרכך, מסכות, ספריי, בושם לשיער. ה-retrieval לא מביא אותם | RAG retrieval + reranking |
| 5 | **Enrichment לא רץ — 0 chunks מועשרים** | דניאל עמית: 5,415 chunks, 0 enriched (אין hebrew_summary). Synthetic queries קיימים (90.5%) אבל חלקם הזויים (פנקייק → קניידלאך) | `enrich.ts`, `document_chunks.metadata` |

### 🟡 בינוני — חוויה לא מושלמת

| # | בעיה | פירוט | קובץ/מיקום |
|---|-------|--------|------------|
| 6 | **ביטויים רובוטיים חדשים לא חסומים** | "אין לי אצלנו", "מה שיש אצלנו כרגע בעולמות קרובים", "נוכל גם לדייק יחד" — נשמעים כמו בוט, לא כמו משפיענית | `baseArchetype.ts` — צריך להרחיב רשימת banned |
| 7 | **Typing indicator נעלם** | `setIsTyping(false)` נקרא לפני שה-stream מתחיל → רגע בלי אינדיקטור | `page.tsx:607` — **תוקן, לא נדחף עדיין** |
| 8 | **39 chunks זעירים (<100 chars)** | רעש ב-RAG: "ai ai ai ai... shabbat shabbat!", שמות מסעדות בודדים, קטעים חסרי משמעות | `document_chunks` — צריך cleanup |
| 9 | **דפי אתר זבל ב-RAG** | הצהרת נגישות (3 chunks, ~4000 chars), תפריטי ניווט, footers חוזרים — תופסים מקום ב-retrieval | `document_chunks` entity_type=website |
| 10 | **Memory V2 כבוי לכל החשבונות** | rolling_summary לא מתעדכן → שיחות ארוכות מאבדות הקשר אחרי 10 הודעות | `MEMORY_V2_ENABLED` env var |
| 11 | **DM ice breakers של LDRS מתייחסים לקופונים** | "יש לך קופון?" — אבל LDRS הם סוכנות, אין להם קופונים | `accounts.config.dm_bot` |

### 🟢 נמוך / תוקן

| # | בעיה | פירוט | סטטוס |
|---|-------|--------|--------|
| 12 | חיתוך טקסט באמצע מילה | truncate() חותך ב-1500 chars ללא התחשבות בגבול משפט | ✅ תוקן — חיתוך בגבול משפט |
| 13 | Suggestion clicks בלי הקשר שיחה | לחיצה על suggestion → RAG search ללא היסטוריה | ✅ תוקן — enrichment עם context |
| 14 | Prewarm suggestions ללא היסטוריה | `conversationHistory: []` → תשובות cached ללא הקשר | ✅ תוקן — מעביר history |
| 15 | GPT-5.4-mini כ-primary | הוחלף ב-18/3, גרם לירידה באיכות | ✅ תוקן — חזרה ל-GPT-5.4 |
| 16 | Fallback error רובוטי | "אני קצת מתקשה למצוא את המידע המדויק" | ✅ תוקן — "אופס, משהו השתבש" |

---

## 8. מדדי ביצועים

### זמנים (target vs actual)

| שלב | Target | בפועל | הערה |
|------|--------|--------|------|
| Early cache hit (suggestion) | <200ms | 50-150ms | ✅ |
| Full pipeline (no cache) | <3s | 2.5-3.5s | ✅ |
| TTFT (Time to First Token) | <1s | 600-1000ms | ✅ |
| RAG vector search | <500ms | 200-400ms | ✅ |
| Query expansion (Gemini) | <800ms | ~600ms | ✅ |
| Personality load (L1 cache) | <5ms | <1ms | ✅ |
| History load (10 msgs) | <100ms | 30-80ms | ✅ |
| Message save (after) | async | 100-200ms | ✅ |
| Suggestion prewarm (per item) | background | 500-1000ms | ✅ |
| **Outlier: OpenAI timeout** | <10s | **up to 141s** | 🔴 no timeout configured |

### עלויות per-message

| Tier | עלות משוערת | מתי |
|------|-------------|------|
| Nano | ~$0.005 | שאלות פשוטות (ברכות, "מה חדש") |
| Standard | ~$0.01-0.03 | רוב השאלות |
| Full | ~$0.01-0.03 | כמו standard (אותו מודל) |
| Prewarm (×3) | ~$0.03-0.09 | background, per response |

---

## 9. מה חסר / רעיונות לשיפור

### RAG Overhaul — סדר עבודה מוסכם

```
Phase 0 — Foundation (עכשיו)
  ✅ Timeout 8s על OpenAI embeddings
  ✅ Embedding cache (in-memory LRU, 30min TTL)
  ✅ Context neglect fix בprompt
  ⬜ Evaluation framework — 50 test queries per account type
  ⬜ Typing indicator fix (תוקן, לא נדחף)

Phase 1 — Rechunk + Re-embed (ביחד, פעם אחת)
  ⬜ Semantic chunking לפי source type:
      post/highlight → chunk שלם (100-300 tokens)
      website/transcription → semantic split (לפי paragraphs/topics)
      fallback → recursive 512-token עם overlap
  ⬜ מעבר ל-text-embedding-3-large (3072 dims)
  ⬜ DB migration: vector(1536) → vector(3072)
  ⬜ Drop + recreate HNSW index
  ⬜ Re-embed כל ה-chunks (batch, background)
  ⬜ Update RPC match_document_chunks

Phase 2 — Classification + Quality
  ⬜ הוסף עמודות: topic, sub_topic, content_type, quality_score
  ⬜ Gemini Flash batch classification על כל ה-chunks
  ⬜ סינון chunks עם quality < 0.2
  ⬜ RPC v2 עם topic pre-filter (לפני vector search)

Phase 3 — Hybrid Search
  ⬜ הוסף tsvector column על chunk_text
  ⬜ BM25 search (tsquery) לצד vector
  ⬜ RRF merge — keyword rank + vector rank
  ⬜ Exact match boost (שמות מותגים, קודי קופון)

Phase 4 — Structured Extraction
  ⬜ טבלת account_entities (products, recipes, services, clients)
  ⬜ חילוץ מוצרים/מתכונים/שירותים מ-chunks קיימים
  ⬜ Smart retrieval router (structured vs vector vs hybrid)
  ⬜ Account profiles (type, chat_mode, gender, content_domains)

Phase 5 — Advanced
  ⬜ Cohere Rerank / cross-encoder
  ⬜ Context budget enforcement (<6K tokens)
  ⬜ HyDE for vague queries
  ⬜ Continuous eval (automated test runs)
```

### שיפורים נוספים
- [ ] **שדה gender מפורש** בchatbot_persona
- [ ] **הרחבת רשימת ביטויים אסורים**
- [ ] **הפעלת Memory V2** — rolling summary
- [ ] **ניקוי קופונים** — brand_name=NULL
- [ ] **LDRS customization** — qualifying flow, brief generator
