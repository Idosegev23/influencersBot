# WhatsApp Cloud Migration — Handoff to Claude Code

**תאריך:** 16.04.2026
**סטטוס:** הקוד כתוב ועומד ב-branch `main` אבל **עוד לא commit/deploy**.
כל הטמפלטים APPROVED במטא (6/6). ה-webhook לא רשום במטא כי ה-endpoint עוד מחזיר 404 (לא deployed).

---

## 0. תמונת מצב ב-30 שניות

| רכיב | מצב |
|------|-----|
| 6 טמפלטים ב-WhatsApp Manager | ✅ כולם APPROVED |
| קוד Notify + 5 triggers + cron | ✅ כתוב, ❌ לא committed |
| Webhook endpoint ב-production | ❌ 404 (`https://bestie.ldrsgroup.com/api/webhooks/whatsapp`) |
| Webhook registered במטא | ❌ לא רשום (subscriptions ריק) |
| WABA→App subscription במטא | ❌ `subscribed_apps: []` |
| Phone display name `BestieAI` | ⏳ `PENDING_REVIEW` (לא בשליטתנו) |
| `WHATSAPP_NOTIFY_ENABLED` ב-Vercel | ❌ לא מוגדר (ברירת מחדל: off, זה תקין בינתיים) |
| GREEN-API | ✅ ממשיך לרוץ במקביל |

---

## 1. מה קיים בדיסק ולא ב-git (untracked/modified)

```text
# modified
src/app/api/admin/accounts/finalize/route.ts
src/app/api/chat/lead/route.ts
src/app/api/support/route.ts
src/app/api/track/route.ts
vercel.json

# untracked (זה הקוד החדש של WhatsApp Cloud)
src/lib/whatsapp-notify.ts                      # 260 שורות, 6 פונקציות
src/lib/whatsapp-cloud/                         # client.ts, signature.ts
src/app/api/webhooks/whatsapp/                  # GET verify + POST receive
src/app/api/cron/weekly-digest/                 # sunday 09:00 IL digest
supabase/migrations/038_whatsapp_cloud.sql      # 5 טבלאות (כבר הורץ ב-DB)
WHATSAPP_GO_LIVE_CHECKLIST.md
WHATSAPP_MIGRATION_GUIDE.md
WHATSAPP_TEMPLATES_SPEC.md
```

**פעולה ראשונה ל-Claude Code:** לעבור על הקבצים, לוודא שהם תואמים לסטנדרט של הפרויקט (CLAUDE.md, lint, typecheck), ולעשות commit + push. אחרי ה-push Vercel יעשה deploy אוטומטי.

```bash
npm run type-check     # לוודא שאין רגרסיות
npm run lint
git add src/lib/whatsapp-notify.ts \
        src/lib/whatsapp-cloud \
        src/app/api/webhooks/whatsapp \
        src/app/api/cron/weekly-digest \
        supabase/migrations/038_whatsapp_cloud.sql \
        src/app/api/admin/accounts/finalize/route.ts \
        src/app/api/chat/lead/route.ts \
        src/app/api/support/route.ts \
        src/app/api/track/route.ts \
        vercel.json \
        WHATSAPP_*.md
git commit -m "WhatsApp Cloud migration — notify module + 5 triggers + weekly digest cron"
git push origin main
```

---

## 2. ארכיטקטורה קצרה (מה עשינו)

### 2.1 `src/lib/whatsapp-notify.ts` — מודול ה-notify המרכזי
6 פונקציות, פונקציה אחת לכל טמפלט. כל פונקציה:
- מקבלת args מוטיפסים (בדיוק כמות ה-variables של הטמפלט)
- fire-and-forget: בולעת שגיאות ומחזירה `{success, error?}` במקום לזרוק
- מכובדת flag `WHATSAPP_NOTIFY_ENABLED` (master) + `WHATSAPP_TEMPLATE_<NAME>` (per-template)
- שומרת את השליחה ב-`whatsapp_messages` (עם `direction='outbound'`, `status='sent'|'failed'`)

