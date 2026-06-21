/**
 * Agent onboarding step 1: forced password change.
 * POST /api/agent/onboarding/password { password }
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const body = await request.json().catch(() => null);
  const newPassword = String(body?.password ?? '');
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'הסיסמה חייבת להכיל לפחות 8 תווים' },
      { status: 400 }
    );
  }

  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from('users').update({ must_change_password: false }).eq('id', agent.id);

  const redirect = agent.onboardingCompleted ? '/agent' : '/agent/onboarding/profile';
  return NextResponse.json({ success: true, redirect });
}
