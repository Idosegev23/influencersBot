/** Pure result contract + reaction/channel classifiers for the agent WA engine. */
import type { AgentWaLogFields } from './wa-log';

export type AgentOutcome = 'done' | 'need_more' | 'error';

export interface AgentMessageResult {
  reply: string | null;
  outcome: AgentOutcome;
  log?: Partial<AgentWaLogFields>;
}

/** ✅ ONLY on a terminal success; ⚠️ on technical failure; nothing while awaiting the agent. */
export function reactionForOutcome(o: AgentOutcome): '✅' | '⚠️' | null {
  if (o === 'done') return '✅';
  if (o === 'error') return '⚠️';
  return null;
}

/** Classify the inbound message channel for the Decision-Log. */
export function channelOf(msg: any): 'voice' | 'text' | 'attachment' | 'unknown' {
  const t = msg?.type;
  if (t === 'audio') return 'voice';
  if (t === 'document' || t === 'image') return 'attachment';
  if (t === 'text' || t === 'button' || t === 'interactive') return 'text';
  return 'unknown';
}
