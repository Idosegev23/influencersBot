'use client';

import { motion } from 'framer-motion';

interface ConferenceForYouTabProps {
  onAskAbout: (question: string, hiddenContext?: string) => void;
}

interface CaseStudy {
  brand: string;
  category: string;
  what: string;
  result?: string;
  product?: string;
  hiddenContext: string;
  question: string;
}

const CASE_STUDIES: CaseStudy[] = [
  // ============ Israeli flagship cases ============
  {
    brand: 'Argania',
    category: 'טיפוח שיער',
    what: 'רענון סדרת הקיק — מהלך 360° עם פרזנטוריות שנבחרו דרך IMAI, פרסומת TV "מאז ועד היום", סושיאל אותנטי',
    result: 'מורשת מרוקאית/מצרית פגשה את העכשיו · נרטיב חי בקהילה',
    product: '360° + IMAI',
    question: 'מה עשיתם עם Argania?',
    hiddenContext:
      '[קייס:]\nמותג: Argania (סדרת הקיק)\nאתגר: לרענן סדרה ותיקה ואהובה תוך פחות מחודש\nפתרון: IMAI לבחירת פרזנטוריות מדויקת (מירן בוזגלו ועינב בובליל), פרסומת TV "הקיק מאז ועד היום" שמספרת על רכיב טבעי שעובר מדורי דורות, סושיאל אותנטי, וקודי קבוצות סודיות\nתוצאה: זהות תוכן חדשה לסדרה, חיבור בין מורשת לעכשווי, פיד עשיר ועניין מחודש',
  },
  {
    brand: 'Seacret',
    category: 'יופי וטיפוח',
    what: 'השקת מסקרה בטכנולוגיית טיובינג — מהלך 360° מבוסס דאטה: פילוח, קריאייטיב, משפיעניות, סושיאל ופרפורמנס',
    result: '+700% מחזור חודשי · סל קנייה ממוצע ×2 · התרחבות לקטגוריות נוספות',
    product: 'Performance 360°',
    question: 'מה עשיתם עם Seacret?',
    hiddenContext:
      '[קייס:]\nמותג: Seacret\nאתגר: מותג בינלאומי שהגיע לישראל עם תדמית מיושנת (ים המלח) ורצה לחדש מול קהל צעיר\nפתרון: 360° עם פילוח דאטה, קריאייטיב מחדש, משפיעניות (מעיין אדם, מאיה ורטהיימר), סרטוני הדגמה אותנטיים, מהלך מדורג ממוצר אחד עד הרחבת סל\nתוצאה: 700% צמיחה חודשית, סל ×2, התרחבות לקרם הגנה/סבון פנים, שינוי תפיסתי מ"מיושן" ל"מותג ביוטי עכשווי"',
  },
  {
    brand: 'Colgate',
    category: 'היגיינת הפה',
    what: 'השקת משחת רגישות חדשה דרך הומור — תמהיל מאקרו+מיקרו משפיעניות + רועי הראל בסרטון מרכזי',
    result: '4M חשיפות · 10K אינטראקציות · +0.7% Share of Market',
    product: 'Influencer Marketing',
    question: 'מה עשיתם עם Colgate?',
    hiddenContext:
      '[קייס:]\nמותג: Colgate\nאתגר: השקת משחה למניעת רגישות בשיניים — מודעות גבוהה והסבר ערך פשוט\nפתרון: 4 משפיעניות (2 גדולות + 2 מיקרו) שנבחרו דרך פלטפורמת ניתוח ביצועים, סרטון מרכזי הומוריסטי בהובלת הקומיקאי רועי הראל, פעימות סטורי לאורך רבעון\nתוצאה: 4 מיליון חשיפות, 1,516 קליקים, 10,000+ אינטראקציות, עלייה של 0.7% ב-Share of Market בקטגוריה תחרותית',
  },
  {
    brand: 'משרד התיירות',
    category: 'תיירות ושיווק מדינה',
    what: 'בתקופת המלחמה — מעבר לשפה חיובית של "ארץ ישראל היפה", 20 סרטונים בחודש, יציאה מ-shadow ban',
    result: 'סרטון בולט: 923K צפיות · 59K לייקים · 8.8K שיתופים · +3K עוקבים',
    product: 'Content & Community',
    question: 'מה עשיתם עם משרד התיירות?',
    hiddenContext:
      '[קייס:]\nמותג: משרד התיירות\nאתגר: פעילות דיגיטלית בינלאומית בתקופת המלחמה — עוינות בפלטפורמות, shadow ban ממתקפת בוטים\nפתרון: שינוי אסטרטגי לתכנים חיוביים על "ארץ ישראל היפה", התמדה (20 סרטונים בחודש), תכנים ייעודיים לתיירות נוצרית\nתוצאה: יציאה הדרגתית מה-shadow ban; סרטון מוביל עם 923K צפיות, 59K לייקים, 5K שמירות, 442 תגובות, 8,845 העברות, +3,000 עוקבים חדשים',
  },

  // ============ International proof points (IMAI / NewVoices) ============
  {
    brand: 'Estée Lauder',
    category: 'יופי גלובלי',
    what: 'גילוי משפיענים מבוסס AI ב-12 שווקים, מעקב ביצועים מלא',
    result: 'ROI ×4 בקמפיין נובמבר · -70% זמן sourcing',
    product: 'IMAI',
    question: 'מה עשיתם עם Estée Lauder?',
    hiddenContext:
      '[קייס:]\nמותג: Estée Lauder\nמוצר: IMAI\nתוצאות: 4x ROI, 12 שווקים, -70% sourcing',
  },
  {
    brand: 'Playtika',
    category: 'גיימינג',
    what: 'מיקוד גיימרים ב-YouTube ו-TikTok דרך IMAI, ניהול קמפיין יחיד',
    result: '15M+ גיימרים מוכשרים זוהו והופעלו',
    product: 'IMAI',
    question: 'מה עשיתם עם Playtika?',
    hiddenContext: '[קייס:]\nמותג: Playtika\nמוצר: IMAI\nתוצאות: 15M+ qualified gamers in single campaign',
  },
  {
    brand: 'Lumenis',
    category: 'בריאות גלובלי',
    what: 'קמפיין Olympic-driven, ניהול end-to-end ב-8 שווקים',
    result: '40M+ impressions גלובלי · attribution מלא',
    product: 'IMAI',
    question: 'מה עשיתם עם Lumenis?',
    hiddenContext: '[קייס:]\nמותג: Lumenis\nמוצר: IMAI\nתוצאות: 40M+ impressions, 8 markets',
  },
  {
    brand: 'Lenovo',
    category: 'טכנולוגיה גלובלי',
    what: 'נציג מכירות AI 24/7 שמדבר בשפת המותג, מחובר ל-CRM, מסנן לידים',
    result: 'דמו חי הוצג בכנס AI להיות או לא להיות',
    product: 'NewVoices',
    question: 'מה עשיתם עם Lenovo?',
    hiddenContext: '[קייס:]\nמותג: Lenovo\nמוצר: NewVoices\nתוצאות: לקוח גלובלי, דמו חי בכנס',
  },
  {
    brand: 'DoReel',
    category: 'SaaS',
    what: 'AI agent לאיתור churn מוקדם, פעילויות שימור אוטומטיות',
    result: '+70% renewal · -80% churn · +45% LTV',
    product: 'NewVoices',
    question: 'מה עשיתם עם DoReel?',
    hiddenContext: '[קייס:]\nמותג: DoReel\nמוצר: NewVoices\nתוצאות: +70% renewal, -80% churn, +45% LTV',
  },
];

