# WhatsApp Templates — מפרט ליצירה ב-Meta Business Suite

> **סטטוס נוכחי (16.04.2026):**
> 6 תבניות הוגשו ל-Meta. 2 כבר APPROVED, 4 ב-PENDING.
>
> | שם ב-Meta | Category | Status |
> |-----------|----------|--------|
> | `follower_welcome_v2` | MARKETING | PENDING |
> | `follower_support_confirmation` | UTILITY | ✅ APPROVED |
> | `follower_coupon_delivery_v3` | UTILITY | PENDING |
> | `brand_support_ticket` | UTILITY | ✅ APPROVED |
> | `influencer_weekly_digest_v2` | UTILITY | PENDING |
> | `influencer_welcome_v2` | UTILITY | PENDING |
>
> **למה `_v2`?** בתהליך ההגשה הראשון יצרנו טמפלטים עם URLs שגויים (`bestieai.com`).
> אחרי מחיקה, Meta נועלת את השם+שפה למשך זמן בלתי-ידוע (~4 שבועות לפי ההודעה של Meta),
> ולכן הגשנו מחדש עם סיומת `_v2`. **הטריגרים בקוד חייבים להשתמש בשמות עם `_v2`.**
>
> **מטרה:** מסמך אחד שתוכל לפתוח ליד Meta Business Suite ולהעתיק כל שדה ישירות.
>
> **לאן להגיע:** [Meta Business Suite](https://business.facebook.com/) → בחר `BestieAI` → תפריט צד → **WhatsApp Manager** → **Message Templates** → **Create Template**
>
> **חוקים כלליים לכל ה-templates:**
> - **Category:** Utility (לא Marketing — Utility זול יותר, מאושר מהר יותר)
> - **Language:** Hebrew (he)
> - **Name:** snake_case, lowercase, אותיות אנגליות בלבד (Meta requirement)
> - **משתנים:** `{{1}}, {{2}}, {{3}}...` — חייבים להיות רציפים
> - **Header text:** עד 60 תווים, עד variable אחד
> - **Body:** עד 1024 תווים, כמה variables שרוצים
> - **Footer:** עד 60 תווים, ללא variables
> - **URL Button Dynamic:** ה-variable חייב להיות **בסוף ה-URL**, רק אחד
> - **לחיצה על "Add sample" בעת היצירה היא חובה** — Meta משתמש בה לבדיקה

---

## Template 1: `follower_welcome`

**מתי נשלח:** עוקב נרשם בצ'אט (מילא טופס ליד עם opt-in ל-WhatsApp)
**למי:** לטלפון של העוקב
**trigger בקוד:** `POST /api/chat/lead` — אחרי insert מוצלח ל-`chat_leads`

### שדות ב-Meta Manager
| שדה | ערך |
|------|------|
| Name | `follower_welcome_v2` ← שם בפועל ב-Meta |
| Category | **Marketing** (Meta נעלה את השם הישן; `v2` הוגש כ-Marketing) |
| Language | Hebrew (he) |
| **Header** | Type: **Text** → `👋 ברוכים הבאים ל-{{1}}` |
| **Body** | ראה למטה |
| **Footer** | `BestieAI — הצ'אטבוט של {{1}}` ❌ **אי אפשר variable ב-footer.** תכתוב: `BestieAI` |
| **Buttons** | URL (Dynamic) — 1 כפתור |

### Body (העתק כמו שזה)
```
שלום {{1}}, שמחים שנרשמת אצל *{{2}}*!
מכאן נעדכן אותך על קופונים בלעדיים, תכנים חדשים והטבות.
לחזרה לצ'אט:
```

### Footer
```
BestieAI
```

### Button: URL (Dynamic)
- Type: **Visit website** → **Dynamic**
- Button text: `לצ'אט של {{1}}` → שים לב: זה שונה מה-URL variable. ה-button text יכול להיות סטטי: `חזרה לצ'אט`
- URL: `https://bestie.ldrsgroup.com/chat/{{1}}`  ← ה-{{1}} כאן הוא username (דינמי)
- **Sample value** (חובה): `danielamit`

### Sample values ל-Body (למילוי בהגשה)
- `{{1}}` = `מיכל`
- `{{2}}` = `דניאל`

---

## Template 2: `follower_support_confirmation`

**מתי נשלח:** עוקב סיים טופס תמיכה (שלח פנייה על בעיה במוצר)
**למי:** לטלפון של העוקב
**trigger בקוד:** `POST /api/support` — אחרי insert מוצלח ל-`support_requests`

### שדות
| שדה | ערך |
|------|------|
| Name | `follower_support_confirmation` |
| Category | **Utility** |
| Language | Hebrew (he) |
| **Header** | Type: **Text** → `✅ הפנייה שלך התקבלה` |
| **Body** | ראה למטה |
| **Footer** | `BestieAI — פניות תמיכה` |
| **Buttons** | ❌ אין |

### Body
```
שלום {{1}}, קיבלנו את הפנייה שלך.
מותג: *{{2}}*
מספר הזמנה: *{{3}}*
סוג הבעיה: *{{4}}*
העברנו לצוות של {{2}} — הם יחזרו אליך ישירות בהקדם.
```

### Sample values
- `{{1}}` = `מיכל`
- `{{2}}` = `SuperPharm`
- `{{3}}` = `SP-12345`
- `{{4}}` = `מוצר פגום`

---

## Template 3: `follower_coupon_delivery`

**מתי נשלח:** עוקב העתיק קופון בצ'אט (רק אם opt-in ל-WhatsApp)
**למי:** לטלפון של העוקב
**trigger בקוד:** event `coupon_copied` ב-`src/engines/events.ts`

### שדות
| שדה | ערך |
|------|------|
| Name | `follower_coupon_delivery_v3` ← שם בפועל ב-Meta |
| Category | **Utility** |
| Language | Hebrew (he) |
| **Header** | Type: **Text** → `🎁 הקופון שלך מוכן` |
| **Body** | ראה למטה |
| **Footer** | `BestieAI — קופונים בלעדיים` |
| **Buttons** | URL (Dynamic) — 1 כפתור |

### Body
```
{{1}}, הנה הקופון שביקשת:
מותג: *{{2}}*
הטבה: *{{3}}*
קוד: *{{4}}*
בתוקף עד: {{5}}
העתיקי את הקוד ותיכנסי לאתר 👇
```

### Button: URL (Dynamic)
- Button text: `לקנייה עם הקופון`
- URL: `https://bestie.ldrsgroup.com/chat/{{1}}`  ← ה-{{1}} הוא username (ה-slug של המשפיען/המותג)
- **Sample value:** `danielamit`

### Sample values ל-Body
- `{{1}}` = `מיכל`
- `{{2}}` = `SuperPharm`
- `{{3}}` = `20% הנחה`
- `{{4}}` = `DANIEL20`
- `{{5}}` = `30.4.2026`

---

## Template 4: `brand_support_ticket`

**מתי נשלח:** עוקב סיים טופס תמיכה → המותג מקבל פנייה
**למי:** לטלפון של המותג (`partnerships.whatsapp_phone` / `brand_logos.whatsapp_phone`)
**trigger בקוד:** `POST /api/support`

### שדות
| שדה | ערך |
|------|------|
| Name | `brand_support_ticket` |
| Category | **Utility** |
| Language | Hebrew (he) |
| **Header** | Type: **Text** → `📋 פנייה חדשה מלקוח` |
| **Body** | ראה למטה |
| **Footer** | `BestieAI — ניהול פניות` |
| **Buttons** | Call Phone (Dynamic) |

### Body
```
שלום {{1}},
פנייה חדשה מלקוח:
שם: *{{2}}*
טלפון: {{3}}
מספר הזמנה: {{4}}
סוג הבעיה: *{{5}}*
תיאור: {{6}}
הגיעה דרך המשפיענית *{{7}}*.
מומלץ לחזור ללקוחה תוך 24 שעות.
```

### Button: Call Phone (Dynamic)
- Button text: `התקשר ללקוחה`
- Phone: `Dynamic` → `{{1}}`
- **Sample:** `+972541234567`

### Sample values ל-Body
- `{{1}}` = `SuperPharm`
- `{{2}}` = `מיכל כהן`
- `{{3}}` = `+972541234567`
- `{{4}}` = `SP-12345`
- `{{5}}` = `מוצר פגום`
- `{{6}}` = `הגיע שבור מהמשלוח`
- `{{7}}` = `דניאל עמית`

---

## Template 5: `influencer_weekly_digest`

**מתי נשלח:** פעם בשבוע, יום ראשון בבוקר (9:00 שעון ישראל) — סיכום השבוע שחלף
**למי:** לטלפון של המשפיען (`influencers.phone_number` אם `influencers.whatsapp_enabled = true`)
**trigger בקוד:** cron חדש `src/app/api/cron/weekly-digest/route.ts` — רץ ב-`0 9 * * 0` (כל ראשון ב-9:00)

> **הגיון:** לא מציפים עם ליד-ליד. פעם בשבוע בבוקר הראשון (כשהמשפיען מתחיל את השבוע), סיכום קצר של שבוע שעבר — כמה לידים, כמה העתקות קופונים, נושא הכי חם, שיעור צמיחה. מניע לכניסה לדשבורד לראות פרטים.

### שדות
| שדה | ערך |
|------|------|
| Name | `influencer_weekly_digest_v2` ← שם בפועל ב-Meta |
| Category | **Utility** |
| Language | Hebrew (he) |
| **Header** | Type: **Text** → `📊 סיכום השבוע שלך` |
| **Body** | ראה למטה |
| **Footer** | `BestieAI — דוח שבועי` |
| **Buttons** | URL (Dynamic) |

### Body
```
שלום *{{1}}*, הנה סיכום השבוע בצ'אטבוט שלך:
לידים חדשים: *{{2}}*
העתקות קופונים: *{{3}}*
פניות תמיכה: *{{4}}*
נושא פופולרי: *{{5}}*
לפרטים מלאים ולרשימת הלידים:
```

### Button: URL (Dynamic)
- Button text: `דשבורד שלי`
- URL: `https://bestie.ldrsgroup.com/influencer/{{1}}`
- **Sample:** `danielamit`

### Sample values ל-Body
- `{{1}}` = `דניאל`
- `{{2}}` = `47`
- `{{3}}` = `23`
- `{{4}}` = `3`
- `{{5}}` = `טיפוח עור`

### הערת מימוש לעתיד (Phase 2)
במקום cron אחד שרץ לכולם באותה שעה, להוסיף שדה ל-`influencers`:
- `whatsapp_digest_frequency` TEXT CHECK IN ('weekly','off') DEFAULT 'weekly'
- `whatsapp_digest_day` INT (0=ראשון, 1=שני...) DEFAULT 0
- `whatsapp_digest_hour` INT (0-23) DEFAULT 9

ה-cron יבדוק `day_of_week=X AND hour=Y` ויסנן מי מקבל. כך כל משפיען יכול לבחור מתי מקבל. (לא מחייב עכשיו — ברירת מחדל ראשון 9:00.)

---

## Template 6: `influencer_welcome`

**מתי נשלח:** חשבון משפיען חדש מופעל (admin finalize)
**למי:** לטלפון של המשפיען
**trigger בקוד:** `POST /api/admin/accounts/finalize` — אחרי `status='active'`

### שדות
| שדה | ערך |
|------|------|
| Name | `influencer_welcome_v2` ← שם בפועל ב-Meta |
| Category | **Utility** |
| Language | Hebrew (he) |
| **Header** | Type: **Image** → העלה את הלוגו של BestieAI (ראה למטה) |
| **Body** | ראה למטה |
| **Footer** | `BestieAI — הצ'אטבוט האישי שלך` |
| **Buttons** | 2 URL Buttons (Dynamic) |

### Header (Image)
- העלה את `public/logo-bestieai.png` בגודל ≥ 300×300
- אם אין לוגו מוכן — דלג על header ל-Text: `🎉 ברוכים הבאים ל-BestieAI!`

### Body
```
שלום *{{1}}*! 🎉
הצ'אטבוט שלך מוכן ופעיל.
מה מחכה לך:
💬 צ'אט AI 24/7
📈 מעקב לידים וקופונים
📊 דשבורד ביצועים
💜 מעקב תמיכה
```

### Button 1: URL (Dynamic) — Chat
- Button text: `העמוד שלי`
- URL: `https://bestie.ldrsgroup.com/chat/{{1}}`
- **Sample:** `danielamit`

### Button 2: URL (Dynamic) — Dashboard
- Button text: `דשבורד ניהול`
- URL: `https://bestie.ldrsgroup.com/influencer/{{1}}`
- **Sample:** `danielamit`

### Sample value ל-Body
- `{{1}}` = `דניאל`

---

# נספחים

## נספח A — סיבות דחייה נפוצות (מניסיון Meta)

| סיבה | מה לעשות |
|------|-----------|
| "Contains vague language" | להוסיף פרטים ספציפיים ב-Body (שמות, מספרים) |
| "Variables without context" | ה-sample values חייבים להיות ריאליסטיים |
| "Marketing content in Utility" | להוריד קריאות לפעולה שיווקיות ("הצטרפו עכשיו", "רק היום") |
| "Promotional footer" | ה-footer חייב להיות ניטרלי, לא פרסומי |
| "Missing variable example" | כל `{{N}}` חייב sample value |

## נספח B — סדר יצירה מומלץ

כדי לא להיחסם אם אחד מהם נדחה:
1. קודם **`follower_support_confirmation`** — הכי פשוט, ללא buttons, מאושר הכי מהר. אם הוא עובר — יש לך ביטחון שהפורמט ב-Meta עובד לך.
2. אחרי שהוא אושר: **`follower_welcome`** + **`follower_coupon_delivery`**
3. במקביל: **`brand_support_ticket`** + **`influencer_new_lead`**
4. אחרון: **`influencer_welcome`** (עם image header — הכי מורכב)

## נספח C — בדיקה שהתבנית מאושרת

לאחר ההגשה, הבדוק:
```bash
# החלף את הטוקן ו-WABA
curl -s -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" \
  "https://graph.facebook.com/v21.0/$WHATSAPP_BUSINESS_ACCOUNT_ID/message_templates?fields=name,status,language,category,rejected_reason&limit=50"
```
- `status: APPROVED` — מוכן לשימוש
- `status: PENDING` — עדיין בבדיקה
- `status: REJECTED` + `rejected_reason` — תקן ושלח שוב

## נספח D — שליחה ראשונה אחרי אישור

לאחר שטמפלט `follower_support_confirmation` אושר:
```bash
# בדוק שהוא עובד — שלח לטלפון שלך (החלף ב-972XXXXXXXX שלך):
TO="972547667775"
curl -s -X POST "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"messaging_product\":\"whatsapp\",
    \"to\":\"$TO\",
    \"type\":\"template\",
    \"template\":{
      \"name\":\"follower_support_confirmation\",
      \"language\":{\"code\":\"he\"},
      \"components\":[
        {\"type\":\"body\",\"parameters\":[
          {\"type\":\"text\",\"text\":\"מיכל\"},
          {\"type\":\"text\",\"text\":\"SuperPharm\"},
          {\"type\":\"text\",\"text\":\"SP-12345\"},
          {\"type\":\"text\",\"text\":\"מוצר פגום\"}
        ]}
      ]
    }
  }'
```

---

# Phase 2 — templates נוספים (לאחר שהבסיס עובד)

אלו לא לבנות כרגע. רק כשה-6 הראשונים ירוצו חודש בשקט ותרצה להרחיב:

- `influencer_new_support` — פנייה חדשה הגיעה דרך הצ'אטבוט שלך (נוגע למשפיען, לא למותג)
- `influencer_hot_lead` — רק כשה-AI מזהה כוונת רכישה גבוהה (לא על כל ליד)
- `follower_order_shipped` — עדכון משלוח (דורש אינטגרציה עם מערכת משלוחים של המותג)
- `brand_weekly_performance` — דוח שבועי למותג על ביצועי קופונים

---

# Definition of Done ליצירת Templates

- [ ] 6 templates נוצרו ב-Meta Business Suite
- [ ] כולם **APPROVED** (לא PENDING)
- [ ] שליחת בדיקה של כל אחד למספר שלך עובדת
- [ ] אם אחד נדחה — תוקן לפי ה-rejected_reason והוגש שוב
