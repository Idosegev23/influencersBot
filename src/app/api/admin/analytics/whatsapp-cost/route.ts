/**
 * Admin: WhatsApp Cloud API cost dashboard data source.
 *
 * Aggregates `whatsapp_messages` over a configurable date range and
 * breaks down spend three ways:
 *   • by account (via support_ticket_history join on wa_message_id)
 *   • by template name (welcome / coupon / support_status_*)
 *   • by Meta pricing category (marketing / utility / authentication / service)
 *
 * Cost comes from per-message Meta data captured by the webhook
 * (`pricing_billable`, `pricing_category`, `pricing_model`) combined
 * with the country-level rate sheet in @/lib/whatsapp-cloud/pricing.
 *
 * Messages without a matching support_ticket_history row are bucketed
 * under accountId=null / display "מערכת" (welcome templates, weekly
 * digests, handoff leads — none of those originate from a ticket).
 *
 * GET params:
 *   days=30   — date range; bounded 1..365
 *   accountId — optional filter to a single account
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { supabase } from '@/lib/supabase';
import { messageCostUsd, usdToIls } from '@/lib/whatsapp-cloud/pricing';

export const runtime = 'nodejs';

interface MessageRow {
  id: string;
  wa_message_id: string | null;
  template_name: string | null;
  pricing_billable: boolean | null;
  pricing_category: string | null;
  pricing_model: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string;
}

interface HistoryRow {
  whatsapp_message_id: string;
  account_id: string;
}

interface AccountRow {
  id: string;
  config: any;
}

type BucketKey = string;
type BucketAgg = {
  key: string;
  label: string;
  count: number;
  billable: number;
  free: number;
  failed: number;
  cost_usd: number;
  cost_ils: number;
  category_breakdown: Record<string, number>;
};

export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days') || '30')));
  const accountFilter = url.searchParams.get('accountId') || null;
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1. Pull every outbound message in window. Keep memory bounded by
  // paging (1000 rows / page) — same defensive pattern as the
  // attribution route.
  const messages: MessageRow[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select(
        'id, wa_message_id, template_name, pricing_billable, pricing_category, pricing_model, status, sent_at, created_at',
      )
      .eq('direction', 'outbound')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error('[whatsapp-cost] messages page error:', error);
      break;
    }
    messages.push(...((data || []) as MessageRow[]));
    if ((data || []).length < 1000) break;
  }

  // 2. Build a wa_message_id → account_id map from support_ticket_history.
  // Fetch only the rows we need.
  const waIds = messages.map((m) => m.wa_message_id).filter((x): x is string => !!x);
  const accountByWaId = new Map<string, string>();
  if (waIds.length) {
    for (let i = 0; i < waIds.length; i += 500) {
      const slice = waIds.slice(i, i + 500);
      const { data, error } = await supabase
        .from('support_ticket_history')
        .select('whatsapp_message_id, account_id')
        .in('whatsapp_message_id', slice);
      if (error) {
        console.error('[whatsapp-cost] history lookup error:', error);
        break;
      }
      for (const row of (data || []) as HistoryRow[]) {
        if (!accountByWaId.has(row.whatsapp_message_id)) {
          accountByWaId.set(row.whatsapp_message_id, row.account_id);
        }
      }
    }
  }

  // 3. Resolve account display names for the IDs we found.
  const accountIds = [...new Set([...accountByWaId.values()])];
  const accountNames = new Map<string, string>();
  if (accountIds.length) {
    const { data: accountRows } = await supabase
      .from('accounts')
      .select('id, config')
      .in('id', accountIds);
    for (const a of (accountRows || []) as AccountRow[]) {
      accountNames.set(
        a.id,
        a.config?.display_name || a.config?.username || a.id,
      );
    }
  }

  // 4. Aggregate.
  const SYSTEM_KEY = '__system__';
  function bucket(key: string, label: string, agg: Map<BucketKey, BucketAgg>): BucketAgg {
    if (!agg.has(key)) {
      agg.set(key, {
        key,
        label,
        count: 0,
        billable: 0,
        free: 0,
        failed: 0,
        cost_usd: 0,
        cost_ils: 0,
        category_breakdown: {},
      });
    }
    return agg.get(key)!;
  }

  const byAccount = new Map<BucketKey, BucketAgg>();
  const byTemplate = new Map<BucketKey, BucketAgg>();
  const byCategory = new Map<BucketKey, BucketAgg>();

  let totalCount = 0;
  let totalBillable = 0;
  let totalFree = 0;
  let totalFailed = 0;
  let totalCostUsd = 0;

  for (const m of messages) {
    const wa = m.wa_message_id;
    const accountId = wa ? accountByWaId.get(wa) || null : null;

    if (accountFilter && accountId !== accountFilter) continue;

    const accountKey = accountId || SYSTEM_KEY;
    const accountLabel = accountId ? accountNames.get(accountId) || accountId : 'מערכת';
    const templateKey = m.template_name || '(free-form text)';
    const categoryKey = m.pricing_category || 'unknown';

    const cost = messageCostUsd({
      billable: m.pricing_billable,
      category: m.pricing_category,
      pricing_model: m.pricing_model,
    });

    const isFailed = m.status === 'failed';
    const isBillable = m.pricing_billable === true;
    const isFree = m.pricing_billable === false;

    const apply = (b: BucketAgg) => {
      b.count += 1;
      if (isFailed) b.failed += 1;
      if (isBillable) b.billable += 1;
      if (isFree) b.free += 1;
      b.cost_usd += cost;
      b.category_breakdown[categoryKey] = (b.category_breakdown[categoryKey] || 0) + 1;
    };

    apply(bucket(accountKey, accountLabel, byAccount));
    apply(bucket(templateKey, templateKey, byTemplate));
    apply(bucket(categoryKey, categoryKey, byCategory));

    totalCount += 1;
    if (isFailed) totalFailed += 1;
    if (isBillable) totalBillable += 1;
    if (isFree) totalFree += 1;
    totalCostUsd += cost;
  }

  const finalize = (m: Map<BucketKey, BucketAgg>): BucketAgg[] =>
    [...m.values()]
      .map((b) => ({ ...b, cost_ils: usdToIls(b.cost_usd) }))
      .sort((a, b) => b.cost_usd - a.cost_usd || b.count - a.count);

  return NextResponse.json({
    dateRange: { days, sinceIso, untilIso: new Date().toISOString() },
    totals: {
      messages: totalCount,
      billable: totalBillable,
      free: totalFree,
      failed: totalFailed,
      cost_usd: totalCostUsd,
      cost_ils: usdToIls(totalCostUsd),
    },
    byAccount: finalize(byAccount),
    byTemplate: finalize(byTemplate),
    byCategory: finalize(byCategory),
  });
}
