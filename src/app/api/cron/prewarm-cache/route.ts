import { NextRequest, NextResponse } from 'next/server';
import { isRedisAvailable } from '@/lib/redis';
import { supabase } from '@/lib/supabase';
import {
  getAccountIdByUsername,
  getBrandsByAccount,
  getInfluencerProfile,
} from '@/lib/cache-l2';

export const runtime = 'nodejs';
export const maxDuration = 30;

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isRedisAvailable()) {
    return NextResponse.json({ message: 'Redis not available, skipping pre-warm' });
  }

  const start = Date.now();

  // Get all active accounts with usernames
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('status', 'active');

  if (error || !accounts) {
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }

  const results: { username: string; ok: boolean; source: string }[] = [];

  for (const account of accounts) {
    const username = account.config?.username;
    if (!username) continue;

    try {
      // Pre-warm: username → accountId
      const { metrics: m1 } = await getAccountIdByUsername(username);

      // Pre-warm: brands
      const { metrics: m2 } = await getBrandsByAccount(account.id);

      // Pre-warm: profile/persona
      const { metrics: m3 } = await getInfluencerProfile(account.id);

      results.push({
        username,
        ok: true,
        source: `${m1.source}/${m2.source}/${m3.source}`,
      });
    } catch (err) {
      results.push({ username, ok: false, source: 'error' });
    }
  }

  const warmed = results.filter(r => r.ok).length;
  const fromCache = results.filter(r => r.ok && !r.source.includes('db')).length;

  return NextResponse.json({
    message: `Pre-warmed ${warmed}/${accounts.length} accounts in ${Date.now() - start}ms`,
    fromCache,
    results,
  });
}
