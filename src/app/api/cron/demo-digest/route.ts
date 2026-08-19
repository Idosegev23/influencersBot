/**
 * Demo digest — daily, 08:00 Israel time (05:00 UTC; Vercel crons are UTC).
 *
 * One email to the sales five covering every live demo: counters, days
 * remaining, and the verbatim transcripts of the last 24 hours — what the
 * prospect asked and what the bot answered.
 *
 * The transcripts are the point. They are a sales asset (you know what they
 * care about before you call) and the only mechanism by which anyone would
 * notice the bot answering badly on a brand we are mid-negotiation with.
 *
 * Locked demos are excluded — their story ended, and their lead email already
 * carried the full week.
 *
 * Auth: CRON_SECRET bearer, or Vercel's cron user-agent. `?dryRun=1` renders
 * the summary without sending.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { SALES_RECIPIENTS } from '@/lib/bestie/handoff-email';
import { resolveDemoAccess } from '@/lib/demo/access';
import { loadDemoUsage, transcriptsHtml, esc } from '@/lib/demo/notify';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  if (req.headers.get('user-agent')?.includes('vercel-cron')) return true;
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('id, config')
    .not('config->demo', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const blocks: string[] = [];
  const summary: any[] = [];

  for (const account of accounts || []) {
    try {
      const cfg: any = account.config || {};
      const access = resolveDemoAccess({ config: cfg });
      if (access.state === 'locked') continue;

      const brand = cfg.display_name || cfg.username || account.id;
      const usage = await loadDemoUsage(supabaseAdmin as any, account.id, since);

      summary.push({
        accountId: account.id,
        brand,
        daysLeft: access.daysLeft,
        sessions: usage.sessions,
        userMessages: usage.userMessages,
      });

      // A quiet demo still earns a line — "nobody touched it" is exactly the
      // signal a salesperson needs, and omitting it would read as no data.
      const headline =
        usage.sessions === 0
          ? '<span style="color:#999">אין פעילות ב-24 השעות האחרונות</span>'
          : `${usage.sessions} שיחות · ${usage.userMessages} הודעות מהמתעניין`;

      blocks.push(`
        <div style="margin:0 0 26px;padding-bottom:18px;border-bottom:1px solid #eee">
          <h3 style="margin:0 0 3px">${esc(brand)}</h3>
          <p style="margin:0 0 10px;color:#666;font-size:13px">
            ${headline} · נותרו ${access.daysLeft ?? '—'} ימים
          </p>
          ${usage.sessions ? transcriptsHtml(usage.transcripts) : ''}
          ${usage.truncated ? '<p style="color:#888">(הוצגו 25 השיחות הראשונות בלבד)</p>' : ''}
        </div>`);
    } catch (err: any) {
      console.error('[demo-digest] account failed:', account.id, err?.message || err);
    }
  }

  if (!blocks.length) {
    return NextResponse.json({ ok: true, sent: false, reason: 'no live demos', dryRun });
  }

  const active = summary.filter((s) => s.sessions > 0).length;
  const html = `
    <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:720px">
      <h2 style="margin:0 0 4px">דמואים חיים — סיכום יומי</h2>
      <p style="color:#666;margin:0 0 22px">
        ${summary.length} דמואים פתוחים, ${active} מהם היו פעילים ב-24 השעות האחרונות.
      </p>
      ${blocks.join('')}
    </div>`;

  if (dryRun) {
    return NextResponse.json({ ok: true, sent: false, dryRun: true, summary });
  }

  const res = await sendEmail({
    to: SALES_RECIPIENTS,
    subject: `דמואים חיים — ${active}/${summary.length} פעילים היום`,
    html,
  });

  return NextResponse.json({ ok: true, sent: res.success, error: res.error, summary });
}
