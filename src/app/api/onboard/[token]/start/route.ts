import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';
import { startPipeline } from '@/lib/pipeline/start';
import { normalizeIgUsername } from '@/lib/pipeline/username';

export const dynamic = 'force-dynamic';

/**
 * POST /api/onboard/[token]/start  { website, tiktok, youtube, whatsapp, email }
 * Token-guarded. Persists sources + owner contact, sets the account's username to
 * the connected IG handle, marks scanning, and kicks off the full pipeline.
 * Idempotent: only allowed while status is draft/filled.
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
  const whatsapp = (body.whatsapp || '').trim();
  const email = (body.email || '').trim();

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

  const igHandle = normalizeIgUsername(conn.ig_username);
  const sources = { instagram: igHandle, website, youtube, tiktok };

  const nextConfig = {
    ...draft.config,
    username: igHandle,
    sources,
    onboarding: { ...ob, status: 'scanning', ownerWhatsapp: whatsapp, ownerEmail: email },
  };
  await supabase.from('accounts').update({ config: nextConfig }).eq('id', draft.id);

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
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  // Stash the jobId for the status endpoint + the Phase-2 completion hook.
  await supabase
    .from('accounts')
    .update({ config: { ...nextConfig, onboarding: { ...nextConfig.onboarding, jobId: result.jobId } } })
    .eq('id', draft.id);

  return NextResponse.json({ jobId: result.jobId });
}
