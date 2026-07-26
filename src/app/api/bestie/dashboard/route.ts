/**
 * The brand-facing assistant endpoint.
 *
 * The account is taken from the authenticated session and from nowhere else.
 * Any accountId in the request body is ignored on purpose — see spec §4.1: the
 * model summarises text this brand's own customers wrote, so the request body
 * is not a trusted source for whose data to read.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { normalizeCurrentRoute } from '@/lib/bestie/dashboard/context';
import { runDashboardTurn } from '@/lib/bestie/dashboard/dashboard-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // retrieval + brain

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  const message = String(body?.message ?? '').trim();
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

  // requireInfluencerAuth validates the session cookie against this username.
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const { reply } = await runDashboardTurn({
      ctx: {
        // From the session. body.accountId is deliberately not read.
        accountId: (auth as any).accountId ?? auth.influencer!.id,
        username: auth.username!,
        currentRoute: normalizeCurrentRoute(body?.currentPath),
        language: (auth.influencer as any)?.language ?? 'he',
      },
      message,
      history: Array.isArray(body?.history) ? body.history.slice(-10) : [],
    });

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[bestie dashboard] turn failed', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
