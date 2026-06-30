import type { EscalationConfig, EscalationRecipient } from './types';

export async function resolveRecipients(
  supabase: any,
  accountId: string,
  cfg: EscalationConfig | undefined,
): Promise<EscalationRecipient[]> {
  const configured = (cfg?.recipients || []).filter((r) => r.email || r.whatsapp);
  if (configured.length > 0) return configured;

  // Fallback: active support agents with an email.
  const { data } = await supabase
    .from('support_agents')
    .select('first_name, last_name, email, is_active')
    .eq('account_id', accountId)
    .eq('is_active', true);

  return (data || [])
    .filter((a: any) => a.email)
    .map((a: any) => ({
      name: [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Support',
      email: a.email as string,
    }));
}
