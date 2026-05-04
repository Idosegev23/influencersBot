#!/usr/bin/env node
/**
 * Local Gmail send test — replicates `sendBriefEmail` without going through
 * Vercel/Next.js. Surfaces the FULL error from Google APIs so we can
 * diagnose domain-wide delegation, missing scopes, expired keys, etc.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-gmail-send.mjs
 *   node --env-file=.env scripts/test-gmail-send.mjs
 *
 * Optional env override (defaults: LEADS_EMAIL_TO as fromEmail, cto@ldrsgroup.com as recipient):
 *   TO=someone@ldrsgroup.com node --env-file=.env.local scripts/test-gmail-send.mjs
 *   FROM=specific@ldrsgroup.com node --env-file=.env.local scripts/test-gmail-send.mjs
 */

import { google } from 'googleapis';

const TO = process.env.TO || 'cto@ldrsgroup.com';
const FROM_OVERRIDE = process.env.FROM;

console.log('=== Gmail Send Diagnostic ===');
console.log('Recipient:', TO);

// Step 1 — env presence check
const hasKey = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const hasLeadsTo = !!process.env.LEADS_EMAIL_TO;
console.log('GOOGLE_SERVICE_ACCOUNT_KEY present:', hasKey);
console.log('LEADS_EMAIL_TO present:', hasLeadsTo, hasLeadsTo ? `(${process.env.LEADS_EMAIL_TO})` : '');

if (!hasKey) {
  console.error('\n❌ GOOGLE_SERVICE_ACCOUNT_KEY is not set in env. Aborting.');
  process.exit(1);
}

// Step 2 — parse credentials
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  console.log('Service account email:', credentials.client_email);
  console.log('Service account project:', credentials.project_id);
} catch (err) {
  console.error('\n❌ Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY as JSON:', err.message);
  process.exit(1);
}

const fromEmail = FROM_OVERRIDE || process.env.LEADS_EMAIL_TO || 'info@ldrsgroup.com';
console.log('Impersonating (from):', fromEmail);

// Step 3 — build JWT client
const jwtClient = new google.auth.JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ['https://www.googleapis.com/auth/gmail.send'],
  subject: fromEmail, // impersonation requires domain-wide delegation
});

// Step 4 — try authorize first to surface DWD errors before the send
console.log('\nAuthorizing JWT client...');
try {
  await jwtClient.authorize();
  console.log('✓ JWT authorized');
} catch (err) {
  console.error('\n❌ JWT.authorize() failed:');
  console.error('  message:', err.message);
  if (err.response?.data) console.error('  response.data:', JSON.stringify(err.response.data, null, 2));
  console.error('\nLikely cause: domain-wide delegation not configured for this service');
  console.error('account on workspace ldrsgroup.com (or wrong scopes / wrong subject email).');
  process.exit(1);
}

// Step 5 — build RFC 2822 message
const subject = `[בדיקת ענן] ליד מהכנס — בדיקה ${new Date().toLocaleTimeString('he-IL')}`;
const htmlBody = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Heebo', Arial, sans-serif; line-height: 1.6; color: #111827; padding: 20px;">
  <h2 style="color: #db2777;">🎤 ליד טסט מהכנס — אבחון Gmail send</h2>
  <p>זה מייל בדיקה ישיר, נשלח דרך Google service account JWT impersonation.</p>
  <p><strong>אם המייל הזה הגיע אליך — Domain-Wide Delegation מוגדרת ותקינה.</strong> כל מה שנשאר זה לוודא ש-env vars נטענים נכון ב-Vercel ושה-after() מוצא לפועל.</p>
  <hr>
  <p style="font-size: 12px; color: #666;">נשלח מסקריפט מקומי בזמן: ${new Date().toLocaleString('he-IL')}</p>
</body>
</html>
`;

const messageParts = [
  `From: ${fromEmail}`,
  `To: ${TO}`,
  `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=UTF-8',
  '',
  htmlBody,
];
const rawMessage = Buffer.from(messageParts.join('\r\n'))
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

// Step 6 — send
console.log('\nSending email via Gmail API...');
try {
  const gmail = google.gmail({ version: 'v1', auth: jwtClient });
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: rawMessage },
  });
  console.log('\n✅ EMAIL SENT SUCCESSFULLY');
  console.log('  message id:', res.data.id);
  console.log('  thread id:', res.data.threadId);
  console.log(`\nCheck inbox of ${TO} now.`);
} catch (err) {
  console.error('\n❌ gmail.users.messages.send() failed:');
  console.error('  message:', err.message);
  if (err.code) console.error('  code:', err.code);
  if (err.errors) console.error('  errors:', JSON.stringify(err.errors, null, 2));
  if (err.response?.data) console.error('  response.data:', JSON.stringify(err.response.data, null, 2));
  process.exit(1);
}
