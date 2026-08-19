'use client';

/**
 * What a prospect sees once the 7-day demo window closes.
 *
 * Deliberately terminal: no dismiss control, no way back to the bot. The demo
 * was the pitch; this screen is the ask. Its single button opens a short form
 * whose submission becomes a hot lead to the sales five (see /api/demo/lead).
 *
 * Bestie purple, not the account's brand colour — /chat/* is Bestie's surface,
 * and by this point we are selling Bestie, not impersonating the brand.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Loader2, CheckCircle2 } from 'lucide-react';
import { BESTIE_PRIMARY } from '@/lib/widget/banner';

interface Props {
  accountId: string;
  brandName: string;
  /** Account avatar / cover, when the scan found one. */
  logoUrl?: string | null;
}

type Phase = 'intro' | 'form' | 'sent';

export function DemoLockedScreen({ accountId, brandName, logoUrl }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState(brandName || '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim() || !phone.trim()) {
      setError('שם וטלפון הם שדות חובה');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/demo/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          name: name.trim(),
          brand: brand.trim(),
          phone: phone.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });
      // A duplicate submit comes back 200 with `alreadySent` — the prospect
      // should see the thank-you either way, never an error for trying twice.
      if (!res.ok) throw new Error(String(res.status));
      setPhase('sent');
    } catch {
      setError('משהו השתבש. אפשר לנסות שוב, או לכתוב לנו ל-bestie@ldrsgroup.com');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-[#F7F2FE] px-5 py-12"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl ring-1 ring-black/5"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={brandName}
            className="mx-auto mb-5 h-16 w-16 rounded-full object-cover ring-2 ring-[#9334EB]/15"
          />
        ) : (
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: `${BESTIE_PRIMARY}14` }}
          >
            <Lock className="h-7 w-7" style={{ color: BESTIE_PRIMARY }} aria-hidden />
          </div>
        )}

        {phase === 'sent' ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" aria-hidden />
            <h1 className="mb-2 text-xl font-bold text-gray-900">קיבלנו — תודה!</h1>
            <p className="text-sm leading-relaxed text-gray-600">
              הצוות של LDRS יחזור אליך בהקדם. את כל מה ששאלת כאן כבר העברנו הלאה, כדי
              שלא תצטרך לספר את זה שוב.
            </p>
          </div>
        ) : phase === 'intro' ? (
          <div className="text-center">
            <h1 className="mb-3 text-xl font-bold text-gray-900">
              ההתנסות ב-Bestie הסתיימה
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-gray-600">
              במהלך השבוע האחרון {brandName ? <b>{brandName}</b> : 'הדמו'} ענה לשאלות
              בקול של המותג, מהתוכן והמוצרים האמיתיים שלו. רוצה להפעיל את זה באמת?
            </p>
            <button
              onClick={() => setPhase('form')}
              className="w-full rounded-xl px-5 py-3.5 text-base font-semibold text-white transition hover:opacity-90"
              style={{ background: BESTIE_PRIMARY }}
            >
              צרו איתי קשר
            </button>
          </div>
        ) : (
          <div>
            <h2 className="mb-1 text-lg font-bold text-gray-900">נשמח לדבר</h2>
            <p className="mb-5 text-sm text-gray-500">נחזור אליך תוך יום עסקים.</p>

            <div className="space-y-3">
              <Field label="שם מלא *" value={name} onChange={setName} autoFocus />
              <Field label="מותג / חברה" value={brand} onChange={setBrand} />
              <Field label="טלפון *" value={phone} onChange={setPhone} type="tel" inputMode="tel" />
              <Field label="אימייל" value={email} onChange={setEmail} type="email" inputMode="email" />
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  משהו שנרצה לדעת לפני שנתקשר?
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#9334EB] focus:ring-1 focus:ring-[#9334EB]"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              onClick={submit}
              disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ background: BESTIE_PRIMARY }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {busy ? 'שולח...' : 'שליחה'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: 'tel' | 'email';
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#9334EB] focus:ring-1 focus:ring-[#9334EB]"
      />
    </div>
  );
}

export default DemoLockedScreen;
