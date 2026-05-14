'use client';

/**
 * Demo tab — for B2B SaaS accounts.
 *
 * Visually mirrors SupportTab: each logical group of fields lives in its own
 * tinted card so the form feels like a "ticket" rather than a flat lead form.
 * Submission lands in `support_requests` with `metadata.source='demo_request'`
 * so the existing support inbox picks it up alongside support tickets, just
 * with a different lane.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, User, Briefcase, MessageSquare } from 'lucide-react';
import { track } from '@/lib/analytics/track';

interface Props {
  accountId: string;
  brandColor?: string;
  language?: string;
}

const TEAM_SIZES = ['1–10', '11–50', '51–200', '201–1000', '1000+'];

export default function DemoTab({ accountId, brandColor = '#0c1013', language }: Props) {
  const isEn = (language || 'en').toLowerCase() === 'en';
  const dir: 'ltr' | 'rtl' = isEn ? 'ltr' : 'rtl';

  const [form, setForm] = useState({ name: '', email: '', company: '', teamSize: '', useCase: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const t = isEn
    ? {
        heading: 'Get a demo',
        subheading: 'Tell us a bit about you — our team will reach out within one business day.',
        sectionAbout: 'About you',
        sectionCompany: 'About your team',
        sectionGoals: 'What you want to achieve',
        name: 'Full name',
        email: 'Work email',
        company: 'Company',
        teamSize: 'Team size',
        useCase: 'Goals or use case',
        useCasePlaceholder: 'e.g. launch our skincare line with 100 nano-creators in Q3, or replace our PR agency with an AI workflow…',
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
        sectionAbout: 'עליכם',
        sectionCompany: 'על הצוות',
        sectionGoals: 'מה תרצו להשיג',
        name: 'שם מלא',
        email: 'אימייל עסקי',
        company: 'חברה',
        teamSize: 'גודל צוות',
        useCase: 'מטרות / use case',
        useCasePlaceholder: 'לדוגמה: השקת מותג טיפוח עם 100 nano-creators ברבעון הקרוב, או החלפת סוכנות PR בתהליך AI…',
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
      try { track('demo_request_submit', { account_id: accountId, team_size: form.teamSize }); } catch { /* */ }
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
          style={{ background: `${brandColor}14`, color: brandColor }}
        >
          <CheckCircle2 className="w-8 h-8" />
        </motion.div>
        <h2 className="text-xl font-bold text-gray-900">{t.success}</h2>
        <p className="text-sm text-gray-600 mt-2 max-w-sm">{t.successSub}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6" style={{ direction: dir }}>
      <div className="mb-5">
        <h2 className="text-2xl font-bold" style={{ color: brandColor }}>{t.heading}</h2>
        <p className="text-sm text-gray-600 mt-1">{t.subheading}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {/* Section: About you */}
        <SectionCard brandColor={brandColor} icon={<User className="w-4 h-4" />} title={t.sectionAbout}>
          <Field label={t.name} value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoComplete="name" brandColor={brandColor} />
          <Field label={t.email} value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" autoComplete="email" brandColor={brandColor} />
        </SectionCard>

        {/* Section: Company */}
        <SectionCard brandColor={brandColor} icon={<Briefcase className="w-4 h-4" />} title={t.sectionCompany}>
          <Field label={t.company} value={form.company} onChange={(v) => setForm({ ...form, company: v })} autoComplete="organization" brandColor={brandColor} />
          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1.5">{t.teamSize}</label>
            <div className="grid grid-cols-5 gap-1.5">
              {TEAM_SIZES.map((s) => {
                const active = form.teamSize === s;
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setForm({ ...form, teamSize: s })}
                    className="text-xs py-2 rounded-lg border transition font-medium"
                    style={
                      active
                        ? { background: brandColor, borderColor: brandColor, color: '#fff' }
                        : { background: '#fff', borderColor: '#e5e7eb', color: '#374151' }
                    }
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </SectionCard>

        {/* Section: Use case */}
        <SectionCard brandColor={brandColor} icon={<MessageSquare className="w-4 h-4" />} title={t.sectionGoals}>
          <textarea
            value={form.useCase}
            onChange={(e) => setForm({ ...form, useCase: e.target.value })}
            rows={4}
            placeholder={t.useCasePlaceholder}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 resize-none"
          />
        </SectionCard>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          style={{ background: brandColor }}
        >
          {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> {t.submitting}</>) : t.submit}
        </button>
      </form>
    </div>
  );
}

// --- Shared section + field primitives ---

export function SectionCard({
  brandColor, icon, title, children,
}: {
  brandColor: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{ background: `${brandColor}0d`, borderColor: `${brandColor}1f` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${brandColor}1a`, color: brandColor }}
        >
          {icon}
        </span>
        <span className="text-sm font-semibold" style={{ color: brandColor }}>{title}</span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

export function Field({
  label, value, onChange, type = 'text', autoComplete, brandColor,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  brandColor?: string;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
        style={brandColor ? { caretColor: brandColor } : undefined}
      />
    </div>
  );
}
