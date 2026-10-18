/**
 * Staff escalation for the association assistant. Reuses the pure detector,
 * but writes its own English reason and email: association staff read these,
 * and the shared escalation path is written in Hebrew.
 */
import { detectEscalation } from '@/engines/escalation/detect';
import { sendEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';

export interface EscalationResult { escalated: boolean; reason: string | null; notified: number; deduped: boolean }

const REASONS: Record<string, string> = {
  legal: 'Mentions legal action',
  abuse: 'Abusive language',
  human_demand: 'Asked for a staff member',
  sustained_anger: 'Repeated frustration',
};
const DEDUPE_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

type Trigger = 'legal' | 'abuse' | 'human_demand' | 'sustained_anger';
interface Verdict { escalate: boolean; severity: string | null; reason: string; triggers: Trigger[] }

const HUMAN_DEMAND_EN = [
  /\b(speak|talk|chat)\s+(to|with)\s+(someone|somebody|a person|a human|a real person|staff|a staff member|an agent|a representative|customer service)\b/i,
  /\b(contact|reach|call)\s+(me|someone|staff)\b/i,
  /\b(human|real person) please\b/i,
];
const ANGER_EN = /\b(ridiculous|unacceptable|useless|terrible|furious|waste of time)\b/i;

/**
 * English-language staff-request and frustration detection. The shared detector's
 * human-demand and anger vocabularies are Hebrew; legal and abuse come from it.
 */
export function detectEnglishEscalation(message: string, priorUserMessages: string[] = []): Verdict {
  const triggers: Trigger[] = [];
  if (HUMAN_DEMAND_EN.some((re) => re.test(message))) triggers.push('human_demand');
  if (ANGER_EN.test(message) && priorUserMessages.some((m) => ANGER_EN.test(m))) triggers.push('sustained_anger');
  return { escalate: triggers.length > 0, severity: triggers.length ? 'high' : null, reason: triggers.map((t) => REASONS[t]).join(' + '), triggers };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function escalateIfNeeded(
  input: {
    accountId: string; associationName: string; sessionId: string; visitorLabel: string;
    userMessage: string; priorUserMessages: string[]; transcript: Array<{ role: string; content: string }>; config: unknown;
  },
  deps: { detect?: typeof detectEscalation; sendEmail?: typeof sendEmail; db?: any; now?: () => Date } = {},
): Promise<EscalationResult> {
  const detect = deps.detect ?? detectEscalation;
  const send = deps.sendEmail ?? sendEmail;
  const db = deps.db ?? supabase;
  const now = (deps.now ?? (() => new Date()))();

  const shared = detect(input.userMessage, input.priorUserMessages);
  const en = detectEnglishEscalation(input.userMessage, input.priorUserMessages);
  const triggers = Array.from(new Set([...(shared.triggers ?? []), ...en.triggers])) as Trigger[];
  const v = {
    escalate: shared.escalate || en.escalate,
    severity: shared.severity === 'critical' || en.severity === 'critical' ? 'critical' : (shared.severity ?? en.severity),
    triggers,
  };
  if (!v.escalate) return { escalated: false, reason: null, notified: 0, deduped: false };
  const reason = REASONS[v.triggers[0]] ?? 'Needs a staff member';

  const since = new Date(now.getTime() - DEDUPE_MS).toISOString();
  const { data: recent } = await db.from('support_requests').select('id')
    .eq('session_id', input.sessionId).eq('source', 'copilot_escalation').gte('created_at', since).limit(1);
  if (recent && recent.length) return { escalated: true, reason, notified: 0, deduped: true };

  const { error } = await db.from('support_requests').insert({
    account_id: input.accountId, session_id: input.sessionId, status: 'new',
    customer_name: input.visitorLabel?.trim() || 'Website visitor', source: 'copilot_escalation',
    message: input.userMessage, escalation_reason: reason, customer_email: null,
    metadata: { copilot: { triggers: v.triggers, severity: v.severity } },
  });
  if (error) console.error('[copilot/escalate]', 'insert failed', input.accountId, error.message);

  const recipients: string[] = ((input.config as any)?.copilot?.escalation?.recipients ?? []).filter((r: unknown) => typeof r === 'string' && EMAIL_RE.test(r));
  if (!recipients.length) return { escalated: true, reason, notified: 0, deduped: false };

  const lines = input.transcript.slice(-12).map((m) => `<p><b>${m.role === 'user' ? 'Visitor' : 'Assistant'}:</b> ${esc(m.content)}</p>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px"><p>A visitor on the ${esc(input.associationName)} website needs a staff member.</p><p><b>Reason:</b> ${esc(reason)}<br><b>Visitor:</b> ${esc(input.visitorLabel)}</p><hr>${lines}</div>`;
  const sendFrom = process.env.GMAIL_SEND_FROM?.trim();
  // Display name only: strip characters that could break or inject into the From header.
  const displayName = input.associationName.replace(/[\r\n<>"]/g, ' ').replace(/\s+/g, ' ').trim();
  const r = await send({
    to: recipients,
    subject: `[${input.associationName}] Visitor needs a staff member: ${reason}`,
    html,
    ...(sendFrom ? { from: `${displayName} Assistant <${sendFrom}>` } : {}),
  });
  if (!r?.success) console.error('[copilot/escalate]', 'email failed', input.accountId, r?.error);
  return { escalated: true, reason, notified: r?.success ? recipients.length : 0, deduped: false };
}
