/**
 * Staff escalation for the association assistant. Reuses the pure detector,
 * but writes its own English reason and email: association staff read these,
 * and the shared escalation path is written in Hebrew.
 */
import { detectEscalation } from '@/engines/escalation/detect';
import { sendEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';
import { sendCopilotMail } from './mail';

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
/** The Copilot decision for one message: pure, computed before the answer is saved. */
export interface EscalationVerdict { escalate: boolean; severity: string | null; triggers: Trigger[] }

// Explicit threats against the association. The shared detector's bare words ('court',
// 'attorney', 'lawyer', 'legal action') are everyday association topics, so it is not used for legal.
const LEGAL_EN = [
  /\b(sue|suing)\s+(you|the association|aba)\b/i,
  /\blawsuit\s+against\b/i,
  /\bmy\s+(lawyer|attorney)\s+will\b/i,
  /\btak(e|ing)\s+legal\s+action\s+against\b/i,
  /\b(contact|call|get|calling|contacting)\s+my\s+(lawyer|attorney)\b/i,
];

const HUMAN_DEMAND_EN = [
  /\b(speak|talk|chat)\s+(to|with)\s+(someone|somebody|a person|a human|a real person|staff|a staff member|an agent|a representative|customer service)\b/gi,
  /\b(have|get)\s+(someone|somebody|staff|a staff member)\s+(contact|call|reach|email)\s+me\b/gi,
  /\b(human|real person) please\b/gi,
];
const NEGATION = /\b(not|don'?t|never|no need)\b/i;

/** True when a match is preceded, within three words, by a negation ("I don't want to speak to someone"). */
function negated(text: string, index: number): boolean {
  const words = text.slice(0, index).replace(/[\u2019\u2018]/g, "'").split(/\s+/).filter(Boolean).slice(-3);
  return NEGATION.test(words.join(' '));
}

function asksForStaff(message: string): boolean {
  return HUMAN_DEMAND_EN.some((re) => {
    re.lastIndex = 0;
    for (let m = re.exec(message); m; m = re.exec(message)) if (!negated(message, m.index)) return true;
    return false;
  });
}
const ANGER_EN = /\b(ridiculous|unacceptable|useless|terrible|furious|waste of time)\b/i;

/**
 * English-language legal-threat, staff-request and frustration detection. The shared
 * detector's human-demand and anger vocabularies are Hebrew; abuse comes from it.
 */
export function detectEnglishEscalation(message: string, priorUserMessages: string[] = []): Verdict {
  const triggers: Trigger[] = [];
  if (LEGAL_EN.some((re) => re.test(message))) triggers.push('legal');
  if (asksForStaff(message)) triggers.push('human_demand');
  if (ANGER_EN.test(message) && priorUserMessages.some((m) => ANGER_EN.test(m))) triggers.push('sustained_anger');
  return { escalate: triggers.length > 0, severity: triggers.length ? 'high' : null, reason: triggers.map((t) => REASONS[t]).join(' + '), triggers };
}

/** HTML-escapes text for staff and visitor emails. */
export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const esc = escapeHtml;

/** Valid staff recipients from config.copilot.escalation.recipients. */
export function staffRecipients(config: unknown): string[] {
  const list = (config as any)?.copilot?.escalation?.recipients;
  return Array.isArray(list) ? list.filter((r: unknown): r is string => typeof r === 'string' && EMAIL_RE.test(r)) : [];
}

/** The partner-branded sender mailbox (address only), or null when unset or not a plain address. */
export function copilotSendFrom(): string | null {
  const a = process.env.COPILOT_SEND_FROM?.trim();
  return a && /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(a) ? a : null;
}

/**
 * From header plus the mailbox to send as, for Co-Pilot mail. The white-label
 * mailbox COPILOT_SEND_FROM is used when set (and impersonated, so Gmail does
 * not rewrite it to the platform mailbox). Without it, mail to a visitor is not
 * sent at all (null); mail to the association's own staff (escalations, contact
 * notes) falls back to the platform mailbox so it never silently drops.
 */
export function assistantSender(associationName: string, opts: { staffOnly: boolean }): { from: string; impersonate?: string } | null {
  const own = copilotSendFrom();
  if (own) return { from: displayFrom(associationName, own), impersonate: own };
  if (!opts.staffOnly) return null;
  const platform = process.env.GMAIL_SEND_FROM?.trim();
  return platform ? { from: displayFrom(associationName, platform) } : null;
}

/** Platform-mailbox From header (kept for callers and tests of the original helper). */
export function assistantFrom(associationName: string): string | undefined {
  const sendFrom = process.env.GMAIL_SEND_FROM?.trim();
  if (!sendFrom) return undefined;
  return displayFrom(associationName, sendFrom);
}

function displayFrom(associationName: string, sendFrom: string): string {
  // Display name only: strip characters that could break or inject into the From header.
  const cleaned = associationName.replace(/[\r\n<>"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const displayName = `${cleaned} Assistant`.trim();
  // A quoted string keeps commas and other specials inside the name; non-ASCII needs RFC 2047.
  const encoded = /^[\x20-\x7e]*$/.test(displayName)
    ? `"${displayName}"`
    : `=?UTF-8?B?${Buffer.from(displayName, 'utf8').toString('base64')}?=`;
  return `${encoded} <${sendFrom}>`;
}

/**
 * Pure verdict. From the shared detector only abuse and sustained anger are kept:
 * its human_demand fires on bare domain words ("human resources", "representative")
 * and its legal on "court", "attorney", "lawyer referral", "legal action center".
 * The English detector owns staff requests and explicit legal threats.
 */
export function detectCopilotEscalation(
  userMessage: string, priorUserMessages: string[] = [], detect: typeof detectEscalation = detectEscalation,
): EscalationVerdict {
  const shared = detect(userMessage, priorUserMessages);
  const en = detectEnglishEscalation(userMessage, priorUserMessages);
  const sharedTriggers = (shared?.triggers ?? []).filter((t) => t !== 'human_demand' && t !== 'legal');
  const triggers = Array.from(new Set([...sharedTriggers, ...en.triggers])) as Trigger[];
  return {
    escalate: triggers.length > 0,
    severity: triggers.length ? (triggers.includes('legal') || triggers.includes('abuse') ? 'critical' : 'high') : null,
    triggers,
  };
}

export async function escalateIfNeeded(
  input: {
    accountId: string; associationName: string; sessionId: string; visitorLabel: string;
    userMessage: string; priorUserMessages: string[]; transcript: Array<{ role: string; content: string }>; config: unknown;
    /** Precomputed by the turn (before the answer is saved); detected here when absent. */
    verdict?: EscalationVerdict;
  },
  deps: { detect?: typeof detectEscalation; sendEmail?: typeof sendEmail; db?: any; now?: () => Date } = {},
): Promise<EscalationResult> {
  const detect = deps.detect ?? detectEscalation;
  const send = deps.sendEmail ?? sendEmail;
  const db = deps.db ?? supabase;
  const now = (deps.now ?? (() => new Date()))();

  const v = input.verdict ?? detectCopilotEscalation(input.userMessage, input.priorUserMessages, detect);
  if (!v.escalate || !v.triggers.length) return { escalated: false, reason: null, notified: 0, deduped: false };
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

  const recipients = staffRecipients(input.config);
  if (!recipients.length) return { escalated: true, reason, notified: 0, deduped: false };

  const lines = input.transcript.slice(-12).map((m) => `<p><b>${m.role === 'user' ? 'Visitor' : 'Assistant'}:</b> ${esc(m.content)}</p>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px"><p>A visitor on the ${esc(input.associationName)} website needs a staff member.</p><p><b>Reason:</b> ${esc(reason)}<br><b>Visitor:</b> ${esc(input.visitorLabel)}</p><hr>${lines}</div>`;
  const sender = assistantSender(input.associationName, { staffOnly: true });
  // Capped per association and bounded by a timeout; never throws.
  const r = await sendCopilotMail(input.accountId, {
    to: recipients,
    subject: `[${input.associationName}] Visitor needs a staff member: ${reason}`,
    html,
    ...(sender ?? {}),
  }, { send });
  if (!r?.success) console.error('[copilot/escalate]', 'email failed', input.accountId, r?.error);
  return { escalated: true, reason, notified: r?.success ? recipients.length : 0, deduped: false };
}
