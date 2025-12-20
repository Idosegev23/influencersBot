'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Shield, ArrowRight, Trash2, Download, Loader2, Check, AlertCircle } from 'lucide-react';

export default function PrivacyPage() {
  const [email, setEmail] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDeleteRequest = async () => {
    if (!email && !sessionId) {
      setMessage({ type: 'error', text: 'יש להזין אימייל או מזהה שיחה' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/gdpr/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, sessionId }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'הבקשה התקבלה בהצלחה. נעבד אותה תוך 30 יום.' });
        setEmail('');
        setSessionId('');
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'שגיאה בעיבוד הבקשה' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'שגיאת תקשורת. נסו שוב.' });
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async () => {
    if (!sessionId) {
      setMessage({ type: 'error', text: 'יש להזין מזהה שיחה לייצוא נתונים' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/gdpr/delete-data?sessionId=${sessionId}`);
      
      if (response.ok) {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-data-${sessionId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage({ type: 'success', text: 'הנתונים הורדו בהצלחה' });
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'לא נמצאו נתונים' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'שגיאת תקשורת. נסו שוב.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" dir="rtl">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:50px_50px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 bg-slate-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
            חזרה
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">מדיניות פרטיות</h1>
          <p className="text-gray-400">עודכן לאחרונה: דצמבר 2024</p>
        </motion.div>

        {/* Privacy Policy Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="prose prose-invert max-w-none mb-12"
        >
          <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-8 space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. מידע שאנחנו אוספים</h2>
              <p className="text-gray-400">
                אנחנו אוספים את המידע הבא:
              </p>
              <ul className="text-gray-400 list-disc list-inside space-y-1 mt-2">
                <li>תוכן השיחות שלך עם הצ'אטבוט</li>
                <li>מידע טכני (כתובת IP, סוג דפדפן, מכשיר)</li>
                <li>נתוני שימוש ואנליטיקה</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. כיצד אנחנו משתמשים במידע</h2>
              <p className="text-gray-400">
                המידע משמש לספק שירות צ'אטבוט, לשפר את החוויה, ולהציג תוכן רלוונטי.
                אנחנו לא מוכרים את המידע שלך לצדדים שלישיים.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. שמירת מידע</h2>
              <p className="text-gray-400">
                המידע נשמר בשרתים מאובטחים. שיחות נמחקות אוטומטית לאחר 90 יום אלא אם ביקשת אחרת.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. זכויותיך (GDPR)</h2>
              <p className="text-gray-400">
                יש לך את הזכויות הבאות:
              </p>
              <ul className="text-gray-400 list-disc list-inside space-y-1 mt-2">
                <li>זכות לגישה למידע שלך</li>
                <li>זכות למחיקת המידע</li>
                <li>זכות להגבלת עיבוד</li>
                <li>זכות לניידות נתונים</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. יצירת קשר</h2>
              <p className="text-gray-400">
                לשאלות בנושא פרטיות, ניתן לפנות אלינו בכתובת: privacy@example.com
              </p>
            </section>
          </div>
        </motion.div>

        {/* GDPR Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-8"
        >
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            מימוש זכויות הפרטיות שלך
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">מזהה שיחה (אופציונלי)</label>
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="session_xxx..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {message && (
            <div
              className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
                message.type === 'success'
                  ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                  : 'bg-red-500/20 border border-red-500/30 text-red-400'
              }`}
            >
              {message.type === 'success' ? (
                <Check className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              {message.text}
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleDeleteRequest}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              בקש מחיקת נתונים
            </button>
            <button
              onClick={handleExportData}
              disabled={loading || !sessionId}
              className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              ייצוא הנתונים שלי
            </button>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            * בקשות מחיקה מטופלות תוך 30 יום. לייצוא נתונים נדרש מזהה השיחה.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
