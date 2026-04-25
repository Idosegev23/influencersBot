/**
 * LDRS Conference Lead — branded HTML email template.
 * Sent to the lead owner (Roi by default) when a visitor submits the
 * conference popup or brief form.
 *
 * Design tokens match the LDRS brand: deep navy + cyan accent + chrome
 * highlight (mirrors Itamar's deck). Mobile-first table layout, RTL
 * Hebrew, inline styles only (mail clients don't run external CSS).
 */

interface ConferenceLeadEmailInput {
  fullName: string;
  phone: string;
  email?: string | null;
  companyName?: string | null;
  role?: string | null;
  preferredProduct?: string | null;
  primaryArea?: string | null;
  currentAiUsage?: string | null;
  painPoint?: string | null;
  readiness?: string | null;
  lastUserMessage?: string | null;
  botSummary?: string | null;
  chatUrl?: string | null;
  createdAt?: string;
}

const PRIMARY_AREA_LABELS: Record<string, string> = {
  implementation: 'הטמעת AI בארגון',
  voice_agent: 'סוכן קולי (NewVoices)',
  automations: 'אוטומציות מותאמות',
  influencer_ai: 'פלטפורמת IMAI',
  consulting: 'ייעוץ / לא בטוח עדיין',
};

function escape(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function row(label: string, value: string, opts: { link?: string; isLast?: boolean } = {}): string {
  const borderTop = opts.isLast ? '' : 'border-bottom:1px solid #f0f3f7;';
  const valueHtml = opts.link
    ? `<a href="${escape(opts.link)}" style="color:#0c1013;text-decoration:none;font-weight:600;">${escape(value)}</a>`
    : escape(value);
  return `
    <tr>
      <td style="padding:12px 0;color:#7a8794;font-size:13px;font-weight:500;width:120px;vertical-align:top;${borderTop}">${escape(label)}</td>
      <td style="padding:12px 0;color:#0c1013;font-size:14px;line-height:1.5;${borderTop}">${valueHtml}</td>
    </tr>`;
}

function section(title: string, body: string): string {
  return `
    <div style="margin-top:24px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#7a8794;margin-bottom:10px;padding-right:4px;">${escape(title)}</div>
      <div style="background-color:#fafbfc;border:1px solid #eef1f5;border-radius:16px;padding:18px 22px;">
        ${body}
      </div>
    </div>`;
}

export function buildConferenceLeadEmail(lead: ConferenceLeadEmailInput): {
  subject: string;
  html: string;
} {
  const displayProduct = lead.preferredProduct || 'לא צוין';
  const subject = `🎯 ליד מהכנס: ${lead.fullName}${lead.preferredProduct ? ` — ${lead.preferredProduct}` : ''}`;
  const dateLabel = formatDate(lead.createdAt);

  // Contact rows
  const contactRows: string[] = [
    row('שם מלא', lead.fullName),
    row('טלפון', lead.phone, { link: `tel:${lead.phone.replace(/[^\d+]/g, '')}` }),
  ];
  if (lead.email) contactRows.push(row('מייל', lead.email, { link: `mailto:${lead.email}` }));
  if (lead.companyName) contactRows.push(row('חברה', lead.companyName));
  if (lead.role) contactRows.push(row('תפקיד', lead.role));
  // Mark last row
  if (contactRows.length > 0) {
    contactRows[contactRows.length - 1] = contactRows[contactRows.length - 1].replace(
      'border-bottom:1px solid #f0f3f7;',
      ''
    );
  }
  const contactBody = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${contactRows.join('')}</table>`;

  // Interest rows
  const interestRows: string[] = [];
  if (lead.preferredProduct) interestRows.push(row('שירות מבוקש', lead.preferredProduct));
  if (lead.primaryArea) {
    const areaLabel = PRIMARY_AREA_LABELS[lead.primaryArea] || lead.primaryArea;
    interestRows.push(row('תחום עניין', areaLabel));
  }
  if (lead.currentAiUsage) interestRows.push(row('שימוש ב-AI היום', lead.currentAiUsage));
  if (lead.painPoint) interestRows.push(row('כאב / צורך', lead.painPoint));
  if (lead.readiness) interestRows.push(row('מוכנות / טווח זמן', lead.readiness));
  if (interestRows.length > 0) {
    interestRows[interestRows.length - 1] = interestRows[interestRows.length - 1].replace(
      'border-bottom:1px solid #f0f3f7;',
      ''
    );
  }
  const interestBody = interestRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${interestRows.join('')}</table>`
    : `<div style="color:#7a8794;font-size:14px;">המבקר לא בחר תחום ספציפי בפופאפ.</div>`;

  // Conversation context
  const convoParts: string[] = [];
  if (lead.botSummary) {
    convoParts.push(`
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;color:#7a8794;font-weight:600;margin-bottom:6px;">סיכום השיחה לפי הבוט</div>
        <div style="font-size:14px;color:#0c1013;line-height:1.6;">${escape(lead.botSummary)}</div>
      </div>
    `);
  }
  if (lead.lastUserMessage) {
    convoParts.push(`
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;color:#7a8794;font-weight:600;margin-bottom:6px;">הודעה אחרונה של המבקר</div>
        <div style="font-size:14px;color:#0c1013;line-height:1.6;background-color:#ffffff;border-right:3px solid #5FD4F5;border-radius:8px;padding:10px 14px;">"${escape(lead.lastUserMessage)}"</div>
      </div>
    `);
  }
  if (lead.chatUrl) {
    convoParts.push(`
      <div>
        <a href="${escape(lead.chatUrl)}" style="display:inline-block;color:#5FD4F5;text-decoration:none;font-size:13px;font-weight:600;">פתח את השיחה המלאה ←</a>
      </div>
    `);
  }
  const convoBody = convoParts.length
    ? convoParts.join('')
    : `<div style="color:#7a8794;font-size:14px;">השיחה התחילה אבל לא נשמר סיכום מלא.</div>`;

  const phoneClean = lead.phone.replace(/[^\d+]/g, '');

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Heebo',Arial,sans-serif;color:#0c1013;direction:rtl;">

<!-- preheader -->
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#eef1f5;">ליד חדש מ${escape(lead.fullName)} בכנס החדשנות של איגוד השיווק — ${escape(displayProduct)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f5;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(12,16,19,0.08);">

        <!-- Hero -->
        <tr>
          <td style="padding:36px 32px 28px 32px;background:linear-gradient(135deg,#0c1013 0%,#1a2030 70%,#243454 100%);color:#ffffff;text-align:right;position:relative;">
            <div style="font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#5FD4F5;margin-bottom:10px;">
              <span style="display:inline-block;width:6px;height:6px;background-color:#5FD4F5;border-radius:50%;vertical-align:middle;margin-left:8px;"></span>LEADERS · CONFERENCE LEAD
            </div>
            <h1 style="margin:0;font-size:24px;font-weight:800;line-height:1.3;color:#ffffff;">ליד חדש מהכנס</h1>
            <div style="font-size:14px;color:#9BA8C4;margin-top:10px;line-height:1.5;">
              ${escape(lead.fullName)}${lead.companyName ? ` · ${escape(lead.companyName)}` : ''}<br>
              <span style="color:#5FD4F5;font-weight:600;">${escape(displayProduct)}</span>
            </div>
          </td>
        </tr>

        <!-- CTA top: phone -->
        <tr>
          <td style="padding:0 32px;background-color:#ffffff;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:-18px;background-color:#ffffff;border:1px solid #eef1f5;border-radius:16px;box-shadow:0 8px 24px rgba(12,16,19,0.06);">
              <tr>
                <td style="padding:14px 18px;" align="right">
                  <a href="tel:${escape(phoneClean)}" style="display:inline-block;padding:12px 28px;background-color:#0c1013;color:#ffffff;text-decoration:none;border-radius:50px;font-weight:700;font-size:14px;">📞 התקשר עכשיו</a>
                  <span style="display:inline-block;margin-right:12px;color:#7a8794;font-size:13px;direction:ltr;">${escape(lead.phone)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:8px 32px 32px 32px;background-color:#ffffff;">
            ${section('איש קשר', contactBody)}
            ${section('תחומי עניין', interestBody)}
            ${section('הקשר השיחה', convoBody)}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background-color:#fafbfc;border-top:1px solid #eef1f5;text-align:right;">
            <div style="font-size:12px;color:#7a8794;line-height:1.6;">
              נשלח אוטומטית מ-Bestie של LDRS · ${escape(dateLabel)}<br>
              <strong style="color:#0c1013;">כנס החדשנות של איגוד השיווק הישראלי · 30.4.2026</strong><br>
              "AI — להיות או לא להיות" · איתמר גונשרוביץ
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;

  return { subject, html };
}
