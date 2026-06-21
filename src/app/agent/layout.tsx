/**
 * Top-level /agent guard: must be a logged-in agent (Supabase Auth, role='agent').
 * Onboarding gating + the CRM shell live in the (app) route-group layout so that
 * the onboarding pages themselves render without the shell or completion gate.
 */
import { redirect } from 'next/navigation';
import { getCurrentAgent } from '@/lib/auth/agent-session';

export const dynamic = 'force-dynamic';

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const agent = await getCurrentAgent();
  if (!agent) redirect('/admin');
  return <>{children}</>;
}
