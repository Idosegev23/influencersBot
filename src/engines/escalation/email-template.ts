export interface EscalationEmailParts {
  brandName: string;
  reason: string;
  severity: 'critical' | 'high';
  customerName?: string | null;
  customerPhone?: string | null;
  userMessage: string;
  lastMessages: { role: string; content: string }[];
  imageUrl?: string | null; // durable URL of a photo the shopper sent — embedded as evidence
  sessionId?: string | null;
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildEscalationEmail(p: EscalationEmailParts): { subject: string; html: string } {
  const sevLabel = p.severity === 'critical' ? 'קריטי' : 'דחוף';
  const sevColor = p.severity === 'critical' ? '#ef4444' : '#f59e0b';
  const phone = p.customerPhone || 'לא ידוע';
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
        <p style="font-size:15px;color:#111;"><b>לקוח/ה:</b> ${esc(name)} · <b>טלפון:</b> ${esc(phone)}</p>
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
