# WhatsApp Cloud — Go Live Checklist

מסמך מבצעי: מה שנשאר כדי לעבור להפעלה מלאה עכשיו כשהקוד מחובר.

## ✅ מה כבר מחובר בקוד (16.04.2026)

| רכיב | איפה | סטטוס |
|------|------|-------|
| DB migration (5 טבלאות) | `supabase/migrations/038_whatsapp_cloud.sql` | ✅ רץ |
| Webhook GET verify | `src/app/api/webhooks/whatsapp/route.ts` | ✅ |
| Webhook POST receive | `src/app/api/webhooks/whatsapp/route.ts` | ✅ |
| HMAC-SHA256 signature | `src/lib/whatsapp-cloud/signature.ts` | ✅ |
| Graph API client | `src/lib/whatsapp-cloud/client.ts` | ✅ |
| **Notify module (6 templates)** | `src/lib/whatsapp-notify.ts` | ✅ חדש |
| Trigger: `follower_welcome_v2` | `src/app/api/chat/lead/route.ts` | ✅ מחובר |
| Trigger: `follower_support_confirmation` | `src/app/api/support/route.ts` | ✅ מחובר |
| Trigger: `brand_support_ticket` | `src/app/api/support/route.ts` | ✅ מחובר |
| Trigger: `follower_coupon_delivery_v3` | `src/app/api/track/route.ts` | ✅ מחובר |
| Trigger: `influencer_welcome_v2` | `src/app/api/admin/accounts/finalize/route.ts` | ✅ מחובר |
| Trigger: `influencer_weekly_digest_v2` | `src/app/api/cron/weekly-digest/route.ts` + `vercel.json` | ✅ חדש |

כל ה-triggers הם fire-and-forget עם gate על `WHATSAPP_NOTIFY_ENABLED=true`. אם ה-flag הוא false (ברירת מחדל), שום דבר לא נשלח, והאפליקציה עובדת בדיוק כמו קודם (GREEN-API ממשיך לעבוד במקביל).

---

## 🔲 מה נשאר לעשות — שלב אחר שלב

### 1. רישום ה-Webhook במטא (פעולה ידנית, פעם אחת)

1. פתח [Meta Developers Console](https://developers.facebook.com/apps/) → בחר את אפליקציית BestieAI
2. בתפריט צד → **WhatsApp → Configuration**
3. תחת **Webhook**, לחץ **Edit**:
   - **Callback URL:** `https://bestie.ldrsgroup.com/api/webhooks/whatsapp`
   - **Verify token:** הערך של `WHATSAPP_WEBHOOK_VERIFY_TOKEN` מתוך `.env.local`
4. לחץ **Verify and save** — מטא תשלח GET עם `hub.challenge`; אם הקוד שלנו מחזיר את ה-challenge תקבל ✅
5. תחת **Webhook fields**, הירשם לפחות ל: `messages` (חובה), ואפשר גם `message_template_status_update` (כדי לקבל עדכון כשטמפלט עובר APPROVED)

### 2. אישור ה-Display Name של מספר העסק

- ב-Meta Business Suite → **WhatsApp Manager** → **Phone numbers**
- וודא ש-`name_status` עבר מ-`PENDING_REVIEW` ל-`APPROVED`
- בדיקה מהירה דרך API:
  ```bash
  curl "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID?fields=verified_name,name_status" \
    -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
  ```

### 3. המתנה לאישור 3 הטמפלטים שעוד PENDING

| שם | Category | סטטוס נוכחי |
|----|----------|-------------|
| `follower_welcome_v2` | MARKETING | PENDING |
| `follower_coupon_delivery_v3` | UTILITY | PENDING |
| `influencer_weekly_digest_v2` | UTILITY | PENDING |
| `influencer_welcome_v2` | UTILITY | PENDING |

בדיקה מהירה:
```bash
curl "https://graph.facebook.com/v21.0/$WHATSAPP_BUSINESS_ACCOUNT_ID/message_templates?fields=name,status&limit=50" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
```

בדרך כלל UTILITY מאושרים בתוך 10-30 דקות. MARKETING יכול לקחת כמה שעות.

### 4. הפעלת ה-Notify module

ברגע שכל הטמפלטים APPROVED, הוסף ל-Vercel environment (Production + Preview):

```bash
WHATSAPP_NOTIFY_ENABLED=true
```

**אופציונלי** — rollout הדרגתי (flag פר-template):

```bash
# ברירת מחדל: כולם on
WHATSAPP_TEMPLATE_FOLLOWER_WELCOME=true
WHATSAPP_TEMPLATE_FOLLOWER_SUPPORT_CONFIRMATION=true
WHATSAPP_TEMPLATE_FOLLOWER_COUPON_DELIVERY=true
WHATSAPP_TEMPLATE_BRAND_SUPPORT_TICKET=true
WHATSAPP_TEMPLATE_INFLUENCER_WELCOME=true
WHATSAPP_TEMPLATE_INFLUENCER_WEEKLY_DIGEST=true
```

כדי לכבות template יחיד בזמן שהאחרים רצים, שנה את הערך ל-`false`.

### 5. הסרה של GREEN-API (אחרי שבוע של הרצה מקבילה)

כשיש בטחון ש-Meta Cloud עובד נקי:

```bash
# קבצים למחוק
rm src/lib/whatsapp.ts        # wrapper ישן (notifyBrandSupport / sendSupportConfirmation)
rm src/lib/greenapi.ts        # מימוש GREEN-API
```

תיקונים נדרשים אחרי המחיקה:
- `src/app/api/support/route.ts` — להסיר את ה-import של `notifyBrandSupport`, `sendSupportConfirmation` ואת הבלוק שקורא להם (ה-Meta Cloud כבר רץ ב-fire-and-forget)
- `src/lib/flows/support.ts` — אותו import להסיר
- `.env.local` — למחוק `GREEN_API_INSTANCE_ID`, `GREEN_API_TOKEN`

### 6. Opt-in UI ל-MARKETING welcome

ה-template `follower_welcome_v2` הוא MARKETING, ולכן ה-trigger ב-`/api/chat/lead` מחכה ל-`body.whatsappOptIn === true`. כרגע טופס הלידים לא שולח את השדה הזה → ה-welcome לא יישלח אפילו אם כל שאר ההגדרות על.

**לפני הפעלה מלאה:** הוסף צ'קבוקס "אשר קבלת עדכונים ב-WhatsApp" לטופס הליד, ושלח `whatsappOptIn: true/false` ל-API.

קובץ להוסיף בו צ'קבוקס: חפש את הטופס שקורא ל-`/api/chat/lead` (ככל הנראה בקומפוננטת הלידים של הצ'אט).

