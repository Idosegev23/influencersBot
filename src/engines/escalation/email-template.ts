import { realPhoneOrNull, realEmailOrNull, waMeNumber } from '@/lib/support/contact';

export interface EscalationEmailParts {
  brandName: string;
  reason: string;
  severity: 'critical' | 'high';
  customerName?: string | null;
  customerPhone?: string | null;
  // The email half. This mail IS the escalation for whoever reads it — leaving the address out
  // meant a shopper who gave only an address showed up as "טלפון: לא ידוע", i.e. unreachable.
  customerEmail?: string | null;
  userMessage: string;
  summary?: string | null;  // AI executive summary (סיכום מנהלים) of the whole conversation
  lastMessages: { role: string; content: string }[];
  imageUrl?: string | null; // durable URL of a photo the shopper sent — embedded as evidence
  sessionId?: string | null;
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * "How do I answer this person?" — the first question whoever opens this mail has, so it is
 * answered at the top, in actionable form: a tappable WhatsApp/phone link, a mailto, or a plain
 * statement that there is no way back at all. A stored-but-undialable value is shown struck
 * through rather than hidden — "junk value" is not the same as "never given" — and the whole
 * block mirrors the ticket panel so the mail and the dashboard never disagree.
 */
function contactBlock(p: EscalationEmailParts, name: string): string {
  const phone = realPhoneOrNull(p.customerPhone);
  const email = realEmailOrNull(p.customerEmail);
  const wa = waMeNumber(p.customerPhone);
  const rows: string[] = [`<b>לקוח/ה:</b> ${esc(name)}`];

  if (phone && wa) {
    rows.push(`<b>טלפון:</b> <a href="https://wa.me/${esc(wa)}" style="color:#16a34a;">${esc(phone)} (WhatsApp)</a> · <a href="tel:${esc(phone)}" style="color:#2563eb;">חיוג</a>`);
  } else if (p.customerPhone) {
    rows.push(`<b>טלפון:</b> <span style="text-decoration:line-through;opacity:.7;">${esc(p.customerPhone)}</span> <span style="color:#b45309;">— המספר שנשמר אינו תקין ואי אפשר לשלוח אליו</span>`);
  }
  if (email) rows.push(`<b>מייל:</b> <a href="mailto:${esc(email)}" style="color:#2563eb;">${esc(email)}</a>`);

  const reachable = !!(phone && wa) || !!email;
  const body = rows.map((r) => `<div style="margin:3px 0;">${r}</div>`).join('');
  if (reachable) {
    return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin:12px 0;font-size:15px;color:#111;">${body}</div>`;
  }
  return `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin:12px 0;font-size:15px;color:#111;">${body}
      <div style="margin-top:6px;color:#b45309;"><b>אין שום דרך ליצור קשר עם הלקוח/ה — לא נמסרו טלפון ולא מייל.</b></div>
      <div style="margin-top:4px;font-size:13px;color:#78716c;">הפנייה הגיעה מצ'אט באתר, שם הלקוח/ה אנונימי/ת. אפשר להשיב רק אם היא תחזור לשיחה${p.sessionId ? ` (מזהה שיחה: <span dir="ltr">${esc(p.sessionId)}</span>)` : ''}.</div>
    </div>`;
}

export function buildEscalationEmail(p: EscalationEmailParts): { subject: string; html: string } {
  const sevLabel = p.severity === 'critical' ? 'קריטי' : 'דחוף';
  const sevColor = p.severity === 'critical' ? '#ef4444' : '#f59e0b';
  const name = p.customerName || 'לקוח/ה';
  const subject = `🚨 אסקלציה (${sevLabel}) — ${p.brandName}`;

  const history = (p.lastMessages || [])
    .map((m) => {
      const who = m.role === 'user' ? 'לקוח/ה' : 'בוט';
      return `<div style="margin:4px 0;"><b>${esc(who)}:</b> ${esc(m.content)}</div>`;
    })
    .join('');

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <div style="background:${sevColor};color:#fff;padding:16px 24px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;font-size:18px;">🚨 פנייה דחופה — ${esc(p.brandName)}</h2>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="font-size:16px;color:#111;"><b>סיבת האסקלציה:</b> ${esc(p.reason)}</p>
        ${contactBlock(p, name)}
        ${p.summary ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin:12px 0;"><b style="color:#1d4ed8;">סיכום מנהלים:</b><br/><span style="color:#111;line-height:1.6;">${esc(p.summary)}</span></div>` : ''}
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:12px 0;">
          <b>ההודעה שהפעילה את ההתראה:</b><br/>${esc(p.userMessage)}
        </div>
        <div style="background:#f9fafb;border-radius:8px;padding:12px;">
          <b>הקשר אחרון:</b>${history || '<div>—</div>'}
        </div>
        ${p.imageUrl ? `<div style="margin-top:12px;"><b>תמונה שצירף/ה הלקוח/ה:</b><br/><a href="${esc(p.imageUrl)}"><img src="${esc(p.imageUrl)}" alt="תמונה מהלקוח" style="max-width:100%;border-radius:8px;margin-top:6px;border:1px solid #e5e7eb;"/></a></div>` : ''}
        <p style="font-size:12px;color:#9ca3af;margin-top:16px;">מזהה שיחה: ${esc(p.sessionId || '—')} · BestieAI</p>
      </div>
    </div>
  `;

  return { subject, html };
}
