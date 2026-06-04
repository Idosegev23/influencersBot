// src/app/api/cron/expire-coupons/route.ts
// Nightly hygiene: flip is_active=false for coupons whose end_date has passed.
// Correctness does not depend on this (date is authoritative in reads), but it
// keeps dashboards honest and shrinks the invalid-code scrub set.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('coupons')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true)
    .not('end_date', 'is', null)
    .lt('end_date', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('[expire-coupons] failed:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  console.log(`[expire-coupons] deactivated ${data?.length || 0} expired coupons`);
  return NextResponse.json({ ok: true, deactivated: data?.length || 0 });
}
