import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { detectEscalation, detectHandoff } from './detect';
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

export interface CsHandoffInput {
  accountId: string;
  chatSessionId: string;
  ticketId: string | null;
  waId: string;
  userMessage: string;
  confidence?: number;
  force?: boolean; // brain-initiated escalate_to_human → skip detection, always escalate (still flag/dedup gated)
}

export interface CsHandoffDeps {
  supabase: any;
  sendEmail: typeof sendEmail;
  pauseBot: (chatSessionId: string, reason: string) => Promise<void>;
  now: () => number;
}

/**
 * WhatsApp CS handoff. Reuses the escalation audit/dedup/notify path but drives
 * detectHandoff (richer trigger set) and pauses the bound thread's chat_session.
 * Read-only for the store — a human takes over via /api/cs/reply.
 *
 * NOTE on defaults: `@/lib/supabase` and `@/lib/handoff/bot-pause` both statically import
 * the service-role Supabase client, which throws at module-evaluation time when
 * NEXT_PUBLIC_SUPABASE_URL isn't set (true for this repo's unit-test process — see
 * escalation-dispatch.test.ts, which relies on the same lazy pattern via `@/lib/supabase/server`'s
 * function-scoped env read). A static top-level import of either would crash *any* test that
 * loads this module, even ones that override every dep. So both defaults are resolved via a
 * dynamic `import()` inside the `??` fallback — which, being short-circuited, only actually runs
 * when a caller hasn't supplied an override (i.e. never in this file's unit tests).
 */
export async function runCsHandoffCheck(
  input: CsHandoffInput,
  depsOverride?: Partial<CsHandoffDeps>,
): Promise<EscalationOutcome> {
  if (process.env.ESCALATION_ENABLED !== 'true') return { escalated: false, skipped: 'flag_off' };

  const deps: CsHandoffDeps = {
    supabase: depsOverride?.supabase ?? (await import('@/lib/supabase')).supabase,
    sendEmail: depsOverride?.sendEmail ?? sendEmail,
    pauseBot: depsOverride?.pauseBot ?? (await import('@/lib/handoff/bot-pause')).pauseBot,
    now: depsOverride?.now ?? (() => Date.now()),
  };
  const { supabase } = deps;

  const { data: acct } = await supabase.from('accounts').select('config').eq('id', input.accountId).single();
  const config = (acct?.config || {}) as Record<string, any>;
  const escalationConfig = (config.escalation || {}) as EscalationConfig;
  if (escalationConfig.enabled === false) return { escalated: false, skipped: 'disabled' };

  // prior user texts from the bound thread (frustration needs history)
  let priorUserTexts: string[] = [];
  if (input.chatSessionId) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', input.chatSessionId)
      .order('created_at', { ascending: false })
      .limit(8);
    priorUserTexts = (msgs || []).reverse().filter((m: any) => m.role === 'user').map((m: any) => m.content);
  }

  // force (from the escalate_to_human tool — the brain already decided) → skip detection, always escalate.
  const detection = input.force
    ? { triggered: true, triggers: ['human_demand'] as any[], severity: 'high' as const, reason: input.userMessage }
    : detectHandoff(input.userMessage, priorUserTexts, {
        enabledTriggers: escalationConfig.triggers,
        lowConfidenceThreshold: escalationConfig.lowConfidenceThreshold,
        confidence: input.confidence,
      });
  if (!detection.triggered) return { escalated: false };

  // dedup: one alert per chat session per window
  const dedupeMin = escalationConfig.dedupeMinutes ?? 15;
  const sinceIso = new Date(deps.now() - dedupeMin * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('support_requests')
    .select('id')
    .eq('session_id', input.chatSessionId)
    .eq('source', 'auto_escalation')
    .gte('created_at', sinceIso)
    .limit(1);
  if (recent && recent.length > 0) return { escalated: false, deduped: true };

  // 1) pause the bot for this thread
  await deps.pauseBot(input.chatSessionId, `handoff:${detection.triggers.join(',')}`);

  // 2) flag the ticket. Mirrors appendCsTicketHistory's (D1, @/lib/cs/cs-ticket.ts) insert shape,
  // but written through the injected `supabase` client rather than calling that helper directly —
  // it hardcodes the real singleton client, which would defeat DI/testability here (see the note
  // on the defaults above).
  if (input.ticketId) {
    await supabase.from('support_ticket_history').insert({
      ticket_id: input.ticketId,
      account_id: input.accountId,
      action: 'status_change',
      actor: 'system',
      note: `handoff — ${detection.reason}`,
      body_text: null,
      whatsapp_message_id: null,
    });
  }

  // 3) notify configured recipients (email) + never-silent fallback
  const recipients = await resolveRecipients(supabase, input.accountId, escalationConfig);
  const brandName = config.brandName || config.username || 'Account';
  const emailTargets = recipients.flatMap((r) => (r.email ? [r.email] : []));
  let notified = 0;
  const channels: any[] = [];
  if (emailTargets.length > 0) {
    const { subject, html } = buildEscalationEmail({
      brandName,
      reason: detection.reason,
      severity: detection.severity === 'high' ? 'critical' : 'high',
      customerPhone: input.waId,
      userMessage: input.userMessage,
      lastMessages: [],
      sessionId: input.chatSessionId,
    });
    const res = await deps.sendEmail({ to: emailTargets, subject, html });
    if (res.success) notified = emailTargets.length;
    channels.push({ channel: 'email', success: res.success, error: res.error });
  }
  if (recipients.length === 0) {
    const { sendAdminAlert } = await import('@/lib/email');
    await sendAdminAlert({
      level: 'critical',
      subject: `Handoff ללא נמען — ${brandName}`,
      message: detection.reason,
      details: input.userMessage,
    });
    channels.push({ channel: 'admin_fallback', success: true });
  }

  // 4) audit row — also the in-app surface (shows in the support inbox) + powers dedup
  await supabase.from('support_requests').insert({
    account_id: input.accountId,
    customer_name: null,
    customer_phone: input.waId,
    message: input.userMessage,
    session_id: input.chatSessionId,
    status: 'new',
    source: 'auto_escalation',
    metadata: {
      escalation: {
        severity: detection.severity,
        reason: detection.reason,
        triggers: detection.triggers,
        detected_at: new Date(deps.now()).toISOString(),
        recipients_notified: notified,
        channels,
        origin: 'whatsapp_cs',
        ticket_id: input.ticketId,
      },
    },
  });

  return { escalated: true, reason: detection.reason, recipientsNotified: notified };
}
