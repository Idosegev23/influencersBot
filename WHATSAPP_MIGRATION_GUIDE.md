# WhatsApp Cloud API — מדריך חיבור והגרה מלא

> **המטרה:** להחליף את **GREEN-API** (ספק צד שלישי) ב-**WhatsApp Cloud API הרשמי של Meta**, ולחבר את כל ה-triggers בקוד.
>
> **מועד:** 16.4.2026 | **סטטוס נוכחי:** חצי — קוד מוכן, Meta/DB עדיין לא מחוברים.

---

## 0. מצב נוכחי — מה שכבר בדקתי

### ✅ מוכן (קוד)
- `src/lib/whatsapp-cloud/client.ts` — sendText, sendTemplate, sendMediaByLink, markAsRead, downloadMedia
- `src/lib/whatsapp-cloud/signature.ts` — אימות X-Hub-Signature-256
- `src/app/api/webhooks/whatsapp/route.ts` — GET verification + POST inbound
- `supabase/migrations/038_whatsapp_cloud.sql` — 5 טבלאות מוכנות

### ⚠️ חוסמים (חייבים לפתור לפני שליחה ראשונה)
| # | חוסם | סטטוס | איפה |
|---|------|--------|------|
| A | מיגרציה 038 לא רצה | **חסר** | Supabase |
| B | `WHATSAPP_APP_SECRET` לא מוגדר | **חסר** | `.env.local` + Vercel |
| C | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` לא מוגדר | **חסר** | `.env.local` + Vercel |
| D | Phone `+972-54-390-2030` סטטוס `PENDING` | ממתין ל-Meta | Meta Business Suite |
| E | רק `hello_world` קיים ב-Meta | **חסר** 8 templates | Meta Business Suite |
| F | Webhook לא רשום ב-Meta | **חסר** | Meta Developer Console |
| G | `/api/support/route.ts` קורא ל-Green API | יחליף אחרי שלב D | קוד |
| H | אין triggers ב-lead/coupon | **חסר** | קוד |

---

## 1. סדר ביצוע נכון (אל תדלג!)

```
שלב 1  →  DB migration (5 דק')
שלב 2  →  Meta: שליפת App Secret + יצירת Verify Token (10 דק')
שלב 3  →  Meta: רישום Webhook + subscribe to "messages" (10 דק')
שלב 4  →  Meta: המתנה/דחיפה לאישור display name (בידיים של Meta)
שלב 5  →  Meta: יצירת 8 templates (שעה — צריך גם לחכות לאישור)
שלב 6  →  קוד: חיבור triggers חדשים (lead/support/coupon) (שעתיים)
שלב 7  →  קוד: הסרת Green API (30 דק')
שלב 8  →  Testing end-to-end + rollout
```

---

## שלב 1 — DB Migration (חייב להיות ראשון)

### ל-Supabase יש 2 אפשרויות:

**אפשרות A — Supabase CLI (מומלץ):**
```bash
cd ~/Downloads/TriRoars/Leaders/influencerbot
supabase db push                      # דוחף את כל המיגרציות שלא רצו
# או ספציפי:
supabase migration up --linked
```

**אפשרות B — Supabase Dashboard:**
1. פתח את [Supabase SQL Editor](https://supabase.com/dashboard/project/zwmlqlzfjiminrokzcse/sql/new)
2. העתק את כל התוכן של `supabase/migrations/038_whatsapp_cloud.sql`
3. הדבק ב-SQL Editor → לחץ **Run**
4. ודא שכל ה-statements הצליחו (5 tables + 2 triggers)

### אימות שהמיגרציה רצה:
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://zwmlqlzfjiminrokzcse.supabase.co/rest/v1/whatsapp_contacts?select=id&limit=1" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
# צפוי: 200 (או 206 אם יש headers נוספים). כרגע: 404.
```

---

## שלב 2 — Meta: App Secret + Verify Token

### 2.1 שליפת App Secret
1. היכנס ל-[Meta for Developers](https://developers.facebook.com/apps)
2. בחר את האפליקציה של BestieAI (שבה ה-WhatsApp Business API)
3. בתפריט הצד: **App settings → Basic**
4. שדה **App Secret** → לחץ **Show** → הזן סיסמת פייסבוק שלך
5. העתק את הערך

### 2.2 יצירת Verify Token (שרירותי — אתה בוחר)
```bash
# צור מחרוזת רנדומלית ארוכה:
openssl rand -hex 32
# לדוגמה: e3f7a2c9b1d4... (תשתמש בערך שיצא לך)
```

### 2.3 הוספה ל-env
הוסף ל-`.env.local`:
```
WHATSAPP_APP_SECRET=<הערך מ-Meta App settings → Basic>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<המחרוזת הרנדומלית שיצרת>
```

**וגם ל-Vercel** (חשוב! אחרת הפרודקשן יישבר):
```bash
# אפשר מה-Vercel dashboard → Project Settings → Environment Variables
# או דרך ה-CLI:
vercel env add WHATSAPP_APP_SECRET production
vercel env add WHATSAPP_WEBHOOK_VERIFY_TOKEN production
# (גם ל-preview ו-development אם רלוונטי)
```

### 2.4 Redeploy
חובה — אחרת ה-env vars לא יעברו ל-Edge/Node runtime:
```bash
vercel --prod
```

---

## שלב 3 — Meta: רישום Webhook

### 3.1 לפני הרישום — וודא שה-endpoint שלך חי
```bash
# החלף את bestieai.com ב-domain הפרודקשן שלך
curl "https://chat.bestieai.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=test123"
# צפוי: test123
# אם קיבלת Forbidden — הטוקן לא תואם את מה שב-Vercel (בדוק redeploy)
```

### 3.2 הגדרת Webhook ב-Meta
1. [Meta for Developers](https://developers.facebook.com/apps) → האפליקציה שלך
2. בתפריט הצד: **WhatsApp → Configuration**
3. תחת **Webhook** → לחץ **Edit**
4. Callback URL: `https://chat.bestieai.com/api/webhooks/whatsapp`  ← **שים את ה-domain הנכון שלך**
5. Verify Token: הערך של `WHATSAPP_WEBHOOK_VERIFY_TOKEN` שהגדרת בשלב 2
6. לחץ **Verify and save** — Meta יעשה GET handshake; אם ה-env הנכון ב-Vercel זה יצליח.

### 3.3 Subscribe ל-webhook fields
בדף ה-Configuration, תחת Webhook fields, לחץ **Manage** ו-subscribe לפחות ל:
- ✅ `messages` — חובה! זה מה שמביא לך הודעות נכנסות וסטטוסים.
- אופציונלי: `message_template_status_update` — מתי template מאושר/נדחה.
- אופציונלי: `account_alerts` — התראות על המספר.

### 3.4 בדיקה
```bash
# שלח webhook test מה-dashboard:
# Meta Console → WhatsApp → Configuration → לחץ "Test" ליד messages
# יצור לך event ב-Supabase → whatsapp_webhook_events
```

אימות ב-Supabase:
```sql
select count(*) from whatsapp_webhook_events where received_at > now() - interval '5 minutes';
-- צפוי: >= 1
```

---

## שלב 4 — אישור Display Name מ-Meta

### מה הסטטוס כרגע
בדקתי חי עכשיו:
```json
{"status":"PENDING","name_status":"PENDING_REVIEW","verified_name":"BestieAI"}
```

### מה זה אומר
- **עד שה-name_status ישתנה ל-`APPROVED`, אי אפשר לשלוח הודעות** בכלל (לא templates ולא text).
- Meta בודקים ש-"BestieAI" לא מפר סימני מסחר / מטעה / כו'.
- זה בדרך כלל 1-3 ימי עבודה. אם תקוע מעל שבוע — צריך לפנות ל-Meta Support.

### איך לבדוק עכשיו
```bash
curl -s -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" \
  "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID?fields=status,name_status,display_phone_number,verified_name"
```
מחכה ל: `"status":"CONNECTED","name_status":"APPROVED"`

### איך לדחוף את זה קדימה
1. [Meta Business Suite](https://business.facebook.com/) → הארגון שלך
2. **Settings → Accounts → WhatsApp Accounts → BestieAI**
3. אם יש banner "Complete verification" → עקוב
4. ודא שלעסק יש **Business Verification** מאושר (עד סוף 2024 Meta מחייב)

---

## שלב 5 — יצירת 8 Templates

**חוק ברזל:** אפשר ליצור templates גם לפני שה-name_status מאושר. הם יישבו ב-PENDING. ברגע שהמספר מאושר, הם יעברו לבדיקה משלהם (בדרך כלל דקות-שעות).

### איפה יוצרים
1. [Meta Business Suite](https://business.facebook.com/) → בחר BestieAI
2. תפריט צד: **WhatsApp Manager**
3. בחר את חשבון ה-WhatsApp Business → **Message Templates**
4. **Create Template**

### למטה — המפרט המדויק של 8 ה-templates
כולם **Utility** (לא Marketing — זול יותר, פחות חסימות), **שפה `Hebrew (he)`**.

> הערה: WhatsApp Cloud הוא **חד-כיווני** מאיתנו ללקוח. אין "Quick Reply" buttons שהלקוח יוכל ללחוץ לחזרה. יש URL / Call buttons שמעבירים לאפליקציות אחרות. זה מה שאנחנו משתמשים בהם.

#### Template 1: `lead_welcome` (לעוקב)
- **Category:** Utility | **Language:** he
- **Header (Text):** `👋 ברוכים הבאים!`
- **Body:**
  ```
  שלום {{1}}, שמחים שנרשמת אצל *{{2}}*!
  מכאן נעדכן אותך על מבצעים, קופונים בלעדיים ותכנים חדשים.
  בינתיים — בקרו בצ'אט ותגלו עוד 👇
  ```
- **Footer:** `BestieAI — הצ'אטבוט של {{2}}`  ← בפועל ב-Meta תכתוב טקסט קבוע ובגוף עם variables. ה-footer לא תומך ב-vars — תכתוב `BestieAI`
- **Buttons:** URL — כפתור אחד
  - Text: `לצ'אט של {{1}}`
  - URL type: `Dynamic` → `https://chat.bestieai.com/{{1}}`
- **דוגמאות לאישור:** `{{1}}=מיכל`, `{{2}}=דניאל`, כפתור URL `{{1}}=danielamit`

#### Template 2: `support_confirmation` (לעוקב)
- **Header (Text):** `✅ הפנייה שלך התקבלה`
- **Body:**
  ```
  {{1}}, קיבלנו.
  מותג: *{{2}}*
  הזמנה: *{{3}}*
  סוג בעיה: *{{4}}*
  העברנו לצוות {{2}} — יחזרו אליך ישירות.
  ```
- **Footer:** `BestieAI — פניות תמיכה`
- **Buttons:** אין

#### Template 3: `coupon_delivery` (לעוקב)
- **Header (Image):** דינמי — העלה לדוגמה תמונה מייצגת; בפועל נשלח URL דינמי
- **Body:**
  ```
  🎁 *{{1}}*
  הטבה: *{{2}}*
  קוד: *{{3}}*
  בתוקף עד: {{4}}
  באהבה, {{5}} 💜
  ```
- **Footer:** `BestieAI — קופונים בלעדיים`
- **Buttons:** URL
  - Text: `לקנייה עם הקופון`
  - URL: `Dynamic` → `{{1}}` (אנחנו נעביר את ה-URL המלא)

#### Template 4: `brand_support_ticket` (למותג)
- **Header (Text):** `📋 פנייה חדשה מלקוח`
- **Body:**
  ```
  שלום *{{1}}*,
  לקוח: *{{2}}*
  טלפון: {{3}}
  הזמנה: {{4}}
  סוג: *{{5}}*
  תיאור: {{6}}
  הגיע דרך *{{7}}*.
  מומלץ לחזור תוך 24 שעות.
  ```
- **Buttons:** Call (Phone)
  - Text: `התקשר ללקוח`
  - Phone: `Dynamic` → `{{1}}`

#### Template 5: `brand_new_lead` (למותג)
- **Header (Text):** `🔔 ליד חדש!`
- **Body:**
  ```
  שלום *{{1}}*,
  ליד חדש: *{{2}}*
  טלפון: {{3}}
  מקור: *{{4}}*
  זמן: {{5}}
  מומלץ ליצור קשר בהקדם.
  ```
- **Buttons:** Call → `{{1}}`

#### Template 6: `influencer_daily_summary` (למשפיען)
- **Header (Text):** `📊 הסיכום היומי שלך`
- **Body:**
  ```
  שלום *{{1}}*
  סיכום {{2}}:
  שיחות: *{{3}}*
  לידים: *{{4}}*
  קופונים: *{{5}}*
  תמיכה: *{{6}}*
  נושא פופולרי: {{7}}
  ```
- **Buttons:** URL
  - Text: `כניסה לדשבורד`
  - URL: `Dynamic` → `{{1}}`

#### Template 7: `influencer_welcome` (למשפיען)
- **Header (Image):** לוגו BestieAI
- **Body:**
  ```
  שלום *{{1}}*! 🎉
  ברוכים הבאים! הצ'אטבוט שלך מוכן ופעיל.
  מה מחכה: צ'אט AI, לידים, קופונים, דשבורד, מעקב תמיכה.
  ```
- **Buttons:** 2 URL (Meta תומך עד 2 URL buttons או URL+Call, לא 3 URLs)
  - #1: `העמוד שלי` → Dynamic `{{1}}`
  - #2: `דשבורד ניהול` → Dynamic `{{1}}`

#### Template 8: `influencer_new_lead` (למשפיען)
- **Header (Text):** `🔔 ליד חדש נכנס!`
- **Body:**
  ```
  *{{1}}*, ליד חדש!
  שם: *{{2}}*
  טלפון: {{3}}
  נרשם: {{4}}
  סה"כ לידים החודש: *{{5}}*
  ```
- **Buttons:** URL → `{{1}}` = URL לדשבורד לידים

---

## שלב 6 — חיבור Triggers בקוד

### 6.1 עקרון ארכיטקטוני
נבנה **שכבת מתווך אחת** בשם `src/lib/whatsapp-notify.ts` שעוטפת את `whatsapp-cloud/client.ts` עם פונקציות דומיין-ספציפיות (`sendLeadWelcome`, `sendSupportConfirmation`, וכו'). כל הקריאות מהקוד ייכנסו דרכה — לא ישירות ל-`sendTemplate`.

**יתרונות:**
- מקום אחד להוסיף לוגינג / DB writes / שגיאות
- קל להחליף את המימוש בעתיד
- טסטים ברורים (mocking של מודול אחד)

### 6.2 ה-signature של המודול החדש (אני אכתוב אחרי שתאשר)
```typescript
// src/lib/whatsapp-notify.ts

export async function sendLeadWelcome(params: {
  to: string;              // טלפון ליד (E.164 או ישראלי)
  firstName: string;
  influencerName: string;
  username: string;        // ל-URL
}): Promise<{ success: boolean; error?: string }>;

export async function sendSupportConfirmation(params: {
  to: string;
  firstName: string;
  brand: string;
  orderNumber: string;
  problemType: string;
}): Promise<{ success: boolean; error?: string }>;

export async function sendCouponDelivery(params: {
  to: string;
  brand: string;
  discount: string;
  code: string;
  expiresAt: string;       // formatted
  influencerName: string;
  purchaseUrl: string;
  brandImageUrl?: string;
}): Promise<{ success: boolean; error?: string }>;

export async function sendBrandSupportTicket(params: {
  toBrand: string;         // טלפון המותג
  brandName: string;
  customerName: string;
  customerPhone: string;
  orderNumber: string;
  problemType: string;
  description: string;
  influencerName: string;
}): Promise<{ success: boolean; error?: string }>;

export async function sendBrandNewLead(params: {
  toBrand: string;
  brandName: string;
  leadName: string;
  leadPhone: string;
  influencerName: string;
  timestamp: string;
}): Promise<{ success: boolean; error?: string }>;

export async function sendInfluencerNewLead(params: {
  toInfluencer: string;
  influencerName: string;
  leadName: string;
  leadPhone: string;
  timestamp: string;
  monthlyLeadsTotal: number;
  dashboardUrl: string;
}): Promise<{ success: boolean; error?: string }>;

export async function sendInfluencerDailySummary(params: {
  toInfluencer: string;
  influencerName: string;
  date: string;
  conversations: number;
  leads: number;
  coupons: number;
  support: number;
  topTopic: string;
  dashboardUrl: string;
}): Promise<{ success: boolean; error?: string }>;

export async function sendInfluencerWelcome(params: {
  toInfluencer: string;
  influencerName: string;
  chatUrl: string;
  dashboardUrl: string;
}): Promise<{ success: boolean; error?: string }>;
```

### 6.3 Trigger Points — איפה בדיוק לקרוא מה

| Trigger | קובץ | שורה בערך | איזו פונקציה לקרוא |
|---------|------|-----------|---------------------|
| הרשמת ליד חדש | `src/app/api/chat/lead/route.ts` | אחרי ה-`insert` ל-`chat_leads` | `sendLeadWelcome`, `sendBrandNewLead`, `sendInfluencerNewLead` (במקביל, `Promise.allSettled`) |
| פנייה לתמיכה | `src/app/api/support/route.ts` | מחליף את `notifyBrandSupport`/`sendSupportConfirmation` | `sendBrandSupportTicket` + `sendSupportConfirmation` |
| העתקת קופון | `src/app/api/influencer/coupons/[id]/copy/route.ts` | אחרי ה-`insert` ל-event | `sendCouponDelivery` (רק אם העוקב opted-in) |
| יצירת חשבון משפיען | `src/app/api/admin/accounts/finalize/route.ts` | אחרי `status='active'` | `sendInfluencerWelcome` |
| סיכום יומי | cron חדש: `src/app/api/cron/daily-summary/route.ts` | כל יום ב-21:00 | `sendInfluencerDailySummary` (לכל משפיען פעיל) |

### 6.4 שאלת בסיס — Opt-in
**חובה חוקית (וגם Meta דורש):** העוקב חייב לאשר קבלת הודעות WhatsApp. נוסיף checkbox לטופס הרשמת הליד:
```
☐ אני מאשר/ת קבלת עדכונים ב-WhatsApp מ-{{influencer}} ומ-BestieAI
```
ונשמור `whatsapp_opt_in BOOLEAN` ב-`chat_leads`. רק אם `true` — שולחים.

---

## שלב 7 — הסרת Green API

### 7.1 קבצים שצריך למחוק / להחליף
```
src/lib/whatsapp.ts       ← GREEN-API (למחוק)
src/lib/greenapi.ts       ← GREEN-API (למחוק)
```

### 7.2 Env vars שצריך להסיר (אחרי שהכל עובד)
```
GREEN_API_INSTANCE_ID     ← להסיר מ-.env.local + Vercel
GREEN_API_TOKEN           ← להסיר
GREENAPI_INSTANCE_ID      ← להסיר (יש גם כתיב זה)
GREENAPI_API_TOKEN        ← להסיר
```

### 7.3 Callers שצריך לעדכן
- `src/app/api/support/route.ts` שורה 3 — לשנות `from '@/lib/whatsapp'` ל-`from '@/lib/whatsapp-notify'`
- `src/lib/flows/support.ts` שורה 2 — אותו דבר
- כל מקום שמופיע `notifyBrandSupport` / `sendSupportConfirmation` — להחליף לפונקציות החדשות

---

## שלב 8 — Testing End-to-End

### 8.1 בדיקה ראשונה — hello_world
לאחר שה-name_status יהיה APPROVED, שלח הודעת בדיקה למספר שלך:
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product":"whatsapp",
    "to":"972547667775",
    "type":"template",
    "template":{"name":"hello_world","language":{"code":"en_US"}}
  }'
```
צפוי: HTTP 200 + `{"messages":[{"id":"wamid....."}]}`. הודעה תגיע למספר.

### 8.2 בדיקה שנייה — template מקומי (אחרי שהוא APPROVED)
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product":"whatsapp",
    "to":"972547667775",
    "type":"template",
    "template":{
      "name":"lead_welcome",
      "language":{"code":"he"},
      "components":[
        {"type":"body","parameters":[
          {"type":"text","text":"מיכל"},
          {"type":"text","text":"דניאל"}
        ]},
        {"type":"button","sub_type":"url","index":"0","parameters":[
          {"type":"text","text":"danielamit"}
        ]}
      ]
    }
  }'
```

### 8.3 בדיקת Webhook — שלח הודעה ידנית מהטלפון שלך למספר BestieAI, וראה:
```sql
select created_at, direction, message_type, text_body
from whatsapp_messages
order by created_at desc limit 5;
-- צפוי: שורה חדשה inbound
```

### 8.4 Smoke tests על ה-flows
- הרשמת ליד דרך אתר → ודא 3 הודעות יצאו (עוקב/מותג/משפיען)
- פנייה לתמיכה → ודא 2 הודעות (עוקב/מותג)
- העתקת קופון → ודא 1 הודעה (אם opt-in)

---

## נספח A — Env vars מלאים שצריך ב-Vercel

```
# כבר מוגדרים ✅
WHATSAPP_ACCESS_TOKEN=<System User permanent token>
WHATSAPP_PHONE_NUMBER_ID=1056971817508262
WHATSAPP_BUSINESS_ACCOUNT_ID=1458477285751402

# חסרים ❌
WHATSAPP_APP_SECRET=<מ-App settings → Basic>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<openssl rand -hex 32>

# להסיר אחרי הסרת Green API 🗑️
# GREEN_API_INSTANCE_ID
# GREEN_API_TOKEN
```

---

## נספח B — פרוטוקול fallback אם Meta נדחה זמנית

במידה ושליחה מחזירה 5xx או error code של rate limit:
1. הלוגר ב-`whatsapp-notify.ts` יכתוב ל-`whatsapp_messages` עם `status='failed'` + `error_code`/`error_message`
2. cron כל 5 דקות ינסה לשלוח מחדש הודעות `failed` עם `retry_count < 3`
3. אחרי 3 ניסיונות — alerting ל-`triroars@gmail.com` (דרך Gmail API שכבר מוגדר)

(רק אם תרצה — זה תוספת אחרי שהבסיס עובד.)

---

## נספח C — חיפוש מהיר לבעיות נפוצות

| בעיה | סיבה סבירה | פתרון |
|------|-------------|--------|
| `GET /webhook` מחזיר 403 | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` ב-Vercel לא מסונכרן עם מה שהגדרת ב-Meta | Redeploy אחרי שינוי env |
| `POST /webhook` מחזיר 200 אבל `signature_valid=false` ב-DB | `WHATSAPP_APP_SECRET` לא נכון | שלוף שוב מ-Meta → Basic |
| `sendTemplate` מחזיר `131051` | Template pending או rejected | Meta Manager → Templates → בדוק סטטוס |
| `sendText` מחזיר `131026` | 24h window פג — הלקוח לא כתב לנו בפתיחה | השתמש ב-template במקום text |
| Phone סטטוס `FLAGGED` | Quality Rating ירד | צמצם spam; template feedback מהמקבלים |

---

## בסיום כל השלבים — Definition of Done

- [ ] מיגרציה 038 רצה → 5 טבלאות קיימות
- [ ] `WHATSAPP_APP_SECRET` + `WHATSAPP_WEBHOOK_VERIFY_TOKEN` ב-local + Vercel
- [ ] Webhook מאומת ב-Meta (Verify and save הצליח)
- [ ] Subscribed ל-`messages` field
- [ ] name_status = APPROVED
- [ ] 8 templates APPROVED
- [ ] `src/lib/whatsapp-notify.ts` נכתב ונבדק
- [ ] `/api/chat/lead` → שולח 3 הודעות
- [ ] `/api/support` → משתמש ב-whatsapp-notify (לא Green)
- [ ] `/api/influencer/coupons/[id]/copy` → שולח coupon_delivery
- [ ] Cron daily-summary קיים ורץ
- [ ] Green API נמחק מהקוד ו-env vars הוסרו
- [ ] Smoke tests עברו בפרודקשן
