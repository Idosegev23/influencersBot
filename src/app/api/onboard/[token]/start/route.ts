import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';
import { startPipeline } from '@/lib/pipeline/start';
import { normalizeIgUsername } from '@/lib/pipeline/username';

export const dynamic = 'force-dynamic';

/**
 * POST /api/onboard/[token]/start  { website, tiktok, youtube, whatsapp, email }
 * Token-guarded. Persists sources + owner contact, sets the account's username to
 * the connected IG handle, and kicks off the full pipeline. Idempotent via an
 * ATOMIC status claim (draft/filled → starting) so concurrent starts can't
 * double-scan; the transient 'starting' state is only promoted to 'scanning'
 * after startPipeline succeeds, and reverted to 'draft' on failure so retry works.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const draft = await resolveDraftByToken(token);
  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ob = draft.config?.onboarding || {};
  if (!['draft', 'filled'].includes(ob.status)) {
    return NextResponse.json({ error: 'already started', jobId: ob.jobId || null }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const website = (body.website || '').trim();
  const tiktok = (body.tiktok || '').trim();
  const youtube = (body.youtube || '').trim();

  // Require a connected Instagram — the account's scannable anchor + login handle.
  const { data: conn } = await supabase
    .from('ig_graph_connections')
    .select('ig_username, is_active')
    .eq('account_id', draft.id)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conn?.ig_username) return NextResponse.json({ error: 'connect_instagram_first' }, { status: 422 });

  // ATOMIC claim: only one request may transition draft/filled → starting.
  // The JSON-path predicate is applied to the UPDATE's WHERE (PostgREST), so a
  // concurrent second request affects 0 rows and is rejected.
  const { data: claimed } = await supabase
    .from('accounts')
    .update({ config: { ...draft.config, onboarding: { ...ob, status: 'starting' } } })
    .eq('id', draft.id)
    .in('config->onboarding->>status', ['draft', 'filled'])
    .select('id');
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'already started' }, { status: 409 });
  }

  const igHandle = normalizeIgUsername(conn.ig_username);
  const sources = { instagram: igHandle, website, youtube, tiktok };
  // ownerWhatsapp / ownerEmail were captured by the admin at link-create time.
  const baseConfig = {
    ...draft.config,
    username: igHandle,
    sources,
    onboarding: { ...ob },
  };

  const result = await startPipeline({
    accountId: draft.id,
    username: igHandle,
    websiteUrl: website || null,
    youtube: youtube || undefined,
    tiktok: tiktok || undefined,
    archetype: 'influencer',
    isDemo: false,
    scanMode: 'full',
    requestedBy: 'onboarding',
  });

  if ('error' in result) {
    // Revert the claim so the creator can retry.
    await supabase
      .from('accounts')
      .update({ config: { ...baseConfig, onboarding: { ...baseConfig.onboarding, status: 'draft' } } })
      .eq('id', draft.id);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Promote to scanning + persist the jobId (for the status endpoint + Phase-2 hook).
  await supabase
    .from('accounts')
    .update({ config: { ...baseConfig, onboarding: { ...baseConfig.onboarding, status: 'scanning', jobId: result.jobId } } })
    .eq('id', draft.id);

  return NextResponse.json({ jobId: result.jobId });
}
