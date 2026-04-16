/**
 * ============================================
 * Email Service — Gmail API + Service Account
 * ============================================
 *
 * Sends emails via Gmail API using a Google Workspace
 * Service Account with domain-wide delegation.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_KEY — full JSON key from Google Cloud Console
 *   GMAIL_SEND_FROM — the workspace email to send from (e.g. bestie@ldrsgroup.com)
 */

import { google } from 'googleapis';

// ── Config ──

const SEND_FROM = process.env.GMAIL_SEND_FROM;

function getServiceAccountCredentials(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.client_email && parsed.private_key) return parsed;
    return null;
  } catch {
    return null;
  }
}

function isConfigured(): boolean {
  return !!(getServiceAccountCredentials() && SEND_FROM);
}

// ── Auth ──

function getAuthClient() {
  const creds = getServiceAccountCredentials();
  if (!creds || !SEND_FROM) {
    throw new Error('Gmail API not configured. Check GOOGLE_SERVICE_ACCOUNT_KEY and GMAIL_SEND_FROM.');
  }

  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: SEND_FROM,
  });
}

// ── Email Builder ──

function buildRawEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}): string {
  const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;
  const from = options.from || `LDRS Bot <${SEND_FROM}>`;

  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    options.html,
  ];

  const rawMessage = messageParts.join('\r\n');
  return Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Public API ──

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  if (!isConfigured()) {
    console.warn('[Email] Gmail API not configured, skipping email.');
    return { success: false, error: 'Not configured' };
  }

  try {
    const auth = getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const raw = buildRawEmail(options);

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    console.log(`[Email] Sent to ${Array.isArray(options.to) ? options.to.join(', ') : options.to} | ID: ${result.data.id}`);

    return {
      success: true,
      messageId: result.data.id || undefined,
    };
  } catch (err: any) {
    console.error('[Email] Send failed:', err.message || err);
    return {
      success: false,
      error: err.message || 'Unknown error',
    };
  }
}

// ── Pre-built Templates ──

export async function sendAdminAlert(options: {
  level: 'info' | 'warning' | 'critical';
  subject: string;
  message: string;
  details?: string;
  adminEmails?: string[];
}): Promise<void> {
  const to = options.adminEmails || [SEND_FROM!];
  const levelColors = {
    info: '#3b82f6',
    warning: '#f59e0b',
    critical: '#ef4444',
  };
  const levelLabels = {
    info: 'מידע',
    warning: 'אזהרה',
    critical: 'קריטי',
  };

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${levelColors[options.level]}; color: white; padding: 16px 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">⚠️ ${levelLabels[options.level]} — ${options.subject}</h2>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; color: #1f2937; line-height: 1.6;">${options.message}</p>
        ${options.details ? `<pre style="background: #f3f4f6; padding: 12px; border-radius: 8px; font-size: 13px; overflow-x: auto; direction: ltr;">${options.details}</pre>` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af;">נשלח אוטומטית מ-LDRS Bot | ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject: `[${levelLabels[options.level].toUpperCase()}] ${options.subject}`,
    html,
  });
}

export async function sendTestEmail(): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: SEND_FROM!,
    subject: 'בדיקת מערכת מיילים — LDRS Bot',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px;">
        <h2 style="color: #883fe2;">✅ מערכת המיילים עובדת!</h2>
        <p>המייל הזה נשלח אוטומטית מ-LDRS Bot כדי לוודא שהחיבור ל-Gmail API תקין.</p>
        <p style="color: #9ca3af; font-size: 12px;">${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
      </div>
    `,
  });
}
