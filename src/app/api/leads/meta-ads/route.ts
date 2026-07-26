/**
 * Meta Lead Ads intake — CAPTURE-ONLY (temporary).
 *
 * Make.com pushes an instant-form submission here. Right now this endpoint does
 * exactly one thing: record the payload verbatim so we can read the real field
 * names, phone format, and consent flag off a live submission instead of guessing
 * at them while writing the spec.
 *
 * It deliberately does NOT: send WhatsApp, email sales, create a lead record, or
 * start a conversation. That logic lands once the design is approved.
 *
 * Auth: set META_LEADS_WEBHOOK_SECRET and send it as the X-Bestie-Secret header.
 * Until that env var exists the endpoint still accepts posts — otherwise there is
 * no way to run the very first test — but the row is stored verified=false and the
 * response says so out loud. Nothing unverified may be treated as a real lead.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Headers worth keeping for debugging. The secret header is never among them. */
const SAFE_HEADERS = ['content-type', 'user-agent', 'origin', 'referer'];

function parseBody(raw: string, contentType: string): { body: any | null; rawText: string | null } {
  const ct = contentType.toLowerCase();

  if (ct.includes('application/json') || raw.trimStart().startsWith('{') || raw.trimStart().startsWith('[')) {
    try {
      return { body: JSON.parse(raw), rawText: null };
    } catch {
      return { body: null, rawText: raw };
    }
  }

  if (ct.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    return { body: Object.fromEntries(params.entries()), rawText: null };
  }

  return { body: null, rawText: raw };
}

/** Field names only — never values. Safe to echo back so Make shows what landed. */
function keysOf(body: any): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body);
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    const raw = await req.text();
    const { body, rawText } = parseBody(raw, contentType);

    const expected = process.env.META_LEADS_WEBHOOK_SECRET;
    const provided = req.headers.get('x-bestie-secret');

    // Once the secret is configured, a wrong one is a hard reject — that is the
    // whole point of setting it. Before it is configured we accept but flag.
    if (expected && provided !== expected) {
      return NextResponse.json(
        { ok: false, error: 'bad or missing X-Bestie-Secret header' },
        { status: 401 }
      );
    }
    const verified = Boolean(expected && provided === expected);

    const headers: Record<string, string> = {};
    for (const name of SAFE_HEADERS) {
      const value = req.headers.get(name);
      if (value) headers[name] = value;
    }

    const { data, error } = await supabase
      .from('meta_lead_captures')
      .insert({
        verified,
        content_type: contentType || null,
        body,
        raw_text: rawText,
        headers,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[meta-ads capture] insert failed', error);
      return NextResponse.json({ ok: false, error: 'store failed' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      id: data.id,
      verified,
      receivedKeys: keysOf(body),
      note: verified
        ? 'captured'
        : 'captured UNVERIFIED — set META_LEADS_WEBHOOK_SECRET and send X-Bestie-Secret',
    });
  } catch (err) {
    console.error('[meta-ads capture] unexpected error', err);
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 });
  }
}

/** So the URL can be sanity-checked from a browser without posting anything. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/leads/meta-ads',
    mode: 'capture-only',
    method: 'POST',
  });
}
