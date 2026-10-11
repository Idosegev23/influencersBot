import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { connectAccountFromSignup } from '@/lib/whatsapp-cloud/connect-account';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/influencer/[username]/whatsapp — an EXISTING customer connects their number
 * from their own dashboard.
 *
 * Same flow as the onboarding wizard, different door. The account comes from the session,
 * never from the request body — a logged-in customer can only ever connect their own.
 */
export async function POST(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  const out = await connectAccountFromSignup(auth.influencer.id, body);
  return NextResponse.json(out.body, { status: out.status });
}
