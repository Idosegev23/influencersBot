'use client';

/**
 * Demo tab — B2B SaaS lead-capture form.
 *
 * Visually identical to the existing brand support form (BrandSupportTab → step
 * 'form'): support-title heading, white pill inputs (.support-form-input,
 * 60px tall, 18px radius), .support-form-textarea (162px), and a brand-color
 * full-pill CTA (.support-cta). Layout is right out of Figma 471:8076 — we
 * stay inside that design system rather than inventing a parallel one.
 *
 * Submission lands in `support_requests` with `metadata.source='demo_request'`
 * so the inbox can separate new-lead requests from existing-customer tickets.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { track } from '@/lib/analytics/track';

interface Props {
  accountId: string;
  username: string;
  brandColor?: string;
  language?: string;
}

const TEAM_SIZES = ['1–10', '11–50', '51–200', '201–1000', '1000+'];

export default function DemoTab({ accountId, username, brandColor = '#0c1013', language }: Props) {
  const isEn = (language || 'en').toLowerCase() === 'en';
  const dir: 'ltr' | 'rtl' = isEn ? 'ltr' : 'rtl';

  const [form, setForm] = useState({ name: '', email: '', company: '', teamSize: '', useCase: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const t = isEn
    ? {
        heading: 'Request a demo',
        subheading: 'Tell us a bit about you — our team will follow up within one business day.',
        name: 'Full name',
        email: 'Work email',
        company: 'Company',
        teamSize: 'Team size',
        useCase: 'What are you hoping to achieve?',
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
        subheading: 'ספרו לנו מעט עליכם ונחזור אליכם תוך יום עסקים.',
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
      try { track('demo_request_submit', { account_id: accountId, team_size: form.teamSize }); } catch { /* */ }
      const message = [
        `Demo request from ${form.name}`,
        `Email: ${form.email}`,
        `Company: ${form.company}`,
        form.teamSize ? `Team size: ${form.teamSize}` : null,
        form.useCase ? `Goal: ${form.useCase}` : null,
      ].filter(Boolean).join('\n');
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          accountId,
          customerName: form.name,
          customerEmail: form.email,
          customerPhone: null,
          message,
          brand: form.company,
          source: 'demo_request',
          metadata: { team_size: form.teamSize, use_case: form.useCase || null },
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
      <div className="px-4 py-10" style={{ direction: dir }}>
        <div className="mx-auto max-w-[700px] flex flex-col items-center text-center">
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
      </div>
    );
  }

  const canSubmit = !submitting && form.name && form.email && form.company;

  return (
    <div className="px-4 py-6" style={{ direction: dir }}>
      {/* Same width container the existing coupons / problem tabs use, so the
          form doesn't stretch to full screen on desktop. */}
      <div className="mx-auto max-w-[700px]">
        <div className="mb-4 px-3">
          <h2 className="support-title">{t.heading}</h2>
          <p className="support-subtitle">{t.subheading}</p>
        </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-[6px]">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t.name}
          autoComplete="name"
          className="support-form-input"
        />
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder={t.email}
          autoComplete="email"
          className="support-form-input"
        />
        <input
          type="text"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          placeholder={t.company}
          autoComplete="organization"
          className="support-form-input"
        />

        {/* Team size — chip selector that visually echoes the support pill aesthetic */}
        <div
          className="flex items-center gap-[6px] bg-white rounded-[18px] px-[8px] h-[60px] overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          <span className="text-[14px] text-[#676767] px-3 flex-shrink-0">{t.teamSize}</span>
          {TEAM_SIZES.map((s) => {
            const active = form.teamSize === s;
            return (
              <button
                type="button"
                key={s}
                onClick={() => setForm({ ...form, teamSize: s })}
                className="h-[40px] px-3 rounded-[60px] text-[14px] font-medium transition flex-shrink-0"
                style={
                  active
                    ? { background: brandColor, color: '#fff' }
                    : { background: '#f4f5f7', color: '#0c1013' }
                }
              >
                {s}
              </button>
            );
          })}
        </div>

        <textarea
          value={form.useCase}
          onChange={(e) => setForm({ ...form, useCase: e.target.value })}
          placeholder={t.useCase}
          className="support-form-textarea"
        />

        {error && (
          <div className="text-[14px] text-[#b91c1c] bg-[#fee2e2] border border-[#fecaca] rounded-[14px] px-4 py-2.5 mt-1">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={`support-cta mt-8 ${canSubmit ? 'support-cta--enabled' : 'support-cta--disabled'}`}
          style={canSubmit ? { background: brandColor } : undefined}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t.submit}
        </button>
      </form>
      </div>
    </div>
  );
}