---

## 🧪 בדיקות ידניות לאחר ההפעלה

1. **Webhook alive**  
   ```bash
   curl "https://bestie.ldrsgroup.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_WEBHOOK_VERIFY_TOKEN&hub.challenge=test123"
   # → אמור להחזיר: test123
   ```

2. **Template test send** (ישירות מ-Meta Manager)  
   - WhatsApp Manager → Templates → בחר template APPROVED → שלח לעצמך

3. **Support flow end-to-end**  
   - שלח טופס תמיכה בדף `/chat/{username}` של משפיענית אמיתית עם phone + brand שיש לו `whatsapp_phone`
   - המותג אמור לקבל `brand_support_ticket`
   - הלקוח אמור לקבל `follower_support_confirmation`

4. **Coupon copy flow**  
   - ודא שהליד הוגש (`chat_leads` insert)
   - העתק קופון בצ'אט
   - הלקוח אמור לקבל `follower_coupon_delivery_v3`

5. **Weekly digest**  
   - קפוץ קדימה: תקרא ידנית ל-
     ```bash
     curl -H "Authorization: Bearer $CRON_SECRET" \
       https://bestie.ldrsgroup.com/api/cron/weekly-digest
     ```
   - כל משפיענית פעילה עם `features.whatsapp=true` + `config.phone` תקבל סיכום

---

## 🔍 איך דיבאג כשמשהו לא הגיע

1. **טבלת events גולמית:** `whatsapp_webhook_events` — כל payload שמטא שולחת נשמר שם גולמי, כולל `signature_valid` ו-`processing_error`
2. **הודעות יוצאות:** `whatsapp_messages` עם `direction='outbound'` — שומר `status` (pending/sent/delivered/read/failed) ו-`error_code`/`error_message`
3. **לוגים ב-Vercel:** כל קריאה ל-Meta שנכשלה תופיע עם prefix `[whatsapp-notify]` בקונסול
4. **Meta error codes נפוצים:**
   - `131026` — מספר לא רשום ב-WhatsApp
   - `132001` — template לא קיים / לא מאושר עדיין
   - `131047` — חלון 24 שעות נסגר (צריך template חדש)
   - `130429` — rate limit
