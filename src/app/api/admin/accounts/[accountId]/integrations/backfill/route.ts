/**
 * POST /api/admin/accounts/[id]/integrations/backfill
 *   → admin-triggered FULL order backfill (all pages) for a connected store, run in the
 *     background via QStash (the /api/cs/orders-backfill worker). Admin-only. Idempotent —
 *     re-running just re-upserts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { enqueueOrdersBackfill } from '@/lib/orders/enqueue-backfill';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId } = await params;
  const supabase = await createClient();
  const { data: account, error } = await supabase.from('accounts').select('config').eq('id', accountId).single();
  if (error || !account) return NextResponse.json({ error: 'account not found' }, { status: 404 });

  const qs = ((account.config as any)?.integrations?.quickshop) || null;
  if (!qs?.api_key) return NextResponse.json({ ok: false, error: 'לא מחוברת חנות QuickShop עם מפתח שמור.' }, { status: 400 });

  const { queued, error: qErr } = await enqueueOrdersBackfill(accountId);
  if (!queued) return NextResponse.json({ ok: false, error: qErr || 'enqueue failed' }, { status: 500 });
  return NextResponse.json({ ok: true, queued: true });
}
