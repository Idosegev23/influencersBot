/**
 * Agency-CRM agent session helpers.
 *
 * Agents authenticate via Supabase Auth (role='agent'); their profile lives in
 * public.users (keyed by auth_user_id). Admin uses a separate cookie path
 * (see src/lib/auth/admin-auth.ts) — these helpers are agent-only.
 */
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export interface AgentSession {
  id: string;                    // public.users.id
  authUserId: string;            // auth.users.id
  username: string | null;
  email: string;                 // login identity (stable)
  contactEmail: string | null;   // real email — inbound-email matching key
  whatsapp: string | null;       // inbound-WhatsApp matching key
  fullName: string | null;
  role: string;
  managedAccountIds: string[];
  mustChangePassword: boolean;
  onboardingCompleted: boolean;
  status: string;
}

const SELECT =
  'id, auth_user_id, username, email, contact_email, whatsapp, full_name, role, managed_account_ids, must_change_password, onboarding_completed, status';

function mapRow(row: any): AgentSession {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    username: row.username ?? null,
    email: row.email,
    contactEmail: row.contact_email ?? null,
    whatsapp: row.whatsapp ?? null,
    fullName: row.full_name ?? null,
    role: row.role,
    managedAccountIds: row.managed_account_ids ?? [],
    mustChangePassword: !!row.must_change_password,
    onboardingCompleted: !!row.onboarding_completed,
    status: row.status,
  };
}

/**
 * Resolve the currently-logged-in agent from the Supabase Auth cookie.
 * Returns null if not authenticated, not an agent, or not active.
 */
export async function getCurrentAgent(): Promise<AgentSession | null> {
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  // Use the service-role client for the profile lookup (avoids RLS surprises).
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(SELECT)
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;
  if (data.role !== 'agent') return null;
  if (data.status !== 'active') return null;
  return mapRow(data);
}

/**
 * API-route guard. Returns { agent } on success, or a NextResponse to return
 * directly on failure.
 *   const gate = await requireAgentApi();
 *   if (gate instanceof NextResponse) return gate;
 *   const { agent } = gate;
 */
export async function requireAgentApi(): Promise<{ agent: AgentSession } | NextResponse> {
  const agent = await getCurrentAgent();
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return { agent };
}
