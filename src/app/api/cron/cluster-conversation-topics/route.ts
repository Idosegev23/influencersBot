/** GET /api/cron/cluster-conversation-topics — weekly stage 2. */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { clusterTopics } from '@/lib/conversation-analytics/topics';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get('account_id');
  const maxBatchesRaw = parseInt(req.nextUrl.searchParams.get('max_batches') || '', 10);
  const maxBatches = Number.isFinite(maxBatchesRaw) && maxBatchesRaw > 0 ? maxBatchesRaw : undefined;
  const { data: accounts } = await supabase.from('accounts').select('id, config').eq('status', 'active');

  const targets = (accounts || []).filter((a: any) =>
    (!accountId || a.id === accountId) &&
    a.config?.isDemo !== true &&
    a.config?.conversation_analytics?.enabled === true);

  const results: any[] = [];
  for (const a of targets) {
    try {
      results.push({ accountId: a.id, ...(await clusterTopics({ accountId: a.id, maxBatches })) });
    } catch (e: any) {
      console.error('[cluster-conversation-topics]', a.id, e?.message || e);
      results.push({ accountId: a.id, error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
