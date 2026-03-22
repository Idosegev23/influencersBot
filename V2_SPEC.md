# InfluencerBot V2 — אפיון מלא

> מסמך אפיון מוצר | גרסה 1.0 | 19 מרץ 2026
> מיועד לעיבוד ע"י יואב (PM)

---

## 1. חזון V2

### 1.1 מצב נוכחי (V1)
המערכת כיום מציעה:
- **צ'אטבוט באתר** (Widget) — עוקבים מגיעים לאתר, שואלים שאלות, מקבלים מידע על תוכן ושת"פים
- **סריקת אינסטגרם** — פוסטים, סטוריז, highlights, תמלולים
- **ניתוח AI** — פרסונה, RAG, אחזור היברידי
- **ניהול שת"פים** — מסמכים, קופונים, מעקב

### 1.2 חזון V2
הפיכת ערוץ ה-DM של אינסטגרם לערוץ הראשי — שיחה אישית, חכמה, עם זיכרון מתמשך. האתר הופך לנקודת כניסה (discovery hub) שמוביל ל-DM כערוץ העמוק.

**עקרון מפתח: V2 נבנה מעל V1 — לא שובר אותו.** V1 כבר נמכר. כל קוד V2 הוא תוספתי, מאחורי feature flags, מופעל per-account.

### 1.3 שלושה ערוצים
| ערוץ | תפקיד | אופי |
|------|--------|------|
| **DM (אינסטגרם)** | שיחה אישית, מתמשכת | אישי, חם, עם זיכרון |
| **אתר (Widget)** | גילוי, חיפוש, רכישה | מידע מהיר, קופונים, שת"פים |
| **Cross-channel** | גשר בין הערוצים | המשכיות, סנכרון, הפניה |

---

## 2. ארכיטקטורה טכנית

### 2.1 Feature Flags
```
# Global
V2_ENABLED=true/false

# Per-account (accounts.config JSONB)
accounts.config.v2 = {
  dm_bot_mode: "auto" | "assist" | "off",    // מצב DM
  cross_channel: true/false,                   // חיבור ערוצים
  follower_identity: true/false,               // זיהוי עוקבים
  dm_audit: true/false,                        // סריקת היסטוריה
  coupon_widget: true/false,                    // קופונים באתר
  notifications: true/false,                    // התראות למשפיענית
  brand_portal: true/false,                     // פורטל מותגים
}
```

### 2.2 מבנה קוד
```
src/
├── lib/v2/                    # כל הקוד החדש
│   ├── dm/                    # DM engine
│   │   ├── modes.ts           # auto/assist/off logic
│   │   ├── intent-detector.ts # זיהוי כוונה
│   │   ├── boundaries.ts      # גבולות שיחה
│   │   ├── session-lifecycle.ts
│   │   └── media-handler.ts   # סטורי replies, תמונות
│   ├── identity/              # זיהוי עוקבים
│   │   ├── follower-store.ts
│   │   └── cross-channel.ts
│   ├── audit/                 # סריקת DM היסטורי
│   │   ├── dm-scanner.ts
│   │   ├── segment-builder.ts
│   │   └── insights.ts
│   ├── notifications/         # התראות למשפיענית
│   │   └── notifier.ts
│   └── analytics/             # דוחות V2
│       ├── dm-analytics.ts
│       └── cross-channel.ts
├── app/api/v2/                # API routes חדשים
│   ├── dm/settings/
│   ├── audit/
│   ├── followers/
│   ├── notifications/
│   └── analytics/
└── app/influencer/[username]/
    ├── dm-settings/           # הגדרות DM (UI)
    ├── followers/             # ניהול עוקבים
    └── dm-audit/              # תוצאות סריקה
```

### 2.3 שינויים ב-V1 (~20 שורות)
הקבצים הקיימים משתנים מינימלית — רק hooks מותנים:

```typescript
// dm-handler.ts — הוספת 5 שורות
if (process.env.V2_ENABLED && account.config?.v2?.dm_bot_mode) {
  const { handleV2DM } = await import('@/lib/v2/dm/modes');
  return handleV2DM(event, account, session);
}
// ... אחרת — V1 הרגיל ממשיך לעבוד

// sandwichBot.ts — הוספת 3 שורות
if (input.mode === 'dm' && account?.config?.v2?.cross_channel) {
  const { enrichWithFollowerContext } = await import('@/lib/v2/identity/cross-channel');
  input = await enrichWithFollowerContext(input, followerId);
}
```

