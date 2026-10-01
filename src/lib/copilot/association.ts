import { supabase } from '@/lib/supabase';
import type { AssociationTenant } from './tenant';

export interface AssociationContext {
  accountId: string;
  partnerId: string;
  industry: string | null;
  branding: Record<string, unknown>;
  openingQuestions: string[];
  config: Record<string, unknown>;
}

export async function loadAssociation(t: AssociationTenant): Promise<AssociationContext | null> {
  const { data } = await supabase.from('accounts').select('id, partner_id, config').eq('id', t.accountId).maybeSingle();
  if (!data || data.partner_id !== t.partnerId) return null;
  const config = (data.config ?? {}) as Record<string, any>;
  const cp = (config.copilot ?? {}) as Record<string, any>;
  return {
    accountId: data.id,
    partnerId: t.partnerId,
    industry: typeof cp.industry === 'string' ? cp.industry : null,
    branding: (cp.branding ?? {}) as Record<string, unknown>,
    openingQuestions: Array.isArray(cp.opening_questions) ? cp.opening_questions.filter((q: unknown) => typeof q === 'string').slice(0, 6) : [],
    config,
  };
}
