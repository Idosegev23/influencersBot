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
    customer_name: phone || 'לקוח/ה', // NOT NULL — mirrors cs-ticket.ts's `input.customerName || 'לקוח/ה'`
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
        customer_phone: phone,
        transcript: prior.slice(-8), // whole recent conversation for the human, not just the trigger line
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
  customerName?: string | null; // learned shopper name — enriches the ticket + email (else the waId)
  imageUrl?: string | null;     // durable URL of a photo the shopper sent → attached to the ticket + email
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
  // CS handoff defaults ON — opt-in is per-account via config.escalation.enabled (below).
  // ESCALATION_ENABLED is only a global kill-switch: set it to 'false' to disable everywhere.
  if (process.env.ESCALATION_ENABLED === 'false') return { escalated: false, skipped: 'flag_off' };

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

  // Prior messages from the bound thread: user-only feeds frustration detection; the FULL transcript
  // (both roles) enriches the escalation ticket + email so the human sees the whole conversation —
  // the order looked up, the exact complaint — instead of a one-line reason.
  let priorUserTexts: string[] = [];
  let transcript: { role: string; content: string }[] = [];
  if (input.chatSessionId) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', input.chatSessionId)
      .order('created_at', { ascending: false })
      .limit(8);
    transcript = (msgs || []).reverse().map((m: any) => ({ role: m.role, content: m.content }));
    priorUserTexts = transcript.filter((m) => m.role === 'user').map((m) => m.content);
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

  // dedup: one alert per conversation per window. A bound CS conversation has its OWN ticket
  // (input.ticketId); we flag THAT ticket instead of spawning a separate auto_escalation ticket.
  // Spawning one per handoff is what produced TWO tickets for a single conversation, so every
  // customer status-notification doubled. So when a ticket exists dedup keys off ITS
  // metadata.last_handoff_at; otherwise (pre-bind / widget / chat) off a recent auto_escalation row.
  const dedupeMin = escalationConfig.dedupeMinutes ?? 15;
  const sinceMs = deps.now() - dedupeMin * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  if (input.ticketId) {
    const { data: existing } = await supabase.from('support_requests').select('metadata').eq('id', input.ticketId).maybeSingle();
    const lastHandoff = (existing?.metadata as any)?.last_handoff_at;
    if (lastHandoff && Date.parse(lastHandoff) >= sinceMs) return { escalated: false, deduped: true };
  } else {
    const { data: recent } = await supabase
      .from('support_requests').select('id').eq('session_id', input.chatSessionId).eq('source', 'auto_escalation').gte('created_at', sinceIso).limit(1);
    if (recent && recent.length > 0) return { escalated: false, deduped: true };
  }

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
      customerName: input.customerName || null,
      customerPhone: input.waId,
      userMessage: input.userMessage,
      lastMessages: transcript.slice(-6),
      imageUrl: input.imageUrl || null,
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

  // 4) record the escalation. When a bound CS conversation ticket exists, FLAG THAT TICKET (one
  // ticket per conversation → customer notifications never double). Otherwise create the standalone
  // auto_escalation surface (pre-bind / widget / chat). Either way it powers dedup + the support inbox.
  const customerName = (input.customerName && input.customerName.trim()) || input.waId;
  const escalation = {
    severity: detection.severity,
    reason: detection.reason,
    triggers: detection.triggers,
    customer_name: customerName,
    customer_phone: input.waId,
    image_url: input.imageUrl || null, // the shopper's photo (durable URL) for the support inbox
    transcript: transcript.slice(-8), // the whole recent conversation for the human
    detected_at: new Date(deps.now()).toISOString(),
    recipients_notified: notified,
    channels,
    origin: 'whatsapp_cs',
    ticket_id: input.ticketId,
  };
  if (input.ticketId) {
    const { data: existing } = await supabase.from('support_requests').select('metadata, customer_name').eq('id', input.ticketId).maybeSingle();
    const prevMeta = ((existing?.metadata as any) || {}) as Record<string, any>;
    const patch: Record<string, any> = {
      metadata: { ...prevMeta, escalated: true, last_handoff_at: new Date(deps.now()).toISOString(), escalation },
      updated_at: new Date(deps.now()).toISOString(),
    };
    // Upgrade a placeholder/phone ticket name to the learned name so the inbox shows who it is.
    const cur = (existing as any)?.customer_name;
    if (input.customerName && input.customerName.trim() && (!cur || cur === 'לקוח/ה' || cur === input.waId)) {
      patch.customer_name = input.customerName.trim();
    }
    await supabase.from('support_requests').update(patch).eq('id', input.ticketId);
  } else {
    await supabase.from('support_requests').insert({
      account_id: input.accountId,
      customer_name: customerName, // learned name when known, else the waId (NOT NULL, traceable)
      customer_phone: input.waId,
      message: input.userMessage,
      session_id: input.chatSessionId,
      status: 'new',
      source: 'auto_escalation',
      metadata: { escalation },
    });
  }

  return { escalated: true, reason: detection.reason, recipientsNotified: notified };
}
