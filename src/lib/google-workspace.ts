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

  const folderId = (opts.folderId || process.env.GOOGLE_DRIVE_LEADS_FOLDER_ID || '').trim();
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

    const credentials = JSON.parse(raw.trim());
    // Strip ALL whitespace from env-derived emails. Vercel UI sometimes
    // preserves trailing newlines, and even .trim() can miss embedded CR/LF.
    // Google Auth rejects "Invalid impersonation sub field" for any whitespace.
    const cleanEmail = (s: string) => s.replace(/[\s​‎‏﻿]+/g, '');
    const fromEmail = cleanEmail(
      opts.fromEmail ||
        process.env.GMAIL_SEND_FROM ||
        process.env.LEADS_EMAIL_TO ||
        'info@ldrsgroup.com'
    );
    if (!fromEmail) {
      console.error('[google-workspace] fromEmail empty after cleaning');
      return false;
    }

    // Use JWT with subject (impersonation) for Gmail
    const jwtClient = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: fromEmail, // impersonate this user (requires domain-wide delegation)
    });

    const gmail = google.gmail({ version: 'v1', auth: jwtClient });

    // Strip whitespace from recipient too — defensive
    const toEmail = cleanEmail(opts.to);

    // Build RFC 2822 message
    const messageParts = [
      `From: ${fromEmail}`,
      `To: ${toEmail}`,
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

  // Build contact info rows
  const contactRows: string[] = [];
  contactRows.push(`<tr><td style="padding:12px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;width:120px;">שם מלא</td><td style="padding:12px 16px;color:#111827;font-weight:600;font-size:15px;border-bottom:1px solid #f3f4f6;">${brief.fullName}</td></tr>`);
  if (brief.businessName) contactRows.push(`<tr><td style="padding:12px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">סוג עסק</td><td style="padding:12px 16px;color:#111827;font-weight:600;font-size:15px;border-bottom:1px solid #f3f4f6;">${brief.businessName}</td></tr>`);
  if (brief.email) contactRows.push(`<tr><td style="padding:12px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">אימייל</td><td style="padding:12px 16px;font-size:15px;border-bottom:1px solid #f3f4f6;"><a href="mailto:${brief.email}" style="color:#7C3AED;text-decoration:none;font-weight:600;">${brief.email}</a></td></tr>`);
  if (brief.phone) contactRows.push(`<tr><td style="padding:12px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">טלפון</td><td style="padding:12px 16px;font-size:15px;border-bottom:1px solid #f3f4f6;"><a href="tel:${brief.phone}" style="color:#7C3AED;text-decoration:none;font-weight:600;">${brief.phone}</a></td></tr>`);

  // Build brief detail rows
  const briefRows: string[] = [];
  briefRows.push(`<tr><td style="padding:12px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;width:120px;">שירות</td><td style="padding:12px 16px;color:#111827;font-weight:600;font-size:15px;border-bottom:1px solid #f3f4f6;">${brief.serviceName}</td></tr>`);
  if (brief.productDescription) briefRows.push(`<tr><td style="padding:12px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">תיאור</td><td style="padding:12px 16px;color:#111827;font-size:14px;border-bottom:1px solid #f3f4f6;">${brief.productDescription}</td></tr>`);
  if (brief.goal) briefRows.push(`<tr><td style="padding:12px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">מטרה</td><td style="padding:12px 16px;color:#111827;font-size:14px;border-bottom:1px solid #f3f4f6;">${brief.goal}</td></tr>`);
  if (brief.budgetRange) briefRows.push(`<tr><td style="padding:12px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">תקציב</td><td style="padding:12px 16px;color:#111827;font-weight:600;font-size:14px;border-bottom:1px solid #f3f4f6;">${brief.budgetRange}</td></tr>`);

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f5f3f0;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3f0;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.06);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#7C3AED,#5B21B6);padding:32px 32px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:8px;">ליד חדש</div>
          <div style="font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;">${brief.fullName}</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.7);margin-top:6px;">${brief.serviceName} &middot; ${date}</div>
        </td>
        <td width="60" align="left" valign="top">
          <div style="width:48px;height:48px;background:rgba(255,255,255,0.15);border-radius:12px;display:flex;align-items:center;justify-content:center;">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.2);text-align:center;line-height:48px;font-size:22px;color:#fff;font-weight:700;">${brief.fullName.charAt(0)}</div>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Status bar -->
  <tr><td style="background:#f9f7ff;padding:12px 32px;border-bottom:1px solid #ede9fe;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:12px;color:#7C3AED;font-weight:600;">
          <span style="display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;margin-left:6px;vertical-align:middle;"></span>
          חדש — ממתין לטיפול
        </td>
        <td align="left" style="font-size:12px;color:#9ca3af;">
          ${new Date().toLocaleDateString('he-IL', { weekday: 'long' })}
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Contact section -->
  <tr><td style="padding:28px 32px 8px;">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7C3AED;font-weight:700;margin-bottom:16px;">פרטי קשר</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border-radius:12px;overflow:hidden;border:1px solid #f3f4f6;">
      ${contactRows.join('\n      ')}
    </table>
  </td></tr>

  <!-- Brief details section -->
  ${briefRows.length > 1 ? `
  <tr><td style="padding:24px 32px 8px;">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7C3AED;font-weight:700;margin-bottom:16px;">פרטי הבריף</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border-radius:12px;overflow:hidden;border:1px solid #f3f4f6;">
      ${briefRows.join('\n      ')}
    </table>
  </td></tr>
  ` : ''}

  <!-- Notes section -->
  ${brief.notes ? `
  <tr><td style="padding:24px 32px 8px;">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#92400e;font-weight:700;margin-bottom:12px;">הערות</div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px;font-size:14px;color:#78350f;line-height:1.7;">
      ${brief.notes}
    </div>
  </td></tr>
  ` : ''}

  <!-- Quick actions hint -->
  <tr><td style="padding:24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;padding:16px;border:1px solid #f3f4f6;">
      <tr><td style="padding:16px;text-align:center;">
        ${brief.email ? `<a href="mailto:${brief.email}" style="display:inline-block;padding:10px 24px;background:#7C3AED;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;margin:0 4px;">שלחו מייל</a>` : ''}
        ${brief.phone ? `<a href="tel:${brief.phone}" style="display:inline-block;padding:10px 24px;background:#ffffff;color:#7C3AED;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #e5e7eb;margin:0 4px;">התקשרו</a>` : ''}
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 32px;border-top:1px solid #f3f4f6;text-align:center;">
    <span style="font-size:11px;color:#c4b5a3;">BestieAI &middot; LDRS Group &middot; ${new Date().getFullYear()}</span>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
