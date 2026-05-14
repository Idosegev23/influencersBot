'use client';

/**
 * Support tab — for B2B SaaS accounts.
 * Existing-customer issue flow. Pairs with DemoTab visually (same SectionCard
 * primitive, same submit button style) but routes to support_requests with
 * `metadata.source='support_ticket'` so the inbox can separate bug reports
 * from new-lead demo requests.
 *
 * Issue types are deliberately B2B-flavoured: Bug, Integration, Billing,
 * Account, Feature request, Other — not the retail-shopping vocabulary the
 * BrandSupportTab uses for LA BEAUTÉ-style accounts.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, CheckCircle2, User, Briefcase, Bug, Plug, CreditCard,
  UserCircle, Sparkles, MoreHorizontal, AlertCircle,
} from 'lucide-react';
import { track } from '@/lib/analytics/track';
import { SectionCard, Field } from './DemoTab';

interface Props {
  accountId: string;
  brandColor?: string;
  language?: string;
}

type IssueId = 'bug' | 'integration' | 'billing' | 'account' | 'feature' | 'other';

const ISSUES_EN: { id: IssueId; label: string; icon: typeof Bug }[] = [
  { id: 'bug', label: 'Bug', icon: Bug },
  { id: 'integration', label: 'Integration', icon: Plug },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'account', label: 'Account', icon: UserCircle },
  { id: 'feature', label: 'Feature request', icon: Sparkles },
  { id: 'other', label: 'Other', icon: MoreHorizontal },
];

const ISSUES_HE: { id: IssueId; label: string; icon: typeof Bug }[] = [
  { id: 'bug', label: 'באג', icon: Bug },
  { id: 'integration', label: 'אינטגרציה', icon: Plug },
  { id: 'billing', label: 'חיוב', icon: CreditCard },
  { id: 'account', label: 'חשבון', icon: UserCircle },
  { id: 'feature', label: 'בקשת פיצ\'ר', icon: Sparkles },
  { id: 'other', label: 'אחר', icon: MoreHorizontal },
];

export default function SupportTab({ accountId, brandColor = '#0c1013', language }: Props) {
  const isEn = (language || 'en').toLowerCase() === 'en';
  const dir: 'ltr' | 'rtl' = isEn ? 'ltr' : 'rtl';
  const issues = isEn ? ISSUES_EN : ISSUES_HE;

  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    issueType: '' as IssueId | '',
    subject: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const t = isEn
    ? {
        heading: 'Get help',
        subheading: 'Tell us what’s going on — we’ll route it to the right person on our team.',
        sectionAbout: 'Your details',
        sectionIssue: 'What can we help with?',
        sectionDescribe: 'Describe the issue',
        name: 'Full name',
        email: 'Work email',
        company: 'Company',
        subject: 'Short summary',
        subjectPlaceholder: 'e.g. Slack integration not posting campaign updates',
        description: 'Details',
        descriptionPlaceholder: 'Steps to reproduce, what you expected, anything you’ve already tried…',
        submit: 'Submit ticket',
        submitting: 'Submitting…',
        success: 'Thanks — your ticket is in.',
        successSub: 'You’ll get an email confirmation, and our team will follow up shortly.',
        required: 'Please fill in name, email, company, and issue type.',
        invalidEmail: 'That email doesn’t look valid.',
        genericError: 'Something went wrong submitting. Please try again.',
      }
    : {
        heading: 'פתיחת פנייה',
        subheading: 'תארו את הבעיה — ננתב לאדם הנכון בצוות.',
        sectionAbout: 'הפרטים שלכם',
        sectionIssue: 'במה אפשר לעזור?',
        sectionDescribe: 'תיאור הבעיה',
        name: 'שם מלא',
        email: 'אימייל עסקי',
        company: 'חברה',
        subject: 'כותרת קצרה',
        subjectPlaceholder: 'לדוגמה: אינטגרציית Slack לא שולחת עדכוני קמפיין',
        description: 'פירוט',
        descriptionPlaceholder: 'שלבים לשחזור, מה ציפיתם, מה כבר ניסיתם…',
        submit: 'שלחו פנייה',
        submitting: 'שולח…',
        success: 'תודה — הפנייה נקלטה.',
        successSub: 'תקבלו אישור במייל, ונציג מהצוות יחזור אליכם בקרוב.',
        required: 'נא למלא שם, מייל, חברה וסוג פנייה.',
        invalidEmail: 'המייל לא נראה תקין.',
        genericError: 'אירעה שגיאה בשליחה. נסו שוב.',
      };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.email.trim() || !form.company.trim() || !form.issueType) {
      setError(t.required);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError(t.invalidEmail);
      return;
    }
    setSubmitting(true);
    try {
      try { track('support_form_submitted', { account_id: accountId, issue_type: form.issueType }); } catch { /* */ }
      const message = [
        `Support ticket from ${form.name}`,
        `Email: ${form.email}`,
        `Company: ${form.company}`,
        `Issue type: ${form.issueType}`,
        form.subject ? `Subject: ${form.subject}` : null,
        form.description ? `\n${form.description}` : null,
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
          metadata: {
            source: 'support_ticket',
            email: form.email,
            issue_type: form.issueType,
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
        {/* Section: Your details */}
        <SectionCard brandColor={brandColor} icon={<User className="w-4 h-4" />} title={t.sectionAbout}>
          <Field label={t.name} value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoComplete="name" brandColor={brandColor} />
          <Field label={t.email} value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" autoComplete="email" brandColor={brandColor} />
          <Field label={t.company} value={form.company} onChange={(v) => setForm({ ...form, company: v })} autoComplete="organization" brandColor={brandColor} />
        </SectionCard>

        {/* Section: Issue type picker */}
        <SectionCard brandColor={brandColor} icon={<AlertCircle className="w-4 h-4" />} title={t.sectionIssue}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {issues.map(({ id, label, icon: Icon }) => {
              const active = form.issueType === id;
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => setForm({ ...form, issueType: id })}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition"
                  style={
                    active
                      ? { background: brandColor, borderColor: brandColor, color: '#fff' }
                      : { background: '#fff', borderColor: '#e5e7eb', color: '#374151' }
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* Section: Describe */}
        <SectionCard brandColor={brandColor} icon={<Bug className="w-4 h-4" />} title={t.sectionDescribe}>
          <Field label={t.subject} value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} brandColor={brandColor} />
          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1.5">{t.description}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={5}
              placeholder={t.descriptionPlaceholder}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 resize-none"
            />
          </div>
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
