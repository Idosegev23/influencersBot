/**
 * Account Deletion Request
 * POST /api/influencer/request-deletion
 *
 * Lets an authenticated influencer ask Bestie to delete their account
 * and disconnect any linked Instagram. We don't auto-delete — we email
 * the admin team so deletion happens under human review (audit trail,
 * support handoff, billing cleanup).
 *
 * This satisfies Meta App Review's "user can request data deletion"
 * requirement for the Instagram Graph API integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { sendEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';
import { sanitizeHtml } from '@/lib/sanitize';

const DELETION_INBOX = process.env.ACCOUNT_DELETION_EMAIL?.trim() || 'bestie@ldrsgroup.com';

export async function POST(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;

  const { influencer, username } = auth;

  let reason = '';
  let contactEmail = '';
  try {
    const body = await req.json().catch(() => ({}));
    reason = typeof body?.reason === 'string' ? sanitizeHtml(body.reason).slice(0, 1000) : '';
    contactEmail = typeof body?.contactEmail === 'string'
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail.trim())
        ? body.contactEmail.trim().toLowerCase()
        : '';
  } catch {}

  const cfg = (influencer as any)?.config || (influencer as any)?._rawConfig || {};
  const displayName = (influencer as any).display_name || username;

  const [{ data: igConnection }, { data: account }] = await Promise.all([
    supabase
      .from('ig_graph_connections')
      .select('ig_username, ig_business_account_id, is_active, connected_at')
      .eq('account_id', influencer.id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('accounts')
      .select('created_at, type')
      .eq('id', influencer.id)
      .maybeSingle(),
  ]);

  const submittedAt = new Date().toISOString();
  const dashboardLink = `${req.nextUrl.origin}/admin/influencers/${influencer.id}`;

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const row = (label: string, value: string | null | undefined) =>
    value
      ? `<tr><td style="padding:6px 14px 6px 0;color:#676767;font-size:13px;white-space:nowrap;vertical-align:top">${escape(label)}</td><td style="padding:6px 0;color:#0c1013;font-size:14px;vertical-align:top">${escape(value)}</td></tr>`
      : '';

  const igLine = igConnection
    ? `@${igConnection.ig_username} (IGBA ${igConnection.ig_business_account_id})`
    : 'No active Instagram connection';

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#0c1013">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <div style="font-size:12px;color:#b91c1c;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;margin-bottom:6px">Account deletion request</div>
    <h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#0c1013">${escape(displayName)}</h1>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      ${row('Username', username)}
      ${row('Account ID', influencer.id)}
      ${row('Account type', (account as any)?.type)}
      ${row('Created', (account as any)?.created_at)}
      ${row('Instagram', igLine)}
      ${row('Contact email', contactEmail || (cfg.support_email as string) || null)}
      ${row('Submitted at', submittedAt)}
    </table>
    ${reason ? `<div style="border-top:1px solid #f1e9fd;padding-top:16px"><div style="font-size:12px;color:#676767;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;margin-bottom:8px">Reason</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.55;color:#0c1013">${escape(reason)}</div></div>` : ''}
    <div style="margin-top:20px;padding:14px;border-radius:10px;background:#fef3c7;border:1px solid #fde68a;font-size:13px;line-height:1.55;color:#78350f">
      <strong>Action required:</strong> disconnect Instagram (revoke long-lived token via Meta + set <code>ig_graph_connections.is_active=false</code>), then delete account + cascaded data (sessions, products, partnerships, persona, RAG chunks).
    </div>
    <div style="margin:18px 0 4px"><a href="${escape(dashboardLink)}" style="display:inline-block;background:#0c1013;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px">Open account in admin →</a></div>
  </div>
  <div style="max-width:620px;margin:12px auto 0;font-size:11px;color:#9ca3af;text-align:center">Submitted from the influencer dashboard.</div>
</body></html>`;

  const subject = `[Deletion request] ${displayName} (${username})`;

  const adminResult = await sendEmail({ to: DELETION_INBOX, subject, html });
  if (!adminResult.success) {
    console.error('[Deletion] Admin email failed:', adminResult.error);
    return NextResponse.json(
      { error: 'Failed to submit deletion request — please contact support directly.' },
      { status: 502 },
    );
  }

  if (contactEmail) {
    const ackHtml = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#0c1013;direction:rtl">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <div style="font-size:13px;color:#676767;margin-bottom:12px">BestieAI</div>
    <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;line-height:1.3">קיבלנו את בקשת המחיקה שלך</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 12px">שלום,</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 12px">קיבלנו את בקשתך למחיקת החשבון <strong>${escape(displayName)}</strong> מהמערכת ולניתוק החיבור לאינסטגרם. הצוות שלנו יטפל בבקשה תוך עד 7 ימי עסקים ויחזור אליך לאישור סופי לפני המחיקה.</p>
    <p style="font-size:14px;line-height:1.55;color:#676767;margin:16px 0 0">אם לא שלחת את הבקשה — אנא צור איתנו קשר במייל זה מיד.</p>
  </div>
</body></html>`;
    sendEmail({ to: contactEmail, subject: 'קיבלנו את בקשת מחיקת החשבון', html: ackHtml })
      .catch(e => console.warn('[Deletion] Ack email failed:', e?.message || e));
  }

  console.log(`[Deletion] Request submitted for ${username} (${influencer.id}); IG connected=${!!igConnection}`);

  return NextResponse.json({ success: true });
}
