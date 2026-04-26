'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

interface ConferenceForYouTabProps {
  onAskAbout: (question: string, hiddenContext?: string) => void;
}

interface CaseStudy {
  brand: string;
  category: string;
  what: string;
  result?: string;
  product?: string;
  logo: string;
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
    logo: '/foryou-logos/argania.svg',
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
    logo: '/foryou-logos/seacret.svg',
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
    logo: '/foryou-logos/colgate.svg',
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
    logo: '/foryou-logos/tourism.svg',
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
    logo: '/foryou-logos/esteelauder.svg',
    question: 'מה עשיתם עם Estée Lauder?',
    hiddenContext: '[קייס:]\nמותג: Estée Lauder\nמוצר: IMAI\nתוצאות: 4x ROI, 12 שווקים, -70% sourcing',
  },
  {
    brand: 'Playtika',
    category: 'גיימינג',
    what: 'מיקוד גיימרים ב-YouTube ו-TikTok דרך IMAI, ניהול קמפיין יחיד',
    result: '15M+ גיימרים מוכשרים זוהו והופעלו',
    product: 'IMAI',
    logo: '/foryou-logos/playtika.svg',
    question: 'מה עשיתם עם Playtika?',
    hiddenContext: '[קייס:]\nמותג: Playtika\nמוצר: IMAI\nתוצאות: 15M+ qualified gamers in single campaign',
  },
  {
    brand: 'Lumenis',
    category: 'בריאות גלובלי',
    what: 'קמפיין Olympic-driven, ניהול end-to-end ב-8 שווקים',
    result: '40M+ impressions גלובלי · attribution מלא',
    product: 'IMAI',
    logo: '/foryou-logos/lumenis.svg',
    question: 'מה עשיתם עם Lumenis?',
    hiddenContext: '[קייס:]\nמותג: Lumenis\nמוצר: IMAI\nתוצאות: 40M+ impressions, 8 markets',
  },
  {
    brand: 'Lenovo',
    category: 'טכנולוגיה גלובלי',
    what: 'נציג מכירות AI 24/7 שמדבר בשפת המותג, מחובר ל-CRM, מסנן לידים',
    result: 'דמו חי הוצג בכנס AI להיות או לא להיות',
    product: 'NewVoices',
    logo: '/foryou-logos/lenovo.svg',
    question: 'מה עשיתם עם Lenovo?',
    hiddenContext: '[קייס:]\nמותג: Lenovo\nמוצר: NewVoices\nתוצאות: לקוח גלובלי, דמו חי בכנס',
  },
  {
    brand: 'DoReel',
    category: 'SaaS',
    what: 'AI agent לאיתור churn מוקדם, פעילויות שימור אוטומטיות',
    result: '+70% renewal · -80% churn · +45% LTV',
    product: 'NewVoices',
    logo: '/foryou-logos/doreel.svg',
    question: 'מה עשיתם עם DoReel?',
    hiddenContext: '[קייס:]\nמותג: DoReel\nמוצר: NewVoices\nתוצאות: +70% renewal, -80% churn, +45% LTV',
  },
];

// Wide-bento variants — controls grid span + how much copy is shown
type Variant = 'hero' | 'wide' | 'banner';

const LAYOUT: Variant[] = [
  'hero',   // 1 — Argania
  'hero',   // 2 — Seacret
  'wide',   // 3 — Colgate
  'wide',   // 4 — Tourism
  'wide',   // 5 — Estée
  'wide',   // 6 — Playtika
  'wide',   // 7 — Lumenis
  'wide',   // 8 — Lenovo
  'banner', // 9 — DoReel
];

const variantClasses: Record<Variant, string> = {
  hero:   'foryou-card foryou-card--hero',
  wide:   'foryou-card foryou-card--wide',
  banner: 'foryou-card foryou-card--banner',
};

function CaseCard({
  cs,
  variant,
  index,
  onAskAbout,
}: {
  cs: CaseStudy;
  variant: Variant;
  index: number;
  onAskAbout: (q: string, ctx?: string) => void;
}) {
  const isHero = variant === 'hero';
  const isBanner = variant === 'banner';

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      onClick={() => onAskAbout(cs.question, cs.hiddenContext)}
      className={`${variantClasses[variant]} group relative overflow-hidden rounded-2xl text-right transition-all active:scale-[0.99] hover:shadow-lg`}
      style={{
        background: '#ffffff',
        border: '1px solid #eef1f5',
        boxShadow: '0 1px 3px rgba(12,16,19,0.04)',
      }}
    >
      <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 h-full">
        {/* Logo tile */}
        <div
          className={`flex-shrink-0 rounded-2xl overflow-hidden ${
            isHero ? 'w-[88px] h-[88px] sm:w-[112px] sm:h-[112px]' : 'w-[64px] h-[64px] sm:w-[72px] sm:h-[72px]'
          }`}
          style={{ background: '#0c1013' }}
        >
          <Image
            src={cs.logo}
            alt={cs.brand}
            width={isHero ? 112 : 72}
            height={isHero ? 112 : 72}
            className="w-full h-full object-contain"
            unoptimized
          />
        </div>

        {/* Copy */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span
              className={`font-bold leading-tight ${isHero ? 'text-[18px] sm:text-[20px]' : 'text-[15px] sm:text-[16px]'}`}
              style={{ color: '#0c1013' }}
            >
              {cs.brand}
            </span>
            {cs.product && (
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{
                  background: '#f4f5f7',
                  color: '#676767',
                }}
              >
                {cs.product}
              </span>
            )}
          </div>
          <div
            className={`mb-1 ${isHero ? 'text-[11px]' : 'text-[10.5px]'}`}
            style={{ color: '#9aa3b0' }}
          >
            {cs.category}
          </div>
          {(isHero || isBanner) && (
            <div
              className="text-[12.5px] leading-snug line-clamp-2 mb-1.5"
              style={{ color: '#0c1013' }}
            >
              {cs.what}
            </div>
          )}
          {cs.result && (
            <div
              className={`font-semibold leading-snug line-clamp-2 ${
                isHero ? 'text-[12px]' : 'text-[11px]'
              }`}
              style={{ color: '#0c1013' }}
            >
              ✦ {cs.result}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}

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

      <div className="foryou-bento">
        {CASE_STUDIES.map((cs, i) => (
          <CaseCard
            key={cs.brand + i}
            cs={cs}
            variant={LAYOUT[i] || 'wide'}
            index={i}
            onAskAbout={onAskAbout}
          />
        ))}
      </div>

      <style jsx>{`
        .foryou-bento {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          grid-auto-flow: dense;
        }

        @media (min-width: 640px) {
          .foryou-bento {
            grid-template-columns: repeat(6, 1fr);
            grid-auto-rows: minmax(110px, auto);
            gap: 14px;
          }
          .foryou-bento :global(.foryou-card--hero) {
            grid-column: span 3;
            grid-row: span 2;
          }
          .foryou-bento :global(.foryou-card--wide) {
            grid-column: span 3;
          }
          .foryou-bento :global(.foryou-card--banner) {
            grid-column: 1 / -1;
          }
        }

        @media (min-width: 1024px) {
          .foryou-bento {
            grid-auto-rows: minmax(130px, auto);
            gap: 16px;
          }
        }
      `}</style>
    </div>
  );
}