### 2.4 טבלאות DB חדשות

```sql
-- זיהוי עוקבים חוצה-ערוצים
CREATE TABLE followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  ig_user_id TEXT,                    -- Instagram scoped ID
  ig_username TEXT,                   -- Instagram username (if known)
  email TEXT,                         -- מייל (מהאתר/ניוזלטר)
  phone TEXT,                         -- טלפון (אופציונלי)
  display_name TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_interaction_at TIMESTAMPTZ,
  total_interactions INT DEFAULT 0,
  channels JSONB DEFAULT '[]',        -- ["dm", "widget", "newsletter"]
  tags TEXT[] DEFAULT '{}',           -- תגיות: ["super_fan", "buyer", "new"]
  notes TEXT,                         -- הערות של המשפיענית
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, ig_user_id)
);

-- סריקת DM היסטורי
CREATE TABLE dm_audit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  scan_started_at TIMESTAMPTZ,
  scan_completed_at TIMESTAMPTZ,
  total_conversations INT,
  total_messages INT,
  unanswered_count INT,
  segments JSONB,                     -- פילוח אוטומטי
  top_topics JSONB,                   -- נושאים עיקריים
  super_fans JSONB,                   -- עוקבים מובילים
  raw_stats JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- היסטוריית DM מיובאת
CREATE TABLE dm_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  ig_conversation_id TEXT,
  ig_user_id TEXT,
  direction TEXT CHECK (direction IN ('incoming', 'outgoing')),
  content TEXT,
  media_url TEXT,
  sent_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ DEFAULT now(),
  analyzed BOOLEAN DEFAULT false,
  analysis JSONB                      -- topics, sentiment, intent
);

-- התראות למשפיענית
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  type TEXT NOT NULL,                 -- 'dm_needs_attention', 'daily_summary', 'new_super_fan', 'escalation'
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- לוג DM assist (טיוטות לאישור)
CREATE TABLE dm_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  session_id UUID REFERENCES chat_sessions(id),
  ig_user_id TEXT NOT NULL,
  draft_text TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'edited', 'rejected', 'expired')),
  edited_text TEXT,                   -- אם המשפיענית ערכה
  created_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ
);
```

---

## 3. ערוץ DM — אפיון מלא

### 3.1 שלושה מצבי פעולה

| מצב | תיאור | מתי |
|-----|--------|-----|
| **Auto** | הבוט עונה אוטומטית | כשהמשפיענית בטוחה באיכות, אחרי תקופת הרצה |
| **Assist** | הבוט מכין טיוטה, המשפיענית מאשרת/עורכת לפני שליחה | ברירת מחדל בהתחלה |
| **Off** | אין בוט, רק מעקב ו-analytics | כשהמשפיענית רוצה לענות בעצמה |

#### זרימה — מצב Assist:
1. הודעה נכנסת מעוקב/ת
2. המערכת מנתחת: כוונה, הקשר, היסטוריה
3. מכינה טיוטת תשובה
4. שולחת התראה למשפיענית (push/אימייל)
5. המשפיענית רואה: ההודעה + הטיוטה המוצעת
6. 3 אפשרויות: **אשר** (שלח כמו שזה) | **ערוך** (שנה ושלח) | **דחה** (ענה בעצמה)
7. אם לא הגיבה תוך X שעות — הטיוטה פגה (expired), לא נשלחת

#### זרימה — מצב Auto:
1. הודעה נכנסת
2. ניתוח כוונה + בדיקת גבולות
3. אם בטוח (confidence > threshold) — שולח ישירות
4. אם לא בטוח — עובר ל-assist (מכין טיוטה ומודיע)
5. לוג של כל תשובה אוטומטית ל-audit

### 3.2 זיהוי כוונה (Intent Detection)

המערכת מזהה את הכוונה האמיתית של העוקב/ת ומגיבה בהתאם — **לא מקדמת שת"פ אלא אם זה זורם טבעי מהשיחה.**

