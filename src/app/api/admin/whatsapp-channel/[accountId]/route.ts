import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { supabase } from '@/lib/supabase';
import { disconnectChannel } from '@/lib/whatsapp-cloud/provisioning';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET — the channel block on the account page. Admin-only; never exposes the token. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const unauthorized = await requireAdminAuth();
  if (unauthorized) return unauthorized;

  const { accountId } = await params;
  const { data } = await supabase
    .from('whatsapp_channels')
    .select('id, waba_id, phone_number_id, display_phone_number, verified_name, status, payment_ready, onboarding_mode, templates, provision_state, sync_initiated_at, connected_at')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!data) return NextResponse.json({ channel: null });
  // token_secret_id is deliberately absent from the select — the admin UI has no use for it.
  return NextResponse.json({ channel: data });
}

/** DELETE — disconnect: unsubscribe, destroy the Vault secret, mark the row. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const unauthorized = await requireAdminAuth();
  if (unauthorized) return unauthorized;

  const { accountId } = await params;
  const { data } = await supabase
    .from('whatsapp_channels').select('id').eq('account_id', accountId).maybeSingle();
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    await disconnectChannel((data as any).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[admin] disconnect failed', e);
    return NextResponse.json({ error: 'disconnect_failed' }, { status: 500 });
  }
}
