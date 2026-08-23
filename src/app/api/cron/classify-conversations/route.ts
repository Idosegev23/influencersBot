/**
 * GET /api/cron/classify-conversations — hourly stage 1.
 *
 * Retro/backfill is the same endpoint with a wider window:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "$HOST/api/cron/classify-conversations?account_id=<uuid>&since=2026-01-01&limit=500&budget=3"
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { runClassification } from '@/lib/conversation-analytics/run-classification';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get('authorization') === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get('account_id');
  const since = req.nextUrl.searchParams.get('since') || undefined;
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '300', 10);
  const budget = parseFloat(req.nextUrl.searchParams.get('budget') || '5');

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('status', 'active');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = (accounts || []).filter((a: any) => {
    if (accountId && a.id !== accountId) return false;
    if (a.config?.isDemo === true) return false;
    return a.config?.conversation_analytics?.enabled === true;
  });

  const results: any[] = [];
  for (const a of targets) {
    try {
      const r = await runClassification({
        accountId: a.id,
        sinceIso: since,
        limit: Number.isFinite(limit) ? limit : 300,
        budgetUsd: Number.isFinite(budget) ? budget : 5,
      });
      results.push({ accountId: a.id, ...r });
    } catch (e: any) {
      console.error('[classify-conversations]', a.id, e?.message || e);
      results.push({ accountId: a.id, error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, accounts: targets.length, results });
}