פונקציות:
```typescript
sendFollowerWelcome({to, followerFirstName, influencerName, influencerUsername})
sendFollowerSupportConfirmation({to, followerFirstName, brand, orderNumber, issueType})
sendFollowerCouponDelivery({to, followerFirstName, brand, benefit, code, expiresOn, influencerUsername})
sendBrandSupportTicket({to, brand, followerName, followerPhone, orderNumber, issueType, description, influencerName})
sendInfluencerWeeklyDigest({to, influencerFirstName, newFollowersThisWeek, conversations, couponsGiven, influencerUsername})
sendInfluencerWelcome({to, influencerFirstName, influencerUsername})

// Helper:
fireAndForget(promise)   // בולעת שגיאות ברקע
```

### 2.2 Triggers שנוספו

| Trigger | איפה | מתי רץ | Template |
|---------|------|-------|----------|
| Follower welcome | `src/app/api/chat/lead/route.ts` | ליד חדש עם `body.whatsappOptIn === true` | `follower_welcome_v2` |
| Support confirmation | `src/app/api/support/route.ts` | אחרי שפנייה נוצרה — **במקביל** ל-GREEN-API הקיים | `follower_support_confirmation` |
| Brand support ticket | `src/app/api/support/route.ts` | במקביל | `brand_support_ticket` |
| Coupon delivery | `src/app/api/track/route.ts` | `mappedType === 'coupon_copied'` | `follower_coupon_delivery_v3` |
| Influencer welcome | `src/app/api/admin/accounts/finalize/route.ts` | אם `phoneNumber && whatsappEnabled && username` | `influencer_welcome_v2` |
| Weekly digest | `src/app/api/cron/weekly-digest/route.ts` | `vercel.json` cron: `0 6 * * 0` (ראשון 06:00 UTC = 09:00 IDT) | `influencer_weekly_digest_v2` |

כל trigger נקרא בצורת `fireAndForget(sendXxx(...))` ולא משפיע על הזרימה הראשית של ה-API.

### 2.3 Migration בסיס הנתונים
`supabase/migrations/038_whatsapp_cloud.sql` — 5 טבלאות, כבר רץ בפרודקשן:
- `whatsapp_contacts` (wa_id, phone_e164, profile_name, …)
- `whatsapp_conversations` (phone_number_id, contact_id, last_inbound_at, last_outbound_at, status)
- `whatsapp_messages` (conversation_id, direction, status, template_name, body, waba_id, message_id, error_code, …)
- `whatsapp_webhook_events` (payload גולמי + `signature_valid`)
- `whatsapp_template_status` (cache מצב טמפלטים)

---

## 3. ⚠️ דבר קריטי שהתגלה היום

**מטא סיווגה 4 מה-6 טמפלטים ל-MARKETING במקום UTILITY כפי שהגשנו:**

| Template | הגשתי כ- | Meta סיווגה כ- | צריך opt-in שיווקי? |
|----------|----------|-----------------|---------------------|
| `follower_welcome_v2` | MARKETING | MARKETING | ✅ כן (כבר מטופל ב-`whatsappOptIn`) |
| `follower_coupon_delivery_v3` | UTILITY | ⚠️ **MARKETING** | ✅ נדרש opt-in! |
| `influencer_welcome_v2` | UTILITY | ⚠️ **MARKETING** | ✅ נדרש opt-in! |
| `influencer_weekly_digest_v2` | UTILITY | ⚠️ **MARKETING** | ✅ נדרש opt-in! |
| `brand_support_ticket` | UTILITY | UTILITY | ❌ לא (UTILITY אמיתי) |
| `follower_support_confirmation` | UTILITY | UTILITY | ❌ לא (UTILITY אמיתי) |

### מה צריך לתקן

היום הקוד **לא בודק opt-in** ב-3 מה-triggers האלה כי חשבנו שהם UTILITY. צריך:

**אופציה A (מומלצת) — להוסיף opt-in checks:**
1. להוסיף עמודה `whatsapp_marketing_opt_in boolean default false` ל-`chat_leads` ול-`accounts.config`.
2. צ׳קבוקס בטופס הליד: "מאשר.ת לקבל עדכונים שיווקיים ב-WhatsApp" → `whatsappOptIn` ב-body.
3. צ׳קבוקס דומה ב-admin finalize (או בטופס ההרשמה של המשפיענית).
4. לגייט:
   - `sendFollowerCouponDelivery` — לבדוק `lead.whatsapp_marketing_opt_in === true` לפני הקריאה (ב-`src/app/api/track/route.ts` → `dispatchCouponDeliveryWhatsApp`).
   - `sendInfluencerWelcome` — לבדוק `whatsappMarketingOptIn` ב-body של `/api/admin/accounts/finalize`.
   - `sendInfluencerWeeklyDigest` — לבדוק `account.config.whatsapp_marketing_opt_in === true` בתוך ה-loop של `src/app/api/cron/weekly-digest/route.ts`.