export function ConferenceForYouTab({ onAskAbout }: ConferenceForYouTabProps) {
  return (
    <div
      className="h-full overflow-y-auto px-4 py-5 pb-32"
      style={{ direction: 'rtl', backgroundColor: '#ffffff' }}
    >
      <div className="mb-5 text-right">
        <h2 className="text-[20px] font-bold mb-1" style={{ color: '#0c1013' }}>
          ForYou — מה עשינו עם
        </h2>
        <p className="text-[13px]" style={{ color: '#676767' }}>
          קייסים אמיתיים של מותגים שעבדנו איתם. לחצו על קייס לסיכום מהיר בצ׳אט.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CASE_STUDIES.map((cs, i) => (
          <motion.button
            key={cs.brand + i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            onClick={() => onAskAbout(cs.question, cs.hiddenContext)}
            className="text-right p-4 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
            style={{
              backgroundColor: '#fafbfc',
              border: '1px solid #eef1f5',
            }}
          >
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <span
                className="text-[16px] font-bold"
                style={{ color: '#0c1013' }}
              >
                {cs.brand}
              </span>
              {cs.product && (
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{
                    backgroundColor: '#f4f5f7',
                    color: '#676767',
                  }}
                >
                  {cs.product}
                </span>
              )}
            </div>
            <div className="text-[11px] mb-2" style={{ color: '#9aa3b0' }}>
              {cs.category}
            </div>
            <div
              className="text-[13px] leading-relaxed mb-2"
              style={{ color: '#0c1013' }}
            >
              {cs.what}
            </div>
            {cs.result && (
              <div
                className="text-[12px] font-semibold leading-relaxed mt-2 pt-2"
                style={{
                  color: '#0c1013',
                  borderTop: '1px solid #eef1f5',
                }}
              >
                ✦ {cs.result}
              </div>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
