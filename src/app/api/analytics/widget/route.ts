/**
 * Cross-origin batch analytics ingest for the embedded widget.
 *
 * Auth: HMAC-signed widget_token (24h TTL) issued by /api/widget/config and
 * scoped to a single accountId. The token must match the accountId in the
 * batch — preventing one client's domain from polluting another's data.
 *
 * Designed for navigator.sendBeacon: accepts text/plain (no preflight),
 * returns 204 with permissive CORS, fire-and-forget on errors.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  parseBatch,
  ingestBatch,
  hashIp,
  clientIp,
} from '@/lib/analytics/server-ingest';
import { verifyWidgetToken } from '@/lib/analytics/widget-token';

export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
} as const;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    // sendBeacon defaults to text/plain so we read as text and JSON.parse.
    const text = await req.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return cors({ error: 'invalid_json' }, 400);
    }

    const parsed = parseBatch(raw);
    if (!parsed.ok || !parsed.batch) return cors({ error: parsed.error || 'invalid' }, 400);

    const tokenRaw = (raw as Record<string, unknown>).token;
    if (typeof tokenRaw !== 'string') return cors({ error: 'token_required' }, 401);
    const verified = verifyWidgetToken(tokenRaw);
    if (!verified) return cors({ error: 'token_invalid' }, 401);
    if (verified.accountId !== parsed.batch.accountId) {
      return cors({ error: 'token_account_mismatch' }, 403);
    }

    const ipHash = await hashIp(clientIp(req));
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 300) || null;
    const country = req.headers.get('x-vercel-ip-country') || null;
    const referrer = req.headers.get('referer')?.slice(0, 500) || null;

    const result = await ingestBatch(parsed.batch, {
      surface: 'widget',
      userAgent,
      ipHash,
      country,
      referrer,
    });

    if (!result.ok) return cors({ error: result.error || 'failed' }, result.status);
    return cors({ ok: true, accepted: result.accepted, rejected: result.rejected }, 200);
  } catch (e: any) {
    console.error('[analytics/widget] error:', e?.message);
    return cors({ error: 'ingest_failed' }, 500);
  }
}

function cors(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}
