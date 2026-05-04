/**
 * Per-influencer attribution stats for the brand dashboard.
 *
 * Returns counts of chat sessions, support tickets, and coupon copies
 * grouped by ref_source over a configurable date window.
 *
 * GET /api/influencer/attribution?username=<slug>&days=30
 *
 * Auth: requires the influencer cookie (same pattern as the rest of the
 * /api/influencer/* routes).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

interface InfluencerRegistryItem {
  slug: string;
  display_name: string;
  coupon_code?: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;

  const url = new URL(req.url);
  const days = Math.min(180, Math.max(1, Number(url.searchParams.get('days') || '30')));

  const accountId = auth.influencer!.id;
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const cfg = (auth.influencer as any)?._rawConfig || {};
  const registry: InfluencerRegistryItem[] = (cfg.influencer_registry as InfluencerRegistryItem[]) || [];
  const refLookup = new Map<string, string>();
  for (const it of registry) {
    if (it.slug) refLookup.set(it.slug.toLowerCase(), it.display_name || it.slug);
    if (it.coupon_code) refLookup.set(it.coupon_code.toLowerCase(), it.display_name || it.slug);
  }
  const niceName = (slug: string | null) => {
    if (!slug) return '— ישיר / לא ידוע —';
    return refLookup.get(slug.toLowerCase()) || slug;
  };

  // Sessions
  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id, ref_source, created_at')
    .eq('account_id', accountId)
    .gte('created_at', sinceIso);

  // Support tickets
  const { data: tickets } = await supabase
    .from('support_requests')
    .select('id, ref_source, created_at')
    .eq('account_id', accountId)
    .gte('created_at', sinceIso);

  // Coupons (for copy_count totals — global, not date-filtered, but we
  // still attribute by code)
  const { data: coupons } = await supabase
    .from('coupons')
    .select('code, copy_count, is_active')
    .eq('account_id', accountId);

  type Row = {
    slug: string;
    display_name: string;
    sessions: number;
    tickets: number;
    coupon_copies: number;
  };

  const bySlug = new Map<string, Row>();

  function rowFor(slug: string | null) {
    const key = (slug || '__direct__').toLowerCase();
    if (!bySlug.has(key)) {
      bySlug.set(key, {
        slug: key,
        display_name: niceName(slug),
        sessions: 0,
        tickets: 0,
        coupon_copies: 0,
      });
    }
    return bySlug.get(key)!;
  }

  for (const s of sessions || []) rowFor(s.ref_source).sessions += 1;
  for (const t of tickets || []) rowFor(t.ref_source).tickets += 1;
  for (const c of coupons || []) {
    if (!c.code) continue;
    const r = rowFor(c.code);
    r.coupon_copies += c.copy_count || 0;
  }

  // Make sure every registered influencer has a row even if 0
  for (const it of registry) {
    if (!bySlug.has(it.slug.toLowerCase())) {
      bySlug.set(it.slug.toLowerCase(), {
        slug: it.slug.toLowerCase(),
        display_name: it.display_name || it.slug,
        sessions: 0,
        tickets: 0,
        coupon_copies: 0,
      });
    }
  }

  const rows = [...bySlug.values()].sort(
    (a, b) => (b.sessions + b.tickets + b.coupon_copies) - (a.sessions + a.tickets + a.coupon_copies),
  );

  const totals = {
    sessions: (sessions || []).length,
    tickets: (tickets || []).length,
    couponCopies: rows.reduce((acc, r) => acc + r.coupon_copies, 0),
    days,
    sinceIso,
  };

  return NextResponse.json({ totals, rows });
}
