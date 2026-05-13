'use client';

/**
 * Demo tab — for B2B SaaS accounts.
 * Lightweight qualification form. Submission lands in `support_requests` with
 * metadata.source='demo_request' so the existing support inbox handles it —
 * no parallel demo-bookings table. Sales team picks it up the same way they
 * pick up regular tickets.
 *
 * Fields are intentionally short: name, work email, company, team size, use
 * case. We deliberately do NOT ask for phone (cuts EU lead conversion in half)
 * or budget (premature for first contact).
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { track } from '@/lib/analytics/track';

interface Props {
  accountId: string;
  brandColor?: string;
  language?: string;
}

const TEAM_SIZES_EN = ['1–10', '11–50', '51–200', '201–1000', '1000+'];
const TEAM_SIZES_HE = ['1–10', '11–50', '51–200', '201–1000', '1000+'];

export default function DemoTab({ accountId, brandColor = '#0c1013', language }: Props) {
  const isEn = (language || 'en').toLowerCase() === 'en';
  const sizes = isEn ? TEAM_SIZES_EN : TEAM_SIZES_HE;

  const [form, setForm] = useState({ name: '', email: '', company: '', teamSize: '', useCase: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const t = isEn
    ? {
        heading: 'Get a demo',
        subheading: 'Tell us a bit about you — our team will reach out within one business day.',
        name: 'Full name',
        email: 'Work email',
        company: 'Company',
        teamSize: 'Team size',
        useCase: 'What are you hoping to accomplish?',
        submit: 'Request demo',
        submitting: 'Sending…',
        success: 'Thanks — your demo request is in.',
        successSub: 'A member of our team will follow up by email shortly.',
        required: 'Please fill in name, work email, and company.',
        invalidEmail: 'That email doesn’t look valid.',
        genericError: 'Something went wrong submitting. Please try again.',
      }
    : {
        heading: 'תיאום דמו',
        subheading: 'ספרו לנו מעט עליכם — נחזור אליכם תוך יום עסקים.',
        name: 'שם מלא',
        email: 'אימייל עסקי',
        company: 'חברה',
        teamSize: 'גודל צוות',
        useCase: 'מה תרצו להשיג?',
        submit: 'בקשו דמו',
        submitting: 'שולח…',
        success: 'תודה — בקשת הדמו נקלטה.',
        successSub: 'נציג מהצוות יחזור אליכם במייל בקרוב.',
        required: 'נא למלא שם, מייל עסקי וחברה.',
        invalidEmail: 'המייל לא נראה תקין.',
        genericError: 'אירעה שגיאה בשליחה. נסו שוב.',
      };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.email.trim() || !form.company.trim()) {
      setError(t.required);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError(t.invalidEmail);
      return;
    }
    setSubmitting(true);
    try {
      track('demo_request_submit', { account_id: accountId, team_size: form.teamSize });
      const message = [
        `Demo request from ${form.name}`,
        `Email: ${form.email}`,
        `Company: ${form.company}`,
        form.teamSize ? `Team size: ${form.teamSize}` : null,
        form.useCase ? `Use case: ${form.useCase}` : null,
      ].filter(Boolean).join('\n');
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          customerName: form.name,
          customerPhone: null,
          message,
          brand: form.company,
          metadata: { source: 'demo_request', email: form.email, team_size: form.teamSize },
        }),
      });
      if (!res.ok) throw new Error('demo_request_failed');
      setSuccess(true);
    } catch {
      setError(t.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="px-4 py-10 flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: `${brandColor}12`, color: brandColor }}
        >
          <CheckCircle2 className="w-8 h-8" />
        </motion.div>
        <h2 className="text-xl font-bold text-gray-900">{t.success}</h2>
        <p className="text-sm text-gray-600 mt-2 max-w-sm">{t.successSub}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6" style={{ direction: isEn ? 'ltr' : 'rtl' }}>
      <div className="mb-5">
        <h2 className="text-2xl font-bold" style={{ color: brandColor }}>{t.heading}</h2>
        <p className="text-sm text-gray-600 mt-1">{t.subheading}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <Field label={t.name} value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoComplete="name" />
        <Field label={t.email} value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" autoComplete="email" />
        <Field label={t.company} value={form.company} onChange={(v) => setForm({ ...form, company: v })} autoComplete="organization" />

        <div>
          <label className="block text-sm text-gray-700 mb-1">{t.teamSize}</label>
          <div className="grid grid-cols-5 gap-1">
            {sizes.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setForm({ ...form, teamSize: s })}
                className={`text-xs py-2 rounded-lg border transition ${
                  form.teamSize === s ? 'text-white' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                }`}
                style={form.teamSize === s ? { background: brandColor, borderColor: brandColor } : undefined}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">{t.useCase}</label>
          <textarea
            value={form.useCase}
            onChange={(e) => setForm({ ...form, useCase: e.target.value })}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 resize-none"
          />
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: brandColor }}
        >
          {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> {t.submitting}</>) : t.submit}
        </button>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
      />
    </div>
  );
}
