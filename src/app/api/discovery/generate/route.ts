import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateAllAILists } from '@/lib/discovery/ai-generator';
import { invalidateDiscoveryCache } from '@/lib/discovery/discovery-cache';

/**
 * POST /api/discovery/generate
 * Internal endpoint — called by cron or admin to generate AI discovery lists.
 */
export async function POST(req: NextRequest) {
  // Verify cron secret or admin auth
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { accountId, username } = body;

    const supabase = createClient();

    if (accountId) {
      // Generate for a specific account
      const { data: account } = await supabase
        .from('accounts')
        .select('id, config')
        .eq('id', accountId)
        .maybeSingle();

      if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      const name = account.config?.display_name || account.config?.username || 'Unknown';
      const generated = await generateAllAILists(accountId, name);
      invalidateDiscoveryCache(accountId);

      return NextResponse.json({ success: true, generated, accountId });
    }

    if (username) {
      const { data: account } = await supabase
        .from('accounts')
        .select('id, config')
        .eq('config->>username', username)
        .eq('status', 'active')
        .maybeSingle();

      if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      const name = account.config?.display_name || account.config?.username || username;
      const generated = await generateAllAILists(account.id, name);
      invalidateDiscoveryCache(account.id);

      return NextResponse.json({ success: true, generated, accountId: account.id });
    }

    // No specific account — generate for all active creator accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('type', 'creator')
      .eq('status', 'active');

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ success: true, generated: 0, message: 'No active accounts' });
    }

    let totalGenerated = 0;
    for (const account of accounts) {
      try {
        const name = account.config?.display_name || account.config?.username || 'Unknown';
        const generated = await generateAllAILists(account.id, name);
        invalidateDiscoveryCache(account.id);
        totalGenerated += generated;
        console.log(`[Discovery Generate] ${name}: ${generated} lists`);
      } catch (err) {
        console.error(`[Discovery Generate] Failed for ${account.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      generated: totalGenerated,
      accounts: accounts.length,
    });
  } catch (err) {
    console.error('[Discovery Generate]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
