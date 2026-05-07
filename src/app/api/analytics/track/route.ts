/**
 * Same-origin batch analytics ingest. Used by the chat surface and any
 * authenticated dashboard view. Writes events to the `events` table after
 * validating shape + allow-listed event names.
 *
 * Distinct from the legacy /api/track endpoint: that one does single-event
 * tracking with idempotency + experiment side-effects (coupon WhatsApp etc.)
 * This one is a fire-and-forget batch writer with no side-effects beyond DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  parseBatch,
  ingestBatch,
  hashIp,
  clientIp,
} from '@/lib/analytics/server-ingest';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null);
    const parsed = parseBatch(raw);
    if (!parsed.ok || !parsed.batch) {
      return NextResponse.json({ error: parsed.error || 'invalid' }, { status: 400 });
    }

    const ipHash = await hashIp(clientIp(req));
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 300) || null;
    const country = req.headers.get('x-vercel-ip-country') || null;
    const referrer = req.headers.get('referer')?.slice(0, 500) || null;

    const result = await ingestBatch(parsed.batch, {
      surface: 'chat',
      userAgent,
      ipHash,
      country,
      referrer,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'failed' }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      accepted: result.accepted,
      rejected: result.rejected,
    });
  } catch (e: any) {
    console.error('[analytics/track] error:', e?.message);
    return NextResponse.json({ error: 'ingest_failed' }, { status: 500 });
  }
}
