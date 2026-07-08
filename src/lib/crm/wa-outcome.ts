/** Pure result contract + reaction/channel classifiers for the agent WA engine. */
import type { AgentWaLogFields } from './wa-log';

// 'progress' = the turn SUCCEEDED and captured something (e.g. a price was recorded) but a short
// confirmation is expected next ("ליצור הצעה? כן/לא"). Distinct from 'need_more' (genuinely stalled,
// missing info) so the Decision-Log — and the agent's reaction — don't read a success as a failure.
export type AgentOutcome = 'done' | 'progress' | 'need_more' | 'error';

export interface AgentMessageResult {
  reply: string | null;
  outcome: AgentOutcome;
  log?: Partial<AgentWaLogFields>;
}

/** ✅ on success OR a captured-with-follow-up step; ⚠️ on technical failure; nothing while stalled awaiting info. */
export function reactionForOutcome(o: AgentOutcome): '✅' | '⚠️' | null {
  if (o === 'done' || o === 'progress') return '✅';
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
