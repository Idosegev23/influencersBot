# Widget Behavioral Intelligence + Cart-Aware Proactive Slice — Design

- **Date:** 2026-07-05
- **Status:** Approved design → pending implementation plan
- **Owner:** Ido
- **Sub-project:** #0 Foundation + #1 Intelligence Collection (+ first proactive cart slice)

---

## 1. רקע ובעיה

הווידג'ט המוטמע (`public/widget.js`) כבר אוסף page-context ואירועי funnel בסיסיים, אבל:

1. **הדשבורד האדמין מציג דאטה לא-אמין.** חקירה (2026-07-05) העלתה שעבור `argania_group` מתוך 1,288 אירועי widget, **1,258 (~98%) הם `backfill_reconstructed`** — אירועים סינתטיים שהוזרקו חד-פעמית ב-14.6 משוחזרים מ-`chat_messages` (commit `56670c5`), עם `payload.reconstructed=true`. הם מנפחים את הכותרות, קופאים בזמן, ויוצרים סימטריה מזויפת (`widget_message_sent = widget_message_received = 498`).
2. **צינור הקליקים מת.** `widget_recommendations`: 2,136 המלצות, 66 מוצרים, 3 אסטרטגיות, על פני מרץ–יולי — **0 קליקים, 0 `clicked_at`**. ההמלצות נכתבות בצד-שרת (עדות לתעבורת צ'אט אמיתית: 1,181 זוגות הודעות), אבל אף קליק לא נרשם.
3. **המדידה החיה חלקית.** אירועים אמיתיים ≈ 30 בלבד, רובם `widget_loaded`. כלומר יש שימוש אמיתי מתחת לפני השטח — פשוט לא מדדנו אותו.

**המסקנה:** לפני שבונים דשבורד "אנליטיקס עמוק ללקוח" צריך יסוד דאטה אמין + שכבת איסוף אמיתית וסקלבילית. סאב-פרויקט זה בונה את שניהם, ומוסיף slice פרואקטיבי אחד מקצה-לקצה (עגלה חיה → המלצות משלימות) שמוכיח את כל הצינור.

### תיקון רשומה
`signWidgetToken()` נופל חזרה ל-`IP_HASH_SALT || SUPABASE_SERVICE_ROLE_KEY`, כך שה-token כן מונפק בפרודקשן. ה"blackout" המלא שתועד בזיכרון קודם **אינו מדויק** — הצינור חי אך התעבורה האמיתית דלה, וה-backfill+0-clicks הם הבעיה האמיתית.

---

## 2. מיקום בחזון הכולל (החלטת פירוק)

החזון המלא = הווידג'ט כפלטפורמת מודיעין + המרה + דיווח-ללקוח. פורק ל-4 תת-מערכות:

- **#0 · יסוד: אמינות דאטה** — מחיקת backfill + תיקון צינור קליקים/המרות.
- **#1 · שכבת מודיעין** — איסוף התנהגותי סקלבילי (הספק הזה).
- **#2 · צ'אט מכירתי מודע-הקשר** — עגלה/עמוד/גלישה → מכירה פרואקטיבית.
- **#3 · דשבורד אנליטיקס ללקוח** — משטח פונה-ללקוח על דאטה אמיתי בלבד.

**הספק הזה מכסה #0 + #1 + slice ראשון של #2** (המלצות משלימות על add-to-cart). #3 והטריגרים הפרואקטיביים האחרים מחוץ לגבולות.

---

## 3. החלטות מפתח (נגזרות מ-brainstorming)

| נושא | החלטה |
|------|-------|
| עומק איסוף | **Tier B** — סיגנלים התנהגותיים + clickstream מלא. **ללא** session-replay/DOM recording. |
| פרטיות | **אנונימי + מיסוך PII.** anon_id בלבד, hash ל-IP, מיסוך ערכי שדות, הסרת PII מ-path. ללא consent-gating וללא זיהוי אישי בשלב האיסוף. |
| שימור | **גולמי 90 יום** (partition drop) **+ rollups קבועים.** |
| ארכיטקטורה | **צינור ייעודי סקלבילי** (לא הרחבת `events`). |
| מנוע אחסון | **Postgres מחולק (partitioned) + Redis buffer.** ללא וונדור columnar חדש. |
| עגלה חיה | חובה — לא רק אנליטיקס, אלא **טריגר חי** להמלצות פרואקטיביות. |
| מקור המלצות משלימות | **AI מעוגן-קטלוג** (LLM בוחר מתוך `widget_products`). |
| משטח פרואקטיבי | **כרטיס/פופאפ צף** מעוגן לבועית (לא חובה בתוך הצ'אט). |

---

## 4. ארכיטקטורה

```
widget.js (Collector + Cart Watcher)
      │  batched sendBeacon
      ▼
/api/widget/events  (Ingest Edge)  ──►  Upstash Redis buffer
                                              │
                                   Drain worker (cron 1–2m)  ──►  widget_events (partitioned raw, 90d)
                                                                        │
                                                        Rollup cron (~10m + nightly)
                                                                        ▼
                                                   widget_sessions + widget_daily_stats  ──►  Dashboard (#3)

Cart Watcher ──► Trigger Engine ──► /api/widget/complementary (AI) ──► Proactive Surface (popup)
```

רכיבים: (1) Collector, (2) Ingest Edge, (3) Redis buffer, (4) Drain worker, (5) Partitioned store + Rollups, (6) Cart Watcher, (7) Trigger Engine + Proactive Surface.

---

## 5. מודל נתונים

### 5.1 `widget_events` — raw, מחולק לפי חודש
```sql
CREATE TABLE widget_events (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  account_id  uuid NOT NULL,
  anon_id     text,
  session_id  uuid,
  type        text NOT NULL,
  path        text,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
-- partition חודשי; אינדקס (account_id, created_at DESC, type)
```
- **כל אירועי הווידג'ט** (funnel + behavioral + commerce) יושבים כאן, ומחליפים את `mode='widget'` בטבלת `events` הישנה (שממשיכה לשרת משטחים אחרים).
- Pruning = `DROP PARTITION` לחודשים >90 יום (מיידי).

### 5.2 `widget_sessions` — rollup ברמת ביקור (קבוע)
```
account_id, anon_id, session_key, first_seen, last_seen, duration_sec,
page_count, max_scroll_pct, product_views int, viewed_product_ids text[],
cart_max_value numeric, cart_max_items int, reached_checkout bool,
converted bool, revenue numeric, opened_widget bool, sent_message bool,
message_count int, entry_path, exit_path, exit_kind, attribution jsonb
```
- `session_key` = קיבוץ לפי `anon_id` + חלון זמן (פער >30 דק' = סשן חדש), כדי למדוד ביקורים גם ללא פתיחת צ'אט.

### 5.3 `widget_daily_stats` — rollup חשבון×יום (קבוע)
```
account_id, day, sessions, unique_visitors, widget_opens, messages,
product_views, add_to_carts, checkouts, conversions, revenue,
avg_scroll_pct, avg_duration_sec, top_products jsonb, top_pages jsonb
```
- **הדשבורד קורא רק מכאן** לגרפי זמן.

### 5.4 טקסונומיית אירועים (Tier B)
| קטגוריה | אירועים |
|---------|---------|
| מחזור חיים | `page_view`, `session_start`, `session_end` |
| engagement | `scroll_depth` (max%), `time_on_page`, `exit_intent`, `tab_visibility` |
| מסחר | `product_view`, `cart_state`, `cart_change`, `checkout_reached`, `purchase` |
| clickstream | `click` (סוג/טקסט/href/מיקום), `internal_nav`, `external_link_click` |
| widget funnel (קיים) | `widget_loaded/opened/closed/message_sent/message_received/...` |

---

## 6. צינור ה-Ingest

- **Collector (widget.js):** מרחיב את התור המבואץ הקיים (`EVENT_QUEUE`/`flushAnalytics`). קולקטורים חדשים: scroll, time-on-page, exit-intent, click, page_view, + Cart Watcher. שליחה ב-batches ב-`sendBeacon`. **knobs של sampling** נשלטים מ-`/api/widget/config` (למשל sampling ל-`click` בנפח גבוה).
- **Ingest Edge — `/api/widget/events`:** endpoint ייעודי. מוודא widget token + schema (reuse ל-`parseBatch`/`ingestBatch` עם התאמות), כותב את ה-batch ל-**Upstash Redis buffer** ומחזיר `204` מהר. rate-limit לכל חשבון (middleware קיים).
- **Drain worker (cron, כל 1–2 דק'):** שולף batches מה-buffer, **bulk-insert** ל-partition הנוכחי. אידמפוטנטי (dedupe לפי event id שנוצר בלקוח). כשל = האירועים נשארים ב-buffer (at-least-once).

---

## 7. Rollup + שימור

- **Rollup cron (~10 דק' + לילי):** קורא raw חדש מאז **watermark** (טבלת state קטנה), עושה upsert ל-`widget_sessions` ו-increment ל-`widget_daily_stats`.
- **Partition cron (לילי):** יוצר partition לחודש הבא מראש; `DROP` לפרטישנים >90 יום.
- כל השאילתות של הדשבורד (#3) קוראות מהרולאפים בלבד — O(rollup), לא O(raw).

---

## 8. Cart Watcher + Trigger + פופאפ פרואקטיבי (ה-slice)

- **Cart Watcher (client):** אדפטרים לפי פלטפורמה, **QuickShop ראשון** (ארגניה חיה עליו), אחריו Shopify `/cart.js`, Woo, ו-fallback גנרי (dataLayer/DOM). זיהוי add-to-cart ע"י: poll לנקודת עגלה + יירוט fetch/XHR לכתובות עגלה + DOM mutation על מונה העגלה. debounced. פולט `cart_change {added_product, items, value}` **גם** לצינור האנליטיקס **וגם** למנוע הטריגרים (סינכרוני).
- **Trigger Engine:** על פריט חדש → throttle (מקס' 1 ל-N דק', cooldown אחרי dismiss, לא כשהצ'אט פתוח) → קריאה לשרת.
- **`/api/widget/complementary`:** קלט = המוצר שנוסף (id/שם/קטגוריה) + accountId. **AI מעוגן ב-`widget_products`** מחזיר 2–3 משלימים. כותב `widget_recommendations` עם `strategy='complementary_cart'` לאטריביושן. **cache לכל מוצר** לשליטת עלות.
- **Proactive Surface:** כרטיס צף מעל הבועית — *"מוסיפים X? זה משלים אותו 👇"* + כרטיסי מוצר. קליק על מוצר → מעבר מיוחס (`bestieTag`); *"שאל"* → מתרחב לצ'אט עם הקשר; dismiss → cooldown.

---

## 9. יסוד (#0)

1. **מחיקת backfill:** `DELETE FROM events WHERE mode='widget' AND metadata->>'source'='backfill_reconstructed';` (~1,258 שורות). לגבות תחילה ל-`_bkp` לפי הקונבנציה.
2. **תיקון צינור קליקים:** אינסטרומנטציה ל-beacon של קליק כרטיס/לינק → לאשש שהוא מגיע ל-`/api/widget/recommendations/click` ומסמן `was_clicked`. לשרש את ה-0-clicks (beacon/CORS מול "אין קליקים אמיתיים"). לחבר קליק מוצר גם כ-`click` event ב-`widget_events`.
3. **אימות המרות:** לוודא end-to-end שצינור `widget_conversions` (זיהוי thank-you → `/api/widget/conversion` → טבלה) עובד.
4. **עדכון RPC/route:** `widget_analytics_summary` + `/api/admin/analytics/widget-summary` יקראו מהמקורות החדשים (widget_events/rollups), ללא הצורך בדגל reconstructed.

---

## 10. פרטיות · שגיאות · תצפיתיות

- **פרטיות:** anon_id בלבד; hash ל-IP; **מיסוך ערכי שדות** (לעולם לא תוכן input); הסרת PII מ-query-string ב-`path`; `cart_state` שומר מזהי-מוצר/סכום, לא זהות לקוח.
- **שגיאות:** buffer overflow → drop-oldest + counter; drain fail → retry, נשאר ב-Redis; **Cart Watcher לעולם לא שובר את דף המארח** (try/catch מקיף + feature-detect); הפופאפ לא חוסם קלט/גלילה.
- **תצפיתיות:** counters ל-ingested/drained/dropped; אות "pipeline active" (מבוסס realtime events) מורחב; לוגים לצינור הקליקים בזמן השרשור.

---

## 11. אסטרטגיית בדיקות (TDD)

- **יחידה:** ולידציית אירוע/schema; אגרגציית rollup (SQL) על קלט ידוע; prompt המשלימים (מחזיר רק מוצרי קטלוג אמיתיים); פרסינג אדפטר QuickShop.
- **אינטגרציה:** `ingest → Redis → drain → rollup` על batch זרוע, אימות ספירות ברולאפ.
- **e2e:** סימולציית add-to-cart בדף דמוי-QuickShop → הפופאפ הפרואקטיבי מופיע עם משלימים; קליק → נרשם `was_clicked`.

---

## 12. פיזינג בנייה

1. **Phase A — יסוד (#0):** מחיקת backfill, תיקון קליקים, אימות המרות, עדכון RPC. עצמאי ובר-שילוח.
2. **Phase B — צינור (§6–§7):** widget_events partitioned + Redis buffer + drain + rollups + collectors חדשים. עצמאי.
3. **Phase C — slice עגלה (§8):** Cart Watcher + Trigger + complementary + פופאפ. עצמאי.

---

## 13. קריטריוני הצלחה

- אין אירועי `backfill_reconstructed`; כל מספר בדשבורד מגיע מדאטה אמיתי.
- קליק על כרטיס/לינק מוצר מסמן `was_clicked` ומופיע ב-CTR (מאומת e2e).
- אירועים התנהגותיים (scroll/click/product_view/cart_change) זורמים דרך הצינור ומופיעים ברולאפים תוך ≤15 דק'.
- על add-to-cart אמיתי בארגניה (QuickShop) מופיע פופאפ עם 2–3 משלימים אמיתיים מהקטלוג, מיוחס.
- הצינור עומד בשיא של אלפי אירועים/דקה בלי לאבד דאטה (buffer סופג, drain מדביק).

---

## 14. סיכונים ושאלות פתוחות

- **זיהוי add-to-cart ב-QuickShop** — אין API רשמי מתועד; ייתכן שיצריך reverse-engineering של נקודת ה-cart/DOM. ראשון-לאימות ב-Phase C.
- **עלות ה-AI complementary** — cache לכל מוצר + throttle צריכים להחזיק את העלות נמוכה; לנטר.
- **מיגרציית `mode='widget'` הישן** — האם למגרר היסטוריה אמיתית (לא-backfill) ל-`widget_events`, או להתחיל נקי? (ברירת מחדל מוצעת: להתחיל נקי אחרי מחיקת ה-backfill; היסטוריה אמיתית דלה ממילא.)
