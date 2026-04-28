/**
 * GET  /api/admin/handoff?token=<HANDOFF_ADMIN_TOKEN>
 *   → { enabled: boolean }
 *
 * POST /api/admin/handoff?token=<HANDOFF_ADMIN_TOKEN>
 *   body: { enabled: true | false }
 *   → { enabled: boolean }
 *
 * Flips accounts.config.features.handoff_button_enabled on the LDRS
 * account. The chat page reads this flag at load time, so toggling
 * is live within seconds (no deploy needed). Gated by a shared token
 * in the URL — set HANDOFF_ADMIN_TOKEN in Vercel env.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function checkToken(req: NextRequest): boolean {
  const expected = (process.env.HANDOFF_ADMIN_TOKEN || '').trim();
  if (!expected) return false;
  const got = (req.nextUrl.searchParams.get('token') || '').trim();
  return got === expected;
}

async function readEnabled(): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', LDRS_ACCOUNT_ID)
    .single();
  if (error || !data) throw new Error('account not found');
  return (data.config as any)?.features?.handoff_button_enabled === true;
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ enabled: await readEnabled() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const enabled = !!body.enabled;
    const supabase = getSupabase();

    // Read current config so we can preserve everything else under config.features
    const { data: row } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', LDRS_ACCOUNT_ID)
      .single();
    const cfg = (row?.config as any) || {};
    const features = { ...(cfg.features || {}), handoff_button_enabled: enabled };
    const newCfg = { ...cfg, features };

    const { error: upErr } = await supabase
      .from('accounts')
      .update({ config: newCfg })
      .eq('id', LDRS_ACCOUNT_ID);
    if (upErr) throw upErr;

    return NextResponse.json({ enabled });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
