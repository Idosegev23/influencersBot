/**
 * LDRS Conference Lead — confirmation email sent BACK to the lead.
 * Triggered after a visitor submits the conference popup or brief form,
 * letting them know we received their details and will be in touch.
 *
 * Same brand tokens as the internal lead notification: navy gradient
 * hero + cyan accents + chrome highlight, mobile-first table layout,
 * RTL Hebrew, inline styles only.
 */

interface ConfirmationEmailInput {
  fullName: string;
  preferredProduct?: string | null;
  phone?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
}

function escape(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildConferenceLeadConfirmationEmail(input: ConfirmationEmailInput): {
  subject: string;
  html: string;
} {
  const firstName = (input.fullName || '').trim().split(/\s+/)[0] || input.fullName || '';
  const ownerName = input.ownerName || 'רועי';
  const ownerEmail = input.ownerEmail || 'roi@ldrsgroup.com';
  const subject = `🙌 קיבלנו את הפרטים שלך — נחזור אליך בהקדם`;
  const productLine = input.preferredProduct
    ? `סימנת עניין ב<strong style="color:#0c1013;">${escape(input.preferredProduct)}</strong> — נביא אותו ${escape(ownerName)} בהקשר הזה.`
    : '';

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Heebo',Arial,sans-serif;color:#0c1013;direction:rtl;">

<!-- preheader -->
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#eef1f5;">
תודה ${escape(firstName)}! קיבלנו את הפרטים שלך מהכנס וניצור קשר בימים הקרובים.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f5;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(12,16,19,0.08);">

        <!-- Hero -->
        <tr>
          <td style="padding:40px 32px 32px 32px;background:linear-gradient(135deg,#0c1013 0%,#1a2030 70%,#243454 100%);color:#ffffff;text-align:right;">
            <div style="font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#5FD4F5;margin-bottom:12px;">
              <span style="display:inline-block;width:6px;height:6px;background-color:#5FD4F5;border-radius:50%;vertical-align:middle;margin-left:8px;"></span>LEADERS · POWERED BY PEOPLE
            </div>
            <h1 style="margin:0;font-size:26px;font-weight:800;line-height:1.3;color:#ffffff;">
              היי ${escape(firstName)}, קיבלנו את הפרטים 🙌
            </h1>
            <div style="font-size:14px;color:#9BA8C4;margin-top:12px;line-height:1.6;">
              תודה שעצרת אצלנו בכנס החדשנות של איגוד השיווק הישראלי.<br>
              <span style="color:#5FD4F5;font-weight:600;">"AI — להיות או לא להיות"</span> · איתמר גונשרוביץ
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;background-color:#ffffff;text-align:right;">
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:#0c1013;">
              ${productLine ? productLine + '<br><br>' : ''}
              ${escape(ownerName)} מצוות LDRS יחזור אליך תוך <strong>יום-יומיים עסקים</strong> כדי לקבוע שיחת היכרות קצרה — נבין מה נכון לארגון שלך, ונראה אם ואיך אנחנו יכולים לעזור.
            </p>

            <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#5a6573;">
              בינתיים אם אתה רוצה לקפוץ אליו ישירות — הוא זמין במייל:
              <a href="mailto:${escape(ownerEmail)}" style="color:#0c1013;text-decoration:none;font-weight:600;">${escape(ownerEmail)}</a>
            </p>

            <!-- Highlights card -->
            <div style="background-color:#fafbfc;border:1px solid #eef1f5;border-radius:16px;padding:20px 22px;margin-bottom:8px;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#7a8794;margin-bottom:12px;">
                מה זה LDRS?
              </div>
              <div style="font-size:14px;color:#0c1013;line-height:1.7;">
                סוכנות ה-AI ושיווק של איתמר גונשרוביץ — בונים סוכנים קוליים (NewVoices), מטמיעים AI בארגונים, ומפעילים שיווק משפיענים על פלטפורמת IMAI. מותגים שעובדים איתנו: Estée Lauder, Lenovo, Playtika, Lumenis, Argania, Seacret ועוד.
              </div>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px;background-color:#fafbfc;border-top:1px solid #eef1f5;text-align:right;">
            <div style="font-size:12px;color:#7a8794;line-height:1.7;">
              <strong style="color:#0c1013;">LDRS Group</strong> · powered by people<br>
              <a href="https://ldrsgroup.com" style="color:#5FD4F5;text-decoration:none;font-weight:600;">ldrsgroup.com</a> ·
              <a href="mailto:${escape(ownerEmail)}" style="color:#5FD4F5;text-decoration:none;font-weight:600;">${escape(ownerEmail)}</a>
            </div>
          </td>
        </tr>

      </table>

      <div style="font-size:11px;color:#9aa3b0;margin-top:16px;line-height:1.5;text-align:center;">
        מייל אישור אוטומטי על השארת פרטים בכנס החדשנות 30.4.2026.<br>
        אם השארת פרטים בטעות — אפשר להשיב למייל הזה.
      </div>
    </td>
  </tr>
</table>

</body>
</html>`;

  return { subject, html };
}
