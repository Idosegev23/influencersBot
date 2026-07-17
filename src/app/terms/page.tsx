import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * Revision date of the terms themselves — deliberately a constant, not
 * `new Date()`. A "last updated" line that silently tracks the render date is
 * a false statement about when the document actually changed.
 */
const LAST_UPDATED = 'יולי 2026';

const CONTACT_EMAIL = 'bestie@ldrsgroup.com';

export const metadata: Metadata = {
  title: 'תנאי שימוש',
  description:
    'תנאי השימוש בפלטפורמת bestieAI — היקף השירות, אחריות המשתמש, קניין רוחני, ' +
    'שימוש ב-AI, פלטפורמות צד שלישי, אחריות ותנאים מסחריים.',
  alternates: { canonical: '/terms' },
};

/* ------------------------------------------------------------------ */
/*  Content — plain data so the document outline stays flat and correct */
/* ------------------------------------------------------------------ */

type Section = { id: string; title: string; body: React.ReactNode };

const SECTIONS: Section[] = [
  {
    id: 'agreement',
    title: 'הסכמה לתנאים',
    body: (
      <>
        <p>
          תנאים אלה חלים על השימוש באתר bestieAI ובפלטפורמה (יחד — &ldquo;השירות&rdquo;), המופעלים
          על ידי LDRS Group מתל אביב (&ldquo;אנחנו&rdquo;). שימוש בשירות מהווה הסכמה לתנאים אלה.
          אם אינכם מסכימים להם — אין להשתמש בשירות.
        </p>
        <p>
          השירות מיועד לשימוש עסקי על ידי מי שמלאו לו 18 שנים ומוסמך לחייב את הארגון שבשמו
          הוא פועל. אם אתם משתמשים בשירות עבור ארגון, אתם מצהירים שיש לכם סמכות לכך.
        </p>
      </>
    ),
  },
  {
    id: 'service',
    title: 'תיאור השירות',
    body: (
      <>
        <p>
          bestieAI היא פלטפורמת AI לניהול נוכחות דיגיטלית ותקשורת עם לקוחות, עבור משפיענים,
          מותגים וסוכנויות. היקף השירות בפועל נקבע בהסכם המסחרי הפרטני שלכם, ועשוי לכלול:
        </p>
        <ul>
          <li>צ׳אטבוט מבוסס AI המותאם לתוכן, לסגנון ולקווים האדומים שלכם</li>
          <li>וידג׳ט צ׳אט להטמעה באתר שלכם</li>
          <li>מענה אוטומטי בהודעות ישירות באינסטגרם ובהתראות WhatsApp</li>
          <li>סריקה וניתוח של תוכן ממקורות שחיברתם (אינסטגרם, יוטיוב, טיקטוק, אתר)</li>
          <li>ניתוח מסמכים — חוזים, בריפים וחשבוניות — באמצעות AI</li>
          <li>כלי ניהול לסוכנויות: הצעות מחיר, חתימה אלקטרונית, חשבוניות ומעקב תשלומים</li>
          <li>דשבורד ניהולי, אנליטיקס והיסטוריית שיחות</li>
        </ul>
        <p>
          אנו רשאים לשנות, להוסיף או להפסיק רכיבים בשירות. שינוי מהותי לרעה ברכיב שאתם משלמים
          עליו יימסר מראש בהתאם להסכם המסחרי.
        </p>
      </>
    ),
  },
  {
    id: 'commercial',
    title: 'תנאים מסחריים',
    body: (
      <>
        <p>
          התמחור, היקף השימוש, תקופת ההתקשרות ותנאי התשלום אינם נקבעים בדף זה — הם נקבעים
          בהסכם או בהצעת מחיר חתומה בינינו לביניכם. במקרה של סתירה בין תנאים אלה לבין ההסכם
          המסחרי שלכם, ההסכם המסחרי גובר.
        </p>
        <p>
          מחירים אינם כוללים מע״מ אלא אם נכתב אחרת. איחור בתשלום עשוי להוביל להשעיית השירות
          לאחר הודעה מראש.
        </p>
      </>
    ),
  },
  {
    id: 'user-obligations',
    title: 'אחריות המשתמש',
    body: (
      <>
        <p>בשימוש בשירות אתם מתחייבים:</p>
        <ul>
          <li>לספק מידע מדויק ועדכני, ולשמור על סודיות פרטי הגישה שלכם</li>
          <li>לחבר רק חשבונות ומקורות תוכן שבבעלותכם או שיש לכם הרשאה מפורשת לחבר</li>
          <li>שלא להשתמש בשירות למטרה בלתי חוקית, מטעה, פוגענית או מפרה זכויות</li>
          <li>שלא להעלות תוכן שאין לכם זכות להעלות</li>
          <li>לעמוד בדיני הפרסום, הגנת הצרכן והגנת הפרטיות החלים עליכם — לרבות גילוי נאות של תוכן שיווקי ממומן</li>
          <li>שלא לנסות לעקוף מגבלות טכניות, לבצע הנדסה לאחור, או להעמיס על המערכת באופן חריג</li>
        </ul>
        <p>
          אתם אחראים לתוכן שהבוט שלכם מפרסם בשמכם ולתקשורת שהוא מנהל עם המשתמשים שלכם.
        </p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'שימוש ב-AI ומגבלותיו',
    body: (
      <>
        <p>
          השירות מבוסס על מודלי שפה של ספקי צד שלישי. פלטים של AI הם הסתברותיים: הם עלולים
          להיות שגויים, חלקיים או לא מתאימים להקשר — גם כשהם נשמעים ודאיים.
        </p>
        <ul>
          <li>אין להסתמך על פלטי AI כייעוץ מקצועי — משפטי, רפואי, פיננסי או אחר</li>
          <li>ניתוח מסמכים (חוזים, בריפים, חשבוניות) הוא כלי עזר בלבד ואינו תחליף לבדיקה אנושית. אין להסתמך על סכומים, תאריכים או תנאים שחולצו אוטומטית מבלי לאמת אותם מול המסמך המקורי</li>
          <li>אתם אחראים לבדוק ולאשר את הגדרות הבוט, לרבות הקווים האדומים והמידע שהוא רשאי למסור</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ip',
    title: 'קניין רוחני ותוכן',
    body: (
      <>
        <p>
          כל הזכויות בפלטפורמה — הקוד, העיצוב, המודלים והתשתית — שייכות לנו ונשארות בבעלותנו.
          תנאים אלה אינם מעניקים לכם זכות בהם מעבר לרישיון שימוש אישי, מוגבל, בלתי-בלעדי
          ובלתי-עביר לתקופת ההתקשרות.
        </p>
        <p>
          התוכן שאתם מזינים או מחברים לשירות (&ldquo;תוכן הלקוח&rdquo;) נשאר בבעלותכם. אתם
          מעניקים לנו רישיון מוגבל להשתמש בו אך ורק לצורך הפעלת השירות עבורכם — לרבות עיבודו
          על ידי ספקי המשנה המפורטים ב
          <Link href="/privacy">מדיניות הפרטיות</Link>. איננו מוכרים את תוכן הלקוח ואיננו
          משתמשים בו כדי לאמן מודלים גנריים עבור לקוחות אחרים.
        </p>
      </>
    ),
  },
  {
    id: 'third-party',
    title: 'פלטפורמות צד שלישי',
    body: (
      <>
        <p>
          השירות מתחבר לפלטפורמות חיצוניות — בין היתר Meta (אינסטגרם ו-WhatsApp), Google
          ו-TikTok. השימוש ברכיבים אלה כפוף גם לתנאים של אותן פלטפורמות, ואתם מתחייבים לעמוד בהם.
        </p>
        <p>
          פלטפורמות אלה עשויות לשנות, להגביל או לנתק את ממשקי ה-API שלהן בכל עת, ללא תלות בנו.
          איננו אחראים להשבתה, לשינוי או לחסימה שמקורם בפלטפורמת צד שלישי, לרבות השעיה או
          חסימה של חשבון שלכם על ידה.
        </p>
      </>
    ),
  },
  {
    id: 'privacy',
    title: 'פרטיות והגנת מידע',
    body: (
      <>
        <p>
          עיבוד מידע אישי במסגרת השירות מתואר ב<Link href="/privacy">מדיניות הפרטיות</Link>,
          המהווה חלק בלתי נפרד מתנאים אלה. בקשות למחיקת נתונים ניתן להגיש דרך{' '}
          <Link href="/data-deletion">דף מחיקת הנתונים</Link>.
        </p>
        <p>
          ככל שאנו מעבדים מידע אישי מטעמכם ביחס למשתמשי הקצה שלכם, אתם בעל השליטה במידע ואנו
          המעבד. אתם אחראים לבסיס החוקי לאיסוף ולמסירת ההודעות הנדרשות למשתמשים שלכם.
        </p>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'זמינות השירות',
    body: (
      <p>
        השירות ניתן &ldquo;כמות שהוא&rdquo; (AS IS) ו&ldquo;כפי שהוא זמין&rdquo;. איננו
        מתחייבים לזמינות רציפה, לחוסר תקלות, לדיוק הפלטים או להתאמה למטרה מסוימת, אלא אם
        התחייבנו לכך במפורש בהסכם מסחרי חתום. אנו רשאים לבצע תחזוקה מתוכננת ולהשעות את השירות
        זמנית מטעמי אבטחה או יציבות.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'הגבלת אחריות ושיפוי',
    body: (
      <>
        <p>
          במידה המרבית המותרת בדין, לא נהיה אחראים לנזק עקיף, תוצאתי, מיוחד או עונשי, לרבות
          אובדן רווחים, אובדן הזדמנות עסקית, פגיעה במוניטין או אובדן נתונים.
        </p>
        <p>
          בכל מקרה, אחריותנו הכוללת בגין כל עילה שהיא לא תעלה על הסכומים ששילמתם לנו בפועל
          עבור השירות בשלושת החודשים שקדמו לאירוע שהצמיח את העילה.
        </p>
        <p>
          אתם תשפו אותנו בגין תביעה של צד שלישי הנובעת מתוכן הלקוח שלכם, מהפרת תנאים אלה על
          ידיכם, או מהפרת דין או זכות של צד שלישי בשימושכם בשירות.
        </p>
        <p>אין באמור כדי לגרוע מאחריות שלא ניתן להגבילה על פי דין.</p>
      </>
    ),
  },
  {
    id: 'termination',
    title: 'סיום ההתקשרות',
    body: (
      <>
        <p>
          כל צד רשאי לסיים את ההתקשרות בהתאם להסכם המסחרי. אנו רשאים להשעות או לסיים את
          הגישה לשירות באופן מיידי במקרה של הפרה מהותית, שימוש בלתי חוקי, או סיכון לאבטחת
          המערכת או למשתמשים אחרים.
        </p>
        <p>
          עם סיום ההתקשרות תיפסק הגישה לשירות. מחיקת נתונים לאחר סיום מתבצעת בהתאם ללוחות
          הזמנים המפורטים ב<Link href="/privacy">מדיניות הפרטיות</Link>. ניתן לבקש ייצוא של
          תוכן הלקוח לפני הסיום.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'שינויים בתנאים',
    body: (
      <p>
        אנו רשאים לעדכן תנאים אלה. שינוי מהותי יפורסם בדף זה עם עדכון תאריך העדכון, ויכנס
        לתוקף 30 יום לאחר הפרסום. המשך שימוש בשירות לאחר כניסת השינוי לתוקף מהווה הסכמה לו.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'דין וסמכות שיפוט',
    body: (
      <p>
        על תנאים אלה יחולו דיני מדינת ישראל, ללא כללי ברירת הדין שלהם. סמכות השיפוט הבלעדית
        בכל עניין הנובע מהם נתונה לבתי המשפט המוסמכים במחוז תל אביב-יפו.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'יצירת קשר',
    body: (
      <p>
        לשאלות בנוגע לתנאי שימוש אלה ניתן לפנות אלינו בכתובת{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> או דרך{' '}
        <Link href="/contact">דף יצירת הקשר</Link>.
      </p>
    ),
  },
];

/* ------------------------------------------------------------------ */

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100" dir="rtl">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {/* RTL: "back" points right */}
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
            חזרה לדף הבית
          </Link>
          <span className="text-sm text-gray-500">עודכן לאחרונה: {LAST_UPDATED}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-gray-900">תנאי שימוש</h1>
        <p className="mt-4 text-gray-600 leading-relaxed">
          תנאים אלה מסדירים את השימוש בפלטפורמת bestieAI. אנא קראו אותם יחד עם{' '}
          <Link href="/privacy" className="text-indigo-600 hover:text-indigo-500 underline">
            מדיניות הפרטיות
          </Link>
          .
        </p>

        {/* Table of contents — real anchors, so focus actually moves. */}
        <nav aria-label="תוכן העניינים" className="mt-10 rounded-xl border border-gray-200 bg-white/60 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            תוכן העניינים
          </h2>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-gray-700 hover:text-indigo-600 underline-offset-4 hover:underline rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  <span className="tabular-nums text-gray-400">
                    {String(i + 1).padStart(2, '0')}
                  </span>{' '}
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div
          className="mt-12 space-y-12
            [&_p]:text-gray-600 [&_p]:leading-relaxed [&_p+p]:mt-4
            [&_ul]:mt-4 [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pr-5 [&_li]:text-gray-600
            [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-500"
        >
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                {i + 1}. {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-gray-200 py-8 mt-12">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap gap-6 justify-center text-sm text-gray-500">
          <Link href="/terms" className="hover:text-gray-700" aria-current="page">
            תנאי שימוש
          </Link>
          <Link href="/privacy" className="hover:text-gray-700">
            מדיניות פרטיות
          </Link>
          <Link href="/data-deletion" className="hover:text-gray-700">
            מחיקת נתונים
          </Link>
          <Link href="/contact" className="hover:text-gray-700">
            יצירת קשר
          </Link>
        </div>
      </footer>
    </div>
  );
}
