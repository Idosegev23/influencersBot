/**
 * Live deliverability check for the widget's email fields.
 *
 * Under /api/widget on purpose: middleware.ts already rate-limits that prefix, so this
 * inherits the bucket instead of needing its own.
 *
 * Stateless, and it discloses nothing — every answer is derivable from a public MX lookup
 * by anyone who cares to run one. Nothing is stored: the authoritative check, and the only
 * one that records anything, happens in /api/support.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyEmail } from '@/lib/support/email-deliverability';

export const runtime = 'nodejs';   // dns/promises is unavailable on edge

function corsHeadersFor(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeadersFor(req.headers.get('origin') || '*') });
}

export async function POST(req: NextRequest) {
  const cors = corsHeadersFor(req.headers.get('origin') || '');
  try {
    const body = await req.json();
    const email = body?.email;
    if (typeof email !== 'string' || !email.trim() || email.length > 254) {
      return NextResponse.json({ error: 'email required' }, { status: 400, headers: cors });
    }
    const verdict = await verifyEmail(email);
    return NextResponse.json(verdict, { status: 200, headers: cors });
  } catch {
    // A validator that 500s must not take the form down with it. "I could not tell" is
    // always a safe answer here, because 'unknown' never blocks anyone.
    return NextResponse.json({ status: 'unknown' }, { status: 200, headers: cors });
  }
}
