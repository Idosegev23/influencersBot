import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

type Params = { params: Promise<{ accountId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId } = await params;
  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();
  if (error || !account) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const escalation = ((account.config || {}) as any).escalation || { enabled: true, recipients: [] };
  return NextResponse.json({ escalation });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId } = await params;
  const body = await req.json().catch(() => ({}));
  const supabase = await createClient();

  const { data: account, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();
  if (error || !account) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const config = (account.config || {}) as Record<string, any>;
  const existing = (config.escalation || {}) as Record<string, any>;

  const recipients = Array.isArray(body.recipients)
    ? body.recipients
        .map((r: any) => ({
          name: typeof r?.name === 'string' ? r.name.trim() : '',
          email: typeof r?.email === 'string' ? r.email.trim() : '',
          whatsapp: typeof r?.whatsapp === 'string' ? r.whatsapp.trim() : '',
        }))
        .filter((r: any) => r.email || r.whatsapp)
    : existing.recipients || [];

  const next = {
    ...existing,
    enabled: body.enabled === false ? false : true,
    recipients,
    dedupeMinutes:
      typeof body.dedupeMinutes === 'number' && body.dedupeMinutes > 0
        ? body.dedupeMinutes
        : existing.dedupeMinutes ?? 15,
  };

  const updatedConfig = { ...config, escalation: next };
  const { error: writeErr } = await supabase
    .from('accounts')
    .update({ config: updatedConfig })
    .eq('id', accountId);
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, escalation: next });
}
