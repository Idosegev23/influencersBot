/**
 * Google Workspace Integration — Drive + Gmail
 * Uses service account (ldrsagent@ldrsgroup-484815) for server-side operations.
 * Same pattern as pptmaker project.
 */

import { google } from 'googleapis';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function getServiceAccountAuth(scopes: string[]) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes,
  });
}

// ---------------------------------------------------------------------------
// Google Drive — upload brief as Google Doc to "לידים חדשים" folder
// ---------------------------------------------------------------------------

export async function uploadBriefToDrive(opts: {
  title: string;
  htmlBody: string;
  folderId?: string;
}): Promise<{ fileId: string; webViewLink: string }> {
  const auth = getServiceAccountAuth(['https://www.googleapis.com/auth/drive']);
  const drive = google.drive({ version: 'v3', auth });

  const folderId = opts.folderId || process.env.GOOGLE_DRIVE_LEADS_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_LEADS_FOLDER_ID not configured');

  const { Readable } = await import('stream');
  const stream = new Readable();
  stream.push(opts.htmlBody);
  stream.push(null);

  const res = await drive.files.create({
    requestBody: {
      name: opts.title,
      parents: [folderId],
      mimeType: 'application/vnd.google-apps.document', // auto-convert HTML → Google Doc
    },
    media: {
      mimeType: 'text/html',
      body: stream,
    },
    supportsAllDrives: true,
    fields: 'id, webViewLink',
  });

  // Make viewable via link
  await drive.permissions.create({
    fileId: res.data.id!,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  });

  return {
    fileId: res.data.id!,
    webViewLink: res.data.webViewLink!,
  };
}

// ---------------------------------------------------------------------------
// Gmail — send brief notification via service account impersonation
// Requires domain-wide delegation for the service account.
// Fallback: if delegation not set up, we skip email silently.
// ---------------------------------------------------------------------------

export async function sendBriefEmail(opts: {
  to: string;
  subject: string;
  htmlBody: string;
  fromEmail?: string;
}): Promise<boolean> {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!raw) return false;

    const credentials = JSON.parse(raw);
    const fromEmail = opts.fromEmail || process.env.LEADS_EMAIL_TO || 'info@ldrsgroup.com';

    // Use JWT with subject (impersonation) for Gmail
    const jwtClient = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: fromEmail, // impersonate this user (requires domain-wide delegation)
    });

    const gmail = google.gmail({ version: 'v1', auth: jwtClient });

    // Build RFC 2822 message
    const messageParts = [
      `From: ${fromEmail}`,
      `To: ${opts.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      opts.htmlBody,
    ];

    const rawMessage = Buffer.from(messageParts.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMessage },
    });

    return true;
  } catch (err) {
    console.error('[google-workspace] Gmail send failed (domain-wide delegation may not be configured):', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Brief HTML Builder — generates a nice HTML for both email and Drive doc
// ---------------------------------------------------------------------------

export function buildBriefHtml(brief: {
  fullName: string;
  businessName?: string;
  email?: string;
  phone?: string;
  serviceName: string;
  productDescription?: string;
  goal?: string;
  budgetRange?: string;
  notes?: string;
  createdAt?: string;
}): string {
  const date = brief.createdAt
    ? new Date(brief.createdAt).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; direction: rtl; }
  .header { background: linear-gradient(135deg, #9334EB, #6B21A8); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 4px 0; font-size: 22px; }
  .header p { margin: 0; opacity: 0.85; font-size: 14px; }
  .section { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 16px; }
  .section h3 { margin: 0 0 12px 0; color: #6B21A8; font-size: 15px; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
  .row:last-child { border-bottom: none; }
  .label { color: #6b7280; font-size: 13px; }
  .value { color: #111827; font-weight: 600; font-size: 14px; }
  .notes { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-top: 16px; }
  .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px; }
</style></head>
<body>
  <div class="header">
    <h1>📋 ליד חדש — ${brief.serviceName}</h1>
    <p>${date}</p>
  </div>

  <div class="section">
    <h3>👤 פרטי הלקוח</h3>
    <div class="row"><span class="label">שם מלא</span><span class="value">${brief.fullName}</span></div>
    ${brief.businessName ? `<div class="row"><span class="label">שם העסק</span><span class="value">${brief.businessName}</span></div>` : ''}
    ${brief.email ? `<div class="row"><span class="label">אימייל</span><span class="value">${brief.email}</span></div>` : ''}
    ${brief.phone ? `<div class="row"><span class="label">טלפון</span><span class="value">${brief.phone}</span></div>` : ''}
  </div>

  <div class="section">
    <h3>📌 פרטי הבריף</h3>
    <div class="row"><span class="label">שירות מבוקש</span><span class="value">${brief.serviceName}</span></div>
    ${brief.productDescription ? `<div class="row"><span class="label">תיאור המוצר/שירות</span><span class="value">${brief.productDescription}</span></div>` : ''}
    ${brief.goal ? `<div class="row"><span class="label">מטרה</span><span class="value">${brief.goal}</span></div>` : ''}
    ${brief.budgetRange ? `<div class="row"><span class="label">תקציב</span><span class="value">${brief.budgetRange}</span></div>` : ''}
  </div>

  ${brief.notes ? `<div class="notes"><strong>הערות נוספות:</strong><br/>${brief.notes}</div>` : ''}

  <div class="footer">נוצר אוטומטית על ידי מערכת LDRS Bot</div>
</body>
</html>`;
}
