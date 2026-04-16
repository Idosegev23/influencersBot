# סיכום סשן — 16 באפריל 2026

## מה נעשה בסשן הזה

### 1. קומפוננטות UI מ-Figma (Chat Page — Follower)

נבנו 3 קומפוננטות חדשות מעיצוב Figma לעמוד הצ'אט של ה-follower:

#### ChatInput (`src/components/chat/ChatInput.tsx`)
- שדה קלט pill-shaped עם שני מצבים:
  - **Default:** border שקוף, send button שחור (#0C1013) עם opacity 0.25
  - **Active (focus/typing):** border סגול (#883FE2), send button סגול
- Shadow: `0px 6px 20px rgba(0,0,0,0.10)`
- תמיכה ב-media attach + preview + disclaimer
- **הוחלף** את שני ה-inline textareas ב-`src/app/chat/[username]/page.tsx`

#### NavTabs (`src/components/chat/NavTabs.tsx`)
- תפריט ניווט תחתון/עליון
- **טאב לא פעיל = רק אייקון**, **טאב פעיל = אייקון + טקסט + רקע סגול**
- מיפוי אייקונים **לפי label קודם** (ולא tab ID) — כי אותו tab ID (`content_feed`, `topics`, `coupons`) משמש עם labels שונים בחשבונות שונים
- אייקונים שנבחרו (lucide-react):
  - טיפוח → `Droplets`
  - לוקים → `Shirt`
  - מתכונים → `CookingPot`
  - שירותים → `BriefcaseBusiness`
  - סקירות → `BadgeCheck`
  - המלצות → `Stars`
  - טיפים → `Stars`
  - קופונים → `Ticket`
  - מבצעים/דילים/הטבות → `Tag`
  - גלו → `Compass`
  - צ'אט → `MessageCircle`
  - בעיה במוצר/בהזמנה → `AlertCircle`
  - מוצרים → `ShoppingBag`
- **הוחלף** גם desktop header nav וגם mobile bottom nav ב-page.tsx

#### StarterPills (`src/components/chat/StarterPills.tsx`)
- כפתורי הצעות שאלות (suggested questions)
- `flex-wrap` עם `max-width: 350px` — לא בורח מגבולות המסך
- **בלי אימוג'ים** — מסירה אוטומטית (stripEmojis)
- תמיכה ב-`extraPill` — כפתור "גלו עוד" משולב בתוך אותו grid
- **עובד לכל סוגי החשבונות** (הוסרה ההתניה `media_news`)
- CSS: רקע לבן, hover אפור `#F4F5F7`, borderRadius 23px, Heebo 13px

#### קבצי CSS שעודכנו (`src/app/globals.css`)
- `.chat-input-pill` + `.chat-input-pill--active` — מצבי default/active
- `.send-btn` — שחור default, סגול ב-active
- `.nav-tab` + `.nav-tab--active` — icon only / icon+label+purple
- `.starter-pills-grid` + `.starter-pill` — flex-wrap grid
- Mobile overrides עודכנו בהתאם

#### page.tsx שינויים (`src/app/chat/[username]/page.tsx`)
- הוסרו `TAB_STYLE`, `getTabStyle` — הועברו ל-NavTabs
- הוסרו `Send`, `Ticket`, `AlertCircle`, `ShoppingBag` imports (לא בשימוש)
- הוסרו `MediaAttachButton`, `MediaPreview` imports (עכשיו בתוך ChatInput)
- הוסרו discovery-pills-row ו-hot-topic-pills הנפרדים — הכל דרך StarterPills
- exports עודכנו ב-`src/components/chat/index.ts`

---

### 2. תיקוני CSP (Content Security Policy)

**בעיה:** תמונות בלוקים ובמתכונים לא הופיעו — CSP חסם אותן.

**תיקונים ב-`next.config.ts`:**
- הוסרו wildcards לא חוקיים: `scontent-*.cdninstagram.com`, `instagram.*.fbcdn.net` (CSP לא תומך ב-wildcard באמצע)
- נוספו: `*.fna.fbcdn.net`, `*.cloudfront.net` (לתמונות מתכונים של danielamit)
- הפטרנים הנכונים: `*.cdninstagram.com`, `*.fbcdn.net`

**תיקון נוסף ב-ContentFeedTab:**
- `getProxiedImageUrl(item.imageUrl)` → `getProxiedImageUrl(item.imageUrl, item.shortcode || undefined)` — כדי שה-image proxy ישתמש ב-shortcode fallback כשה-CDN URL פג תוקף

---

### 3. תשתית Scaling (Phase 1)

#### אינדקסים על DB
נוצרו 3 אינדקסים ב-Supabase (ישירות, בלי migration):
```sql
CREATE INDEX idx_accounts_config_username ON accounts ((config->>'username'));
CREATE INDEX idx_accounts_config_subdomain ON accounts ((config->>'subdomain'));
CREATE INDEX idx_accounts_config_archetype ON accounts ((config->>'archetype'));
```
**חשוב:** ה-query `config->>'username'` מופיע ב-30+ מקומות בקוד. בלי אינדקס זה full table scan.

#### Upstash Redis
- **נוצר:** Upstash Redis instance (Free tier — 10K commands/day, 256MB)
- **Env vars:** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — ב-`.env.local` וב-Vercel
- **הקוד כבר היה מוכן:** `src/lib/redis.ts`, `src/lib/cache-l2.ts`, `src/lib/rate-limit.ts` — הכל עבד מיד עם הוספת ה-env vars
- **מה זה נותן:** L2 cache משותף בין כל Vercel instances + rate limiting מבוזר

#### Cache Pre-warming
- **קובץ חדש:** `src/app/api/cron/prewarm-cache/route.ts`
- **Vercel Cron:** כל 4 דקות (`*/4 * * * *`)
- טוען לכל חשבון פעיל: username resolution + brands + persona → Redis
- אם Redis לא זמין — מדלג בשקט

---

### 4. Email Service (Gmail API)

#### Setup
- **ספרייה:** `googleapis` (כבר מותקנת)
- **חיבור:** Google Workspace Service Account עם Domain-wide Delegation
- **Service Account:** `ldrsagent@ldrsgroup-484815.iam.gserviceaccount.com` (client_id: `116285547084587978627`)
- **Domain-wide Delegation scope:** `https://www.googleapis.com/auth/gmail.send`
- **שולח מ:** `bestie@ldrsgroup.com`
- **שם שולח:** `BestieAI`

#### Env Vars
```
GOOGLE_SERVICE_ACCOUNT_KEY=<full JSON from Google Cloud Console>
GMAIL_SEND_FROM=bestie@ldrsgroup.com
```
**חשוב:** ה-`GOOGLE_SERVICE_ACCOUNT_KEY` הוא ה-JSON המלא (לא client_email/private_key בנפרד). הקוד מפרסר אותו עם `JSON.parse()`.

#### קובץ (`src/lib/email.ts`)
- `sendEmail({ to, subject, html })` — שליחה גנרית
- `sendAdminAlert({ level, subject, message, details, adminEmails })` — template מעוצב בעברית עם צבעים לפי level
- `sendTestEmail()` — בדיקת חיבור
- **נבדק ועובד** — מייל בדיקה נשלח בהצלחה

#### מייל תמיכה באתר
עודכן מ-`support@bestieai.com` ל-`bestie@ldrsgroup.com` ב:
- `src/app/login/page.tsx`
- `src/app/contact/page.tsx`

---

### 5. System Health Monitoring

#### API Endpoint (`src/app/api/admin/system-health/route.ts`)
מחזיר:
- **Tier info:** שלב נוכחי + מה צריך לשלב הבא
- **Database:** latency, row counts (accounts, sessions, messages, chunks), פעילות שעה אחרונה
- **Redis:** available, latency, commands today
- **L1 Cache:** hit rate, size, queries
- **Growth:** sessions per day (7 days), top 5 accounts, week-over-week growth %
- **Alerts:** רשימת התראות בעברית עם levels (info/warning/critical)

#### Monitoring Tab (`src/components/admin/MonitoringTab.tsx`)
טאב חדש בדשבורד אדמין ("/admin/dashboard" → tab "מוניטורינג"):
- כרטיסיות alerts צבעוניות (אדום/צהוב)
- Tier נוכחי + פעולות לשלב הבא
- סטטיסטיקות: חשבונות, סשנים, הודעות, צמיחה %
- סטטוס DB (latency, row counts) + סטטוס Redis (commands/יום עם progress bar)
- L1 Cache hit rate + size
- גרף עמודות — סשנים ב-7 ימים אחרונים
- Top 5 חשבונות פעילים
- כפתור רענון + כפתור שליחת מייל בדיקה
- רענון אוטומטי כל 30 שניות

#### Test Email Endpoint (`src/app/api/admin/test-email/route.ts`)
POST → שולח מייל בדיקה ל-`bestie@ldrsgroup.com`

#### Health Alerts Cron (`src/app/api/cron/health-alerts/route.ts`)
- **Vercel Cron:** כל 10 דקות (`*/10 * * * *`)
- בודק: Redis availability, Redis latency, Redis daily commands, DB latency, sessions/hour, messages/hour
- **שולח מייל ל:** `triroars@gmail.com`, `cto@ldrsgroup.com`, `yoav@ldrsgroup.com`
- **Cooldown:** שעה לכל סוג התראה (דרך Redis) — לא מציף
- Thresholds:
  - DB latency > 1000ms
  - Redis latency > 100ms
  - Redis commands/day > 8000
  - Sessions/hour > 500
  - Messages/hour > 2000

---

### 6. WhatsApp Cloud API — Setup (חלקי)

#### מה מוכן
- **Client:** `src/lib/whatsapp-cloud/client.ts` — מלא ועובד:
  - `sendText()`, `sendTemplate()`, `sendMediaByLink()`, `markAsRead()`, `downloadMedia()`
- **Webhook:** `src/app/api/webhooks/whatsapp/route.ts` — GET (verification) + POST (inbound messages)
- **Signature verification:** `src/lib/whatsapp-cloud/signature.ts`
- **DB Schema:** `supabase/migrations/038_whatsapp_cloud.sql` — tables: `whatsapp_contacts`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_webhook_events`

#### Env Vars (הוגדרו)
```
WHATSAPP_ACCESS_TOKEN=<System User permanent token>
WHATSAPP_PHONE_NUMBER_ID=1056971817508262
WHATSAPP_BUSINESS_ACCOUNT_ID=1458477285751402
```

#### סטטוס נוכחי
- **Phone number:** `+972 54-390-2030` (BestieAI)
- **status: PENDING** — ממתין לאישור display name מ-Meta
- **name_status: PENDING_REVIEW**
- **לא ניתן לשלוח הודעות** עד שהסטטוס ישתנה ל-CONNECTED

#### מה צריך לעשות כש-Meta יאשרו
1. לבדוק שהסטטוס השתנה ל-CONNECTED:
```bash
curl -s -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" \
  "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID?fields=status,name_status"
```
2. לשלוח הודעת בדיקה:
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"972547667775","type":"template","template":{"name":"hello_world","language":{"code":"en_US"}}}'
```
3. ליצור את 8 ה-message templates ב-Meta Business Suite (פירוט למטה)
4. לחבר את ה-templates לקוד — trigger points:
   - `lead_welcome` → אחרי `/api/chat/lead` POST
   - `support_confirmation` → אחרי `/api/support` POST
   - `coupon_delivery` → אחרי coupon copy event
   - `brand_support_ticket` → אחרי `/api/support` POST (למותג)
   - `brand_new_lead` → אחרי `/api/chat/lead` POST (למותג)
   - `influencer_daily_summary` → cron יומי
   - `influencer_welcome` → אחרי יצירת חשבון חדש
   - `influencer_new_lead` → אחרי `/api/chat/lead` POST (למשפיען)
5. להגדיר webhook ב-Meta → URL: `https://<domain>/api/webhooks/whatsapp`

---

### 7. WhatsApp Message Templates (לבנות ב-Meta)

כל ה-templates הם **Utility category**, **שפה: Hebrew (he)**.

**חשוב:** ערוץ WhatsApp הוא **חד-כיווני** (outbound בלבד) — אין quick reply buttons על הודעות לעוקבים, אין "שלח הודעה כאן".

#### Template 1: `lead_welcome` (לעוקב)
- Header (text): `👋 ברוכים הבאים!`
- Body: שלום {{1}}, שמחים שנרשמת אצל *{{2}}*! מכאן נעדכן אותך על מבצעים, קופונים בלעדיים ותכנים חדשים. בינתיים — בקרו בצ'אט ותגלו עוד 👇
- Footer: `BestieAI — הצ'אטבוט של {{2}}`
- Button URL: `לצ'אט של {{2}}` → `https://chat.bestieai.com/{{3}}`
- Vars: `{{1}}` שם, `{{2}}` שם משפיען, `{{3}}` username

#### Template 2: `support_confirmation` (לעוקב)
- Header (text): `✅ הפנייה שלך התקבלה`
- Body: {{1}}, קיבלנו. מותג: *{{2}}*, הזמנה: *{{3}}*, סוג בעיה: *{{4}}*. העברנו לצוות {{2}} — יחזרו אליך ישירות.
- Footer: `BestieAI — פניות תמיכה דרך {{5}}`
- No buttons
- Vars: `{{1}}` שם, `{{2}}` מותג, `{{3}}` מספר הזמנה, `{{4}}` סוג בעיה, `{{5}}` שם משפיען

#### Template 3: `coupon_delivery` (לעוקב)
- Header (image): דינמי — באנר מותג
- Body: 🎁 *{{1}}* | הטבה: *{{2}}* | קוד: *{{3}}* | בתוקף עד: {{4}} | באהבה, {{5}} 💜
- Footer: `BestieAI — קופונים בלעדיים`
- Button URL: `לקנייה עם הקופון` → `{{6}}`
- Vars: `{{1}}` מותג, `{{2}}` הנחה, `{{3}}` קוד, `{{4}}` תפוגה, `{{5}}` משפיען, `{{6}}` לינק

#### Template 4: `brand_support_ticket` (למותג)
- Header (text): `📋 פנייה חדשה מלקוח`
- Body: שלום *{{1}}*, לקוח: *{{2}}*, טלפון: {{3}}, הזמנה: {{4}}, סוג: *{{5}}*, תיאור: {{6}}. הגיע דרך *{{7}}*. מומלץ לחזור תוך 24 שעות.
- Footer: `BestieAI — ניהול פניות`
- Button Phone: `התקשר ללקוח` → `{{3}}`
- Vars: `{{1}}` מותג, `{{2}}` שם לקוח, `{{3}}` טלפון, `{{4}}` הזמנה, `{{5}}` סוג בעיה, `{{6}}` תיאור, `{{7}}` משפיען

#### Template 5: `brand_new_lead` (למותג)
- Header (text): `🔔 ליד חדש!`
- Body: שלום *{{1}}*, ליד חדש: *{{2}}*, טלפון: {{3}}, מקור: *{{4}}*, זמן: {{5}}. מומלץ ליצור קשר בהקדם.
- Footer: `BestieAI — לידים ממשפיענים`
- Button Phone: `התקשר` → `{{3}}`
- Vars: `{{1}}` מותג, `{{2}}` שם ליד, `{{3}}` טלפון, `{{4}}` משפיען, `{{5}}` תאריך

#### Template 6: `influencer_daily_summary` (למשפיען)
- Header (text): `📊 הסיכום היומי שלך`
- Body: שלום *{{1}}*, סיכום {{2}}: שיחות: *{{3}}*, לידים: *{{4}}*, קופונים: *{{5}}*, תמיכה: *{{6}}*, נושא פופולרי: {{7}}
- Footer: `BestieAI — דוח יומי אוטומטי`
- Button URL: `כניסה לדשבורד` → `{{8}}`
- Vars: `{{1}}` שם, `{{2}}` תאריך, `{{3}}`-`{{6}}` מספרים, `{{7}}` נושא, `{{8}}` לינק

#### Template 7: `influencer_welcome` (למשפיען)
- Header (image): לוגו BestieAI
- Body: שלום *{{1}}*! 🎉 ברוכים הבאים! הצ'אטבוט שלך מוכן ופעיל. מה מחכה: צ'אט AI, לידים, קופונים, דשבורד, מעקב תמיכה. שתפו ✨
- Footer: `BestieAI — הצ'אטבוט האישי שלך`
- Button URL: `העמוד שלי` → `{{2}}`
- Button URL: `דשבורד ניהול` → `{{3}}`
- Vars: `{{1}}` שם, `{{2}}` לינק צ'אט, `{{3}}` לינק דשבורד

#### Template 8: `influencer_new_lead` (למשפיען)
- Header (text): `🔔 ליד חדש נכנס!`
- Body: *{{1}}*, ליד חדש! שם: *{{2}}*, טלפון: {{3}}, נרשם: {{4}}, סה"כ לידים החודש: *{{5}}*
- Footer: `BestieAI — לידים`
- Button URL: `צפייה בלידים` → `{{6}}`
- Vars: `{{1}}` שם משפיען, `{{2}}` שם ליד, `{{3}}` טלפון, `{{4}}` תאריך, `{{5}}` סה"כ, `{{6}}` לינק

---

### 8. Scaling Roadmap (לא בוצע — תכנון בלבד)

#### Tier 0 (נוכחי) — עד 5,000 בו-זמנית
- ✅ DB indexes
- ✅ Upstash Redis
- ✅ Cache pre-warming
- ✅ Monitoring + alerts

#### Tier 1 — עד 10,000
- Upstash Pro ($20/mo)
- Supabase connection pooling (Supavisor)
- איחוד Supabase clients (9 קבצים שיוצרים client משלהם)
- **Trigger:** Redis > 8K commands/day, Vercel 5xx > 1%, chat response > 5s

#### Tier 2 — עד 50,000
- מעבר ל-Railway/Fly.io ($200-500/mo)
- Supabase read replica
- Rate limiting מלא ב-Redis
- **Trigger:** Concurrent > 5K, Vercel timeout errors

#### Tier 3 — עד 200,000
- WebSocket server + message queue
- AI Worker pool נפרד
- Multi-region deployment
- **Trigger:** Concurrent > 30K

#### Tier 4 — 1,000,000+
- Kubernetes cluster
- DB sharding
- CDN caching layer
- Auto-scaling policies
- **Trigger:** Concurrent > 100K

---

### Commits בסשן הזה

1. `7b8e332` — Extract ChatInput, NavTabs, StarterPills components
2. `376dcc9` — Fix starter pills: constrain width, merge discover, apply globally
3. `cf152ac` — NavTabs: show label on all tabs, add topic-specific icons
4. `0601a46` — NavTabs: restore icon-only for inactive tabs
5. `b548940` — Update NavTabs icons per user selection
6. `a153dd6` — Fix NavTabs: check label BEFORE tab id for icon matching
7. `7da7b56` — Fix CSP img-src: add missing Instagram CDN patterns
8. `31e024c` — Fix content feed images: pass shortcode to image proxy
9. `2143a19` — Fix CSP: remove invalid wildcard patterns
10. `e311ffd` — Fix CSP: add cloudfront.net for recipe images
11. `f868553` — Add cache pre-warming cron
12. `91d48e9` — Add system health API endpoint
13. `229a7c1` — Add Gmail API email service
14. `d8d6cbd` — Rename sender to BestieAI
15. `fe52a71` — Update support email to bestie@ldrsgroup.com
16. `929d393` — Add Monitoring tab to admin dashboard
17. `22d4a96` — Add health-alerts cron with email to admin team

---

### קבצים חדשים שנוצרו

```
src/components/chat/ChatInput.tsx
src/components/chat/NavTabs.tsx
src/components/chat/StarterPills.tsx
src/components/admin/MonitoringTab.tsx
src/lib/email.ts
src/app/api/admin/system-health/route.ts
src/app/api/admin/test-email/route.ts
src/app/api/cron/prewarm-cache/route.ts
src/app/api/cron/health-alerts/route.ts
```

### קבצים שעודכנו

```
src/app/chat/[username]/page.tsx — ChatInput + NavTabs + StarterPills integration
src/app/globals.css — CSS for new components
src/components/chat/index.ts — exports
src/components/chat/content-feed/ContentFeedTab.tsx — shortcode to proxy
src/app/login/page.tsx — support email
src/app/contact/page.tsx — support email
src/app/admin/dashboard/page.tsx — monitoring tab
next.config.ts — CSP fixes
vercel.json — new crons (prewarm-cache, health-alerts)
.env.local — Redis + Gmail + WhatsApp vars
```

### Env Vars שצריך ב-Vercel

```
UPSTASH_REDIS_REST_URL=<from Upstash dashboard>
UPSTASH_REDIS_REST_TOKEN=<from Upstash dashboard>
GOOGLE_SERVICE_ACCOUNT_KEY=<full JSON from Google Cloud Console>
GMAIL_SEND_FROM=bestie@ldrsgroup.com
WHATSAPP_ACCESS_TOKEN=<System User permanent token>
WHATSAPP_PHONE_NUMBER_ID=1056971817508262
WHATSAPP_BUSINESS_ACCOUNT_ID=1458477285751402
```
