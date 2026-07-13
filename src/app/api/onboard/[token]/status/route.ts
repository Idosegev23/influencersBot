import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';

export const dynamic = 'force-dynamic';

/**
 * GET /api/onboard/[token]/status — public onboarding state for the wizard.
 * The raw accountId is never returned to the client; a ready-made `connectUrl`
 * (token-scoped) is provided so the wizard can start the IG connect flow.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const draft = await resolveDraftByToken(token);
  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ob = draft.config?.onboarding || {};
  const { data: conn } = await supabase
    .from('ig_graph_connections')
    .select('ig_username, is_active')
    .eq('account_id', draft.id)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    accountName: ob.accountName || draft.config?.display_name || '',
    clientName: ob.clientName || '',
    status: ob.status || 'draft',
    sources: draft.config?.sources || {},
    connected: !!conn,
    igUsername: conn?.ig_username || null,
    jobId: ob.jobId || null,
    connectUrl: `/api/onboard/${token}/connect`,
  });
}
