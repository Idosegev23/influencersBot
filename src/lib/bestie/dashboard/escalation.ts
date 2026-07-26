/**
 * A brand stuck inside the product.
 *
 * Email only — no ticket, no row, nothing written. That is what lets this whole
 * surface claim "no write path" with no exception to remember, which is a far
 * easier property to keep true than "no writes except one".
 *
 * Two recipients, not the lead funnel's five: a paying customer with a problem
 * is not a sales lead and must not land in that inbox.
 */

export const DASHBOARD_ESCALATION_RECIPIENTS = [
  'yoav@ldrsgroup.com',
  'cto@ldrsgroup.com',
];

export interface EscalationLine {
  role: string;
  text: string;
}

/** Written by the brand, so nothing goes in unescaped. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function transcriptHtml(transcript: EscalationLine[]): string {
  if (!transcript.length) return '<p style="color:#666">אין תמליל.</p>';
  return transcript
    .map(line => {
      const isBrand = line.role === 'user';
      const who = isBrand ? 'המותג' : 'בסטי';
      const bg = isBrand ? '#f3f4f6' : '#eef2ff';
      return (
        `<div style="margin:8px 0;padding:10px 12px;background:${bg};border-radius:8px">` +
        `<div style="font-size:12px;color:#666;margin-bottom:4px">${who}</div>` +
        `<div>${esc(line.text)}</div></div>`
      );
    })
    .join('');
}

export function buildDashboardEscalationEmail(p: {
  brandUsername: string;
  currentRoute: string | null;
  message: string;
  transcript: EscalationLine[];
}): { subject: string; html: string } {
  const subject = `מותג תקוע בדשבורד — ${p.brandUsername}`;

  const html = `
<div dir="rtl" style="font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 4px">מותג ביקש עזרה מהדשבורד</h2>
  <p style="margin:0 0 20px;color:#666">בסטי לא ידעה לעזור והפנתה אליכם.</p>

  <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
    <tr><td style="padding:6px 12px 6px 0;color:#666">מותג</td><td style="padding:6px 0"><strong>${esc(p.brandUsername)}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666">מסך</td><td style="padding:6px 0">${esc(p.currentRoute || '—')}</td></tr>
  </table>

  <h3 style="margin:0 0 8px;font-size:15px">מה הוא ביקש</h3>
  <p style="margin:0 0 20px;font-size:14px">${esc(p.message)}</p>

  <h3 style="margin:0 0 8px;font-size:15px">השיחה</h3>
  <div style="font-size:14px">${transcriptHtml(p.transcript)}</div>
</div>`.trim();

  return { subject, html };
}

export async function sendDashboardEscalation(p: {
  brandUsername: string;
  currentRoute: string | null;
  message: string;
  transcript: EscalationLine[];
}): Promise<{ success: boolean }> {
  // Lazy: @/lib/email reads env at module load.
  const { sendEmail } = await import('@/lib/email');
  const { subject, html } = buildDashboardEscalationEmail(p);
  const result = await sendEmail({ to: DASHBOARD_ESCALATION_RECIPIENTS, subject, html });
  return { success: Boolean(result?.success) };
}