| כוונה | דוגמה | תגובה |
|-------|--------|--------|
| **שאלה כללית** | "מה את ממליצה לארוחת בוקר?" | תשובה מהתוכן + RAG |
| **שאלה על שת"פ** | "איזה קרם פנים את משתמשת?" | תשובה + **אם יש שת"פ רלוונטי** — הזכרה טבעית |
| **עניין רכישה** | "יש קופון?" | קופון + לינק |
| **בקשת עזרה אישית** | "אני מרגישה ממש רע" | תמיכה רגשית + גבולות (לא ייעוץ מקצועי) |
| **תלונה** | "המוצר שהמלצת היה גרוע" | הכרה + escalation למשפיענית |
| **ספאם/הטרדה** | שפה פוגענית | התעלמות + סימון |
| **שיחת חולין** | "מה נשמע?" | שיחה קלילה בטון של המשפיענית |
| **story reply** | תגובה לסטורי | תשובה בהקשר הסטורי + המשך טבעי |

**עקרון מפתח**: הבוט מתנהג כמו המשפיענית — לא כמו סוכן מכירות. קידום מוצרים קורה רק כשזה **חלק טבעי מהשיחה**.

דוגמה:
```
עוקב: "וואו הכנתי את המתכון שפירסמת! יצא מעולה"
בוט: "אייי כיף! שמחה ששווה 🥰
       מה הכנת? את הפסטה או הסלט?"    ← שיחה טבעית, לא מכירה

עוקב: "את הפסטה! עם מה את עושה את הרוטב?"
בוט: "אני משתמשת בשמן זית של XXX — הוא ממש עושה את ההבדל ברוטב.
       אגב יש לי קוד הנחה: COOKING10 💚"   ← הזדמנות טבעית
```

### 3.3 פרסונה — אפיון קריטי

**בעיה ב-V1:** הפרסונה לא מותאמת מספיק. בוט של סוכנות (כמו ldrs_group) דיבר כאילו הוא אדם פרטי.

**פתרון V2:** פרסונה מפורטת per-account עם שדות חובה:

```typescript
interface V2Persona {
  // זהות
  name: string;                    // שם מלא
  type: "individual" | "agency" | "brand";  // סוג חשבון
  gender: "male" | "female" | "neutral";    // לנטיית שפה

  // טון
  tone: string;                    // "חברותי וקליל" / "מקצועי ורשמי"
  language_style: string;          // "משלבת אמוג'ים" / "ללא אמוג'ים"
  greeting_style: string;          // "היי מותק!" / "שלום, איך אוכל לעזור?"

  // גבולות
  topics_allowed: string[];        // נושאים שמותר לדבר עליהם
  topics_forbidden: string[];      // נושאים אסורים
  boundaries: string;              // "לא ייעוץ רפואי, לא פוליטיקה"
  escalation_triggers: string[];   // מתי להעביר למשפיענית: ["תלונה", "בקשה אישית"]

  // דוגמאות
  example_responses: {             // 3-5 דוגמאות של תשובות אמיתיות
    question: string;
    answer: string;
  }[];

  // הנחיות נוספות
  custom_instructions: string;     // הנחיות חופשיות מהמשפיענית
}
```

**אונבורדינג פרסונה:** בהקמת חשבון, המשפיענית עוברת תהליך מודרך:
1. "מה השם שלך?" / "מה הטון שלך?" / "מה אסור לדבר עליו?"
2. "תני 3 דוגמאות של תשובות שאת הייתה נותנת"
3. המערכת בונה persona draft ← המשפיענית מאשרת/מתקנת
4. test chat — המשפיענית מנסה לדבר עם הבוט שלה ומתקנת

### 3.4 גבולות שיחה

| סוג גבול | התנהגות |
|-----------|---------|
| **נושא אסור** | "זה לא משהו שאני נכנסת אליו 😊 אבל שמחה לדבר על [נושא מותר]" |
| **ייעוץ מקצועי** | "אני לא מומחית ב-X, שווה לפנות לאיש/ת מקצוע" |
| **מידע אישי** | לא חושף כתובת, טלפון, לוח זמנים של המשפיענית |
| **שפה פוגענית** | לא עונה, מסמן לאדמין |
| **ניסיון הונאה** | "אני הבוט של [שם], לא יכולה לעזור עם זה" |
| **שיחה ארוכה מדי** | אחרי X הודעות ← "שמחתי לדבר! אם את צריכה עוד משהו אני פה 💛" |

### 3.5 Escalation Protocol

