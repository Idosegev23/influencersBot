import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { detectEscalation } from './detect';
import { resolveRecipients } from './recipients';
import { buildEscalationEmail } from './email-template';
import type { EscalationConfig } from './types';

export interface EscalationInput {
  accountId: string;
  sessionId: string | null;
  userMessage: string;
  source: 'chat' | 'widget' | 'dm';
}

export interface EscalationDeps {
  supabase: any;
  sendEmail: typeof sendEmail;
  now: () => number;
}

export interface EscalationOutcome {
  escalated: boolean;
  reason?: string;
  recipientsNotified?: number;
  deduped?: boolean;
  skipped?: string;
}

const PHONE_RE = /0\d{1,2}-?\d{7}|\+972\d{8,9}/;

function extractPhone(text: string): string | null {
  const m = (text || '').match(PHONE_RE);
  return m ? m[0] : null;
}

export async function runEscalationCheck(
  input: EscalationInput,
  depsOverride?: Partial<EscalationDeps>,
): Promise<EscalationOutcome> {
  if (process.env.ESCALATION_ENABLED !== 'true') return { escalated: false, skipped: 'flag_off' };

  const deps: EscalationDeps = {
    supabase: depsOverride?.supabase ?? (await createClient()),
    sendEmail: depsOverride?.sendEmail ?? sendEmail,
    now: depsOverride?.now ?? (() => Date.now()),
  };
  const { supabase } = deps;

  // 1) account config
  const { data: acct } = await supabase.from('accounts').select('config').eq('id', input.accountId).single();
  const config = (acct?.config || {}) as Record<string, any>;
  const escalationConfig = (config.escalation || {}) as EscalationConfig;
  if (escalationConfig.enabled === false) return { escalated: false, skipped: 'disabled' };

  // 2) recent prior user messages (for sustained-anger detection)
  let prior: { role: string; content: string }[] = [];
  if (input.sessionId) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', input.sessionId)
      .order('created_at', { ascending: false })
      .limit(8);
    prior = (msgs || []).reverse();
  }
  const priorUserTexts = prior.filter((m) => m.role === 'user').map((m) => m.content);

  // 3) detect
  const verdict = detectEscalation(input.userMessage, priorUserTexts);
  if (!verdict.escalate) return { escalated: false };

  // 4) dedup (one alert per session per window)
  if (input.sessionId) {
    const dedupeMin = escalationConfig.dedupeMinutes ?? 15;
    const sinceIso = new Date(deps.now() - dedupeMin * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('support_requests')
      .select('id')
      .eq('session_id', input.sessionId)
      .eq('source', 'auto_escalation')
      .gte('created_at', sinceIso)
      .limit(1);
    if (recent && recent.length > 0) return { escalated: false, deduped: true };
  }

  // 5) recipients
  const recipients = await resolveRecipients(supabase, input.accountId, escalationConfig);
  const brandName = config.brandName || config.username || 'Account';
  const phone = extractPhone(input.userMessage);
  const lastMessages = prior.slice(-3);

  // 6) email
  const emailTargets = recipients.flatMap((r) => (r.email ? [r.email] : []));
  let notified = 0;
  const channels: any[] = [];
  if (emailTargets.length > 0) {
    const { subject, html } = buildEscalationEmail({
      brandName,
      reason: verdict.reason,
      severity: verdict.severity ?? 'high',
      customerPhone: phone,
      userMessage: input.userMessage,
      lastMessages,
      sessionId: input.sessionId,
    });
    const res = await deps.sendEmail({ to: emailTargets, subject, html });
    if (res.success) notified = emailTargets.length;
    channels.push({ channel: 'email', success: res.success, error: res.error });
  }

  // 7) never-silent fallback when no recipient resolves
  if (recipients.length === 0) {
    const { sendAdminAlert } = await import('@/lib/email');
    await sendAdminAlert({
      level: 'critical',
      subject: `אסקלציה ללא נמען — ${brandName}`,
      message: verdict.reason,
      details: input.userMessage,
    });
    channels.push({ channel: 'admin_fallback', success: true });
  }

  // 8) auditable record (also powers dedup)
  await supabase.from('support_requests').insert({
    account_id: input.accountId,
    customer_name: null,
    customer_phone: phone,
    message: input.userMessage,
    session_id: input.sessionId,
    status: 'new',
    source: 'auto_escalation',
    metadata: {
      escalation: {
        severity: verdict.severity,
        reason: verdict.reason,
        triggers: verdict.triggers,
        detected_at: new Date(deps.now()).toISOString(),
        recipients_notified: notified,
        channels,
        origin: input.source,
      },
    },
  });

  return { escalated: true, reason: verdict.reason, recipientsNotified: notified };
}

/**
 * Placeholder for the Phase-D CS handoff dispatch (Task D4 — brand-notify + bot-pause wiring for
 * `escalate_to_human`, force-mode skips re-detection since the brain already decided). This stub
 * exists only so `src/lib/cs/tools/index.ts` (Task C4) can resolve its dynamic
 * `import('@/engines/escalation/dispatch')` — Vitest/Vite's import-analysis needs the named
 * export to exist on disk even for a dynamic import before
 * `vi.mock('@/engines/escalation/dispatch', ...)` can intercept it (same issue Task A7 hit with
 * `wa-cs-worker.ts`, resolved by Task A8's `cs-agent.ts` stub). The tool tests mock this module
 * entirely. Do NOT deploy C4 to production before D4 replaces this with the real handoff dispatch.
 */
export interface CsHandoffCheckInput {
  accountId: string;
  chatSessionId: string | null;
  ticketId?: string | null;
  waId?: string;
  userMessage: string;
  force?: boolean;
}

export async function runCsHandoffCheck(input: CsHandoffCheckInput): Promise<EscalationOutcome> {
  throw new Error(`runCsHandoffCheck not implemented (Task D4 pending) — accountId=${input?.accountId}`);
}
