import { NextRequest, NextResponse } from 'next/server';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';
import { connectAccountFromSignup } from '@/lib/whatsapp-cloud/connect-account';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/onboard/[token]/whatsapp — the customer connects their own WhatsApp number.
 *
 * Body: { code, waba_id, phone_number_id } from the Embedded Signup popup.
 * There is NO accountId in the body, ever: the onboarding token resolves it server-side,
 * the same anti-IDOR pattern as the Instagram connect route.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const draft = await resolveDraftByToken(token);
  if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  const out = await connectAccountFromSignup(draft.id, body);
  return NextResponse.json(out.body, { status: out.status });
}