מתי הבוט **מפסיק ומעביר למשפיענית**:
1. **תלונה על מוצר/שת"פ** — הבוט מכיר בבעיה, לא מתנצל בשם המותג, מודיע שמעביר
2. **בקשה אישית** — "אפשר להיפגש?" / "את יכולה לעזור לי עם..."
3. **מצוקה רגשית** — "אני חושבת על לעשות משהו לעצמי" → הודעה + קו חירום
4. **שאלה שאין עליה תשובה** — confidence < threshold → "אני בודקת ואחזור אלייך"
5. **trigger ידני** — המשפיענית הגדירה מילות מפתח ספציפיות

**בכל escalation:**
- הבוט שולח הודעת ביניים לעוקב ("בודקת ואחזור!")
- שולח התראה למשפיענית עם: ההודעה + ההקשר + סיבת ההעברה
- מסמן את השיחה ב-dashboard

### 3.6 מחזור חיי Session ב-DM

```
SESSION LIFECYCLE:

1. הודעה ראשונה מעוקב/ת חדש/ה
   → יצירת follower record
   → יצירת session חדש
   → greeting מותאם אישית

2. שיחה פעילה
   → rolling summary מתעדכן אחרי כל חילופי הודעות
   → context window: 20 הודעות אחרונות + rolling summary
   → intent detection על כל הודעה

3. שיחה "נרדמת" (> 4 שעות ללא הודעה)
   → session נשאר פתוח
   → בהודעה הבאה: "היי! חזרת 😊" + המשך מהנקודה שעצרנו

4. session ישן (> 7 ימים)
   → rolling summary נשמר
   → בהודעה הבאה: session חדש עם rolling summary כ-context
   → "שמחה לשמוע ממך שוב! בפעם שעברה דיברנו על..."

5. עוקב/ת חוזר/ת (session חדש, follower קיים)
   → כל ההיסטוריה זמינה
   → הבוט "זוכר": שם, העדפות, רכישות קודמות
```

### 3.7 Story Replies

