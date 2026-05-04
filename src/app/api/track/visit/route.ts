/**
 * Page-view tracker for the chat surface.
 *
 * Called by the chat page on mount. Records one row in chat_visits per
 * page open, tagged with ref_source from the URL ?ref= param. Used to
 * measure top-of-funnel clicks per influencer separately from chat
 * sessions (a visitor who lands and bounces still counts as a visit
 * but creates no session).
 *
 * Dedup: skip if the same (account_id, anon_id) was logged in the past
 * 30 minutes — prevents over-counting tab refreshes / SPA navigations.
 *
 * POST body: { username, ref?, anonId?, sessionId? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

const REF_RE = /^[a-z0-9_.-]{1,32}$/i;
const ANON_RE = /^[a-zA-Z0-9_-]{4,64}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, ref, anonId, sessionId } = body || {};

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

    // Dedup last 30 minutes by (account_id, anon_id, ref_source)
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

    // Hash the IP for rate-limiting / abuse signals — never store raw IP
    const rawIp = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || null;
    const ipHash = rawIp
      ? crypto.createHash('sha256').update(rawIp + (process.env.IP_HASH_SALT || '')).digest('hex').slice(0, 32)
      : null;

    const userAgent = (req.headers.get('user-agent') || '').slice(0, 300);
    const referer = (req.headers.get('referer') || '').slice(0, 500);

    const { error: insErr } = await supabase.from('chat_visits').insert({
      account_id: accountId,
      ref_source: cleanRef,
      anon_id: cleanAnon,
      session_id: typeof sessionId === 'string' && sessionId.length <= 64 ? sessionId : null,
      user_agent: userAgent || null,
      ip_hash: ipHash,
      referer: referer || null,
    });

    if (insErr) {
      console.warn('[track/visit] insert failed:', insErr.message);
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'tracking failed' }, { status: 500 });
  }
}
