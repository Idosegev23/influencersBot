/**
 * Unified system login (landing "כניסה למערכת").
 *
 * - username === 'admin'  → legacy env-password path; sets bestieai_admin_session
 *   cookie. Admin auth mechanism is unchanged (zero blast radius on /api/admin/*).
 * - otherwise             → Supabase Auth for agents (role='agent'). Resolves
 *   username → login email → signInWithPassword (sets the SSR auth cookie).
 *
 * Influencer and support-agent logins keep their own routes — untouched.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
const ADMIN_COOKIE = 'bestieai_admin_session';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // ---- Logout (clears both admin cookie and any Supabase session) ----
  if (body?.action === 'logout') {
    try {
      const sb = await createSupabaseServerClient();
      await sb.auth.signOut();
    } catch {
      /* no active supabase session — fine */
    }
    const res = NextResponse.json({ success: true });
    res.cookies.set(ADMIN_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
    });
    return res;
  }

  const username = String(body?.username ?? '').trim();
  const password = String(body?.password ?? '');
  const uname = username.toLowerCase();

  if (!username || !password) {
    return NextResponse.json({ error: 'שם משתמש וסיסמה נדרשים' }, { status: 400 });
  }

  // ---- Admin path (reserved username) ----
  if (uname === 'admin') {
    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'שם משתמש או סיסמה שגויים' }, { status: 401 });
    }
    const res = NextResponse.json({
      success: true,
      role: 'admin',
      redirect: '/admin/dashboard',
    });
    res.cookies.set(ADMIN_COOKIE, 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SEVEN_DAYS,
    });
    return res;
  }

  // ---- Agent path (Supabase Auth) ----
  const { data: u } = await supabaseAdmin
    .from('users')
    .select('email, role, status, must_change_password, onboarding_completed')
    .ilike('username', uname)
    .maybeSingle();

  if (!u || u.role !== 'agent') {
    return NextResponse.json({ error: 'שם משתמש או סיסמה שגויים' }, { status: 401 });
  }
  if (u.status !== 'active') {
    return NextResponse.json({ error: 'החשבון אינו פעיל' }, { status: 403 });
  }

  const sb = await createSupabaseServerClient();
  const { error: signInError } = await sb.auth.signInWithPassword({
    email: u.email,
    password,
  });
  if (signInError) {
    return NextResponse.json({ error: 'שם משתמש או סיסמה שגויים' }, { status: 401 });
  }

  // Best-effort last-login stamp.
  supabaseAdmin
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .ilike('username', uname)
    .then(undefined, () => {});

  let redirect = '/agent';
  if (u.must_change_password) redirect = '/agent/onboarding/password';
  else if (!u.onboarding_completed) redirect = '/agent/onboarding/profile';

  return NextResponse.json({ success: true, role: 'agent', redirect });
}
