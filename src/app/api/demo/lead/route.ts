/**
 * POST /api/demo/lead — the button at the end of an expired demo.
 *
 * This is the point of the whole demo-expiry feature: a prospect who spent a
 * week with a working product asking to talk. It is handled accordingly.
 *
 * Order matters. The `support_requests` row is written FIRST and the two
 * notification channels fire after it, independently. A Meta outage or a Gmail
 * hiccup must never be able to lose the lead — worst case it sits in the table
 * and the admin alert says so. This mirrors the never-silent rule in
 * engines/escalation/lead-capture.ts.
 *
 * Unauthenticated by necessity: the caller is an anonymous prospect on a public
 * page. Everything they send is treated as hostile text and escaped on the way
 * into the email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail, sendAdminAlert } from '@/lib/email';
import { SALES_RECIPIENTS } from '@/lib/bestie/handoff-email';
import { resolveDemoAccess } from '@/lib/demo/access';
import {
  loadDemoUsage,
  notifyDemoTeamWhatsApp,
  transcriptsHtml,
  esc,
} from '@/lib/demo/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FIELD = 300;
const MAX_MESSAGE = 2000;

function clean(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const accountId = clean(body.accountId, 100);
  const name = clean(body.name, MAX_FIELD);
  const brand = clean(body.brand, MAX_FIELD);
  const phone = clean(body.phone, MAX_FIELD);
  const email = clean(body.email, MAX_FIELD);
  const message = clean(body.message, MAX_MESSAGE);

  if (!accountId || !name || !phone) {
    return NextResponse.json({ error: 'accountId, name and phone are required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: account } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('id', accountId)
    .single();

  if (!account) {
    return NextResponse.json({ error: 'account not found' }, { status: 404 });
  }

  const cfg: any = account.config || {};
  const demo = cfg.demo;
  const access = resolveDemoAccess({ config: cfg });

  // Only an expired demo produces this lead. Without the check the endpoint is
  // an open relay into the sales team's WhatsApp for anyone who knows an
  // account id.
  if (access.state !== 'locked') {
    return NextResponse.json({ error: 'demo is not expired' }, { status: 400 });
  }

  const brandLabel = cfg.display_name || cfg.username || brand || 'חשבון דמו';

  // Submit-once. A prospect who taps twice gets the thank-you screen, not a
  // second round of pages to five people.
  if (demo?.lead_sent_at) {
    return NextResponse.json({ ok: true, alreadySent: true });
  }

  // 1) Persist first — everything below is best-effort on top of this row.
  const { error: insertError } = await supabase.from('support_requests').insert({
    account_id: accountId,
    source: 'demo_expired_lead',
    status: 'new',
    metadata: {
      demo_lead: { name, brand, phone, email, message, submitted_at: new Date().toISOString() },
    },
  });
  if (insertError) {
    console.error('[demo-lead] insert failed:', insertError.message);
  }

  // 2) Stamp so a double-tap can't re-notify, merging rather than replacing so
  //    a concurrent config write elsewhere isn't clobbered.
  const sentAt = new Date().toISOString();
  await supabase
    .from('accounts')
    .update({ config: { ...cfg, demo: { ...(demo || {}), lead_sent_at: sentAt } } })
    .eq('id', accountId);

  // 3) The transcripts that make this lead worth more than a contact form.
  let usageHtml = '<p style="color:#666">לא נטענו שיחות.</p>';
  let usageLine = '';
  try {
    const since = demo?.starts_at || new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const usage = await loadDemoUsage(supabase, accountId, since);
    usageHtml = transcriptsHtml(usage.transcripts);
    usageLine = `${usage.sessions} שיחות · ${usage.userMessages} הודעות מהמתעניין`;
    if (usage.truncated) usageHtml += '<p style="color:#888">(הוצגו 25 השיחות הראשונות בלבד)</p>';
  } catch (err: any) {
    console.error('[demo-lead] transcript load failed:', err?.message || err);
  }

  const subject = `🔥 ליד חם מדמו שהסתיים — ${brandLabel}`;
  const html = `
    <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:680px">
      <h2 style="margin:0 0 4px">🔥 ליד חם — הדמו הסתיים והם ביקשו לדבר</h2>
      <p style="color:#666;margin:0 0 16px">${esc(brandLabel)}${usageLine ? ` · ${esc(usageLine)}` : ''}</p>
      <table style="border-collapse:collapse;margin-bottom:18px">
        <tr><td style="padding:5px 14px 5px 0;color:#666">שם</td><td><strong>${esc(name)}</strong></td></tr>
        <tr><td style="padding:5px 14px 5px 0;color:#666">מותג</td><td><strong>${esc(brand || brandLabel)}</strong></td></tr>
        <tr><td style="padding:5px 14px 5px 0;color:#666">טלפון</td><td><strong>${esc(phone)}</strong></td></tr>
        <tr><td style="padding:5px 14px 5px 0;color:#666">אימייל</td><td><strong>${esc(email || '—')}</strong></td></tr>
      </table>
      ${message ? `<p style="padding:10px 12px;background:#fffbea;border-radius:8px"><strong>מה הם כתבו:</strong><br>${esc(message)}</p>` : ''}
      <h3 style="margin:22px 0 6px">מה הם שאלו את הבוט במהלך השבוע</h3>
      <p style="color:#888;font-size:12px;margin:0 0 10px">אל תבקשו מהם לספר את זה שוב.</p>
      ${usageHtml}
    </div>`;

  const emailResult = await sendEmail({ to: SALES_RECIPIENTS, subject, html });
  if (!emailResult.success) {
    // Never silent: if the sales five didn't get it, somebody must still hear.
    await sendAdminAlert({
      level: 'critical',
      subject: `ליד חם מדמו לא נשלח — ${brandLabel}`,
      message: `נכשלה שליחת המייל לצוות המכירות. הליד נשמר ב-support_requests ויש ליצור קשר ידנית.`,
      details: JSON.stringify({ accountId, name, brand, phone, email, message }, null, 2),
    }).catch(() => {});
  }

  await notifyDemoTeamWhatsApp(
    `ליד חם מדמו שהסתיים - ${brandLabel}. ${name}, ${phone}${email ? `, ${email}` : ''}. הפרטים המלאים והתמלילים במייל.`,
  );

  return NextResponse.json({ ok: true });
}
