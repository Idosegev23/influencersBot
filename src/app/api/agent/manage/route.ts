import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAgentSession, hashPassword, type AgentSession } from '@/lib/auth/agent-auth';

export const runtime = 'nodejs';

const MIN_PASSWORD = 6;
const OPEN_EXCLUDED = '("resolved","closed","cancelled")';

/**
 * Admin-only agent management for the logged-in admin's own account.
 *
 *  GET   ?accountUsername=…  → every agent, including deactivated ones
 *  POST  { accountUsername, first_name, last_name, password, is_admin?, is_routable? }
 *  PATCH { accountUsername, id, is_admin?, is_active?, is_routable?, password? }
 *
 * Agents are deactivated, never deleted: their name stays on the tickets
 * and history they touched, so the analytics numbers don't shift.
 * Deactivating never moves tickets. Agents often handle a ticket without
 * changing its status, so "open" ones may well be done; reassigning is
 * left to a human.
 */
async function requireAdmin(
  accountUsername: string | null,
): Promise<{ session: AgentSession } | { res: NextResponse }> {
  if (!accountUsername) {
    return { res: NextResponse.json({ error: 'accountUsername required' }, { status: 400 }) };
  }
  const session = await getAgentSession(accountUsername);
  if (!session) return { res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!session.is_admin) return { res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(new URL(req.url).searchParams.get('accountUsername'));
  if ('res' in auth) return auth.res;

  const { data, error } = await supabase
    .from('support_agents')
    .select('id, first_name, last_name, is_admin, is_active, is_routable, last_login_at, created_at')
    .eq('account_id', auth.session.account_id)
    .order('is_active', { ascending: false })
    .order('first_name');
  if (error) {
    console.error('[agent/manage] list:', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Open tickets per agent, so the admin sees what a deactivation will hand back.
  const ids = (data || []).map((a) => a.id);
  const openCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: open } = await supabase
      .from('support_requests')
      .select('assigned_agent_id')
      .in('assigned_agent_id', ids)
      .not('status', 'in', OPEN_EXCLUDED);
    for (const t of open || []) {
      openCounts.set(t.assigned_agent_id, (openCounts.get(t.assigned_agent_id) || 0) + 1);
    }
  }

  return NextResponse.json({
    self_id: auth.session.agent_id,
    agents: (data || []).map((a) => ({ ...a, open_tickets: openCounts.get(a.id) || 0 })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await requireAdmin(body.accountUsername ?? null);
  if ('res' in auth) return auth.res;

  const first_name = String(body.first_name || '').trim();
  const last_name = String(body.last_name || '').trim();
  const password = String(body.password || '');
  if (!first_name || !last_name) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: 'password_too_short' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('support_agents')
    .insert({
      account_id: auth.session.account_id,
      first_name,
      last_name,
      password_hash: await hashPassword(password),
      is_admin: !!body.is_admin,
      is_active: true,
      is_routable: body.is_routable !== false,
    })
    .select('id')
    .single();
  if (error) {
    // Login is by first + last name, so the pair must be unique per account.
    if (error.code === '23505') return NextResponse.json({ error: 'name_taken' }, { status: 409 });
    console.error('[agent/manage] create:', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await requireAdmin(body.accountUsername ?? null);
  if ('res' in auth) return auth.res;
  const { session } = auth;

  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  // An admin can't lock themselves out by removing their own access.
  if (id === session.agent_id && (body.is_admin === false || body.is_active === false)) {
    return NextResponse.json({ error: 'cannot_demote_self' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.is_admin === 'boolean') update.is_admin = body.is_admin;
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active;
  if (typeof body.is_routable === 'boolean') update.is_routable = body.is_routable;
  if (body.password !== undefined) {
    const pw = String(body.password);
    if (pw.length < MIN_PASSWORD) {
      return NextResponse.json({ error: 'password_too_short' }, { status: 400 });
    }
    update.password_hash = await hashPassword(pw);
  }

  const { data: updated, error } = await supabase
    .from('support_agents')
    .update(update)
    .eq('id', id)
    .eq('account_id', session.account_id)
    .select('id, first_name, last_name')
    .maybeSingle();
  if (error) {
    console.error('[agent/manage] update:', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
