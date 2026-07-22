import { supabase as supabaseAdmin } from '@/lib/supabase';

// `phase` is a COARSE ANALYTICS HINT ONLY (onboarding|serving) — it does NOT gate the brain.
// The brain-led loop decides everything from the injected context digest.
export type CsPhase = 'onboarding' | 'serving';

export interface CsSessionContext {
  lastOrderRef?: string;
  lastBrandCandidates?: any[];
  [k: string]: unknown;
}

export interface CsSessionRow {
  wa_id: string;
  contact_id: string | null;
  phase: CsPhase;
  active_account_id: string | null;
  active_ticket_id: string | null;
  active_chat_session_id: string | null;
  customer_name: string | null;
  context: CsSessionContext;
  last_activity_at: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export const WARM_WINDOW_MS = 45 * 60 * 1000;

/** A session is "warm" if the last activity is within 45 min → continue silently, don't interrogate. */
export function isWarm(row: CsSessionRow, now: number = Date.now()): boolean {
  if (!row?.last_activity_at) return false;
  return now - Date.parse(row.last_activity_at) < WARM_WINDOW_MS;
}

export async function loadCsSession(waId: string): Promise<CsSessionRow | null> {
  const { data } = await supabaseAdmin
    .from('whatsapp_cs_sessions')
    .select('*')
    .eq('wa_id', waId)
    .maybeSingle();
  return (data as CsSessionRow) ?? null;
}

export async function createCsSession(waId: string, contactId: string | null): Promise<CsSessionRow> {
  const { data } = await supabaseAdmin
    .from('whatsapp_cs_sessions')
    .insert({
      wa_id: waId,
      contact_id: contactId,
      phase: 'onboarding',
      context: {},
      version: 0,
      last_activity_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  return data as CsSessionRow;
}

/**
 * Optimistic-concurrency update: WHERE wa_id = prev.wa_id AND version = prev.version, bumping
 * version by 1. Returns false when no row matched (a sibling drain won the race) so the caller
 * can reload + retry. Mirrors crm_agent_wa_state.
 */
export async function saveCsSession(prev: CsSessionRow, patch: Partial<CsSessionRow>): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('whatsapp_cs_sessions')
    .update({
      ...patch,
      version: prev.version + 1,
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('wa_id', prev.wa_id)
    .eq('version', prev.version)
    .select('wa_id');
  return Array.isArray(data) && data.length > 0;
}
