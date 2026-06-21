/**
 * Admin: agency-CRM agent management.
 *   GET  /api/admin/agents          → list agents
 *   POST /api/admin/agents          → create an agent (Supabase Auth + public.users)
 *
 * Agents log in via Supabase Auth (role='agent'); their login identity is a
 * stable internal email `${username}@influencerbot.local`. They are issued a
 * temp password and forced to change it + complete a profile on first login.
 */
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { supabase as supabaseAdmin } from '@/lib/supabase';

const LOGIN_EMAIL_DOMAIN = 'influencerbot.local';

function genTempPassword(): string {
  return 'bestie-' + randomBytes(4).toString('hex'); // e.g. bestie-9f3a2b1c
}

export async function GET() {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from('users')
    .select(
      'id, username, full_name, contact_email, whatsapp, status, managed_account_ids, must_change_password, onboarding_completed, last_login_at, created_at'
    )
    .eq('role', 'agent')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data || [] });
}

export async function POST(request: Request) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const username = String(body?.username ?? '').trim().toLowerCase();
  const fullName = body?.full_name ? String(body.full_name).trim() : null;

  if (!username) {
    return NextResponse.json({ error: 'שם משתמש נדרש' }, { status: 400 });
  }
  if (username === 'admin') {
    return NextResponse.json({ error: 'שם המשתמש "admin" שמור' }, { status: 400 });
  }
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    return NextResponse.json(
      { error: 'שם משתמש: 3-40 תווים, אותיות אנגליות קטנות / ספרות / . _ -' },
      { status: 400 }
    );
  }

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .ilike('username', username)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'שם המשתמש כבר קיים' }, { status: 409 });
  }

  const tempPassword = body?.password ? String(body.password) : genTempPassword();
  const loginEmail = `${username}@${LOGIN_EMAIL_DOMAIN}`;

  // 1) Supabase Auth user
  const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: loginEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role: 'agent', username, full_name: fullName },
  });
  if (authErr || !created?.user) {
    return NextResponse.json(
      { error: authErr?.message || 'יצירת משתמש נכשלה' },
      { status: 500 }
    );
  }

  // 2) public.users profile row
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('users')
    .insert({
      auth_user_id: created.user.id,
      email: loginEmail,
      username,
      full_name: fullName,
      role: 'agent',
      status: 'active',
      must_change_password: true,
      onboarding_completed: false,
      managed_account_ids: [],
    })
    .select('id, username')
    .single();

  if (profErr) {
    // avoid orphaned auth user
    await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    agent: { id: profile.id, username },
    // shown once to the admin so they can hand it to the agent
    credentials: { username, tempPassword },
  });
}
