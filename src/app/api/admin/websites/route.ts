import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
      });
    }

    return NextResponse.json({ websites });
  } catch (error: any) {
    console.error('[Admin Websites] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
