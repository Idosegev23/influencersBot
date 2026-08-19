/**
 * Widget Diagnostics — POST /api/widget/diagnostics
 *
 * Deliberately UNAUTHENTICATED. When /api/widget/config fails, the widget never
 * receives an analytics token and therefore cannot report that failure through
 * the token-gated /api/widget/events. The most important failure to catch is the
 * one the existing pipeline structurally cannot report.
 *
 * Compensating controls: a narrow rate-limit bucket in middleware.ts, an
 * account-existence check, a 2KB body cap, and an allow-list sanitizer.
 *
 * Like every public widget route, this never 500s and never reveals whether an
 * account exists — all outcomes are 204.
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redisRPush } from '@/lib/redis';
import { bufferKey } from '@/lib/analytics/widget-events';
import { sanitizeDiagnostic } from '@/lib/telemetry/diagnostics';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 2048;

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    // This response varies by request Origin, so any shared cache must key on
    // it. Without this a cached response carrying one customer's origin can be
    // served to another, and their widget's beacons fail CORS for no reason
    // visible on either side. See src/app/api/widget/events/route.ts:24-34.
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin') || '*') });
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin') || '*');
  try {
    // sendBeacon defaults to text/plain, so read as text and parse ourselves.
    const text = await req.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
      return new Response(null, { status: 204, headers });
    }

    const body = JSON.parse(text) as Record<string, unknown>;
    const accountId = typeof body.accountId === 'string' ? body.accountId : '';
    if (!accountId) return new Response(null, { status: 204, headers });

    const clean = sanitizeDiagnostic(body);
    if (!clean) return new Response(null, { status: 204, headers });

    const { data } = await supabase.from('accounts').select('id').eq('id', accountId).maybeSingle();
    if (!data) return new Response(null, { status: 204, headers });

    await redisRPush(bufferKey(), [JSON.stringify({
      account_id: accountId,
      anon_id: null,
      session_id: null,
      event_uid: null,
      type: clean.type,
      path: typeof body.path === 'string' ? body.path.split('?')[0].slice(0, 512) : null,
      payload: clean.payload,
      created_at: new Date().toISOString(),
    })]);

    return new Response(null, { status: 204, headers });
  } catch {
    // Never 500 the widget — diagnostics is best-effort by definition.
    return new Response(null, { status: 204, headers });
  }
}
