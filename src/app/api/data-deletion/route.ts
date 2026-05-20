/**
 * Public Data Deletion Request
 * POST /api/data-deletion
 *
 * Public, unauthenticated endpoint for end-users (followers, chat
 * visitors, Instagram users who interacted with one of our connected
 * accounts) to request deletion of their data. Used by the /data-deletion
 * page that Meta App Review requires as a public "Data Deletion Request
 * URL" for the Instagram Graph API integration.
 *
 * Rate limited globally via middleware. We additionally guard against
 * empty / nonsense submissions and forward each valid request to the
 * Bestie admin inbox for manual handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { sanitizeHtml } from '@/lib/sanitize';

const DELETION_INBOX = process.env.ACCOUNT_DELETION_EMAIL?.trim() || 'bestie@ldrsgroup.com';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body?.name === 'string' ? sanitizeHtml(body.name).slice(0, 200) : '';
  const igHandle = typeof body?.igHandle === 'string'
    ? sanitizeHtml(body.igHandle.replace(/^@/, '')).slice(0, 100)
    : '';
  const brand = typeof body?.brand === 'string' ? sanitizeHtml(body.brand).slice(0, 200) : '';
  const reason = typeof body?.reason === 'string' ? sanitizeHtml(body.reason).slice(0, 2000) : '';

  if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const submittedAt = new Date().toISOString();
  const ua = req.headers.get('user-agent') || '';
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || '';

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const row = (label: string, value: string | null | undefined) =>
    value
      ? `<tr><td style="padding:6px 14px 6px 0;color:#676767;font-size:13px;white-space:nowrap;vertical-align:top">${escape(label)}</td><td style="padding:6px 0;color:#0c1013;font-size:14px;vertical-align:top">${escape(value)}</td></tr>`
      : '';

  const adminHtml = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#0c1013">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <div style="font-size:12px;color:#b91c1c;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;margin-bottom:6px">Public data deletion request</div>
    <h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#0c1013">${escape(name)}</h1>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      ${row('Email', rawEmail)}
      ${row('Instagram handle', igHandle ? `@${igHandle}` : null)}
      ${row('Brand / account', brand)}
      ${row('Submitted at', submittedAt)}
      ${row('User agent', ua.slice(0, 200))}
      ${row('IP', ip)}
    </table>
    ${reason ? `<div style="border-top:1px solid #f1e9fd;padding-top:16px"><div style="font-size:12px;color:#676767;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;margin-bottom:8px">Reason / details</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.55;color:#0c1013">${escape(reason)}</div></div>` : ''}
    <div style="margin-top:20px;padding:14px;border-radius:10px;background:#fef3c7;border:1px solid #fde68a;font-size:13px;line-height:1.55;color:#78350f">
      <strong>Action required:</strong> identify all data linked to this email / IG handle (chat sessions, analytics events, support tickets, IG Graph DMs), delete it, and reply to the requester within 30 days per GDPR / Meta Platform Terms.
    </div>
  </div>
  <div style="max-width:620px;margin:12px auto 0;font-size:11px;color:#9ca3af;text-align:center">Submitted from the public /data-deletion page.</div>
</body></html>`;

  const subject = `[Data deletion] ${name} <${rawEmail}>`;

  const adminResult = await sendEmail({ to: DELETION_INBOX, subject, html: adminHtml });
  if (!adminResult.success) {
    console.error('[DataDeletion] Admin email failed:', adminResult.error);
    return NextResponse.json(
      { error: 'We could not record your request right now. Please email bestie@ldrsgroup.com directly.' },
      { status: 502 },
    );
  }

  // Best-effort confirmation to the requester
  const ackHtml = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#0c1013">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <div style="font-size:13px;color:#676767;margin-bottom:12px">BestieAI</div>
    <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;line-height:1.3">We received your data deletion request</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 12px">Hi ${escape(name.split(' ')[0] || 'there')},</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 12px">Thanks for reaching out. Your data deletion request has been logged and our team will process it within 30 days, in line with GDPR and the Meta Platform Terms. We will email you once it's complete.</p>
    <p style="font-size:14px;line-height:1.55;color:#676767;margin:16px 0 0">If you did not submit this request, please reply to this email immediately so we can investigate.</p>
  </div>
  <div style="max-width:560px;margin:12px auto 0;font-size:11px;color:#9ca3af;text-align:center">BestieAI · ldrsgroup.com</div>
</body></html>`;

  sendEmail({ to: rawEmail, subject: 'We received your data deletion request', html: ackHtml })
    .catch(e => console.warn('[DataDeletion] Ack email failed:', e?.message || e));

  console.log(`[DataDeletion] Request from ${rawEmail} (IG: @${igHandle || '—'})`);

  return NextResponse.json({ success: true });
}
