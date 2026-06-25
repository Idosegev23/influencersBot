/**
 * POST /api/agent/settings/password — agent changes their own password.
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => null);
  const password = String(body?.password ?? '');
  if (password.length < 8) {
    return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }, { status: 400 });
  }

  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
