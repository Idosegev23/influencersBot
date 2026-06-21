/**
 * Agent CRM app layout: enforces forced onboarding, then renders the CRM shell.
 * Onboarding pages live OUTSIDE this group (/agent/onboarding/*) so they aren't
 * blocked by the completion gate below.
 */
import { redirect } from 'next/navigation';
import { getCurrentAgent } from '@/lib/auth/agent-session';
import AgentShell from '@/components/agent/AgentShell';

export const dynamic = 'force-dynamic';

export default async function AgentAppLayout({ children }: { children: React.ReactNode }) {
  const agent = await getCurrentAgent();
  if (!agent) redirect('/admin');
  if (agent.mustChangePassword) redirect('/agent/onboarding/password');
  if (!agent.onboardingCompleted) redirect('/agent/onboarding/profile');

  return <AgentShell agentName={agent.fullName || agent.username || 'סוכן'}>{children}</AgentShell>;
}
