#!/usr/bin/env node
/**
 * Ingest LDRS Conference KB docs (12 documents).
 * Content is conference-specific: Itamar's deck, AI products, team, yitzug1, IG post, FAQs.
 *
 * Usage:
 *   node --env-file=.env scripts/ingest-ldrs-conference-kb.mjs
 *   node --env-file=.env scripts/ingest-ldrs-conference-kb.mjs --dry-run
 *   node --env-file=.env scripts/ingest-ldrs-conference-kb.mjs --only 1,3,5
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY = (() => {
  const i = args.indexOf('--only');
  if (i === -1) return null;
  return new Set(args[i + 1].split(',').map((s) => parseInt(s.trim(), 10)));
})();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}
if (!OPENAI_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// Documents
// ============================================

const DOCS = [
  {
    num: 1,
    source_id: 'ldrs-conf-2026-itamar-talk',
    title: 'ההרצאה של איתמר גונשרוביץ בכנס החדשנות 30.4 - "AI להיות או לא להיות"',
    metadata: { topic: 'ai_org', type: 'presentation', event: 'innovation_conference_2026', speaker: 'itamar_gonsherovitz', date: '2026-04-30', aliases: 'ההרצאה, המצגת, הופעה, דיבר, אמר, נשא דברים' },
    text: `# ההרצאה של איתמר גונשרוביץ בכנס החדשנות של איגוד השיווק הישראלי
# תאריך: 30.4.2026 | כותרת: "AI - להיות או לא להיות"

## על ההרצאה של איתמר (לא פודקאסט, לא פרק, לא ראיון)
זוהי **ההרצאה של איתמר גונשרוביץ** - מנכ"ל Leaders - בכנס החדשנות של איגוד השיווק הישראלי ב-30.4.2026. כותרת ההרצאה: "AI - להיות או לא להיות". זאת הופעה בימתית בכנס מקצועי של איגוד השיווק, לא פודקאסט ולא ראיון, ולא קשור לפרק 403 של "מנהלי שיווק מצייצים" או לפרק אצל אבי זיתן - אלה ערוצים אחרים.

## מי נותן את ההרצאה
איתמר גונשרוביץ, מנכ"ל Leaders. 8 שנים בלידרס, 2.5 שנים אחרונות מכהן כמנכ"ל. לפני שנה וחצי מכרו את החברה ל-Stagwell (נסחרת בנאסד"ק, סימול STGW) והפכו להיות חלק מקבוצה של יותר מ-70 חברות. איתמר אמר בהרצאה: "התאפסנו, מצאנו את הדרך לעבוד עם האמריקאים, והתחלנו לחפש את הדבר הבא - AI. קודם ניסינו להחליט מה הדרך בה נטמיע ואלו השלבים."

## המסר המרכזי של ההרצאה של איתמר
המהפכה כבר התחילה, ואל לנו לפחד מהשינוי.

## 4 עקרונות ליבה שהוצגו בהרצאה של איתמר

### עיקרון 1 בהרצאה: תפסיקו לשחק לבד - AI ארגוני, לא AI פרטי
איתמר אמר בהרצאה: אם ה-AI שלכם חי בחשבון הפרטי של העובד - אתם לא חברה שעובדת עם AI.
שלושה מרכיבים נדרשים:
- הכשרות עומק לעובדים
- ממשק אחיד לכל לקוח
- יוזר ארגוני לכל עובד, עם כלים ספציפיים לפי מחלקות

### עיקרון 2 בהרצאה: AI בשביל תוצאות, לא בשביל AI
איתמר הדגיש: תמצאו את צווארי הבקבוק, תתמקדו בערך ובמקומות ספציפיים בנו שם. אל תתחילו מלבנות AI - תתחילו מלמצוא כאב. ה-AI הוא התשובה, לא השאלה.

דוגמה מהפרקטיקה של לידרס שהוצגה במצגת:
- מחולל הצעות מחיר + מסמך התנעה + בריף לקוח → הצעה מוכנה לשליחה
- מיום עבודה שלם על הצעת מחיר אחת - לשעה אחת ביום
- Ratio: 20% human, 80% AI

### עיקרון 3 בהרצאה: ממוצר פנימי למוצר ללקוחות
איתמר סיפר על הרגע שבו הכלי הפנימי הפך למוצר למכירה.
NewVoices נולד כדמו פנימי בלידרס, היום הוא שירות עם לקוחות גלובליים:
- נציג מכירות דיגיטלי שמדבר בשפה של המותג
- חיבור ל-CRM, Database, APIs, KMS, Files, Telephone, Cloud & Storage, Ticketing, Payments, ERP, Scheduling, BI, Authentication, Messaging

### עיקרון 4 בהרצאה: שני דברים אחרונים לסיום
בסיום ההרצאה איתמר אמר:
- **80/20**: הבינה לא תחליף אותנו, אבל תייעל אותנו. תמיד יישאר ה-20% של הבינה האנושית.
- **ההטמעה היא האתגר**: כמו הטמעת כל מערכת ארגונית, זה מורכב גם אחרי השימוש בפועל. השינוי בקרב אנשים - זה האתגר האמיתי כארגון.

## מסר סיום של ההרצאה של איתמר
איתמר סיים את ההרצאה במסר "ההרצאה לא נגמרת" - והפנה את הקהל ל-Bestie של לידרס (הבוט הזה) לגלות את המוצרים הנוספים של לידרס בשיווק המותג. QR Code בסוף המצגת מוביל לכאן.

## מילות מפתח שיזהו את ההרצאה הזו
ההרצאה של איתמר, המצגת של איתמר, הדיבור של איתמר, ההופעה של איתמר גונשרוביץ, הכנס של איגוד השיווק, כנס החדשנות, AI להיות או לא להיות, 30.4, הכנס השיווקי, הרצאת איתמר, הדיבור של המנכ"ל, דברי הפתיחה של איתמר. כל אלה מתייחסים לאותה הרצאה בת 10 שקפים שניתנה בכנס.`,
  },
  {
    num: 2,
    source_id: 'ldrs-conf-2026-5-steps-implementation',
    title: '5 שלבי הטמעת AI בארגון - הגישה של לידרס',
    metadata: { topic: 'ai_org', type: 'framework' },
    text: `# 5 שלבי הטמעת AI בארגון - לפי הגישה של לידרס

## שלב 1: החלטה על GPT (או LLM בסיס אחר)
בחירת המנוע. איזה מודל שפה משרת את הארגון? GPT, Claude, Gemini או שילוב? ההחלטה תלויה בעלויות, ב-latency, באבטחה, ובאיכות עבור שפת העבודה שלכם (עברית במקרה הישראלי).

## שלב 2: מערכות נוספות בחברה
חיבור ה-LLM למערכות הקיימות של הארגון:
- CRM
- ERP
- דאטה-בייסים
- טלפוניה
- אפליקציות פנימיות
- מערכות ticketing ושירות

בלי חיבור למערכות, ה-AI נשאר צעצוע ולא מנוע צמיחה.

## שלב 3: הכשרות
עומק, לא כותרות. לא מספיק להראות לעובדים איך משתמשים ב-ChatGPT. צריך ללמד אותם:
- איך מזהים תהליך שאפשר לשפר
- איך כותבים prompt אפקטיבי
- איך לבדוק איכות תוצר
- איך לא לסמוך עיוור ב-AI (שמירה על 20% האנושי)

## שלב 4: צווארי בקבוק
איתור המקומות שבהם ה-AI ייתן את התשואה הגבוהה ביותר. לא לבנות הכל בבת אחת, אלא:
- איפה הכי כואב?
- איפה המשימה חוזרת על עצמה?
- איפה האדם עושה עבודה שהוא שונא?
- איפה הזמן מתבזבז?

המיקוד הזה הוא ההבדל בין AI בשביל AI (באזוורד) לבין AI בשביל תוצאות.

## שלב 5: הטמעת ופיתוח מוצרים ייעודיים
כאן המוצר הופך קונקרטי. מפתחים פתרון ממוקד שמשתלב בזרימת העבודה. בלידרס: Leaders Platform - מחולל הצעות מחיר, מסמך התנעה, מצגת קריאייטיבית. כולם נולדו מכאב פנימי.

## עקרון על
ההטמעה היא תהליך ארגוני, לא פרויקט IT. 80% מהאתגר הוא שינוי התנהגות, לא טכנולוגיה. לכן לידרס מלווה תהליך שלם - לא מוכרת כלי ורצה.`,
  },
  {
    num: 3,
    source_id: 'ldrs-conf-2026-newvoices',
    title: 'NewVoices - סוכן מכירות ושירות קולי של לידרס',
    metadata: { topic: 'ai_products', type: 'product', product: 'newvoices', url: 'https://newvoices.ai' },
    text: `# NewVoices - Leaders Group
# "AI Voice Agents That Speak, Sell & Support 24/7"

## מה זה
סוכני קול מבוססי AI שמדברים, מוכרים ותומכים - 24/7. הסיפור: מוצר שנולד כדמו פנימי בלידרס, עבר ל-IMAI ולמוצר ראשי בסל ה-Leaders ו-Stagwell.

## הבטחה מרכזית
"NewVoices לא נשמע כמו AI. הוא נשמע כמו העובד הכי טוב שלנו, עובד 24 שעות ביממה."

## מה הוא עושה
- **מכירות וצמיחה**: המרת לידים באמצעות אינטראקציה מיידית וחכמה
- **שירות ותפעול**: תמיכה עקבית ומדויקת עם סוכנים זמינים תמיד
- **שימור ונאמנות**: חיזוק יחסים והפחתת churn עם outreach יזום
- **פידבק ותובנות**: הפיכת שיחות לקוח לתובנות מעשיות מיידיות

## יכולות
- מענה מיידי ללידים ושיחות - בתוך שניות
- דיבור טבעי ברמה אנושית
- זמינות 24/7 בכל שפה
- אינטגרציה בזמן אמת למערכות CRM, billing, ticketing
- תאימות אנטרפרייז: SOC 2, GDPR, HIPAA, end-to-end encryption
- Plug & play integrations
- Agent Studio לקינפוג ללא קוד
- Conversation Intelligence למעקב ולמידה

## אינטגרציות תומכות (מהארכיטקטורה)
CRM, Database, APIs, KMS, Messaging, Authentication, BI, Payments, ERP, Scheduling, Cloud & Storage, Ticketing, Telephone, Files

## לקוחות וקייס סטאדיס
- **Leaders (LDRSGroup)**: -85% עומס תמיכה, +50% CSAT
- **IMAI (influencermarketing.ai)**: +230% יותר פגישות, -95% response delay
- **DoReel**: +70% renewal rate, -80% churn, +45% LTV
- **Lenovo**: לקוח גלובלי (הוזכר בהרצאת הכנס)

## פרסונה מצוטטת מהאתר
רון מרגליות - Technical Development Specialist ב-Leaders

## כיצד מתחילים
דמו או שיחה אישית (לא Self-service). CTA: Talk to our AI agent / Book a demo / Get a call now.

## למי זה מתאים
אנטרפרייז גלובלי ב-SaaS, eCommerce, telecom, פיננסים ובריאות.`,
  },
  {
    num: 4,
    source_id: 'ldrs-conf-2026-imai',
    title: 'IMAI - Influencer Marketing AI: פלטפורמת אנטרפרייז מ-Stagwell',
    metadata: { topic: 'ai_products', type: 'product', product: 'imai', url: 'https://influencermarketing.ai' },
    text: `# Influencer Marketing AI (IMAI)
# "The only platform where intelligence and activation live together"

## מה זה
פלטפורמת AI ארגונית שמאחדת 6 כלים עצמאיים במקום אחד:
- גילוי וניהול יוצרים
- ניטור שיחות ותובנות צרכנים
- יחסי ציבור ומדיה
- הפקת UGC ו-AI avatar video
- מעקב נראות ב-LLM (ChatGPT, Gemini, Perplexity)
- AI agents לקול וצ'אט

400 מיליון+ יוצרים. 2 טריליון+ שיחות מנוטרות. לוגין אחד.

## למה זה קיים
סטק השיווק מפוצל: Brandwatch להקשבה, CreatorIQ להפעלת יוצרים, Cision ליחסי ציבור, פלטפורמה נוספת ל-UGC. כולם משלמים עבור כולם, והנתונים לא מדברים ביניהם. IMAI מציעה מודל נתונים אחד בכל הworkspaces: consumer intelligence מזינה discovery של יוצרים, תוצאות של influencer מזינות אסטרטגיית PR.

## 6 ה-workspaces
1. **Influencer Marketing**: גילוי יוצרים, ניהול קשרים, ROI tracking, תשלומים
2. **Consumer Intelligence**: ניטור 2T+ שיחות, בריפים מבוססי AI, one-click activation
3. **PR & Media**: pitching ל-1M+ עיתונאים, טרגוט outlets שצוטטו ב-LLMs
4. **UGC Video Ads**: יוצרי UGC + AI avatar videos, workflow שלם תוך 14 ימים
5. **LLM Visibility**: מעקב מותג ב-ChatGPT/Gemini/Perplexity + benchmark מתחרים
6. **AI Agents**: סוכני קול וצ'אט 24/7, lead qualification, handoff אנושי

## לקוחות פומביים
- **Estée Lauder**: 4x ROI, 12 שווקים, -70% זמן sourcing
- **Playtika**: 15M+ gamers מזוהים ומנוהלים
- **Lumenis**: 40M+ impressions ב-8 שווקים
- **Beluga Gold Line**: יוקרה
ועוד 1,000+ מותגים ב-50+ מדינות

## אותנטיקציה וסטנדרטים
SOC2 Type II, SSO, role-based access, white-label לסוכנויות.

## מתחרים שהמוצר מחליף
CreatorIQ, Modash, Upfluence, GRIN, Brandwatch, Sprinklr, Talkwalker, Cision, MuckRack, Meltwater, Prowly, Insense, Billo, Cohley, MakeUGC, LLMrefs, Otterly, Peec AI, Profound, Retell AI, Cognigy, Voiceflow.

## החיבור ללידרס
IMAI נבנה ע"י ערן ניזרי (ב-2020), הוא חלק מהקבוצה. Stagwell רכשה את לידרס + IMAI ב-2024.

## היכן נפגשים
demo של 20 דקות - live, על המותג שלכם, עם המתחרים כבר במערכת.`,
  },
  {
    num: 5,
    source_id: 'ldrs-conf-2026-leaders-platform',
    title: 'Leaders Platform - הפלטפורמה הפנימית שהפכה למוצר - סקירה כללית',
    metadata: { topic: 'ai_products', type: 'product_family', product: 'leaders_platform' },
    text: `# Leaders Platform — סקירה
# "ממוצר פנימי - למוצר ללקוחות"

## מה זה
Leaders Platform היא משפחת מוצרים פנימיים של לידרס, שעברה מהמשרד הפנימי להיות חלק מהצעת הערך ללקוחות. Next.js 14 + Supabase + AI multi-model (Claude, Gemini, OpenAI). Google Drive integration + Gmail + cron תזכורות אוטומטיות יומיות ב-08:00 UTC.

## 5 המוצרים שבפלטפורמה — רשימה מהירה

1. **בריף לקוח** — טופס בריף דיגיטלי ללקוח, עם מעקב sent/opened/completed ותזכורות אוטומטיות.
2. **פגישת התנעה (Inner Meeting)** — טופס שיתופי בזמן אמת לתיעוד פגישת kickoff עם הצוות.
3. **מחולל הצעת מחיר** — בונה מסמך תמחור אינטראקטיבי עם יצוא PPTX/PDF.
4. **מצגת קריאייטיבית (המוצר הדגל)** — AI שבונה מצגת 11 שקפים מבריף PDF/DOCX, כולל מחקר מותג ואסטרטגיה.
5. **האב מסמכים / ניהול לינקים** — מערכת על של ניהול לינקים מסמכיים חוצי-מוצר, עם tracking ותזכורות.

לכל אחד מאלה יש doc ייעודי ב-KB של הבוט (ראה docs #14-18).

## השגים מדידים שהוצגו בהרצאת איתמר 30.4
- יצירת הצעת מחיר מלאה: מ-**יום עבודה שלם → שעה ביום אחד**
- Ratio: 20% human, 80% AI
- תזכורות אוטומטיות ביומי

## ההבטחה המרכזית
"אל תתחילו מלבנות AI — תתחילו מלמצוא כאב." Leaders Platform נבנתה סביב הכאבים הפנימיים של צוותי לידרס, ומהם הפכה למוצר ללקוחות חיצוניים.`,
  },
  {
    num: 14,
    source_id: 'ldrs-conf-2026-leaders-client-brief',
    title: 'בריף לקוח — מוצר של Leaders Platform',
    metadata: { topic: 'ai_products', type: 'product', product: 'leaders_platform', sub_tool: 'client_brief' },
    text: `# בריף לקוח — Client Brief
# מוצר בתוך Leaders Platform של לידרס

## מה זה עושה
טופס בריף דיגיטלי רב-שלבי שעובד שולח ללקוח. הלקוח פותח דרך לינק ייחודי (ללא חשבון, ללא סיסמה), ממלא את הטופס שנשמר אוטומטית, והצוות מקבל התראות בכל שלב.

## איך זה עובד (בפועל)
1. עובד נכנס ל-Leaders Platform, לוחץ "שלח בריף ללקוח"
2. המערכת יוצרת token + לינק ייחודי
3. הלינק נשלח ללקוח בווטסאפ/מייל
4. הלקוח פותח את הטופס הרב-שלבי בדפדפן
5. התשובות נשמרות אוטומטית ב-localStorage בזמן אמת
6. הצוות רואה סטטוס live: sent → opened → completed

## יכולות מרכזיות
- **Multi-step form** עם שמירה אוטומטית
- **Multi-language** (עברית/אנגלית)
- **Link tracking** — עוקב מתי הלקוח פתח, איזה שלב סיים, מתי הגיש
- **תזכורות אוטומטיות** — אם לקוח לא השלים אחרי 7 ימי עסקים, המערכת שולחת תזכורת ליוצר דרך Gmail (cron יומי 08:00 UTC)
- **אבטחה** — token expires, לינק חד-פעמי, לא ניתן לזיוף

## למי זה מתאים
כל לקוח שלידרס צריך ממנו בריף — מותג חדש, קמפיין ספציפי, פרויקט יצירתי. במקום טפסים בגוגל דוקס או ימיילים מתפזרים, הלקוח מקבל חוויה דיגיטלית מובנית.

## טכנולוגיה
Next.js 14 + Supabase (Realtime + Auth) + token-based link auth. Integrated עם Gmail לתזכורות.

## הערך
חוסך ~2-3 שעות בכל מחזור בריף — במקום לעקוב ידנית אחר לקוחות שלא מילאו, המערכת עושה את זה אוטומטית. התוצאות מגיעות מובנות ומוכנות לעיבוד.`,
  },
  {
    num: 15,
    source_id: 'ldrs-conf-2026-leaders-kickoff',
    title: 'פגישת התנעה (Inner Meeting) — מוצר של Leaders Platform',
    metadata: { topic: 'ai_products', type: 'product', product: 'leaders_platform', sub_tool: 'kickoff' },
    text: `# פגישת התנעה — Inner Meeting
# מוצר בתוך Leaders Platform של לידרס

## מה זה עושה
טופס שיתופי בזמן אמת לתיעוד פגישת kickoff של פרויקט חדש. כמה חברי צוות ממלאים את הטופס יחד, רואים אחד את השני כותב, וסוגרים את התיעוד תוך הפגישה עצמה — לא אחרי.

## איך זה עובד (בפועל)
1. אחרי קבלת בריף מהלקוח, מזמינים פגישת התנעה בצוות
2. פותחים את טופס ה-Inner Meeting ב-Leaders Platform
3. כל חבר צוות נכנס ללינק, המערכת מציגה כמה אנשים פעילים (presence)
4. ממלאים ביחד — מטרות, דדליינים, KPIs, אחריות, נקודות פתוחות
5. בסיום הפגישה, המסמך מוכן. לא צריך לכתוב סיכום.

## יכולות מרכזיות
- **Realtime collaboration** — Supabase Realtime, כולם רואים כל שינוי מיד
- **Presence awareness** — רואים מי פעיל בטופס עכשיו (כמו Google Docs)
- **תזכורות אוטומטיות** — אם פגישה לא פעילה >7 ימים, או deadline <48 שעות, המערכת שולחת webhook ל-Make.com שמייצר תזכורת
- **Deadline tracking** — מעקב תאריכי יעד
- **Audit log** — מי שינה מה ומתי

## למי זה מתאים
כל פרויקט חדש עם לקוח. במקום שמישהו ירשום הערות בניטמפד ואחרי הפגישה יעשה סיכום שלא מדויק, הצוות כותב LIVE יחד. התיעוד מדויק כי נוצר בזמן אמת.

## טכנולוגיה
Next.js 14 + Supabase Realtime + Presence API. Webhook ל-Make.com לתזכורות.

## הערך
חיסכון של ~45 דק' של סיכום אחרי כל פגישת kickoff. בונוס: התיעוד מדויק יותר כי נעשה ע"י כולם בזמן אמת, לא אחד שמזכר אחרי.`,
  },
  {
    num: 16,
    source_id: 'ldrs-conf-2026-leaders-price-quote',
    title: 'מחולל הצעות מחיר — מוצר של Leaders Platform',
    metadata: { topic: 'ai_products', type: 'product', product: 'leaders_platform', sub_tool: 'price_quote' },
    text: `# מחולל הצעות מחיר — Price Quote Generator
# מוצר בתוך Leaders Platform של לידרס

## מה זה עושה
בונה מסמך תמחור מקצועי ללקוח בצורה אינטראקטיבית. בוחרים שירותים (משפיענים, UGC creators, וידאו, PPC וכו'), מגדירים תקציב, KPIs, פלטפורמות, ותקופת התקשרות — המערכת מרכיבה הצעת מחיר מובנית ויוצאת ל-PPTX/PDF.

## איך זה עובד (בפועל)
1. עובד נכנס ל-Leaders Platform → מחולל הצעת מחיר
2. בוחר שירותים מתפריט (templates מוכנים)
3. מגדיר תקציב וחלוקה בין השירותים
4. בוחר פלטפורמות (Instagram, TikTok, YouTube...)
5. מוסיף KPIs ומסגרת זמן
6. תצוגה מקדימה בזמן אמת — המסמך מתעדכן תוך כדי
7. לחיצה אחת על Export → PPTX או PDF מוכן לשליחה

## יכולות מרכזיות
- **Service templates** — קטלוג מוכן של שירותי לידרס
- **Budget calculator** — חלוקה אוטומטית של תקציב לפי שירותים
- **Content mix** — breakdown של סוגי תוכן (reels, UGC, carousels...)
- **Platform selector** — Instagram + TikTok multi-select
- **Live preview** — רואים את ההצעה תוך כדי בנייה
- **PPTX export** — מעוצב, מוכן לשליחה ללקוח
- **PDF export** — לחלופה
- **Contract period** — מגדירים את תקופת ההתקשרות וההצעה מתאימה את עצמה

## ההשג שאיתמר ציטט בהרצאה
יצירת הצעת מחיר מלאה: מ-**יום עבודה שלם → שעה ביום אחד**. זה לא 20% אוטומציה — זה 80% אוטומציה, 20% קלט אנושי.

## טכנולוגיה
Inherited מ-pptmaker (פרויקט PPTX generation פנימי). Next.js 14 + PPTX generation + PDF via Puppeteer.

## הערך
חסך שעות של עבודה ידנית על הצעות מחיר — שזה היה הכאב הכי גדול של הצוות המסחרי לפני. היום מנהלי לקוחות יכולים לשלוח הצעה איכותית תוך שעה, במקום יום.`,
  },
  {
    num: 17,
    source_id: 'ldrs-conf-2026-leaders-creative-deck',
    title: 'מצגת קריאייטיבית AI — המוצר הדגל של Leaders Platform',
    metadata: { topic: 'ai_products', type: 'product', product: 'leaders_platform', sub_tool: 'creative_deck' },
    text: `# מצגת קריאייטיבית AI — Creative Deck
# המוצר הדגל של Leaders Platform

## מה זה עושה
מעלים בריף לקוח (PDF או DOCX) + מסמך התנעה (אופציונלי) → סוכן AI בונה מצגת קריאייטיבית מלאה של 11 שקפים, כולל מחקר מותג, ניתוח מתחרים, אסטרטגיית משפיענים, לוח תוכן, וויזואלים — מוכן לשליחה ללקוח תוך דקות.

## איך זה עובד (בפועל)
1. עובד נכנס ל-Leaders Platform → Create Proposal
2. גורר קובץ בריף (PDF/DOCX) או מושך מ-Google Drive
3. לחיצה אחת: "צור הצעה"
4. הסוכן:
   - מנתח את הבריף (Document parsing עם OCR)
   - מחקר מותג (Gemini, חיפוש אוטומטי)
   - ניתוח מתחרים
   - בניית אסטרטגיית משפיענים
   - לוח תוכן מוצע
   - ייצור ויזואלים עם Gemini Image
   - בונה 11 שקפים עם layouts מותאמים
5. תצוגה מקדימה → עריכה (אופציונלי) → Export PPTX
6. המצגת מוכנה

## 11 השקפים הטיפוסיים
1. Cover
2. תקציר מנהלים
3. מחקר מותג
4. ניתוח קהל ומתחרים
5. אתגרים והזדמנויות
6. אסטרטגיה יצירתית
7. בחירת משפיענים
8. לוח תוכן
9. KPIs ומדידה
10. Deliverables + Timeline
11. Next Steps + CTA

## מצב חלופי — Interactive Chat (Create Auto)
במקום העלאת בריף, יש גם מצב צ'אט: הבוט מוביל את המשתמש צעד-צעד דרך שאלות, ובונה את ההצעה תוך כדי שיחה. מתאים למי שאין לו בריף מוכן.

## יכולות טכניות
- **Multi-model**: Gemini לוויזואלים + ניתוח, Claude לטקסט, OpenAI כ-fallback
- **Document parsing**: PDF/DOCX לחילוץ טקסט
- **Brand research agent**: סוכן עצמאי שחוקר את המותג
- **Image generation**: Gemini Image לוויזואלים מותאמים
- **Layout engine**: HTML slides עם design system של לידרס
- **PPTX export**: מעוצב, editable בפאוורפוינט

## ההשג שאיתמר ציטט בהרצאה
זה המוצר שעליו איתמר אמר "מיום עבודה שלם לשעה ביום". Ratio: 20% human, 80% AI.

## הערך
הכלי הקריאייטיבי הכי מורכב בצוות לידרס הפך מ-"שבוע של עבודה" ל-"שעה של עריכה". מאפשר לצוות לקחת יותר לקוחות, לייצר יותר הצעות, ולהשקיע את הזמן בעידון ולא בבנייה מ-0.`,
  },
  {
    num: 18,
    source_id: 'ldrs-conf-2026-leaders-document-hub',
    title: 'האב מסמכים וניהול לינקים — תשתית של Leaders Platform',
    metadata: { topic: 'ai_products', type: 'product', product: 'leaders_platform', sub_tool: 'document_hub' },
    text: `# האב מסמכים — Document Hub
# תשתית אופקית של Leaders Platform

## מה זה עושה
מערכת על שמנהלת את כל הלינקים המסמכיים של לידרס — בריפים, פגישות התנעה, הצעות מחיר, ומצגות — במקום אחד. כל מסמך מקבל lifecycle ברור: נוצר, נשלח, נפתח, הושלם, או נסגר.

## איך זה עובד (בפועל)
- כל מסמך בכל אחד ממוצרי Leaders Platform מקבל לינק ייחודי (UUID token)
- הלינק נשמר בטבלת 'document_links' עם מעקב סטטוס
- המערכת עוקבת: created → sent → opened → completed → closed
- Dashboard מרכזי לצוות: מה פתוח, מה עומד, מה עוקב, מה נסגר
- תזכורות אוטומטיות על מסמכים שנתקעו

## API Endpoints
- POST /api/links — יוצר לינק עם token
- GET /api/links/[token] — מביא מסמך לפי token (למשתמש חיצוני)
- PATCH /api/links/[token] — מעדכן סטטוס (opened, completed)

## Cron אוטומציה
כל יום ב-08:00 UTC, cron רץ ובודק:
- **בריפים פתוחים >7 ימי עסקים** → מייל תזכורת ליוצר דרך Gmail
- **פגישות התנעה ללא פעילות 7+ ימים** → webhook ל-Make.com → תזכורת צוות
- **פגישות התנעה עם deadline <48 שעות** → webhook ל-Make.com → alert

## אינטגרציות
- **Google Drive**: העלאת מסמכים שהושלמו אוטומטית לתיקיית הפרויקט בדרייב
- **Gmail**: שליחת תזכורות ב-authenticated context של היוצר
- **Make.com**: כל סוגי התזכורות הלא-מיילי עוברים דרך Make
- **Google OAuth**: ההרשאות נוהלות דרך OAuth ל-Gmail/Drive

## הערך
לפני: מסמכים היו מפוזרים — חלק ב-Google Drive, חלק בצ'אטים, חלק בהיסטוריית מיילים. אחרי: מקום אחד שבו רואים את כל המסמכים שבתהליך, מה פתוח, מה עומד. מתאים לחברה שמרצה לקוחות במקביל.

## יחסית למוצרים האחרים
האב המסמכים הוא ה-**תשתית** שמאחדת את 4 המוצרים האחרים. הוא לא מוצר נפרד שמוכרים ללקוח — הוא התשתית הארגונית שעליה בנויים יתר המוצרים.`,
  },
  {
    num: 6,
    source_id: 'ldrs-conf-2026-eran-bio',
    title: 'ערן ניזרי - מייסד ומנכ"ל קבוצת לידרס',
    metadata: { topic: 'team', type: 'bio', person: 'eran_nizri', url: 'https://erannizri.com' },
    text: `# ערן ניזרי - Founder & CEO, Leaders Group

## מה הוא עושה
יזם בתחום ה-AI וטכנולוגיית השיווק, עם התמחות בשיווק משפיענים ובינה מלאכותית. יותר מעשור של ניסיון בלהפוך את האופן בו מותגים גלובליים עובדים עם יוצרי תוכן. פעיל בפלטפורמות AI workforce ובתפקידי ייעוץ אסטרטגיים.

## תפקיד נוכחי
מייסד ומנכ"ל LEADERS - סוכנות שיווק משפיענים זוכת פרסים.

## תחומי מומחיות
- תכנון צמיחה אסטרטגית
- שיווק משפיענים ואסטרטגיית סושיאל
- שיווק ו-analytics מבוססי AI
- התרחבות לשווקים גלובליים
- טרנספורמציה דיגיטלית ומנהיגות חדשנות

## נושאי הרצאה מקצועיים
- Influencer Marketing Mastery: אסטרטגיות data-driven למקסום ROI
- Social Media Innovation: ניצול טרנדים לצמיחת מותגים גלובליים
- AI in Marketing: חיזוי הצלחת משפיענים וצרכנים
- Strategic Growth: שימוש ב-creators להרחבה בינלאומית

## תפקידים ופרויקטים
- **יוצר IMAI** (Influencer Marketing AI) - הושק ב-2020
- **מייסד/מנכ"ל LEADERS** - נרכשה ב-2024
- **יועץ דירקטוריון** למספר חברות
- **Board Advisor**

## הישגים בולטים
- **Cannes Lions Jury 2024** בקטגוריית Social & Creator Lions
- **IMAI**: דירוג 4.8/5 ב-Influencer Marketing Hub
- **Best Influencer Marketing Platform 2024**
- **LEADERS + IMAI נרכשו ע"י Stagwell** (נסחרת בנאסד"ק: STGW) ב-2024
- **2025**: השיק את NewVoices.ai
- קמפיינים עבור Samsung, Estée Lauder, Nespresso

## פרסומים ומדיה
הופיע ב-Forbes, Nasdaq, Vogue Business. חבר Forbes Tech Council.

## נוכחות
Website: erannizri.com | LinkedIn: linkedin.com/in/nizri | TikTok: @erannizri`,
  },
  {
    num: 7,
    source_id: 'ldrs-conf-2026-itamar-bio',
    title: 'איתמר גונשרוביץ - מנכ"ל Leaders',
    metadata: { topic: 'team', type: 'bio', person: 'itamar_gonsherovitz' },
    text: `# איתמר גונשרוביץ - מנכ"ל Leaders

## רקע
8 שנים בלידרס, 2.5 שנים אחרונות מכהן כמנכ"ל (נכון להרצאה ב-30.4.2026). הוביל את לידרס במהלך ומאחרי הרכישה ע"י Stagwell, והתוביל את המעבר האסטרטגי של החברה לעולם ה-AI.

## תפקידים מרכזיים כמנכ"ל
- הובלת השילוב והעבודה המשותפת עם Stagwell (קבוצת 70+ חברות, נסחרת בנאסד"ק: STGW)
- תכנון ויישום אסטרטגיית ה-AI של לידרס - מה-Decision על LLM, דרך ההכשרות, ועד פיתוח מוצרים ייעודיים
- פיתוח Leaders Platform - הפלטפורמה הפנימית שהפכה למוצר
- קידום NewVoices - מוצר הקולי של הקבוצה

## הפילוסופיה שלו ל-AI (מהרצאת הכנס 30.4)
- "המהפכה כבר התחילה ואל לנו לפחד מהשינוי"
- "תפסיקו לשחק לבד - AI ארגוני, לא AI פרטי"
- "AI בשביל תוצאות, לא בשביל AI"
- "ה-AI הוא התשובה, לא השאלה"
- "80/20 - הבינה לא תחליף אותנו, אבל תייעל אותנו"
- "ההטמעה היא האתגר - השינוי של האנשים והארגון, לא הטכנולוגיה"

## ההרצאה שנתן
30.4.2026 - כנס החדשנות של איגוד השיווק הישראלי. הכותרת: "AI - להיות או לא להיות". תוייג ב-@itamar_gonsherovitz בפוסט הכנס באינסטגרם.

## רקע מקצועי
LinkedIn: linkedin.com/in/itamar-gonsherovitz-725b4187`,
  },
  {
    num: 8,
    source_id: 'ldrs-conf-2026-yonatan-bio',
    title: 'יונתן ערמי - שותף מייסד לידרס',
    metadata: { topic: 'team', type: 'bio', person: 'yonatan_arami' },
    text: `# יונתן ערמי - שותף מייסד Leaders

## תפקיד
שותף ומנהיג בכיר בקבוצת לידרס. מופיע בפודקאסטים ובתכני הסבר של החברה יחד עם איתמר גונשרוביץ.

## איפה הוא
LinkedIn: linkedin.com/in/yonatan-arami-92206286

## ציטוט אופייני ללידרס (מנקודת המבט של יונתן ואיתמר)
"צריך להבין קודם את האסטרטגיה והשורשים של המותג - ורק אז לבנות פתרון." גישה שחוזרת בפודקאסטים של לידרס: לא לעבוד מקריאייטיב החוצה, אלא מה-DNA של המותג, דרך הערכים וההיסטוריה, לפני שמשחררים תוכן.

## הגישה
Leaders Powered by People - חוזר כסלוגן המותגי וגובה בתרבות ארגונית שמדגישה את האנשים מאחורי העבודה.`,
  },
  {
    num: 9,
    source_id: 'ldrs-conf-2026-yitzug1',
    title: 'יצוג1 - סוכנות הכישרונות של קבוצת לידרס',
    metadata: { topic: 'group', type: 'subsidiary', url: 'https://yitzug1.co.il' },
    text: `# יצוג1 - סוכנות הכישרונות של קבוצת לידרס

## מה זה
סוכנות הכישרונות הוותיקה והגדולה בישראל, פעילה מאז 1987. חלק מקבוצת לידרס - ענף הכישרונות של הקבוצה, נפרד מענף השיווק והדיגיטל.

## מה מייצגת
שחקנים, יוצרים וכישרונות בקולנוע, טלוויזיה, תיאטרון, מדיה דיגיטלית ופרסום.

## שירותים
- ניהול קריירה וייצוג מקצועי
- פיתוח אישי וליווי
- חיבורים ורישות בתעשייה
- משא ומתן על חוזים והגנה על זכויות
- הנחיית אירועים והופעות
- הרצאות וסדנאות
- קריינות ודיבוב
- ייצוג ספורטאים

## קטגוריות כישרון
1. משחק (שחקנים, שחקניות, נוער)
2. שידור (מגישי טלוויזיה, רדיו, קריינים, עיתונאים)
3. מוזיקה וספרות (מוזיקאים, זמרים, סופרים, משוררים)
4. יוצרים (במאים, כותבי פרסום, מחזאים, תסריטאים, עורכי תסריט, מתרגמים)
5. Plus One Influencers
6. Spotlight
7. ספורט
8. אירועים והרצאות

## דוגמאות ממייצגים
Guy Loel, Ofer Shechter, Naomi Levov, Liat Har Lev, Miri Nevo.

## התקשרות
בן יהודה 99, תל אביב. טלפון: 03-5272748. מייל: yitzug1@yitzug1.com.

## הקשר ל-AI
יצוג1 עצמה לא עוסקת ישירות ב-AI - היא ענף הכישרונות של הקבוצה. אבל היא חלק מהסל שלידרס מציעה ללקוחות: אם לקוח צריך פרזנטור / קריין / שחקן לקמפיין, יצוג1 היא החלק של הקבוצה שמטפל בזה.`,
  },
  {
    num: 10,
    source_id: 'ldrs-conf-2026-stagwell',
    title: 'לידרס ו-Stagwell - החיבור הגלובלי',
    metadata: { topic: 'group', type: 'corporate' },
    text: `# לידרס + Stagwell - החיבור הגלובלי

## העובדות
- **2024**: Stagwell (NASDAQ: STGW) רוכשת את לידרס ואת IMAI
- **Stagwell**: קבוצה של יותר מ-70 חברות תחת מטריה אחת
- **לידרס**: שומרת על המותג, התרבות והצוות, מקבלת גישה לכלים, לקוחות, טכנולוגיה ופריסה גלובלית
- **סטטוס**: לידרס ממשיכה לפעול כחברה עצמאית, עם גישה לרשת הבינלאומית של Stagwell

## המשמעות המעשית ללקוחות
- **פריסה גלובלית**: לקוחות שצריכים קמפיין ב-12 שווקים מקבלים יכולת אורגנית של Leaders עם גב של Stagwell
- **טכנולוגיה משותפת**: IMAI ו-NewVoices הם מוצרי קבוצה, עם תשתית אנטרפרייז (SOC2 Type II)
- **סטנדרטים**: עבודה מול חברה ציבורית בנאסד"ק - שקיפות, ממשל תאגידי, חוזים ברמה בינלאומית
- **לקוחות גלובליים**: Estée Lauder, Samsung, Nespresso, Lenovo, Colgate, Lufthansa, Playtika

## מה השתנה מאז הרכישה (לפי הרצאת איתמר)
"התאפסנו, מצאנו את הדרך לעבוד עם האמריקאים, והתחלנו לחפש את הדבר הבא - AI. קודם ניסינו להחליט מה הדרך בה נטמיע ואלו השלבים." השנה וחצי מאז הרכישה שימשה להתבסס בקבוצה, לבנות תהליכי עבודה, ולצאת לדרך עם הטמעת AI ארגונית.

## מה Stagwell מביא ללוח
- גישה ל-70+ חברות תחת הקבוצה (שיתופי פעולה אפשריים)
- רשת של לקוחות אנטרפרייז ברחבי העולם
- יכולות טכנולוגיה משותפות
- סטנדרטים של חברה ציבורית

## מה לידרס מביאה ללוח
- DNA של שיווק ישראלי מצליח
- מותגים מקומיים בולטים (Argania, Shufersal Green, MAC Israel, SodaStream, Palmolive, Cheerios)
- יכולת "לוקליזציה" של קמפיינים בינלאומיים לשוק הישראלי (כמו Colgate)
- תרבות "Powered by People"`,
  },
  {
    num: 11,
    source_id: 'ldrs-conf-2026-instagram-post',
    title: 'פוסט הכנס באינסטגרם של לידרס',
    metadata: { topic: 'event', type: 'social_post', date: '2026-04-16', handle: 'ldrs_group', url: 'https://www.instagram.com/p/DXMWLqPgtoA/' },
    text: `# פוסט האינסטגרם של הכנס - @ldrs_group (16.4.2026)

## הטקסט המלא
"איך באמת משלבים בינה מלאכותית בארגון בלי רעש ובלי הבטחות ריקות? איך הופכים אותה למנוע צמיחה אמיתי? בכנס הקרוב של איגוד השיווק, יום חמישי 30.4, נצלול בדיוק לשאלות האלה עם המומחים שכבר עושים את זה נכון. אז אם אתם רוצים להבין לאן זה הולך (ואיך לא לפספס את הרכבת) זה המקום להיות בו! ממליצים לשריין כרטיסים כבר מעכשיו - מחכים לכם עם הלינק בביו! 💪"

## מי מתויג בפוסט
- @itamar_gonsherovitz (איתמר גונשרוביץ, מנכ"ל לידרס)
- @israel.marketing.association (איגוד השיווק הישראלי)

## מה זה אומר
הכנס הוא פלטפורמה שבה איגוד השיווק הישראלי מכנס את מובילי השיווק בישראל לדבר על הטמעת AI בארגון. לידרס ואיתמר בולטים בכנס הזה כמי ש"כבר עושים את זה נכון" - הוכחה לפרקטיקה ולא רק דיבורים.

## הטון
נגד-הייפ. "בלי רעש ובלי הבטחות ריקות" הוא המסר המרכזי. מסמן שלידרס מחויבת לתוכן מעשי ולא באזוורדס.

## מידע לוגיסטי
- יום חמישי, 30.4.2026
- אירוח: איגוד השיווק הישראלי
- כרטיסים: לינק בביו של @ldrs_group`,
  },
  {
    num: 12,
    source_id: 'ldrs-conf-2026-ai-faq',
    title: 'AI בארגון - שאלות ותשובות פרקטיות',
    metadata: { topic: 'ai_org', type: 'faq' },
    text: `# שאלות ותשובות פרקטיות - AI בארגון
# מהגישה של לידרס, בלי באזוורדס

## איך אני יודע שהעסק שלי יכול לקבל AI?
כל עסק יכול. השאלה היא איפה הכאב. שאלות שכדאי לשאול:
- איזה תהליך חוזר על עצמו ולוקח הרבה זמן?
- איפה יש צוואר בקבוק?
- איפה עובדים מבזבזים זמן על משימות שהם שונאים?
- איפה קבלת החלטות איטית בגלל נתונים לא זמינים?

אם יש לכם תשובה לפחות לאחת מהשאלות - אתם מוכנים להתחיל. אם לא, זה סימן שצריך לעצור ולחפש את הכאב לפני שמדברים על AI.

## איך לזהות תהליך שאפשר לשפר ב-AI?
סממנים פרקטיים:
- **חזרתיות**: המשימה מופיעה שוב ושוב בצורה דומה
- **נפח**: הרבה instance של המשימה (לא פעם בחודש)
- **דפוסים**: התהליך ניתן לתיאור ב-if/then/else
- **זמן**: לוקח יותר מ-10 דקות כל פעם
- **רגישות נמוכה לטעות אמיתית**: הטעות לא קטסטרופלית (כי 80% AI, 20% human review)

דוגמה מלידרס: כתיבת הצעת מחיר. חוזר, בנפח, דפוסים ברורים, לוקח יום שלם. AI + bonus של review אנושי = שעה ביום.

## מה הכי חשוב לפני שמתחילים תהליך הטמעה?
1. **למצוא כאב אמיתי** - לא לבנות AI בשביל AI
2. **החלטה ארגונית, לא פרטית** - אם כל עובד על GPT הפרטי שלו, זה לא ארגון שעובד עם AI
3. **היערכות אנושית** - ההטמעה היא שינוי ארגוני, לא פרויקט IT
4. **הסכמה על 80/20** - AI מייעל, לא מחליף. 20% יישארו אנושיים
5. **בחירת שותף שמבין גם ארגונים גם AI** - לא רק פתרון טכנולוגי

## איך נראה תהליך הטמעה אמיתי?
5 שלבים (לפי הגישה של לידרס):
1. **החלטה על GPT/LLM** - בחירת המנוע
2. **חיבור למערכות** - CRM, ERP, טלפוניה, דטאבייסים
3. **הכשרות** - עומק, לא רק "איך משתמשים ב-ChatGPT"
4. **צווארי בקבוק** - איפה נותנים את התשואה הראשונה
5. **מוצרים ייעודיים** - פיתוח פתרון ממוקד לכאב שאיתרנו

לוח זמנים טיפוסי: 3-9 חודשים מהחלטה ראשונית עד מוצר פעיל, תלוי בגודל הארגון.

## איך אתם עובדים היום עם AI (בלידרס)?
- **פנימה**: Leaders Platform - מבריף ועד מצגת בלחיצה (מיום עבודה לשעה ביום)
- **החוצה**: NewVoices (סוכן קולי), IMAI (פלטפורמת שיווק), אוטומציות מותאמות
- **80/20**: כל מוצר בנוי על עיקרון ה-80% AI + 20% אנושי
- **5 שלבי הטמעה**: הצלחנו בעצמנו, עוזרים ללקוחות לעבור את אותם שלבים

## כמה זמן לידרס בתחום ה-AI?
- **2020**: ערן ניזרי ייסד IMAI - פלטפורמת AI לשיווק משפיענים
- **2024**: Stagwell רוכשת את לידרס + IMAI
- **2025**: השקת NewVoices (סוכן קולי)
- **2026**: לידרס כ-LDRS by Stagwell, מוביל הטמעת AI ללקוחות ישראליים וגלובליים

נטו: יותר מ-5 שנים של עבודה מעשית ב-AI, לא דיבורים.

## אם אני רוצה להתחיל - מה השלב הבא?
לא להתחייב על מוצר - להיפגש. 30 דקות ללא מחויבות. נבדוק:
- איפה הכאב אצלכם
- איך 5 השלבים נראים אצלכם
- אם יש fit בין הצרכים למוצרים שלנו (NewVoices, IMAI, Leaders Platform, ליווי הטמעה, אוטומציות)
- אם לא - נגיד בכנות. זה לא תמיד fit.

מילוי טופס קצר באפליקציית הבוט או לחיצה על "קבעו פגישה". נחזור תוך 48 שעות.`,
  },
  {
    num: 13,
    source_id: 'ldrs-conf-2026-talk-faq',
    title: 'שאלות נפוצות על ההרצאה של איתמר בכנס',
    metadata: { topic: 'conference_talk', type: 'faq', speaker: 'itamar_gonsherovitz', event: 'innovation_conference_2026', date: '2026-04-30' },
    text: `# שאלות נפוצות על ההרצאה של איתמר גונשרוביץ בכנס

## ש: סיכום ההרצאה של איתמר?
ההרצאה של איתמר בכנס החדשנות של איגוד השיווק ב-30.4.2026 נקראה "AI - להיות או לא להיות". איתמר הציג 4 עקרונות: (1) תפסיקו לשחק לבד - AI ארגוני ולא AI פרטי (2) AI בשביל תוצאות, לא בשביל AI (3) ממוצר פנימי למוצר ללקוחות (NewVoices) (4) 80/20 וההטמעה היא האתגר. המסר: התחילו מלמצוא כאב, לא מלבנות AI.

## ש: מה איתמר אמר על AI בארגון?
איתמר טען בהרצאה שאם ה-AI חי בחשבון הפרטי של העובד - זו לא חברה שעובדת עם AI. AI ארגוני מחייב 3 דברים: הכשרות עומק, ממשק אחד לכל לקוח, ויוזר ארגוני עם כלים מותאמים לפי מחלקות.

## ש: מה הייתה הדוגמה שאיתמר נתן בהרצאה?
איתמר הציג את Leaders Platform - הכלי הפנימי שלידרס בנתה לעצמה. בריף + מסמך התנעה + מחולל הצעות מחיר = הצעה מוכנה לשליחה. הביצועים: מיום עבודה שלם לשעה ביום. ה-ratio שהוצג: 20% אנושי, 80% AI.

## ש: מה הוא אמר על NewVoices?
NewVoices התחיל כדמו פנימי בלידרס והפך למוצר גלובלי. נציג מכירות ושירות דיגיטלי קולי שמדבר בשפת המותג. מחובר ל-CRM, טלפוניה, דאטה-בייסים, ERP. פתוח ללקוחות חיצוניים.

## ש: איך איתמר סיכם את ההרצאה?
שני משפטים: (1) 80/20 - AI לא יחליף אותנו אבל ייעל אותנו, ויישאר תמיד 20% של בינה אנושית. (2) ההטמעה עצמה היא האתגר, לא הטכנולוגיה - השינוי הארגוני וההתנהגותי.

## ש: מתי הייתה ההרצאה?
יום חמישי, 30.4.2026, בכנס החדשנות של איגוד השיווק הישראלי.

## ש: מה בדיוק איתמר אמר על ההטמעה?
"כמו הטמעת מערכת, זה מורכב גם אחרי. השימוש בפועל של האנשים והשינוי - זה האתגר האמיתי כארגון." הוא הציג 5 שלבי הטמעה: (1) החלטה על GPT (2) חיבור למערכות נוספות (3) הכשרות (4) איתור צווארי בקבוק (5) פיתוח מוצרים ייעודיים.

## ש: למה איתמר אמר "תפסיקו לשחק לבד"?
זה היה כותרת של העיקרון הראשון. משמעות: AI פרטי (ChatGPT בחשבון הפרטי) הוא לא AI ארגוני. ארגון שמעודד כל עובד לשחק לבד עם AI - לא עובד עם AI. צריך ממשק אחד, יוזר ארגוני, וכלים מותאמים למחלקות.

## ש: איך התחילו את מסע ה-AI שלהם?
ציטוט של איתמר בהרצאה: "לפני שנה וחצי מכרנו את החברה לסטגוול שנסחרת בנאסד"ק והפכנו להיות חלק מ-70 חברות תחת הקבוצה. התאפסנו, מצאנו את הדרך לעבוד עם האמריקאים, והתחלנו לחפש את הדבר הבא - AI. קודם ניסינו להחליט מה הדרך בה נטמיע ואלו השלבים."

## ש: מה השלב הבא אחרי ההרצאה?
איתמר סיים במסר "ההרצאה לא נגמרת" וכיוון את הקהל ל-Bestie של לידרס (הבוט הזה). כאן אפשר לגלות את כל השירותים של לידרס, לשאול שאלות, ולקבוע פגישה.

## הבהרה חשובה
ההרצאה הזאת **אינה** אותו דבר כמו פרק 403 ב"מנהלי שיווק מצייצים" אצל אבי זיתן, ואינה ראיון פודקאסט. זאת הופעה בימתית עצמאית של איתמר בכנס של איגוד השיווק הישראלי ב-30.4.2026 עם מצגת של 10 שקפים.`,
  },
];

// ============================================
// Utilities
// ============================================

function chunkText(text, { maxChars = 1800, overlapChars = 200 } = {}) {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      const tail = current.slice(-overlapChars);
      current = tail + '\n\n' + p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

function estimateTokens(text) {
  // Hebrew is roughly 2-3 chars per token for embeddings
  return Math.ceil(text.length / 2.5);
}

async function embedBatch(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: texts,
      dimensions: 2000,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings failed: ${res.status} ${body}`);
  }
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

// ============================================
// Ingestion
// ============================================

async function ingestDoc(doc) {
  const chunks = chunkText(doc.text);
  const totalTokens = chunks.reduce((s, c) => s + estimateTokens(c), 0);

  console.log(`\n#${doc.num} ${doc.title}`);
  console.log(`  chars=${doc.text.length}, chunks=${chunks.length}, est.tokens=${totalTokens}`);

  if (DRY_RUN) {
    console.log('  [DRY RUN] — skipping DB writes');
    return;
  }

  // Delete existing doc + chunks if source_id matches
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('account_id', LDRS_ACCOUNT_ID)
    .eq('entity_type', 'website')
    .eq('source_id', doc.source_id)
    .maybeSingle();

  if (existing) {
    await supabase.from('document_chunks').delete().eq('document_id', existing.id);
    await supabase.from('documents').delete().eq('id', existing.id);
    console.log(`  replaced existing doc ${existing.id}`);
  }

  // Insert document
  const { data: newDoc, error: docErr } = await supabase
    .from('documents')
    .insert({
      account_id: LDRS_ACCOUNT_ID,
      entity_type: 'website',
      source_id: doc.source_id,
      title: doc.title,
      source: 'website',
      status: 'active',
      chunk_count: chunks.length,
      total_tokens: totalTokens,
      metadata: { ...doc.metadata, ingested_by: 'ingest-ldrs-conference-kb', ingested_at: new Date().toISOString() },
    })
    .select('id')
    .single();

  if (docErr || !newDoc) {
    console.error('  FAILED to insert document:', docErr);
    return;
  }

  // Generate embeddings in batches
  const BATCH = 64;
  const allEmbeddings = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const vecs = await embedBatch(batch);
    allEmbeddings.push(...vecs);
  }

  // Insert chunks
  const rows = chunks.map((chunkText, i) => ({
    document_id: newDoc.id,
    account_id: LDRS_ACCOUNT_ID,
    entity_type: 'website',
    chunk_index: i,
    chunk_text: chunkText,
    embedding: allEmbeddings[i],
    token_count: estimateTokens(chunkText),
    metadata: { ...doc.metadata, chunk_of: doc.source_id, title: doc.title },
    topic: doc.metadata?.topic || null,
    chunk_hash: crypto.createHash('md5').update(chunkText).digest('hex'),
  }));

  const { error: chErr } = await supabase.from('document_chunks').insert(rows);
  if (chErr) {
    console.error('  FAILED to insert chunks:', chErr);
    return;
  }

  console.log(`  ✓ inserted doc ${newDoc.id} with ${chunks.length} chunks`);
}

// ============================================
// Main
// ============================================

async function main() {
  console.log(`LDRS Conference KB Ingest${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Account: ${LDRS_ACCOUNT_ID}`);
  console.log(`Docs: ${DOCS.length}${ONLY ? ` (filtered to ${ONLY.size})` : ''}`);

  const toIngest = ONLY ? DOCS.filter((d) => ONLY.has(d.num)) : DOCS;
  for (const doc of toIngest) {
    try {
      await ingestDoc(doc);
    } catch (err) {
      console.error(`Error on doc #${doc.num}:`, err.message);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