**אופציה B (חלופה) — לערער על הסיווג מול מטא:**
ב-WhatsApp Manager → Templates → על כל אחד מה-4 → Request re-categorization. מטא לפעמים מחזירה ל-UTILITY אם מסבירים שהטמפלט נשלח בתגובה לפעולה ישירה של המשתמש (copying a coupon הוא action-triggered).
**סיכוי הצלחה:** מקסימום 50/50. כדאי לערער על `follower_coupon_delivery_v3` ו-`influencer_welcome_v2` (הכי הגיוני UTILITY), ולהשאיר `influencer_weekly_digest_v2` כ-MARKETING (קשה להגן עליו כ-UTILITY).

**אופציה C — שילוב:** להגיש ערעור + במקביל להוסיף opt-in checks (בטוח משני הצדדים).

**עד שה-opt-in לא מוטמע, MUST להשאיר `WHATSAPP_NOTIFY_ENABLED=false`.** אחרת נעבור על ה-Messaging Policy של מטא.

---

## 4. מה צריך להיעשות ב-Meta (ידנית אחרי ה-deploy)

### 4.1 כשהדיפלוי ירוק (webhook מחזיר 200 ל-GET verify)

```bash
# Sanity check שה-endpoint חי
VERIFY_TOKEN="<value from .env.local WHATSAPP_WEBHOOK_VERIFY_TOKEN>"
curl "https://bestie.ldrsgroup.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=ping123"
# צריך להחזיר: ping123
```

### 4.2 רישום ה-Webhook ב-Meta Developers Console
1. פתח https://developers.facebook.com/apps/1297141655644794/
2. ב-sidebar: **WhatsApp → Configuration**
3. תחת **Webhook** לחץ **Edit**:
   - **Callback URL:** `https://bestie.ldrsgroup.com/api/webhooks/whatsapp`
   - **Verify token:** הערך של `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
4. **Verify and save** → מטא תשלח GET עם `hub.challenge`
5. ב-**Webhook fields** הירשם ל: `messages`, `message_template_status_update`

### 4.3 אלטרנטיבה — להירשם דרך Graph API (עדיף לאוטומציה)

```bash
TOKEN="<WHATSAPP_ACCESS_TOKEN>"
APPSEC="<WHATSAPP_APP_SECRET>"
VERIFY_TOKEN="<WHATSAPP_WEBHOOK_VERIFY_TOKEN>"
APP_ID="1297141655644794"
WABA="1458477285751402"
APP_TOKEN="${APP_ID}|${APPSEC}"
CALLBACK="https://bestie.ldrsgroup.com/api/webhooks/whatsapp"

# 1) רישום ה-callback ב-app level
curl -X POST "https://graph.facebook.com/v21.0/${APP_ID}/subscriptions" \
  -d "object=whatsapp_business_account" \
  -d "callback_url=${CALLBACK}" \
  -d "verify_token=${VERIFY_TOKEN}" \
  -d "fields=messages,message_template_status_update" \
  -d "access_token=${APP_TOKEN}"

# 2) קישור ה-WABA לאפליקציה
curl -X POST "https://graph.facebook.com/v21.0/${WABA}/subscribed_apps" \
  -H "Authorization: Bearer ${TOKEN}"
