/**
 * Widget Events Ingest API — Public CORS-enabled batched analytics endpoint
 * POST /api/widget/events
 *
 * Receives batched widget analytics events cross-origin, verifies the
 * signed widget token (see src/lib/analytics/widget-token.ts), normalizes +
 * masks them, and pushes them onto a shared Redis list buffer for a later
 * drain cron to consume. Analytics is best-effort — this route must never
 * 500 the widget, so any internal failure still resolves to 204.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWidgetToken } from '@/lib/analytics/widget-token';
import { normalizeWidgetEvents, bufferKey } from '@/lib/analytics/widget-events';
import { redisRPush } from '@/lib/redis';

export const runtime = 'nodejs';

// ============================================
// CORS Headers
// ============================================

function getCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ============================================
// OPTIONS — CORS Preflight
// ============================================

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

// ============================================
// POST — Ingest batched events
// ============================================

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  const cors = getCorsHeaders(origin);
  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    const verified = verifyWidgetToken(token);
    if (!verified || verified.accountId !== body?.accountId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors });
    }
    const { rows } = normalizeWidgetEvents(body, verified.accountId);
    if (rows.length > 0) {
      // Buffer the batch as one JSON string per event; drain worker parses.
      await redisRPush(bufferKey(), rows.map((r) => JSON.stringify(r)));
    }
    return new Response(null, { status: 204, headers: cors });
  } catch {
    // Never 500 the widget — analytics is best-effort.
    return new Response(null, { status: 204, headers: cors });
  }
}
