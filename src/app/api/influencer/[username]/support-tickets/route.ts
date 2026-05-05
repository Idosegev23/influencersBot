/**
 * Mini-CRM list endpoint for an account's support tickets.
 *
 * GET /api/influencer/[username]/support-tickets?status=new&q=...&from=...&to=...&page=1
 *
 * Auth: brand-admin auth on this account, OR platform admin.
 *
 * The legacy `/api/support?username=` was a one-shot list with no
 * filters — kept for backwards-compat but new dashboard wiring should
 * use this endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;

const VALID_STATUSES = new Set([
  'new',
  'in_progress',
  'awaiting_customer',
  'shipped',
  'resolved',
  'closed',
  'cancelled',
]);

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string }> },
) {
  const { username } = await ctx.params;
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const isInfluencer = await checkInfluencerAuth(username);
  const isAdmin = (await requireAdminAuth()) === null;
  if (!isInfluencer && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const q = (url.searchParams.get('q') || '').trim();
  const fromIso = url.searchParams.get('from');
  const toIso = url.searchParams.get('to');
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));

  // Note: support_requests has no FK on product_id — PostgREST cannot
  // auto-embed the products row. Resolve product details separately
  // below if needed (none of the list-view UI uses them today).
  let query = supabase
    .from('support_requests')
    .select(
      `
      id, account_id, customer_name, customer_phone, message, brand,
      order_number, product_id, status, created_at, updated_at,
      ref_source, internal_notes, assigned_to, last_customer_notified_at,
      tracking_number, resolution_summary, resolved_at
    `,
      { count: 'exact' },
    )
    .eq('account_id', influencer.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // Status filter — allow comma-separated list, e.g. ?status=new,in_progress
  if (statusParam && statusParam !== 'all') {
    const statuses = statusParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => VALID_STATUSES.has(s));
    if (statuses.length > 0) {
      query = query.in('status', statuses);
    }
  }

  // Free-text search across name / phone / order # / message.
  // Postgres `or` filter — escape commas in the input or this trips up
  // PostgREST's parser (we strip them defensively).
  if (q.length > 0) {
    const safe = q.replace(/[,()]/g, ' ').slice(0, 80);
    query = query.or(
      `customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%,order_number.ilike.%${safe}%,message.ilike.%${safe}%`,
    );
  }

  if (fromIso) query = query.gte('created_at', fromIso);
  if (toIso) query = query.lte('created_at', toIso);

  const { data, error, count } = await query;
  if (error) {
    console.error('[support-tickets GET] db error:', error);
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  // Quick aggregate for the filter pills — small extra query but lets
  // us show counts per status without forcing the client to fetch all.
  const { data: agg } = await supabase
    .from('support_requests')
    .select('status', { count: 'exact', head: false })
    .eq('account_id', influencer.id);

  const counts: Record<string, number> = { all: 0 };
  for (const row of agg || []) {
    const s = (row as any).status as string;
    counts.all = (counts.all || 0) + 1;
    counts[s] = (counts[s] || 0) + 1;
  }

  return NextResponse.json({
    tickets: data || [],
    total: count || 0,
    page,
    pageSize: PAGE_SIZE,
    counts,
  });
}
