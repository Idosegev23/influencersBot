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

  const v = detect(input.userMessage, input.priorUserMessages);
  if (!v.escalate) return { escalated: false, reason: null, notified: 0, deduped: false };
  const reason = REASONS[v.triggers[0]] ?? 'Needs a staff member';

  const since = new Date(now.getTime() - DEDUPE_MS).toISOString();
  const { data: recent } = await db.from('support_requests').select('id')
    .eq('session_id', input.sessionId).eq('source', 'copilot_escalation').gte('created_at', since).limit(1);
  if (recent && recent.length) return { escalated: true, reason, notified: 0, deduped: true };

  const { error } = await db.from('support_requests').insert({
    account_id: input.accountId, session_id: input.sessionId, status: 'new', source: 'copilot_escalation',
    message: input.userMessage, escalation_reason: reason, customer_email: null,
    metadata: { copilot: { triggers: v.triggers, severity: v.severity } },
  });
  if (error) console.error('[copilot/escalate]', 'insert failed', input.accountId, error.message);

  const recipients: string[] = ((input.config as any)?.copilot?.escalation?.recipients ?? []).filter((r: unknown) => typeof r === 'string' && r.includes('@'));
  if (!recipients.length) return { escalated: true, reason, notified: 0, deduped: false };

  const lines = input.transcript.slice(-12).map((m) => `<p><b>${m.role === 'user' ? 'Visitor' : 'Assistant'}:</b> ${esc(m.content)}</p>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px"><p>A visitor on the ${esc(input.associationName)} website needs a staff member.</p><p><b>Reason:</b> ${esc(reason)}<br><b>Visitor:</b> ${esc(input.visitorLabel)}</p><hr>${lines}</div>`;
  const r = await send({ to: recipients, subject: `[${input.associationName}] Visitor needs a staff member: ${reason}`, html });
  return { escalated: true, reason, notified: r?.success ? recipients.length : 0, deduped: false };
}
