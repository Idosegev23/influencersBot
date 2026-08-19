/**
 * Demo watch — every 15 minutes.
 *
 * Turns silent demo activity into the three WhatsApp moments the sales team
 * actually wants interrupting for:
 *
 *   first_open_at  — somebody opened the demo for the first time, ever
 *   first_chat_at  — somebody is really talking to it (3+ of THEIR messages)
 *   locked_at      — the window closed; the ball is ours now
 *
 * A cron rather than hooks inside the chat path, deliberately. Sending a
 * WhatsApp inline would add latency to a prospect's reply and hand a Meta
 * outage a way to break the conversation we are trying to sell.
 *
 * Locking itself needs nothing from this route — `resolveDemoAccess` derives
 * it from `ends_at` on every request. This only NOTIFIES and stamps.
 *
 * Each moment fires exactly once: the stamp is written only after a confirmed
 * send, so a failed notification retries next tick instead of being silently
 * skipped (the lesson recorded in bestie-lead-nudge).
 *
 * Auth: CRON_SECRET bearer, or Vercel's cron user-agent. `?dryRun=1` reports
 * what would fire without sending anything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { resolveDemoAccess } from '@/lib/demo/access';
import { notifyDemoTeamWhatsApp } from '@/lib/demo/notify';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/** How many of the visitor's own messages make a page-poke into a conversation. */
const REAL_CONVERSATION_MESSAGES = 3;

function authorized(req: NextRequest): boolean {
  if (req.headers.get('user-agent')?.includes('vercel-cron')) return true;
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';

  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('id, config')
    .not('config->demo', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fired: any[] = [];

  for (const account of accounts || []) {
    // One bad account must not abort the sweep.
    try {
      const cfg: any = account.config || {};
      const demo = cfg.demo || {};
      const brand = cfg.display_name || cfg.username || 'חשבון דמו';

      // What still needs stamping for this account? Nothing → skip the queries.
      const needsOpen = !demo.first_open_at;
      const needsChat = !demo.first_chat_at;
      const access = resolveDemoAccess({ config: cfg });
      const needsLock = access.state === 'locked' && !demo.locked_at;
      if (!needsOpen && !needsChat && !needsLock) continue;

      const patch: Record<string, string> = {};

      if (needsOpen || needsChat) {
        const { data: sessions } = await supabaseAdmin
          .from('chat_sessions')
          .select('id, created_at')
          .eq('account_id', account.id)
          .gte('created_at', demo.starts_at || '1970-01-01')
          .order('created_at', { ascending: true })
          .limit(200);

        if (sessions?.length) {
          if (needsOpen) {
            const text = `הדמו של ${brand} נפתח לראשונה 🟡`;
            if (dryRun || (await notifyDemoTeamWhatsApp(text)) > 0) {
              patch.first_open_at = sessions[0].created_at;
              fired.push({ accountId: account.id, moment: 'first_open', dryRun });
            }
          }

          if (needsChat) {
            // Only the visitor's own messages count. The bot's greeting lands
            // in every session, so counting all roles would report a
            // conversation the moment anybody loads the page.
            const { count } = await supabaseAdmin
              .from('chat_messages')
              .select('id', { count: 'exact', head: true })
              .in('session_id', sessions.map((s: any) => s.id))
              .eq('role', 'user');

            if ((count || 0) >= REAL_CONVERSATION_MESSAGES) {
              const text = `${brand} משוחח עם הבוט - ${count} הודעות עד כה 🟢`;
              if (dryRun || (await notifyDemoTeamWhatsApp(text)) > 0) {
                patch.first_chat_at = new Date().toISOString();
                fired.push({ accountId: account.id, moment: 'first_chat', messages: count, dryRun });
              }
            }
          }
        }
      }

      if (needsLock) {
        const text = `הדמו של ${brand} ננעל. עכשיו הכדור אצלנו ⏳`;
        if (dryRun || (await notifyDemoTeamWhatsApp(text)) > 0) {
          patch.locked_at = new Date().toISOString();
          fired.push({ accountId: account.id, moment: 'locked', dryRun });
        }
      }

      if (!dryRun && Object.keys(patch).length) {
        // Re-read before writing: this sweep runs alongside /api/demo/lead and
        // the admin extend action, both of which also write config.demo.
        const { data: fresh } = await supabaseAdmin
          .from('accounts')
          .select('config')
          .eq('id', account.id)
          .single();
        const freshCfg: any = fresh?.config || cfg;
        await supabaseAdmin
          .from('accounts')
          .update({
            config: { ...freshCfg, demo: { ...(freshCfg.demo || {}), ...patch } },
            updated_at: new Date().toISOString(),
          })
          .eq('id', account.id);
      }
    } catch (err: any) {
      console.error('[demo-watch] account failed:', account.id, err?.message || err);
    }
  }

  return NextResponse.json({ ok: true, scanned: accounts?.length || 0, fired, dryRun });
}
