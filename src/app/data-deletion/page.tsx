'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Shield, Trash2, Loader2, Check, AlertCircle, Mail } from 'lucide-react';

export default function DataDeletionPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [igHandle, setIgHandle] = useState('');
  const [brand, setBrand] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError('יש להזין שם ואימייל / Name and email are required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/data-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          igHandle: igHandle.trim() || undefined,
          brand: brand.trim() || undefined,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'Submission failed');
      }
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-gray-300" dir="rtl">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:40px_40px]" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <header className="relative z-20 bg-slate-950/70 backdrop-blur-2xl border-b border-white/5 sticky top-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
          >
            <ArrowRight className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="hidden sm:inline">חזרה לדף הבית</span>
            <span className="sm:hidden">חזרה</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              מדיניות פרטיות
            </Link>
            <span className="text-gray-700">|</span>
            <Link href="/terms" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              תנאי שימוש
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="text-center mb-10">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-rose-500/30 rounded-3xl blur-xl" />
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
              <Trash2 className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">בקשה למחיקת נתונים</h1>
          <p className="text-lg text-gray-400">Data Deletion Request</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 mb-6">
          <div className="space-y-4 text-sm sm:text-base leading-relaxed text-gray-300">
            <p>
              באמצעות הטופס הזה ניתן לבקש מחיקת מידע אישי שנאסף עליך במהלך אינטראקציה עם חשבון
              שמופעל על-ידי BestieAI — צ׳אטבוט באתר, שיחות ב-Instagram DM, או תגובות.
            </p>
            <p className="text-gray-400 text-sm">
              <strong className="text-gray-300">English:</strong> Use this form to request deletion of personal data we
              collected from you while interacting with a BestieAI-powered account — a website chatbot, Instagram DMs,
              or comments. We process requests within 30 days under GDPR and the Meta Platform Terms.
            </p>
            <div className="flex items-start gap-3 mt-4 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <Shield className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-400">
                המידע שלך יימחק מהמערכות שלנו (שיחות, פעילות, אינטראקציות עם Meta API) תוך 30 יום.
                נשלח אליך אישור במייל בסיום התהליך.
              </div>
            </div>
          </div>
        </div>

        {done ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">הבקשה התקבלה</h2>
            <p className="text-gray-300 mb-1">Request received</p>
            <p className="text-sm text-gray-400 mt-3">
              שלחנו אישור למייל שלך. נעבד את הבקשה תוך 30 יום ונשלח אישור נוסף כשנסיים.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 mt-6 text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              חזרה לדף הבית
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                שם מלא <span className="text-rose-400">*</span>
                <span className="text-gray-500 font-normal mr-2">/ Full name</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={submitting}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="ישראל ישראלי"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                אימייל ליצירת קשר <span className="text-rose-400">*</span>
                <span className="text-gray-500 font-normal mr-2">/ Contact email</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
                dir="ltr"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors text-left"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                שם משתמש באינסטגרם
                <span className="text-gray-500 font-normal mr-2">/ Instagram handle (optional)</span>
              </label>
              <input
                type="text"
                value={igHandle}
                onChange={(e) => setIgHandle(e.target.value)}
                disabled={submitting}
                dir="ltr"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors text-left"
                placeholder="@your_ig_username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                שם המותג / החשבון שאיתו הייתה לך אינטראקציה
                <span className="text-gray-500 font-normal mr-2">/ Brand or account (optional)</span>
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                disabled={submitting}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="LDRS Group / @bestie_account"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                פירוט (לא חובה)
                <span className="text-gray-500 font-normal mr-2">/ Additional details (optional)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                rows={4}
                maxLength={2000}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                placeholder="נשמח לדעת מאיזה ערוץ הגעת אלינו / Tell us where we interacted (chatbot, IG DM, comments)…"
              />
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-rose-200">{error}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-base font-semibold bg-gradient-to-r from-rose-500 to-pink-600 text-white transition-all hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              {submitting ? 'שולח...' : 'שליחת בקשה / Submit request'}
            </button>

            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 pt-2">
              <Mail className="w-4 h-4" />
              <span>אפשר גם לפנות ישירות במייל:</span>
              <a
                href="mailto:bestie@ldrsgroup.com"
                className="text-indigo-400 hover:text-indigo-300 transition-colors"
                dir="ltr"
              >
                bestie@ldrsgroup.com
              </a>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
