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
import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mapMetaLead } from '@/lib/bestie/lead-intake';
import { sendLeadIntro } from '@/lib/bestie/lead-greeting';

// The after() callback greets the lead over WhatsApp; give it room past the
// 30s default so a slow Graph call cannot truncate the send.
export const maxDuration = 60;

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
    const verified = Boolean(expected && provided === expected);

    // Deliberately NOT a 401.
    //
    // Rejecting an unverified post would mean that the day the Make scenario is
    // edited and loses this header, every real lead is refused and gone — and it
    // looks identical to a quiet week. This codebase has already paid that
    // price once: the landing form 500'd on every submission and captured zero
    // leads for its entire life before anyone noticed.
    //
    // So an unverified payload is always STORED and never ACTED ON: no WhatsApp,
    // no lead record, no email. Nothing can be lost, and nothing can be
    // triggered by someone who found the URL.
    if (!verified) {
      console.warn(
        '[meta-ads] UNVERIFIED payload stored, no action taken.',
        expected ? 'X-Bestie-Secret missing or wrong — check the Make HTTP module.'
                 : 'META_LEADS_WEBHOOK_SECRET is not configured on this deployment.'
      );
    }

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

    // ---------------------------------------------------------------
    // Act on the lead. Only when verified — an unverified payload is
    // recorded above and goes no further.
    // ---------------------------------------------------------------
    const mapped = mapMetaLead(body ?? {});
    let leadId: string | null = null;

    if (verified) {
      // leadgen_id is unique, so Meta's at-least-once delivery is a no-op here.
      const { data: lead, error: leadError } = await supabase
        .from('bestie_leads')
        .upsert(
          {
            leadgen_id: mapped.leadgenId,
            form_id: mapped.formId,
            ad_id: mapped.adId,
            adset_id: mapped.adsetId,
            campaign_id: mapped.campaignId,
            full_name: mapped.fullName,
            email: mapped.email,
            phone_raw: mapped.phoneRaw,
            wa_id: mapped.waId,
            raw_payload: body ?? {},
            status: mapped.deliverable ? 'pending' : 'undeliverable',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'leadgen_id' }
        )
        .select('id, status, greeted_at')
        .single();

      if (leadError) {
        console.error('[meta-ads] lead upsert failed', leadError);
      } else if (lead) {
        leadId = lead.id;

        // Greet in the background so Make gets its 200 immediately. greeted_at
        // guards a redelivery that arrived without a leadgen_id to dedupe on.
        if (mapped.deliverable && !lead.greeted_at) {
          after(async () => {
            const sent = await sendLeadIntro({
              waId: mapped.waId!,
              firstName: mapped.firstName,
            });
            if (!sent.success) {
              console.error('[meta-ads] intro template failed for lead', lead.id);
              return;
            }
            const nowIso = new Date().toISOString();
            await supabase
              .from('bestie_leads')
              .update({ status: 'greeted', greeted_at: nowIso, updated_at: nowIso })
              .eq('id', lead.id);
            // The session is what the webhook looks up by when they reply.
            await supabase
              .from('bestie_lead_sessions')
              .upsert({ wa_id: mapped.waId!, lead_id: lead.id }, { onConflict: 'wa_id' });
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      id: data.id,
      verified,
      leadId,
      deliverable: mapped.deliverable,
      receivedKeys: keysOf(body),
      note: verified
        ? mapped.deliverable
          ? 'lead stored, greeting queued'
          : 'lead stored, no usable phone number — nothing sent'
        : 'stored UNVERIFIED and NOT acted on — send X-Bestie-Secret',
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