```

### 4.4 אימות סופי
```bash
# subscribed_apps צריך להחזיר את LeadersInfluencers
curl "https://graph.facebook.com/v21.0/${WABA}/subscribed_apps" -H "Authorization: Bearer ${TOKEN}"
# והאפליקציה עצמה
curl "https://graph.facebook.com/v21.0/${APP_ID}/subscriptions?access_token=${APP_TOKEN}"
```

---

## 5. ENV VARS חדשים ל-Vercel (Production + Preview)

**הכל כבר קיים ב-`.env.local` — צריך להעתיק ל-Vercel:**
```bash
WHATSAPP_ACCESS_TOKEN=EAASbvlObqnoBR...       # system user token, never expires
WHATSAPP_PHONE_NUMBER_ID=1056971817508262
WHATSAPP_BUSINESS_ACCOUNT_ID=1458477285751402
WHATSAPP_APP_SECRET=3c1bbc69eeafc7cb847335540ef15a5d
WHATSAPP_WEBHOOK_VERIFY_TOKEN=f62ebefc22d0ac563e6007328eed85176881e80b46789b7b6978dbc876a6a820
```

**להישאר off עד שה-opt-in UI מוטמע:**
```bash
WHATSAPP_NOTIFY_ENABLED=false       # master toggle — OFF כברירת מחדל
```

**כשבאמת רוצים להפעיל — tog per-template (אופציונלי, ברירת מחדל=on כשה-master on):**
```bash
WHATSAPP_TEMPLATE_FOLLOWER_SUPPORT_CONFIRMATION=true   # UTILITY → בטוח להפעיל ראשון
WHATSAPP_TEMPLATE_BRAND_SUPPORT_TICKET=true            # UTILITY → בטוח להפעיל ראשון
WHATSAPP_TEMPLATE_FOLLOWER_WELCOME=false               # MARKETING → רק כש-opt-in עובד
WHATSAPP_TEMPLATE_FOLLOWER_COUPON_DELIVERY=false       # MARKETING → רק כש-opt-in עובד
WHATSAPP_TEMPLATE_INFLUENCER_WELCOME=false             # MARKETING → רק כש-opt-in עובד
WHATSAPP_TEMPLATE_INFLUENCER_WEEKLY_DIGEST=false       # MARKETING → רק כש-opt-in עובד
```

---

## 6. סדר ההפעלה המומלץ

1. **commit + push** (Vercel יעשה deploy אוטומטי)
2. **ENV ב-Vercel:** העתק את 5 המשתנים + `WHATSAPP_NOTIFY_ENABLED=false`
3. **redeploy** כדי שה-env יכנס לתוקף
4. **בדיקה:** ה-webhook endpoint מחזיר את `hub.challenge` (ראה §4.1)
5. **רישום ב-Meta** (§4.2 או §4.3)
6. **הפעלה מדורגת:**
   - שלב 1 (אפשר מייד): להפעיל רק את 2 ה-UTILITY — support confirmation + brand ticket:
     ```
     WHATSAPP_NOTIFY_ENABLED=true
     WHATSAPP_TEMPLATE_FOLLOWER_WELCOME=false
     WHATSAPP_TEMPLATE_FOLLOWER_COUPON_DELIVERY=false
     WHATSAPP_TEMPLATE_INFLUENCER_WELCOME=false
     WHATSAPP_TEMPLATE_INFLUENCER_WEEKLY_DIGEST=false
     # שני ה-UTILITY משאירים default=on (לא צריך env נפרד)
     ```
   - שלב 2 (אחרי שה-opt-in מוטמע): להפעיל את ה-4 MARKETING אחד-אחד, לראות שאין flag של מטא על הודעות spam
7. **אחרי שבוע הרצה מקבילה:** להסיר את GREEN-API (§7)

---

## 7. הסרה של GREEN-API (רק אחרי שבוע נקי)

קבצים למחוק:
```bash
rm src/lib/whatsapp.ts
rm src/lib/greenapi.ts
```
תיקונים נדרשים (כל האזכורים של `notifyBrandSupport`, `sendSupportConfirmation`):
- `src/app/api/support/route.ts` — להסיר את ה-import ואת הקריאות (Meta Cloud כבר רץ במקביל)
- `src/lib/flows/support.ts` — אותו דבר
- `.env.local` ו-Vercel — למחוק `GREEN_API_INSTANCE_ID`, `GREEN_API_TOKEN`
- `package.json` — אם יש dep של green-api

---

## 8. בדיקות ידניות אחרי ההפעלה

### 8.1 Webhook alive
```bash
curl "https://bestie.ldrsgroup.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_WEBHOOK_VERIFY_TOKEN&hub.challenge=test123"
# → test123
```

### 8.2 Template test send (WhatsApp Manager UI)
WhatsApp Manager → Templates → בחר `brand_support_ticket` → **Send** → שלח לעצמך

### 8.3 Support flow end-to-end
שלח פנייה אמיתית דרך `/chat/{username}` של משפיענית עם brand שיש לו `whatsapp_phone` → המותג אמור לקבל `brand_support_ticket`, הלקוח `follower_support_confirmation`.

### 8.4 Coupon flow (אחרי opt-in)
התחבר כליד עם opt-in, העתק קופון → הלקוח אמור לקבל `follower_coupon_delivery_v3`.

### 8.5 Weekly digest manual
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://bestie.ldrsgroup.com/api/cron/weekly-digest
```

