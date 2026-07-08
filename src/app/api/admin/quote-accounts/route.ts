import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

/**
 * GET /api/admin/quote-accounts
 *
 * Lists accounts that were provisioned via a "quote" (pre-sales demo) scan —
 * i.e. `config.scan_mode = 'quote'`. The admin add form's regular (full) mode
 * offers these for "enrich to full scope" so a demo account can be upgraded to
 * a full scan without re-creating the account row.
 *
 * Returns: [{ accountId, display_name, username, website_url }]
 */
export async function GET() {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('config->>scan_mode', 'quote');

    if (error) {
      console.error('Error fetching quote accounts:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const accounts = (data || []).map((a: any) => {
      const config = a.config || {};
      return {
        accountId: a.id,
        display_name: config.display_name || config.username || 'Unknown',
        username: config.username || null,
        website_url: config.website_url || null,
      };
    });

    return NextResponse.json(accounts);
  } catch (err) {
    console.error('Error in GET /api/admin/quote-accounts:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
