/**
 * Admin: manage a single agent.
 *   PATCH  /api/admin/agents/[id]   → assign accounts / status / reset password / name
 *   DELETE /api/admin/agents/[id]   → remove agent (auth user + profile)
 *
 * Agent→accounts link is the public.users.managed_account_ids array (no junction table).
 */
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { supabase as supabaseAdmin } from '@/lib/supabase';

function genTempPassword(): string {
  return 'bestie-' + randomBytes(4).toString('hex');
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data: agent, error: loadErr } = await supabaseAdmin
    .from('users')
    .select('id, auth_user_id, role')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!agent || agent.role !== 'agent') {
    return NextResponse.json({ error: 'הסוכן לא נמצא' }, { status: 404 });
  }

  // Reset password → returns new temp creds, forces change on next login
  if (body?.reset_password) {
    if (!agent.auth_user_id) {
      return NextResponse.json({ error: 'לסוכן אין משתמש התחברות' }, { status: 400 });
    }
    const tempPassword = genTempPassword();
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(agent.auth_user_id, {
      password: tempPassword,
    });
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 });
    await supabaseAdmin.from('users').update({ must_change_password: true }).eq('id', id);
    return NextResponse.json({ success: true, credentials: { tempPassword } });
  }

  // Build a partial update for the simple fields
  const update: Record<string, any> = {};
  if (Array.isArray(body?.managed_account_ids)) {
    // de-dupe + keep only string UUIDs
    update.managed_account_ids = Array.from(
      new Set(body.managed_account_ids.filter((x: any) => typeof x === 'string'))
    );
  }
  if (typeof body?.full_name === 'string') update.full_name = body.full_name.trim() || null;
  if (typeof body?.status === 'string' && ['active', 'suspended'].includes(body.status)) {
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 });
  }

  const { error: updErr } = await supabaseAdmin.from('users').update(update).eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { id } = await params;
  const { data: agent } = await supabaseAdmin
    .from('users')
    .select('id, auth_user_id, role')
    .eq('id', id)
    .maybeSingle();
  if (!agent || agent.role !== 'agent') {
    return NextResponse.json({ error: 'הסוכן לא נמצא' }, { status: 404 });
  }

  if (agent.auth_user_id) {
    await supabaseAdmin.auth.admin.deleteUser(agent.auth_user_id).catch(() => {});
  }
  const { error } = await supabaseAdmin.from('users').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
