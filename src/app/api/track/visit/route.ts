/**
 * Page-view tracker for the chat surface.
 *
 * Called by the chat page on mount. Records one row in chat_visits per
 * page open, tagged with full attribution (UTM/gclid/fbclid/referrer)
 * pulled from a signed cookie set by middleware.ts on first visit (so
 * adblockers can't suppress the data) plus a body fallback for cases
 * where the cookie is missing (e.g., subdomain mismatch).
 *
 * Dedup: skip if the same (account_id, anon_id) was logged in the past
 * 30 minutes — prevents over-counting tab refreshes / SPA navigations.
 *
 * is_returning: true if any chat_visit exists for the same anon_id+account
 * in the last 30 days.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

const REF_RE = /^[a-z0-9_.-]{1,32}$/i;
const ANON_RE = /^[a-zA-Z0-9_-]{4,64}$/;

interface AttributionPayload {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  referrer_host?: string;
  landing_path?: string;
}

function readAttributionCookie(req: NextRequest): AttributionPayload | null {
  const raw = req.cookies.get('ldrs_attr')?.value;
  if (!raw || !raw.includes('.')) return null;
  const [payloadB64, sig] = raw.split('.', 2);
  if (!payloadB64 || !sig) return null;
  const secret =
    process.env.ANALYTICS_WIDGET_SECRET ||
    process.env.IP_HASH_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';
  if (!secret) return null;
  const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const expected = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');
  if (expected.length !== sig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    return JSON.parse(payloadStr);
  } catch {
    return null;
  }
}

function detectDevice(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobile|iphone|android.*mobile/.test(ua)) return 'mobile';
  return 'desktop';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, ref, anonId, sessionId, attribution: bodyAttr } = body || {};

    if (typeof username !== 'string' || !username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'account not found' }, { status: 404 });
    }
    const accountId = influencer.id;

    const cleanRef = typeof ref === 'string' && REF_RE.test(ref) ? ref.toLowerCase() : null;
    const cleanAnon = typeof anonId === 'string' && ANON_RE.test(anonId) ? anonId : null;

    // Dedup last 30 minutes by (account_id, anon_id)
    if (cleanAnon) {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('chat_visits')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('anon_id', cleanAnon)
        .gte('created_at', since);
      if ((count || 0) > 0) {
        return NextResponse.json({ ok: true, deduped: true });
      }
    }

    // Returning visitor: any visit in past 30 days from same anon
    let isReturning = false;
    if (cleanAnon) {
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('chat_visits')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('anon_id', cleanAnon)
        .gte('created_at', since30d);
      isReturning = (count || 0) > 0;
    }

    // Hash the IP for rate-limiting / abuse signals — never store raw IP
    const rawIp = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || null;
    const ipHash = rawIp
      ? crypto
          .createHash('sha256')
          .update(rawIp + (process.env.IP_HASH_SALT || ''))
          .digest('hex')
          .slice(0, 32)
      : null;

    const userAgent = (req.headers.get('user-agent') || '').slice(0, 300);
    const referer = (req.headers.get('referer') || '').slice(0, 500);
    const country = req.headers.get('x-vercel-ip-country') || null;
    const acceptLang = req.headers.get('accept-language') || '';
    const lang = acceptLang.split(',')[0]?.split('-')[0]?.slice(0, 8) || null;

    // Attribution: prefer signed cookie (middleware-set), fallback to body.
    const attr =
      readAttributionCookie(req) ||
      (bodyAttr && typeof bodyAttr === 'object' ? (bodyAttr as AttributionPayload) : {}) ||
      {};

    const { error: insErr } = await supabase.from('chat_visits').insert({
      account_id: accountId,
      ref_source: cleanRef,
      anon_id: cleanAnon,
      session_id: typeof sessionId === 'string' && sessionId.length <= 64 ? sessionId : null,
      user_agent: userAgent || null,
      ip_hash: ipHash,
      referer: referer || null,
      utm_source: attr.utm_source || null,
      utm_medium: attr.utm_medium || null,
      utm_campaign: attr.utm_campaign || null,
      utm_term: attr.utm_term || null,
      utm_content: attr.utm_content || null,
      gclid: attr.gclid || null,
      fbclid: attr.fbclid || null,
      ttclid: attr.ttclid || null,
      landing_path: attr.landing_path || null,
      referrer_host: attr.referrer_host || null,
      device: userAgent ? detectDevice(userAgent) : null,
      country,
      language: lang,
      is_returning: isReturning,
    });

    if (insErr) {
      console.warn('[track/visit] insert failed:', insErr.message);
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, isReturning });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'tracking failed' }, { status: 500 });
  }
}
