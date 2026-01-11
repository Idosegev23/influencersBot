import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'תנאי שימוש | InfluencerBot',
  description: 'תנאי השימוש של InfluencerBot - פלטפורמת הצ\'אטבוטים למשפיענים',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
            חזרה לדף הבית
          </Link>
          <span className="text-sm text-gray-500">עודכן לאחרונה: דצמבר 2024</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">תנאי שימוש</h1>

        <div className="prose prose-lg prose-gray max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. הסכמה לתנאים</h2>
            <p className="text-gray-600 leading-relaxed">
              על ידי גישה לאתר InfluencerBot ושימוש בו, אתם מסכימים לציית לתנאי שימוש אלה ולכל החוקים והתקנות החלים. אם אינכם מסכימים לתנאים אלה, אנא הימנעו משימוש באתר.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. תיאור השירות</h2>
            <p className="text-gray-600 leading-relaxed">
              InfluencerBot מספקת פלטפורמה ליצירת צ'אטבוטים מבוססי AI עבור משפיענים ויוצרי תוכן. השירות כולל:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>יצירה אוטומטית של צ'אטבוט מותאם אישית</li>
              <li>ניתוח פרופיל אינסטגרם וזיהוי מוצרים וקופונים</li>
              <li>מיניסייט ייעודי לכל משפיען</li>
              <li>אנליטיקס ומעקב אחר שיחות</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. אחריות המשתמש</h2>
            <p className="text-gray-600 leading-relaxed">
              המשתמש מתחייב:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>לספק מידע מדויק ועדכני</li>
              <li>לא להשתמש בשירות למטרות בלתי חוקיות</li>
              <li>לשמור על סודיות פרטי הגישה שלו</li>
              <li>לא להפר זכויות קניין רוחני של צדדים שלישיים</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. קניין רוחני</h2>
            <p className="text-gray-600 leading-relaxed">
              כל הזכויות בפלטפורמה, כולל הקוד, העיצוב והתוכן, שייכות ל-InfluencerBot. התוכן שמזינים המשפיענים נשאר בבעלותם.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. הגבלת אחריות</h2>
            <p className="text-gray-600 leading-relaxed">
              השירות ניתן "כמות שהוא" (AS IS). אנחנו לא מתחייבים לזמינות רציפה או לחוסר תקלות. לא נהיה אחראים לכל נזק ישיר או עקיף הנובע משימוש בשירות.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. שינויים בתנאים</h2>
            <p className="text-gray-600 leading-relaxed">
              אנו שומרים לעצמנו את הזכות לעדכן תנאים אלה בכל עת. שינויים מהותיים יפורסמו באתר ויכנסו לתוקף 30 יום לאחר הפרסום.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. יצירת קשר</h2>
            <p className="text-gray-600 leading-relaxed">
              לשאלות בנוגע לתנאי השימוש, ניתן לפנות אלינו דרך{' '}
              <Link href="/contact" className="text-indigo-600 hover:text-indigo-500 underline">
                דף יצירת הקשר
              </Link>
              .
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 mt-12">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap gap-6 justify-center text-sm text-gray-500">
          <Link href="/terms" className="hover:text-gray-700">תנאי שימוש</Link>
          <Link href="/privacy" className="hover:text-gray-700">מדיניות פרטיות</Link>
          <Link href="/contact" className="hover:text-gray-700">יצירת קשר</Link>
        </div>
      </footer>
    </div>
  );
}








