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

  // Supabase JS caps a query at 1000 rows by default — for accounts
  // with high traffic that silently truncated visits / sessions /
  // tickets, so the brand dashboard underreported. Pull in 1000-row
  // pages until the table is exhausted. No artificial upper bound;
  // even 100K rows is just ~100 round-trips.
  async function fetchAll<T>(
    table: 'chat_visits' | 'chat_sessions' | 'support_requests',
    cols: string,
  ): Promise<T[]> {
    const PAGE = 1000;
    const out: T[] = [];
    let from = 0;
    // Bail safety after 200 pages (= 200K rows) to avoid runaway
    // requests if something goes weird; this is well above any
    // reasonable account size and we'll see it in logs if it ever hits.
    for (let i = 0; i < 200; i++) {
      const { data, error } = await supabase
        .from(table)
        .select(cols)
        .eq('account_id', accountId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error(`[attribution] ${table} chunk error:`, error);
        break;
      }
      const rows = (data || []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }

  const [visits, sessions, tickets] = await Promise.all([
    fetchAll<{ id: string; ref_source: string | null; anon_id: string | null; created_at: string }>(
      'chat_visits',
      'id, ref_source, anon_id, created_at',
    ),
    fetchAll<{ id: string; ref_source: string | null; created_at: string }>(
      'chat_sessions',
      'id, ref_source, created_at',
    ),
    fetchAll<{ id: string; ref_source: string | null; created_at: string }>(
      'support_requests',
      'id, ref_source, created_at',
    ),
  ]);

  // Coupons (for copy_count totals — global, not date-filtered, but we
  // still attribute by code)
  const { data: coupons } = await supabase
    .from('coupons')
    .select('code, copy_count, is_active')
    .eq('account_id', accountId);

  type Row = {
    slug: string;
    display_name: string;
    visits: number;
    unique_visitors: number;
    sessions: number;
    tickets: number;
    coupon_copies: number;
    conversion_rate: number; // sessions / visits
  };

  const bySlug = new Map<string, Row>();

  function rowFor(slug: string | null) {
    const key = (slug || '__direct__').toLowerCase();
    if (!bySlug.has(key)) {
      bySlug.set(key, {
        slug: key,
        display_name: niceName(slug),
        visits: 0,
        unique_visitors: 0,
        sessions: 0,
        tickets: 0,
        coupon_copies: 0,
        conversion_rate: 0,
      });
    }
    return bySlug.get(key)!;
  }

  // Track unique visitors per slug via Set of anon_ids
  const uniqAnon = new Map<string, Set<string>>();
  for (const v of visits || []) {
    const r = rowFor(v.ref_source);
    r.visits += 1;
    if (v.anon_id) {
      const key = (v.ref_source || '__direct__').toLowerCase();
      if (!uniqAnon.has(key)) uniqAnon.set(key, new Set());
      uniqAnon.get(key)!.add(v.anon_id);
    }
  }
  for (const [key, set] of uniqAnon) {
    const r = bySlug.get(key);
    if (r) r.unique_visitors = set.size;
  }

  for (const s of sessions || []) rowFor(s.ref_source).sessions += 1;
  for (const t of tickets || []) rowFor(t.ref_source).tickets += 1;
  for (const c of coupons || []) {
    if (!c.code) continue;
    const r = rowFor(c.code);
    r.coupon_copies += c.copy_count || 0;
  }

  // Compute conversion rate per row
  for (const r of bySlug.values()) {
    r.conversion_rate = r.visits > 0 ? r.sessions / r.visits : 0;
  }

  // Make sure every registered influencer has a row even if 0
  for (const it of registry) {
    if (!bySlug.has(it.slug.toLowerCase())) {
      bySlug.set(it.slug.toLowerCase(), {
        slug: it.slug.toLowerCase(),
        display_name: it.display_name || it.slug,
        visits: 0,
        unique_visitors: 0,
        sessions: 0,
        tickets: 0,
        coupon_copies: 0,
        conversion_rate: 0,
      });
    }
  }

  const rows = [...bySlug.values()].sort(
    (a, b) => (b.visits + b.sessions + b.tickets + b.coupon_copies) -
              (a.visits + a.sessions + a.tickets + a.coupon_copies),
  );

  const totals = {
    visits: (visits || []).length,
    uniqueVisitors: new Set((visits || []).map((v) => v.anon_id).filter(Boolean)).size,
    sessions: (sessions || []).length,
    tickets: (tickets || []).length,
    couponCopies: rows.reduce((acc, r) => acc + r.coupon_copies, 0),
    days,
    sinceIso,
  };

  return NextResponse.json({ totals, rows });
}
