/**
 * The moment a lead becomes a person's job.
 *
 * One email, five recipients, carrying everything needed to pick up the
 * conversation without asking the lead to repeat themselves: who they are, how
 * to reach them, what we learned, and the whole transcript.
 *
 * Recipients are pinned in code rather than read from env. Leads are the point
 * of the funnel; a stray environment variable must not be able to redirect them
 * somewhere nobody is watching.
 */

export const SALES_RECIPIENTS = [
  'kfir@ldrsgroup.com',
  'roei@ldrsgroup.com',
  'itamar@ldrsgroup.com',
  'cto@ldrsgroup.com',
  'yoav@ldrsgroup.com',
];

export interface TranscriptLine {
  role: string;
  text: string;
}

/** Everything below is written by a stranger, so nothing goes in unescaped. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function qualificationRows(qualification: Record<string, unknown> | null | undefined): string {
  const entries = Object.entries(qualification ?? {});
  if (!entries.length) {
    return '<tr><td colspan="2" style="padding:6px 0;color:#666">לא נאסף מידע נוסף</td></tr>';
  }
  return entries
    .map(
      ([key, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap">${esc(key)}</td>` +
        `<td style="padding:6px 0"><strong>${esc(value)}</strong></td></tr>`
    )
    .join('');
}

function transcriptHtml(transcript: TranscriptLine[]): string {
  if (!transcript.length) {
    return '<p style="color:#666">אין תמליל להצגה.</p>';
  }
  return transcript
    .map(line => {
      const isLead = line.role === 'user';
      const who = isLead ? 'הליד' : 'בסטי';
      const bg = isLead ? '#f3f4f6' : '#eef2ff';
      return (
        `<div style="margin:8px 0;padding:10px 12px;background:${bg};border-radius:8px">` +
        `<div style="font-size:12px;color:#666;margin-bottom:4px">${who}</div>` +
        `<div>${esc(line.text)}</div></div>`
      );
    })
    .join('');
}

export function buildHandoffEmail(p: {
  lead: Record<string, any>;
  summary: string;
  transcript: TranscriptLine[];
}): { subject: string; html: string } {
  const name = p.lead?.full_name || 'ליד ללא שם';
  const waId = String(p.lead?.wa_id ?? '');

  const subject = `ליד חם מבסטי — ${name} (${waId})`;

  const html = `
<div dir="rtl" style="font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 4px">ליד חם מבסטי</h2>
  <p style="margin:0 0 20px;color:#666">הבוט סיים להכשיר את הליד והפסיק לענות בשיחה הזו.</p>

  <h3 style="margin:0 0 8px;font-size:15px">פרטי הליד</h3>
  <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
    <tr><td style="padding:6px 12px 6px 0;color:#666">שם</td><td style="padding:6px 0"><strong>${esc(name)}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666">טלפון</td><td style="padding:6px 0"><strong>${esc(waId)}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666">אימייל</td><td style="padding:6px 0">${esc(p.lead?.email || '—')}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666">קמפיין</td><td style="padding:6px 0">${esc(p.lead?.campaign_id || '—')}</td></tr>
  </table>

  <a href="https://wa.me/${esc(waId)}"
     style="display:inline-block;padding:10px 18px;background:#25D366;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin-bottom:24px">
    פתח שיחה בוואטסאפ
  </a>

  <h3 style="margin:0 0 8px;font-size:15px">סיכום</h3>
  <p style="margin:0 0 20px;font-size:14px">${esc(p.summary) || '<span style="color:#666">אין סיכום</span>'}</p>

  <h3 style="margin:0 0 8px;font-size:15px">מה נלמד</h3>
  <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
    ${qualificationRows(p.lead?.qualification)}
  </table>

  <h3 style="margin:0 0 8px;font-size:15px">תמליל מלא</h3>
  <div style="font-size:14px">${transcriptHtml(p.transcript)}</div>
</div>`.trim();

  return { subject, html };
}

export async function sendHandoffEmail(p: {
  lead: Record<string, any>;
  summary: string;
  transcript: TranscriptLine[];
}): Promise<{ success: boolean }> {
  // Lazy: @/lib/email reads env at module load.
  const { sendEmail } = await import('@/lib/email');
  const { subject, html } = buildHandoffEmail(p);
  const result = await sendEmail({ to: SALES_RECIPIENTS, subject, html });
  return { success: Boolean(result?.success) };
}
