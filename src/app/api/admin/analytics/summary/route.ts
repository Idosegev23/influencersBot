/**
 * Admin per-account analytics summary. Wraps the shared
 * getAccountAnalyticsSummary helper with admin auth + cost data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getAccountAnalyticsSummary } from '@/lib/analytics/summary';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10);
  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  try {
    const data = await getAccountAnalyticsSummary({
      accountId,
      days: Number.isFinite(days) ? days : 30,
      includeCost: true,
    });
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[admin/analytics/summary] error:', e);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
