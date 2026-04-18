/**
 * Weekly WhatsApp digest — Sunday 09:00 Israel time.
 *
 * Vercel cron runs in UTC; Israel in April is IDT (UTC+3), so 09:00 IL = 06:00 UTC.
 * Schedule (add to vercel.json): `"schedule": "0 6 * * 0"`
 *
 * For each active influencer that has WhatsApp enabled + a phone number,
 * computes the last-7-days counters (leads / chat sessions / coupons copied)
 * and fires the `influencer_weekly_digest_v2` template.
 *
 * Auth: requires `CRON_SECRET` (same pattern as the other cron endpoints).
 * Runs best-effort per-influencer; failures are logged but don't short-circuit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { sendInfluencerWeeklyDigest } from '@/lib/whatsapp-notify';

export const runtime = 'nodejs';
export const maxDuration = 300;

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

interface DigestResult {
  accountId: string;
  username?: string;
  phone?: string;
  sent: boolean;
  error?: string;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient();
  const results: DigestResult[] = [];
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Pull all active accounts that have WhatsApp-enabled features and a phone.
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, config, features')
      .eq('status', 'active');

    if (error) {
      console.error('[weekly-digest] account query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. For each eligible account, compute last-week counters + fire template.
    for (const account of accounts ?? []) {
      const config = (account.config ?? {}) as Record<string, any>;
      const features = (account.features ?? {}) as Record<string, any>;
      const phone: string | undefined = config.phone;
      const username: string | undefined = config.username;
      const whatsappEnabled: boolean = features.whatsapp === true;
      // Weekly digest is a MARKETING template — requires explicit opt-in
      const marketingOptIn: boolean = config.whatsapp_marketing_opt_in === true;

      if (!whatsappEnabled || !marketingOptIn || !phone || !username) {
        results.push({
          accountId: account.id,
          username,
          phone,
          sent: false,
          error: 'skipped: missing whatsapp/phone/username',
        });
        continue;
      }

      // 3. Fetch influencer's first name for the greeting
      const { data: persona } = await supabase
        .from('chatbot_persona')
        .select('name')
        .eq('account_id', account.id)
        .maybeSingle();
      const firstName =
        persona?.name?.split(' ')[0] ||
        username;

      // 4. Counters — all three in parallel via head+count queries
      const [leadsRes, sessionsRes, couponsRes] = await Promise.all([
        supabase
          .from('chat_leads')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', account.id)
          .gte('created_at', sinceIso),
        supabase
          .from('chat_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', account.id)
          .gte('created_at', sinceIso),
        supabase
          .from('coupon_usages')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', account.id)
          .gte('created_at', sinceIso),
      ]);

      const newFollowersThisWeek = leadsRes.count ?? 0;
      const conversations = sessionsRes.count ?? 0;
      const couponsGiven = couponsRes.count ?? 0;

      // 5. Send the template (gated by env flags inside notify lib)
      try {
        const result = await sendInfluencerWeeklyDigest({
          to: phone,
          influencerFirstName: firstName,
          newFollowersThisWeek,
          conversations,
          couponsGiven,
          influencerUsername: username,
        });
        results.push({
          accountId: account.id,
          username,
          phone,
          sent: result.success,
          error: result.error?.message,
        });
      } catch (err) {
        results.push({
          accountId: account.id,
          username,
          phone,
          sent: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const sent = results.filter((r) => r.sent).length;
    const skipped = results.filter((r) => !r.sent).length;
    console.log(`[weekly-digest] sent=${sent} skipped=${skipped}`);

    return NextResponse.json({ success: true, sent, skipped, results });
  } catch (err) {
    console.error('[weekly-digest] fatal error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