כשעוקב/ת מגיב/ה לסטורי:
1. המערכת מקבלת את ה-story ID + התגובה
2. שולפת metadata של הסטורי (תוכן, נושא, שת"פ?)
3. בונה תשובה בהקשר הסטורי הספציפי

דוגמה:
```
[סטורי: תמונה של ארוחת בוקר במסעדה X]
עוקב: "וואו כיף! איפה זה?"
בוט: "זו מסעדת X בתל אביב! ממליצה בטירוף,
       במיוחד הגרנולה שלהם 🥣
       אגב הם נותנים 10% עם הקוד BREAKFAST10"
       ← רק אם יש שת"פ אמיתי עם המסעדה
```

### 3.8 טיפול במדיה

| סוג מדיה נכנסת | טיפול |
|-----------------|-------|
| **תמונה** | OCR + תיאור → הבנת הקשר → תשובה |
| **סרטון** | לוג בלבד (אין תמלול real-time) |
| **קול** | לוג בלבד (עתידי: whisper transcription) |
| **קובץ/לינק** | לוג + "קיבלתי! אבדוק" |
| **שיתוף פוסט** | זיהוי הפוסט → תשובה בהקשר |
| **שיתוף Reel** | לוג + תשובה כללית |

---

## 4. ערוץ האתר (Widget) — שדרוגי V2

### 4.1 קופונים ושת"פים

**מצב V1:** מידע על שת"פים זמין דרך RAG, אבל אין חוויית קופון ייעודית.

**V2 — Widget Coupons:**
- כפתור "קופונים והנחות" בולט ב-widget
- תצוגת כרטיסיות: לוגו מותג + תיאור + קוד + תוקף
- חיפוש: "יש קופון ל-X?" → תשובה ישירה עם הקוד
- tracking: כל חשיפת קופון נרשמת ← דוחות למשפיענית

### 4.2 ניוזלטר

- שדה "השאירו מייל לעדכונים" ב-widget
- נשמר ב-followers table (channel: "newsletter")
- מאפשר cross-channel: מי שנרשם באתר → מזוהה ב-DM (אם נתן מייל)

### 4.3 Affiliate Tracking

- כל קופון קשור ל-partnership
- כל שימוש בקופון (click על "העתק קוד") נספר
- דוח affiliate למשפיענית: כמה חשיפות, כמה clicks, conversion rate (ידני — המותג מעדכן)

### 4.4 הפניה ל-DM

כשהשיחה באתר מגיעה לנקודה שרלוונטית:
```
בוט (widget): "רוצה לשמוע עוד על הנושא הזה?
               שלחי לי הודעה באינסטגרם ונדבר 💬
               [כפתור: פתח DM באינסטגרם]"
```

---

## 5. Cross-Channel — המשכיות בין ערוצים

### 5.1 זיהוי עוקבים

**הבעיה:** עוקב/ת שמדבר/ת באתר ואח"כ ב-DM — נראים כשני אנשים שונים.

**הפתרון — טבלת `followers`:**
```
follower_123:
  ig_user_id: "12345678"     ← מה-DM
  email: "dana@gmail.com"    ← מהאתר (ניוזלטר)
  channels: ["dm", "widget"]
  tags: ["super_fan", "buyer"]
  total_interactions: 47
  last_interaction_at: "2026-03-19"
```

**חיבור ערוצים:**
- DM → widget: אם העוקב/ת נותן/ת מייל ב-DM, מתחבר ל-record הקיים
- Widget → DM: אם אותו מייל כבר קיים מאתר ← מזוהה
- חיבור ידני: המשפיענית יכולה לחבר records ידנית

### 5.2 סנכרון קופונים

- קופון שנחשף באתר ← העוקב/ת שואלת ב-DM "מה הקוד?" → הבוט יודע מה הראו לה
- קופון שנשלח ב-DM ← גם זמין באתר (אם לא אישי)

### 5.3 העברת הקשר

```
עוקב/ת שואלת באתר: "מה את ממליצה לעור יבש?"
→ נשמר ב-follower metadata: { interests: ["skincare", "dry_skin"] }

אותו עוקב/ת שולח/ת DM שבוע אחרי: "היי!"
→ בוט DM יודע: "זו דנה, היא מתעניינת בטיפוח לעור יבש,
                  שאלה באתר לפני שבוע"
→ תשובה: "היי דנה! 💛 מה שלומך? בדקת את הקרם ששוחחנו עליו?"
```

---

## 6. DM Audit — סריקת היסטוריה

### 6.1 למה זה קריטי

כשמשפיענית מחברת את החשבון — יש לה **אלפי הודעות DM קיימות**. המידע הזה הוא זהב:
- מי העוקבים הכי פעילים (super fans)?
- מה שואלים אותה הכי הרבה?
- על מה לא ענתה?
- מה הטון והסגנון שלה בתשובות?

### 6.2 תהליך הסריקה

```
שלב 1: חיבור חשבון
   → בקשת הרשאה ל-Instagram conversations API
   → הודעה: "אנחנו סורקים את ההודעות שלך כדי ללמוד את הסגנון שלך
              ולזהות עוקבים חשובים. זה לוקח כמה דקות."

שלב 2: ייבוא (background job)
   → שליפת כל השיחות (Instagram Conversations API)
   → שמירה ב-dm_history table
   → progress bar ב-dashboard

שלב 3: ניתוח AI
   → לכל שיחה: נושאים, sentiment, כוונה
   → זיהוי patterns: שאלות חוזרות, נושאים חמים
   → זיהוי super fans: מי כתב הכי הרבה? מי קנה?
   → זיהוי הודעות ללא מענה

שלב 4: פילוח אוטומטי (Segments)
   → "סופר פאנים" — מעל X אינטראקציות
   → "מתעניינים במוצרים" — שאלו על שת"פים/קופונים
   → "ללא מענה" — הודעות שלא נענו
   → "עוקבים חדשים" — פעם ראשונה
   → "VIP" — דמויות ציבוריות / חשבונות מאומתים

שלב 5: דוח למשפיענית
   → dashboard עם:
      - "יש לך 47 הודעות שלא נענו"
      - "23 סופר פאנים שכותבים לך באופן קבוע"
      - "הנושאים הכי חמים: טיפוח (34%), אוכל (28%), אופנה (19%)"
      - "3 עוקבים VIP שכדאי לתת להם תשומת לב"

שלב 6: שיפור פרסונה
   → הדוגמאות האמיתיות של המשפיענית → fine-tuning הפרסונה
   → הנושאים החמים → הרחבת RAG בתחומים הרלוונטיים
```

### 6.3 DM Audit — שימוש שוטף

הסריקה לא חד-פעמית:
- **יומית**: סריקה של שיחות חדשות → עדכון segments
- **שבועית**: דוח שבועי למשפיענית
- **בזמן אמת**: כל DM חדש → עדכון follower record + segment

---

## 7. חוויית משתמש — שלוש פרספקטיבות

### 7.1 חוויית העוקב/ת (Follower Journey)

#### שלב 1: גילוי (Discovery)
```
עוקב/ת רואה סטורי/פוסט של המשפיענית
   → לוחצ/ת על לינק באתר
   → נכנס/ת ל-widget
   → "מה השעות של המסעדה שהמלצת עליה?"
   → תשובה מיידית + קופון (אם רלוונטי)
   → "רוצה לשמוע עוד? שלחי לי DM 💬"
```

#### שלב 2: מעורבות (Engagement)
```
עוקב/ת שולח/ת DM
   → "היי! ראיתי שדיברת על הקרם..."
   → בוט: "היי! כן, אני מתה עליו!
            את עם עור יבש או משולב?"  ← שיחה אמיתית
   → עוקב/ת: "יבש"
   → בוט: "אז ממליצה על הקרם של XXX, הוא עושה פלאים
            יש לי קוד: SKIN20 🤍"     ← הזדמנות טבעית
```

#### שלב 3: נאמנות (Loyalty)
```
אותו עוקב/ת שבוע אחרי:
   → "היי! הקרם מעולה תודה! מה עוד את ממליצה?"
   → בוט (זוכר!): "כיף דנה! 💛 שמחה שאהבת!
                     יש לי גם סרום שאני משתמשת איתו,
                     רוצה לשמוע?"
   → עוקב/ת הפכה ל-super fan
```

#### שלב 4: חזרה לאתר
```
עוקב/ת נכנסת שוב לאתר
   → widget "מכיר" אותה (via מייל/cookie)
   → "היי דנה! 👋 חוזרת לבדוק עוד מוצרים?"
   → תצוגת קופונים מותאמת אישית
```

### 7.2 חוויית המשפיענית (Influencer Experience)

#### אונבורדינג (15-20 דקות)
```
1. "ברוכה הבאה! בואי נגדיר את הבוט שלך"
2. חיבור אינסטגרם (OAuth)
3. סריקת DM היסטורית (background — ממשיכים בינתיים)
4. הגדרת פרסונה:
   - "מה הטון שלך? חברותי? מקצועי?"
   - "תני 3 דוגמאות של תשובות שלך"
   - "על מה הבוט לא ידבר?"
5. test chat — המשפיענית מנסה לדבר עם הבוט
6. "מעולה! הבוט מוגדר במצב ASSIST — כל תשובה תגיע לאישורך"
7. סריקת DM מוכנה: "מצאנו 23 סופר פאנים! 47 הודעות ללא מענה"
```

#### שימוש יומי (3-5 דקות)
```
בוקר:
   → התראה: "3 הודעות חדשות מחכות לאישורך"
   → פותחת dashboard (mobile-first)
   → רואה 3 טיוטות:
      [1] דנה שאלה על הקרם → טיוטה: "היי דנה! כן..."
          [✅ אשר] [✏️ ערוך] [❌ דחה]
      [2] עוקב חדש: "מה נשמע?" → טיוטה: "היי! שמחה..."
          [✅ אשר] [✏️ ערוך] [❌ דחה]
      [3] תלונה על מוצר → ⚠️ דורש תשומת לב
          [👁️ צפה] [✍️ ענה ידנית]
   → מאשרת 2, עונה ידנית על 1
   → סיימה תוך 2 דקות

ערב:
   → סיכום יומי: "12 שיחות, 8 אוטומטיות, 3 אושרו, 1 ידנית"
   → "2 עוקבים חדשים נוספו ל-super fans"
   → "קופון SKIN20 הוצג 34 פעמים היום"
```

#### ניהול שבועי (10 דקות)
```
דוח שבועי:
   → "השבוע: 84 שיחות DM, 156 שיחות אתר"
   → "נושאים חמים: טיפוח (40%), אוכל (25%), אופנה (20%)"
   → "3 super fans חדשים"
   → "קופון הכי פופולרי: SKIN20 (89 חשיפות)"
   → הצעות תוכן: "הרבה שואלים על שגרת הטיפוח שלך —
                     שווה לעשות סטורי/פוסט על זה"  ← הצעה, לא יצירה אוטומטית
```

### 7.3 חוויית המותג (Brand Portal)

#### Dashboard מותג
```
המותג (שת"פ עם המשפיענית) מקבל גישה לפורטל:

📊 סטטיסטיקות שת"פ:
   → חשיפות קופון: 340 (אתר: 200, DM: 140)
   → clicks על "העתק קוד": 89
   → שאלות על המוצר: 47 (נענו אוטומטית: 42, ידני: 5)

💬 שיחות לדוגמה (אנונימי):
   → "עוקבת שאלה על הקרם → הבוט הסביר + נתן קופון"
   → "3 עוקבות דיברו על חוויה חיובית עם המוצר"

📈 תובנות:
   → "רוב השאלות על המוצר מגיעות אחרי סטוריז (72%)"
   → "קהל היעד: נשים 25-34, מתעניינות בטיפוח"
   → "שעות שיא: 18:00-21:00"

🔔 התראות:
   → "תלונה על מוצר — 1 מקרה השבוע"
   → "קופון יפוג בעוד 3 ימים"
```

**חשוב:** המותג רואה **תובנות, לא שיחות פרטיות.** כל המידע אנונימי ומצטבר.

---

## 8. התראות למשפיענית

### 8.1 סוגי התראות

| סוג | דחיפות | ערוץ | דוגמה |
|-----|--------|------|--------|
| **Escalation** | גבוהה | Push + אימייל | "תלונה על מוצר — דורש תשומת לב" |
| **טיוטה לאישור** | בינונית | Push | "3 הודעות מחכות לאישורך" |
| **super fan חדש** | נמוכה | In-app | "רונה הפכה ל-super fan! 47 אינטראקציות" |
| **דוח יומי** | נמוכה | אימייל/Push | סיכום יומי |
| **דוח שבועי** | נמוכה | אימייל | דוח שבועי מפורט |
| **קופון עומד לפוג** | בינונית | Push | "הקוד SKIN20 פג בעוד 3 ימים" |
| **הצעת תוכן** | נמוכה | In-app | "הרבה שואלים על X — שווה לעשות סטורי" |

### 8.2 הגדרות אישיות
המשפיענית קובעת:
- אילו התראות לקבל
- באילו שעות (quiet hours)
- באיזה ערוץ (push/אימייל/שניהם)

---

## 9. Analytics ודוחות

### 9.1 Dashboard ראשי

```
📊 סקירה כללית
   ├── שיחות DM: 84 השבוע (+12%)
   ├── שיחות אתר: 156 השבוע (-3%)
   ├── עוקבים מזוהים: 234
   ├── super fans: 23
   └── קופונים שהוצגו: 340

📈 גרפים
   ├── שיחות לאורך זמן (DM vs Widget)
   ├── נושאים חמים (pie chart)
   ├── שעות פעילות (heatmap)
   └── conversion: שיחה → קופון → click

💬 שיחות אחרונות
   ├── [DM] דנה: "מה את ממליצה ל..." (2 דק')
   ├── [Widget] אנונימי: "שעות פתיחה?" (5 דק')
   └── [DM] ⚠️ רונה: "המוצר לא טוב" (escalation)
```

### 9.2 דוחות export
- CSV/PDF export של: שיחות, followers, קופונים, analytics
- דוח למותגים (PDF) — מותאם לשיתוף עם שותפים עסקיים

---

## 10. פרטיות ואבטחה

### 10.1 עקרונות
- **GDPR compliance**: עוקב/ת יכול/ה לבקש מחיקת מידע
- **הסכמה**: בהודעה הראשונה — הודעה שזה בוט ("אני העוזרת הדיגיטלית של [שם]")
- **שקיפות**: המשפיענית רואה כל מה שהבוט שלח
- **אנונימיות למותגים**: מותגים לא רואים שיחות פרטיות, רק מצטברים

### 10.2 הגנת מידע
- DM content מוצפן at rest
- API keys מנוהלים ב-environment variables
- Rate limiting על כל ה-endpoints
- RLS policies על כל הטבלאות
- Audit log של כל פעולות admin

### 10.3 גילוי בוט
בהודעה הראשונה מעוקב/ת חדש/ה:
```
"היי! 👋 אני העוזרת הדיגיטלית של [שם המשפיענית].
 אני יכולה לעזור עם שאלות, להמליץ על מוצרים ולשתף קופונים.
 [שם] בודקת את ההודעות ותיכנס לשיחה כשצריך 💛"
```

---

## 11. הצעות תוכן (לא יצירה אוטומטית)

**חשוב: המערכת לא יוצרת פוסטים אוטומטית.** היא מציעה רעיונות בלבד.

### 11.1 מקורות להצעות
- **שאלות חוזרות ב-DM/Widget**: "47 עוקבות שאלו על שגרת הטיפוח שלך השבוע"
- **נושאים חמים**: "הנושא 'תזונה בריאה' עלה ב-30% מהשיחות"
- **תגובות לסטוריז**: "הסטורי על המסעדה קיבל 23 תגובות — שווה פוסט מלא?"
- **שת"פ חדש**: "חיברת שת"פ חדש עם XXX — שווה לעשות סטורי הכרות?"

### 11.2 פורמט ההצעה
```
💡 הצעת תוכן:
"הרבה עוקבות שאלו על שגרת הבוקר שלך (34 שאלות השבוע).
 שווה לשקול סטורי/פוסט עם השגרה המלאה + המוצרים שאת משתמשת."

 [👍 רעיון טוב] [👎 לא רלוונטי] [📌 שמור לאחר כך]
```

---

## 12. תוכנית פיתוח — שלבים

### Phase 1: תשתית (2-3 שבועות)
- [ ] Feature flags infrastructure (`V2_ENABLED` + per-account config)
- [ ] טבלאות DB: `followers`, `notifications`, `dm_drafts`
- [ ] V2 persona schema + אונבורדינג UI
- [ ] DM modes: auto/assist/off + UI toggle
- [ ] Intent detection engine (בסיסי)
- [ ] Boundaries engine
- [ ] Hook ב-dm-handler.ts → V2 flow

### Phase 2: DM חכם (2-3 שבועות)
- [ ] Assist mode: טיוטות + UI אישור
- [ ] Escalation protocol
- [ ] Rolling summary שיפור (per-exchange)
- [ ] Story reply handler
- [ ] Media handler (OCR + logging)
- [ ] Session lifecycle (sleep/wake/resume)
- [ ] Follower identity: create + update

### Phase 3: DM Audit (2 שבועות)
- [ ] DM history import (Instagram Conversations API)
- [ ] AI analysis pipeline (topics, sentiment, segments)
- [ ] Super fan detection
- [ ] Unanswered messages report
- [ ] Persona fine-tuning from real examples
- [ ] Audit dashboard UI

### Phase 4: Cross-Channel (2 שבועות)
- [ ] Follower identity: cross-channel linking
- [ ] Widget coupons display
- [ ] Coupon tracking (impressions, clicks)
- [ ] Widget → DM referral
- [ ] Newsletter signup → follower record
- [ ] Context passing between channels

### Phase 5: Notifications & Analytics (1-2 שבועות)
- [ ] Notification system (in-app + push + email)
- [ ] Daily/weekly summary
- [ ] Content suggestions engine
- [ ] Analytics dashboard
- [ ] Brand portal (basic)
- [ ] Export reports

### Phase 6: Polish & Scale (1-2 שבועות)
- [ ] Mobile-first PWA for influencer dashboard
- [ ] Performance optimization
- [ ] Multi-language support (Hebrew, English, Arabic)
- [ ] Rate limiting V2 endpoints
- [ ] E2E testing
- [ ] Documentation

---

## 13. סיכום — עקרונות מנחים

1. **V1 לא נשבר** — הכל תוספתי, feature flags, per-account
2. **DM = שיחה אישית** — לא מכירה, לא spam, לא בוט-ית
3. **פרסונה = הכל** — בלי פרסונה טובה, אין ערך ב-DM
4. **Human-in-the-loop** — ASSIST כברירת מחדל, AUTO רק אחרי שהמשפיענית בטוחה
5. **Intent > Promotion** — הבוט מקשיב ומגיב, לא מקדם
6. **פרטיות** — גילוי בוט, GDPR, אנונימיות למותגים
7. **Mobile-first** — המשפיענית מנהלת מהטלפון
8. **Data-driven** — DM audit, analytics, content suggestions
9. **הצעות, לא אוטומציה** — המערכת מציעה תוכן, לא יוצרת
10. **קופונים תלויי שת"פ** — אין תמחור דינמי, הקופון מגיע מהמותג

---

*מסמך זה מיועד לעיבוד ע"י PM. כל סעיף ניתן לפירוק ל-tasks ב-Linear/Jira.*
