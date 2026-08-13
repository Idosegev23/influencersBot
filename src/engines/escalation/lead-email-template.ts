import type { LeadFields } from './lead-capture';

export interface LeadBriefEmailParts {
  brandName: string;
  contactLabel?: string | null; // "Full Name (@username)" from resolveSenderIdentity
  igUsername?: string | null;   // for the instagram.com profile link
  fields: LeadFields;
  briefType: 'full' | 'partial';
  lastMessages: { role: string; content: string }[];
  sessionId?: string | null;
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FIELD_LABELS: Record<keyof LeadFields, string> = {
  service: 'שירות מבוקש',
  brand: 'מותג / חברה',
  timeline: 'לוח זמנים',
  goal: 'מטרה',
  budget: 'תקציב',
  contact_name: 'שם איש קשר',
  contact_phone: 'טלפון',
  contact_email: 'אימייל',
  summary: 'סיכום',
};

export function buildLeadBriefEmail(p: LeadBriefEmailParts): { subject: string; html: string } {
  const partial = p.briefType === 'partial';
  const subject = partial
    ? `🟡 ליד מאינסטגרם (בריף חלקי) — ${p.brandName}`
    : `🟢 ליד חדש מאינסטגרם — ${p.brandName}`;
  const headColor = partial ? '#f59e0b' : '#16a34a';
  const headTitle = partial
    ? 'ליד שהתחיל שיחה ולא השלים — מה שנאסף עד כה'
    : 'ליד חדש נכנס בהודעות האינסטגרם';

  const rows = (Object.keys(FIELD_LABELS) as (keyof LeadFields)[])
    .filter((k) => k !== 'summary' && p.fields[k])
    .map(
      (k) =>
        `<tr><td style="padding:6px 10px;color:#6b7280;white-space:nowrap;">${FIELD_LABELS[k]}</td><td style="padding:6px 10px;color:#111;font-weight:600;">${esc(String(p.fields[k]))}</td></tr>`,
    )
    .join('');

  const profileLink = p.igUsername
    ? `<a href="https://instagram.com/${esc(p.igUsername)}" style="color:#4f46e5;">@${esc(p.igUsername)}</a>`
    : '';

  const history = (p.lastMessages || [])
    .map((m) => {
      const who = m.role === 'user' ? 'הפונה' : 'הבוט';
      return `<div style="margin:4px 0;"><b>${esc(who)}:</b> ${esc(m.content)}</div>`;
    })
    .join('');

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <div style="background:${headColor};color:#fff;padding:16px 24px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;font-size:18px;">${partial ? '🟡' : '🟢'} ${esc(headTitle)}</h2>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="font-size:15px;color:#111;"><b>הפונה:</b> ${esc(p.contactLabel || 'לא ידוע')} ${profileLink}</p>
        ${p.fields.summary ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin:12px 0;"><b style="color:#1d4ed8;">סיכום:</b><br/><span style="color:#111;line-height:1.6;">${esc(p.fields.summary)}</span></div>` : ''}
        ${rows ? `<table style="border-collapse:collapse;background:#f9fafb;border-radius:8px;width:100%;margin:12px 0;">${rows}</table>` : ''}
        ${partial ? `<p style="font-size:13px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;">השיחה נקטעה לפני שנאספו כל הפרטים — כדאי לחזור לפונה ישירות ב-DM.</p>` : ''}
        <div style="background:#f9fafb;border-radius:8px;padding:12px;margin-top:12px;">
          <b>השיחה האחרונה:</b>${history || '<div>—</div>'}
        </div>
        <p style="font-size:12px;color:#9ca3af;margin-top:16px;">מזהה שיחה: ${esc(p.sessionId || '—')} · BestieAI</p>
      </div>
    </div>
  `;

  return { subject, html };
}