---

## 9. דיבאג כשמשהו נכשל

**3 מקומות לבדוק:**
1. `whatsapp_webhook_events` — כל payload שמטא שלחה (כולל `signature_valid` ו-`processing_error`)
2. `whatsapp_messages` עם `direction='outbound'` — כל שליחה יוצאת עם `status` ו-`error_code`/`error_message`
3. לוגים ב-Vercel — prefix `[whatsapp-notify]` או `[weekly-digest]`

**שגיאות נפוצות של מטא:**
- `131026` — המספר לא רשום ב-WhatsApp
- `131047` — חלון 24 שעות נסגר → חייבים טמפלט
- `132001` — טמפלט לא קיים / לא מאושר
- `130429` — rate limit
- `132012` — variable count mismatch (לא תואם למה שמטא אישרה)

---

## 10. מידע רפרנס מה-Meta API (נבדק היום)

```json
// App info (debug_token)
{
  "app_id": "1297141655644794",
  "application": "LeadersInfluencers",
  "type": "SYSTEM_USER",
  "expires_at": 0,
  "scopes": ["whatsapp_business_management", "whatsapp_business_messaging"]
}

// Phone number
{
  "id": "1056971817508262",
  "display_phone_number": "+972 54-390-2030",
  "verified_name": "BestieAI",
  "name_status": "PENDING_REVIEW",    // מטא עדיין בודקת — לא בשליטתנו
  "code_verification_status": "VERIFIED",
  "quality_rating": "UNKNOWN"
}

// WABA
{
  "id": "1458477285751402",
  "subscribed_apps": []               // עוד לא רשמנו
}
```

טמפלטים (6, כולם APPROVED):
```
follower_coupon_delivery_v3       MARKETING  id=1044143087944571
influencer_welcome_v2             MARKETING  id=1456802222793611
influencer_weekly_digest_v2       MARKETING  id=1004629721901970
follower_welcome_v2               MARKETING  id=4395591397429610
brand_support_ticket              UTILITY    id=1842789693022186
follower_support_confirmation     UTILITY    id=3487704568053317
```

---

## 11. Checklist תמציתי ל-Claude Code

- [ ] `npm run type-check` + `npm run lint` על הקבצים החדשים
- [ ] `git add` + commit + push של כל הקבצים מ-§1
- [ ] להוסיף את 5 ה-ENV-ים של WhatsApp + `WHATSAPP_NOTIFY_ENABLED=false` ל-Vercel (Production + Preview)
- [ ] לאמת שה-webhook endpoint מחזיר 200 אחרי ה-deploy
- [ ] להוסיף opt-in checkbox + עמודת DB ל-`chat_leads.whatsapp_marketing_opt_in` + ל-`accounts.config.whatsapp_marketing_opt_in`
- [ ] לגייט את 3 ה-triggers MARKETING על ה-opt-in (coupon, influencer welcome, weekly digest)
- [ ] לעדכן את ה-UI של טופס הליד + טופס onboarding המשפיענית
- [ ] לרשום את ה-webhook ב-Meta (§4.2 או §4.3)
- [ ] להפעיל את 2 ה-UTILITY ראשונים (שלב 1)
- [ ] לעקוב שבוע — כשהכל נקי, להפעיל את ה-MARKETING (שלב 2)
- [ ] להסיר את GREEN-API (§7) לאחר שבוע נקי

---

**שאלות פתוחות לתיעדוף:**
1. האם להגיש ערעור על סיווג 3 המרקטינג (follower_coupon_delivery_v3, influencer_welcome_v2) או ישר ללכת על opt-in?
2. איפה בדיוק מופיע טופס הליד (ה-UI שקורא ל-`/api/chat/lead`)? צריך לאתר אותו כדי להוסיף את ה-checkbox.
3. האם יש כבר `whatsapp_marketing_opt_in` או משהו דומה ב-schema? (אם כן — אפשר להשתמש; אם לא — migration חדש.)
