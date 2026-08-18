import type { LeadFields, LeadType, LeadChannel } from './lead-capture';

export interface LeadBriefEmailParts {
  brandName: string;
  contactLabel?: string | null; // "Full Name (@username)" from resolveSenderIdentity
  igUsername?: string | null;   // for the instagram.com profile link
  fields: LeadFields;
  leadType?: LeadType | null;
  channel?: LeadChannel;
  briefType: 'full' | 'partial' | 'updated';
  lastMessages: { role: string; content: string }[];
  sessionId?: string | null;
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FIELD_LABELS: Record<keyof LeadFields, string> = {
  // brand lane
  service: 'שירות מבוקש',
  brand: 'מותג / חברה',
  timeline: 'לוח זמנים',
  goal: 'מטרה',
  budget: 'תקציב',
  // talent lane
  niche: 'תחום התוכן',
  platforms: 'פלטפורמות',
  audience: 'גודל קהל',
  experience: 'ניסיון / שיתופי פעולה',
  // shared
  contact_name: 'שם איש קשר',
  contact_phone: 'טלפון',
  contact_email: 'אימייל',
  summary: 'סיכום',
};

const BRAND_FIELDS: (keyof LeadFields)[] = ['service', 'brand', 'timeline', 'goal', 'budget'];
const TALENT_FIELDS: (keyof LeadFields)[] = ['niche', 'platforms', 'audience', 'experience'];
const CONTACT_FIELDS: (keyof LeadFields)[] = ['contact_name', 'contact_phone', 'contact_email'];

/**
 * Field order follows the lane, so the reader sees the answers to the questions
 * their own funnel asks first. Fields from the other lane are still rendered
 * when present — a 'brand' verdict that happens to carry a follower count is
 * information, not noise, and dropping it would hide why the lane is arguable.
 */
function orderedFields(leadType: LeadType | null | undefined): (keyof LeadFields)[] {
  const lanes =
    leadType === 'talent'
      ? [...TALENT_FIELDS, ...BRAND_FIELDS]
      : [...BRAND_FIELDS, ...TALENT_FIELDS];
  return [...lanes, ...CONTACT_FIELDS];
}

const LEAD_TYPE_LABEL: Record<LeadType, string> = {
  brand: 'מותג / סוכנות',
  talent: 'משפיען / מועמד',
  both: 'מעורב — מותג וגם משפיען',
};

const LEAD_TYPE_COLOR: Record<LeadType, string> = {
  brand: '#4f46e5',
  talent: '#0d9488',
  both: '#a16207',
};

const CHANNEL_LABEL: Record<LeadChannel, string> = {
  dm: 'מהודעות האינסטגרם',
  chat: 'מדף הצ׳אט',
  widget: 'מהווידג׳ט באתר',
};

export function buildLeadBriefEmail(p: LeadBriefEmailParts): { subject: string; html: string } {
  const partial = p.briefType === 'partial';
  const updated = p.briefType === 'updated';
  const channel: LeadChannel = p.channel || 'dm';
  const channelLabel = CHANNEL_LABEL[channel] || CHANNEL_LABEL.dm;
  // The lane belongs in the subject: these briefs land in three different
  // inboxes and the reader needs to know at a glance whether this one is theirs.
  const typeTag = p.leadType ? ` (${LEAD_TYPE_LABEL[p.leadType]})` : '';

  const subject = partial
    ? `🟡 ליד ${channelLabel}${typeTag} — בריף חלקי — ${p.brandName}`
    : updated
      ? `🔵 עדכון ליד ${channelLabel}${typeTag} — ${p.brandName}`
      : `🟢 ליד חדש ${channelLabel}${typeTag} — ${p.brandName}`;

  const headColor = partial ? '#f59e0b' : updated ? '#2563eb' : '#16a34a';
  const headIcon = partial ? '🟡' : updated ? '🔵' : '🟢';
  const headTitle = partial
    ? `ליד שהתחיל שיחה ולא השלים — מה שנאסף עד כה`
    : updated
      ? 'הליד המשיך לשוחח אחרי הבריף — פרטים חדשים נוספו'
      : `ליד חדש נכנס ${channelLabel}`;

  const rows = orderedFields(p.leadType)
    .filter((k) => p.fields[k])
    .map(
      (k) =>
        `<tr><td style="padding:6px 10px;color:#6b7280;white-space:nowrap;">${FIELD_LABELS[k]}</td><td style="padding:6px 10px;color:#111;font-weight:600;">${esc(String(p.fields[k]))}</td></tr>`,
    )
    .join('');

  const typeBadge = p.leadType
    ? `<span style="display:inline-block;background:${LEAD_TYPE_COLOR[p.leadType]};color:#fff;border-radius:999px;padding:3px 12px;font-size:12px;font-weight:700;">${esc(LEAD_TYPE_LABEL[p.leadType])}</span>`
    : `<span style="display:inline-block;background:#6b7280;color:#fff;border-radius:999px;padding:3px 12px;font-size:12px;font-weight:700;">סוג הליד לא זוהה</span>`;

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
        <h2 style="margin:0;font-size:18px;">${headIcon} ${esc(headTitle)}</h2>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 12px;">${typeBadge}</p>
        <p style="font-size:15px;color:#111;"><b>הפונה:</b> ${esc(p.contactLabel || 'לא ידוע')} ${profileLink}</p>
        ${p.fields.summary ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin:12px 0;"><b style="color:#1d4ed8;">סיכום:</b><br/><span style="color:#111;line-height:1.6;">${esc(p.fields.summary)}</span></div>` : ''}
        ${rows ? `<table style="border-collapse:collapse;background:#f9fafb;border-radius:8px;width:100%;margin:12px 0;">${rows}</table>` : ''}
        ${partial ? `<p style="font-size:13px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;">השיחה נקטעה לפני שנאספו כל הפרטים — כדאי לחזור לפונה ישירות.</p>` : ''}
        <div style="background:#f9fafb;border-radius:8px;padding:12px;margin-top:12px;">
          <b>השיחה האחרונה:</b>${history || '<div>—</div>'}
        </div>
        <p style="font-size:12px;color:#9ca3af;margin-top:16px;">מזהה שיחה: ${esc(p.sessionId || '—')} · BestieAI</p>
      </div>
    </div>
  `;

  return { subject, html };
}
