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
  {
    brand: 'Estée Lauder',
    category: 'יופי גלובלי',
    what: 'גילוי משפיענים מבוסס AI ב-12 שווקים, מעקב ביצועים מלא',
    result: 'ROI x4 בקמפיין נובמבר · -70% זמן sourcing',
    product: 'IMAI',
    question: 'מה עשיתם עם Estée Lauder?',
    hiddenContext: '[קייס:]\nמותג: Estée Lauder\nמוצר: IMAI\nתוצאות: 4x ROI, 12 שווקים, -70% sourcing',
  },
  {
    brand: 'Playtika',
    category: 'גיימינג',
    what: 'מיקוד גיימרים על YouTube ו-TikTok, ניהול קמפיין יחיד למאגר ענק',
    result: '15M+ גיימרים מוכשרים זוהו, נכתבו והופעלו',
    product: 'IMAI',
    question: 'מה עשיתם עם Playtika?',
    hiddenContext: '[קייס:]\nמותג: Playtika\nמוצר: IMAI\nתוצאות: 15M+ qualified gamers in single campaign',
  },
  {
    brand: 'Lumenis',
    category: 'בריאות גלובלי',
    what: 'קמפיין משפיענים מבוסס Olympic-driven, ניהול end-to-end ב-8 שווקים',
    result: '40M+ impressions גלובלי, attribution מלא',
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
  {
    brand: 'Beluga Gold Line',
    category: 'אלכוהול יוקרה',
    what: 'נראות מותג גלובלית בשוק היוקרה',
    product: 'IMAI',
    question: 'מה עשיתם עם Beluga?',
    hiddenContext: '[קייס:]\nמותג: Beluga Gold Line\nמוצר: IMAI\nסקטור: יוקרה',
  },
  {
    brand: 'Samsung',
    category: 'טכנולוגיה',
    what: 'שגרירי מותג גלובליים, סדרת רילסים על מוצרים חדשים',
    product: 'Influencer Marketing',
    question: 'מה עשיתם עם Samsung?',
    hiddenContext: '[קייס:]\nמותג: Samsung\nשירות: שיווק משפיענים גלובלי + שגרירים',
  },
  {
    brand: 'Nespresso',
    category: 'מזון ומשקאות',
    what: 'שותפות ארוכת טווח עם משפיענים בישראל',
    product: 'Influencer Marketing',
    question: 'מה עשיתם עם Nespresso?',
    hiddenContext: '[קייס:]\nמותג: Nespresso\nשירות: שיווק משפיענים\nאופי: שותפות long-term',
  },
  {
    brand: 'MAC × H&M',
    category: 'אופנה ויופי',
    what: 'חיבור בין שתי קטגוריות דרך משפיעניות, רילסים משותפים, אימייל מרקטינג',
    result: 'חוויה אחת שלמה — מעורבות עמוקה והנעת רכישה',
    product: 'Performance 360°',
    question: 'מה עשיתם עם MAC ו-H&M?',
    hiddenContext: '[קייס:]\nמותג: MAC × H&M\nשירות: חיבור fashion+beauty דרך משפיעניות',
  },
  {
    brand: 'Argania',
    category: 'eCommerce ביופי',
    what: 'Bestie widget באתר עם 109 מוצרים, המלצות AI שיחתיות',
    product: 'Bestie',
    question: 'מה עשיתם עם Argania?',
    hiddenContext: '[קייס:]\nמותג: Argania\nמוצר: Bestie widget\nשירות: AI agent לקטלוג מוצרים',
  },
  {
    brand: 'IMAI (פנימי)',
    category: 'B2B SaaS',
    what: 'NewVoices לסינון לידים אוטומטי + ניהול שיחות',
    result: '+230% פגישות · -95% response delay',
    product: 'NewVoices',
    question: 'איך IMAI משתמשים ב-NewVoices בעצמם?',
    hiddenContext: '[קייס:]\nמותג: IMAI (שימוש פנימי)\nמוצר: NewVoices\nתוצאות: +230% פגישות, -95% response delay',
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
