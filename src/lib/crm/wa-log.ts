/** Decision-Log writer for the agent WhatsApp engine (audit + eval source, §6.1). */
import { supabase as supabaseAdmin } from '@/lib/supabase';
import type { AgentOutcome } from './wa-outcome';

export interface AgentWaLogFields {
  message_id: string | null;
  agent_id: string | null;
  channel: string | null;
  stt_provider: string | null;
  stt_confidence: number | null;
  transcript: string | null;
  router_intent: string | null;
  router_confidence: number | null;
  plan_json: any | null;
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  outcome: AgentOutcome | null;
  deal_id: string | null;
  amount: number | null;
  agent_corrected: boolean;
}

export interface BuildLogInput {
  messageId: string | null;
  agentId: string | null;
  channel: string;
  transcript?: string | null;
  outcome: AgentOutcome;
  latencyMs: number;
  sttProvider?: string | null;
  sttConfidence?: number | null;
  log?: Partial<AgentWaLogFields>;
}

/** Pure assembler → a fully-defaulted DB row (null, not undefined). */
export function buildAgentWaLogRow(input: BuildLogInput): AgentWaLogFields {
  const t = input.log || {};
  return {
    message_id: input.messageId ?? null,
    agent_id: input.agentId ?? null,
    channel: input.channel ?? null,
    stt_provider: input.sttProvider ?? t.stt_provider ?? null,
    stt_confidence: input.sttConfidence ?? t.stt_confidence ?? null,
    transcript: input.transcript ?? t.transcript ?? null,
    router_intent: t.router_intent ?? null,
    router_confidence: t.router_confidence ?? null,
    plan_json: t.plan_json ?? null,
    model_used: t.model_used ?? null,
    input_tokens: t.input_tokens ?? null,
    output_tokens: t.output_tokens ?? null,
    latency_ms: input.latencyMs ?? null,
    outcome: input.outcome ?? null,
    deal_id: t.deal_id ?? null,
    amount: t.amount ?? null,
    agent_corrected: t.agent_corrected ?? false,
  };
}

/** Best-effort insert — never throws into the webhook path. */
export async function logAgentWa(input: BuildLogInput): Promise<void> {
  try {
    await supabaseAdmin.from('crm_agent_wa_log').insert(buildAgentWaLogRow(input));
  } catch (err) {
    console.warn('[wa-log] failed to write decision-log row', err);
  }
}
