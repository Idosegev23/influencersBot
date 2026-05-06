import { NextRequest, NextResponse } from 'next/server';
import { loginAgent } from '@/lib/auth/agent-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  const { accountUsername, firstName, lastName, password } = body || {};
  if (
    typeof accountUsername !== 'string' ||
    typeof firstName !== 'string' ||
    typeof lastName !== 'string' ||
    typeof password !== 'string'
  ) {
    return NextResponse.json({ ok: false, error: 'bad_input' }, { status: 400 });
  }

  const result = await loginAgent(accountUsername, firstName, lastName, password);
  if (!result.ok) {
    // Generic message — don't leak whether the agent exists vs wrong password.
    return NextResponse.json(
      { ok: false, error: 'invalid_credentials' },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    agent: {
      id: result.session.agent_id,
      first_name: result.session.first_name,
      last_name: result.session.last_name,
      display_name: result.session.display_name,
      is_admin: result.session.is_admin,
    },
  });
}
