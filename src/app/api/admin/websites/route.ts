import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

/**
 * POST /api/admin/websites - Generate management token for an account
 */
export async function POST(request: NextRequest) {
  try {
    const { accountId } = await request.json();
    if (!accountId) {
      return NextResponse.json({ error: 'accountId required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get current config
    const { data: account, error: fetchErr } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', accountId)
      .single();

    if (fetchErr || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');

    // Deep merge into config.widget.managementToken
    const config = account.config || {};
    config.widget = config.widget || {};
    config.widget.managementToken = token;

    const { error: updateErr } = await supabase
      .from('accounts')
      .update({ config })
      .eq('id', accountId);

    if (updateErr) throw new Error(updateErr.message);

    return NextResponse.json({ success: true, token });
  } catch (error: any) {
    console.error('[Admin Websites] Generate token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/admin/websites - List all widget-enabled accounts
 * Every account with config.widget.enabled = true appears here.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Get all accounts with widget enabled
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('status', 'active')
      .not('config->widget', 'is', null);

    if (error) throw new Error(error.message);

    const websites = [];

    for (const account of accounts || []) {
      const widgetConfig = account.config?.widget;
      if (!widgetConfig?.enabled) continue;

      const domain = widgetConfig.domain || account.config?.username || '';
      const displayName = account.config?.display_name || domain;

      // Count documents (scraped pages)
      const { count: pagesCount } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', account.id);

      // Count RAG chunks
      const { count: chunksCount } = await supabase
        .from('document_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', account.id);

      websites.push({
        id: account.id,
        domain,
        displayName,
        url: `https://${domain}`,
        pagesCount: pagesCount || 0,
        chunksCount: chunksCount || 0,
        primaryColor: widgetConfig.primaryColor || '#6366f1',
        profilePic: account.config?.profile_pic_url || null,
        managementToken: widgetConfig.managementToken || null,
      });
    }

    return NextResponse.json({ websites });
  } catch (error: any) {
    console.error('[Admin Websites] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
