'use client';

/**
 * Support tab — B2B SaaS existing-customer ticket form.
 *
 * Same visual system as DemoTab and the existing BrandSupportTab: white
 * `support-form-input` pills (60px), `support-form-textarea` (162px), full-pill
 * `support-cta` button. The issue-type picker is built from `support-card`
 * primitives — same component already used by BrandSupportTab's product
 * selector, so the look stays consistent across all support flows in the app.
 *
 * Submission lands in `support_requests` with `metadata.source='support_ticket'`
 * plus issue_type so the inbox can route bug / billing / integration tickets
 * separately from new-lead demo requests (which use source='demo_request').
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, Bug, Plug, CreditCard, UserCircle, Sparkles, MoreHorizontal } from 'lucide-react';
import { track } from '@/lib/analytics/track';

interface Props {
  accountId: string;
  brandColor?: string;
  language?: string;
}

type IssueId = 'bug' | 'integration' | 'billing' | 'account' | 'feature' | 'other';

const ISSUES_EN: { id: IssueId; label: string; subtitle: string; icon: typeof Bug }[] = [
  { id: 'bug', label: 'Bug', subtitle: 'Something’s not working', icon: Bug },
  { id: 'integration', label: 'Integration', subtitle: 'Connecting another tool', icon: Plug },
  { id: 'billing', label: 'Billing', subtitle: 'Invoices or payment', icon: CreditCard },
  { id: 'account', label: 'Account', subtitle: 'Access, users, settings', icon: UserCircle },
  { id: 'feature', label: 'Feature request', subtitle: 'Something you’d like us to build', icon: Sparkles },
  { id: 'other', label: 'Other', subtitle: 'Anything else', icon: MoreHorizontal },
];

const ISSUES_HE: { id: IssueId; label: string; subtitle: string; icon: typeof Bug }[] = [
  { id: 'bug', label: 'באג', subtitle: 'משהו לא עובד', icon: Bug },
  { id: 'integration', label: 'אינטגרציה', subtitle: 'חיבור לכלי אחר', icon: Plug },
  { id: 'billing', label: 'חיוב', subtitle: 'חשבוניות ותשלום', icon: CreditCard },
  { id: 'account', label: 'חשבון', subtitle: 'הרשאות, משתמשים, הגדרות', icon: UserCircle },
  { id: 'feature', label: 'בקשת פיצ\'ר', subtitle: 'משהו שתרצו שנפתח', icon: Sparkles },
  { id: 'other', label: 'אחר', subtitle: 'כל דבר אחר', icon: MoreHorizontal },
];

type Step = 'type' | 'form';

export default function SupportTab({ accountId, brandColor = '#0c1013', language }: Props) {
  const isEn = (language || 'en').toLowerCase() === 'en';
  const dir: 'ltr' | 'rtl' = isEn ? 'ltr' : 'rtl';
  const issues = isEn ? ISSUES_EN : ISSUES_HE;

  const [step, setStep] = useState<Step>('type');
  const [issueType, setIssueType] = useState<IssueId | null>(null);
  const [form, setForm] = useState({ name: '', email: '', company: '', subject: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const t = isEn
    ? {
        headingType: 'Get help',
        subheadingType: 'What can we help with?',
        headingForm: 'Open a ticket',
        subheadingForm: 'Fill in the details and we’ll get back to you shortly.',
        name: 'Full name',
        email: 'Work email',
        company: 'Company',
        subject: 'Short summary (optional)',
        description: 'Describe the issue',
        submit: 'Submit ticket',
        submitting: 'Submitting…',
        success: 'Thanks — your ticket is in.',
        successSub: 'You’ll get an email confirmation, and our team will follow up shortly.',
        required: 'Please fill in name, email, company, and description.',
        invalidEmail: 'That email doesn’t look valid.',
        genericError: 'Something went wrong submitting. Please try again.',
        back: 'Back',
      }
    : {
        headingType: 'פתיחת פנייה',
        subheadingType: 'במה אפשר לעזור?',
        headingForm: 'פנייה',
        subheadingForm: 'מלאו את הפרטים ונחזור אליכם בקרוב.',
        name: 'שם מלא',
        email: 'אימייל עסקי',
        company: 'חברה',
        subject: 'כותרת קצרה (אופציונלי)',
        description: 'תיאור הבעיה',
        submit: 'שלחו פנייה',
        submitting: 'שולח…',
        success: 'תודה — הפנייה נקלטה.',
        successSub: 'תקבלו אישור במייל ונציג מהצוות יחזור אליכם בקרוב.',
        required: 'נא למלא שם, מייל, חברה ופירוט.',
        invalidEmail: 'המייל לא נראה תקין.',
        genericError: 'אירעה שגיאה בשליחה. נסו שוב.',
        back: 'חזרה',
      };

  const selectedIssue = issues.find((i) => i.id === issueType);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.email.trim() || !form.company.trim() || !form.description.trim()) {
      setError(t.required);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError(t.invalidEmail);
      return;
    }
    setSubmitting(true);
    try {
      try { track('support_form_submitted', { account_id: accountId, issue_type: issueType || 'unspecified' }); } catch { /* */ }
      const message = [
        `Support ticket from ${form.name}`,
        `Email: ${form.email}`,
        `Company: ${form.company}`,
        issueType ? `Issue type: ${issueType}` : null,
        form.subject ? `Subject: ${form.subject}` : null,
        '',
        form.description,
      ].filter((x) => x !== null).join('\n');
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          customerName: form.name,
          customerPhone: null,
          message,
          brand: form.company,
          metadata: {
            source: 'support_ticket',
            email: form.email,
            issue_type: issueType,
            subject: form.subject || null,
          },
        }),
      });
      if (!res.ok) throw new Error('support_request_failed');
      setSuccess(true);
    } catch {
      setError(t.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="px-4 py-10 flex flex-col items-center text-center" style={{ direction: dir }}>
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

  // ---- STEP 1: pick an issue type ----
  if (step === 'type') {
    return (
      <div className="px-4 py-6" style={{ direction: dir }}>
        <div className="mb-4 px-3">
          <h2 className="support-title">{t.headingType}</h2>
          <p className="support-subtitle">{t.subheadingType}</p>
        </div>

        <div className="flex flex-col gap-2">
          {issues.map(({ id, label, subtitle, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setIssueType(id); setStep('form'); }}
              className="support-card"
            >
              <div
                className="support-card-icon-avatar"
                style={{ background: `${brandColor}14`, color: brandColor }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="support-card-text">
                <p className="support-card-title">{label}</p>
                <p className="support-card-subtitle">{subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- STEP 2: form ----
  const canSubmit = !submitting && form.name && form.email && form.company && form.description;

  return (
    <div className="px-4 py-6" style={{ direction: dir }}>
      <div className="mb-4 px-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="support-title">{t.headingForm}</h2>
          <p className="support-subtitle">{t.subheadingForm}</p>
        </div>
        <button
          type="button"
          onClick={() => { setStep('type'); setError(null); }}
          className="support-back-btn"
          aria-label={t.back}
        >
          <span className="support-back-icon" aria-hidden />
        </button>
      </div>

      {/* Selected issue type pill (matches BrandSupportTab's selected-product-pill look) */}
      {selectedIssue && (
        <div
          className="flex items-center gap-3 rounded-[18px] px-4 py-3 mb-3"
          style={{ background: `${brandColor}12` }}
        >
          <div
            className="w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0"
            style={{ background: `${brandColor}1f`, color: brandColor }}
          >
            <selectedIssue.icon className="w-4 h-4" />
          </div>
          <p className="text-[16px]" style={{ color: brandColor }}>{selectedIssue.label}</p>
        </div>
      )}

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
        <input
          type="text"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder={t.subject}
          className="support-form-input"
        />
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={t.description}
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
  );
}
