/**
 * Inbound-lead capture for the IG DM path (modeled on the Bestie ads lead flow).
 *
 * A "lead" is the OPPOSITE of an escalation: a potential client showing buying
 * intent (services / collab / quote) rather than an angry customer. The bot keeps
 * answering everyone; this module watches the conversation, and once the digging
 * questions have gathered enough (or the lead leaves contact details) it emails a
 * structured brief to the account's sales contacts (config.lead_capture.to/cc).
 *
 * Leads that go quiet mid-qualification are flushed by the hourly
 * /api/cron/ig-lead-flush sweep as a "partial brief" — gathered > lost.
 *
 * Per-account opt-in: config.lead_capture = { enabled: true, to: [...], cc: [...] }.
 * State lives on a support_requests row (source='ig_lead', one per session) —
 * no migration needed, and the lead shows up in the support inbox.
 */
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { laneModel } from '@/lib/llm/config';
import { buildLeadBriefEmail } from './lead-email-template';

export interface LeadFields {
  service?: string | null;       // influencer campaign / social / content / 360
  brand?: string | null;         // the inquiring brand/company
  timeline?: string | null;
  goal?: string | null;          // leads / awareness / sales
  budget?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  summary?: string | null;       // one-line Hebrew summary of what the lead wants
}

export type LeadReadiness = 'not_lead' | 'gathering' | 'ready';

export interface LeadVerdict {
  is_lead: boolean;
  readiness: LeadReadiness;
  fields: LeadFields;
}

export interface LeadCaptureConfig {
  enabled?: boolean;
  to?: string[];
  cc?: string[];
  idleFlushMinutes?: number; // quiet-time before a partial brief goes out (default 30)
}

export interface LeadCaptureInput {
  accountId: string;
  sessionId: string;
  userMessage: string;
  contact?: { name?: string | null; username?: string | null } | null;
}

export interface LeadCaptureDeps {
  supabase: any;
  sendEmail: typeof sendEmail;
  classify: (input: {
    transcript: { role: string; content: string }[];
    userMessage: string;
    priorFields: LeadFields;
    brandName: string;
  }) => Promise<LeadVerdict | null>;
  now: () => number;
}

export interface LeadCaptureOutcome {
  isLead: boolean;
  briefSent?: boolean;
  skipped?: string;
}

/**
 * Injected into the DM conversation context when lead capture is on — Yoav's
 * "בוט חופר": answer briefly, then dig ONE qualifying question per turn.
 * Every qualifying question must carry <<SUGGESTIONS>> so the DM shows
 * quick-reply chips with ready answers (dm-handler converts them to buttons).
 */
export function leadDiggingInstruction(brandName: string): string {
  return (
    `[הנחיה פנימית לבוט של ${brandName}: כשפונה מתעניין/ת בשירותים, בשיתוף פעולה, בקמפיין או בהצעת מחיר — ` +
    `זהו ליד עסקי. ענה/י קצר ולעניין, ובכל תשובה שאל/י שאלה מבררת אחת בלבד, לפי הסדר וממה שעוד חסר: ` +
    `איזה שירות מעניין אותם · לאיזה מותג/חברה · מה לוח הזמנים · מה המטרה (לידים/מודעות/מכירות) · מה סדר גודל התקציב · ` +
    `ולבסוף שם + טלפון או אימייל לחזרה. אל תשאל/י את כל השאלות בבת אחת, ואל תבטיח/י מחירים. ` +
    `לכל שאלה מבררת צרף/י בסוף התשובה שורת <<SUGGESTIONS>>אפשרות 1|אפשרות 2|אפשרות 3<</SUGGESTIONS>> ` +
    `עם 2-4 תשובות קצרות (עד 20 תווים) שמתאימות בדיוק לשאלה ששאלת. ` +
    `כשיש שם ופרטי קשר — אמור/אמרי שנציג/ה יחזרו בהקדם.]`
  );
}

// ── Default LLM classifier (cheap router lane; best-effort, null on failure) ──

async function classifyLeadLLM(input: {
  transcript: { role: string; content: string }[];
  userMessage: string;
  priorFields: LeadFields;
  brandName: string;
}): Promise<LeadVerdict | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const convo = (input.transcript || [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => `${m.role === 'user' ? 'פונה' : 'בוט'}: ${m.content}`)
    .join('\n')
    .slice(0, 4000);
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      model: laneModel('router'),
      response_format: { type: 'json_object' },
      max_completion_tokens: 700,
      messages: [
        {
          role: 'system',
          content:
            `אתה מסווג הודעות DM עבור העסק "${input.brandName}". ` +
            'קבע אם הפונה הוא ליד עסקי — מותג/חברה/גורם שמתעניין בשירותים, שיתוף פעולה, קמפיין או הצעת מחיר. ' +
            'עוקב/מעריץ/לקוח עם בעיית שירות אינם ליד. ' +
            'החזר JSON בלבד במבנה: {"is_lead": boolean, "readiness": "not_lead"|"gathering"|"ready", ' +
            '"fields": {"service": string|null, "brand": string|null, "timeline": string|null, "goal": string|null, ' +
            '"budget": string|null, "contact_name": string|null, "contact_phone": string|null, "contact_email": string|null, ' +
            '"summary": string|null}}. ' +
            'מלא שדות רק ממה שנאמר בפועל בשיחה (אל תמציא), שמור ערכים קודמים שידועים, ו-summary = משפט אחד בעברית על מה הליד רוצה. ' +
            '"ready" רק כאשר יש טלפון או אימייל לחזרה וגם ידוע איזה שירות מבוקש; אחרת אם זה ליד — "gathering".',
        },
        {
          role: 'user',
          content:
            `שדות שכבר נאספו: ${JSON.stringify(input.priorFields || {})}\n\n` +
            `השיחה עד כה:\n${convo || '(אין)'}\n\nההודעה הנוכחית של הפונה: ${input.userMessage}`,
        },
      ],
    });
    const raw = res.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.is_lead !== 'boolean') return null;
    const readiness: LeadReadiness = ['not_lead', 'gathering', 'ready'].includes(parsed.readiness)
      ? parsed.readiness
      : parsed.is_lead
        ? 'gathering'
        : 'not_lead';
    return { is_lead: parsed.is_lead, readiness, fields: parsed.fields || {} };
  } catch (e) {
    console.warn('[lead-capture] classify failed', (e as Error).message);
    return null;
  }
}

// ── Helpers ──

function mergeFields(prior: LeadFields, next: LeadFields): LeadFields {
  const merged: LeadFields = { ...prior };
  for (const k of Object.keys(next || {}) as (keyof LeadFields)[]) {
    const v = next[k];
    if (typeof v === 'string' && v.trim()) merged[k] = v.trim();
  }
  return merged;
}

async function sendBrief(params: {
  deps: LeadCaptureDeps;
  leadConfig: LeadCaptureConfig;
  brandName: string;
  row: any;
  briefType: 'full' | 'partial' | 'updated';
  transcript: { role: string; content: string }[];
}): Promise<boolean> {
  const { deps, leadConfig, brandName, row, briefType, transcript } = params;
  const lead = (row.metadata?.lead || {}) as Record<string, any>;
  const to = (leadConfig.to || []).filter(Boolean);

  const { subject, html } = buildLeadBriefEmail({
    brandName,
    contactLabel: lead.ig?.label || null,
    igUsername: lead.ig?.username || null,
    fields: lead.fields || {},
    briefType,
    lastMessages: transcript.slice(-8),
    sessionId: row.session_id,
  });

  let sent = false;
  if (to.length > 0) {
    const res = await deps.sendEmail({ to, cc: (leadConfig.cc || []).filter(Boolean), subject, html });
    sent = !!res.success;
  } else {
    // Never-silent fallback, mirroring dispatch.ts — misconfig must not eat leads.
    const { sendAdminAlert } = await import('@/lib/email');
    await sendAdminAlert({
      level: 'warning',
      subject: `ליד ללא נמען — ${brandName}`,
      message: lead.fields?.summary || 'ליד נכנס מאינסטגרם אך config.lead_capture.to ריק',
      details: JSON.stringify(lead.fields || {}, null, 2),
    });
    sent = true;
  }

  await deps.supabase
    .from('support_requests')
    .update({
      status: 'new',
      metadata: {
        ...(row.metadata || {}),
        lead: {
          ...lead,
          state: 'sent',
          brief_type: briefType,
          brief_sent_at: new Date(deps.now()).toISOString(),
          fields_changed_after_brief: false,
          // Delivery evidence — without this a failed send still flips the state
          // and the lead silently dies (learned from the first live test).
          email: { success: sent, at: new Date(deps.now()).toISOString() },
        },
      },
      updated_at: new Date(deps.now()).toISOString(),
    })
    .eq('id', row.id);

  return sent;
}

// ── Per-turn check (fire-and-forget from dm-handler) ──

export async function runLeadCaptureCheck(
  input: LeadCaptureInput,
  depsOverride?: Partial<LeadCaptureDeps>,
): Promise<LeadCaptureOutcome> {
  const deps: LeadCaptureDeps = {
    supabase: depsOverride?.supabase ?? (await createClient()),
    sendEmail: depsOverride?.sendEmail ?? sendEmail,
    classify: depsOverride?.classify ?? classifyLeadLLM,
    now: depsOverride?.now ?? (() => Date.now()),
  };
  const { supabase } = deps;

  // 1) per-account opt-in
  const { data: acct } = await supabase.from('accounts').select('config').eq('id', input.accountId).single();
  const config = (acct?.config || {}) as Record<string, any>;
  const leadConfig = (config.lead_capture || {}) as LeadCaptureConfig;
  if (leadConfig.enabled !== true) return { isLead: false, skipped: 'disabled' };
  const brandName = config.brandName || config.display_name || config.username || 'Account';

  // 2) existing lead row for this session. A sent brief does NOT stop processing:
  // the conversation often keeps going (budget, timeline arrive late) — we keep
  // merging fields and the flush cron emails ONE "updated brief" once it goes
  // quiet. Only immediate re-emailing is suppressed (no per-message spam).
  const { data: row } = await supabase
    .from('support_requests')
    .select('id, session_id, metadata')
    .eq('session_id', input.sessionId)
    .eq('source', 'ig_lead')
    .limit(1)
    .maybeSingle();
  const briefAlreadySent = row?.metadata?.lead?.state === 'sent';

  // 3) transcript (excludes the current turn — it isn't saved yet; passed separately)
  const { data: msgs } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', input.sessionId)
    .order('created_at', { ascending: false })
    .limit(16);
  const transcript = (msgs || []).reverse().map((m: any) => ({ role: m.role, content: m.content }));

  // 4) classify
  const priorFields = (row?.metadata?.lead?.fields || {}) as LeadFields;
  const verdict = await deps.classify({ transcript, userMessage: input.userMessage, priorFields, brandName });
  if (!verdict) return { isLead: !!row, skipped: 'classifier_unavailable' };
  if (!verdict.is_lead && !row) return { isLead: false };

  const fields = mergeFields(priorFields, verdict.fields || {});
  const fieldsChanged = JSON.stringify(fields) !== JSON.stringify(priorFields);

  // Post-brief turns: silently absorb new details; the flush cron sends the update.
  if (briefAlreadySent) {
    if (row && fieldsChanged) {
      const nowIso = new Date(deps.now()).toISOString();
      await supabase
        .from('support_requests')
        .update({
          metadata: {
            ...(row.metadata || {}),
            lead: {
              ...(row.metadata?.lead || {}),
              fields,
              fields_changed_after_brief: true,
              last_activity_at: nowIso,
            },
          },
          updated_at: nowIso,
        })
        .eq('id', row.id);
    }
    return { isLead: true, briefSent: false, skipped: fieldsChanged ? undefined : 'already_sent' };
  }

  const contactLabel = [input.contact?.name?.trim() || '', input.contact?.username ? `@${input.contact.username.trim()}` : '']
    .filter(Boolean)
    .join(' ');
  const nowIso = new Date(deps.now()).toISOString();
  const leadMeta = {
    ...(row?.metadata?.lead || {}),
    state: 'gathering',
    fields,
    last_activity_at: nowIso,
    ig: {
      ...(row?.metadata?.lead?.ig || {}),
      ...(input.contact?.username ? { username: input.contact.username } : {}),
      ...(contactLabel ? { label: contactLabel } : {}),
    },
  };

  // 5) upsert the state row
  let leadRow = row;
  if (row) {
    await supabase
      .from('support_requests')
      .update({ metadata: { ...(row.metadata || {}), lead: leadMeta }, updated_at: nowIso })
      .eq('id', row.id);
    leadRow = { ...row, metadata: { ...(row.metadata || {}), lead: leadMeta } };
  } else {
    const { data: inserted } = await supabase
      .from('support_requests')
      .insert({
        account_id: input.accountId,
        customer_name: contactLabel || fields.contact_name || 'ליד מאינסטגרם',
        customer_phone: fields.contact_phone || null,
        message: input.userMessage,
        session_id: input.sessionId,
        status: 'in_progress',
        source: 'ig_lead',
        metadata: { lead: leadMeta },
      })
      .select('id, session_id, metadata')
      .single();
    leadRow = inserted;
  }
  if (!leadRow) return { isLead: true, skipped: 'row_write_failed' };

  // 6) enough gathered → full brief now
  if (verdict.readiness === 'ready') {
    const fullTranscript = [...transcript, { role: 'user', content: input.userMessage }];
    const sent = await sendBrief({ deps, leadConfig, brandName, row: leadRow, briefType: 'full', transcript: fullTranscript });
    return { isLead: true, briefSent: sent };
  }

  return { isLead: true, briefSent: false };
}

// ── Hourly sweep: leads that went quiet mid-qualification → partial brief ──

export async function flushStaleLeads(
  depsOverride?: Partial<LeadCaptureDeps>,
): Promise<{ flushed: number; scanned: number }> {
  const deps: LeadCaptureDeps = {
    supabase: depsOverride?.supabase ?? (await createClient()),
    sendEmail: depsOverride?.sendEmail ?? sendEmail,
    classify: depsOverride?.classify ?? classifyLeadLLM,
    now: depsOverride?.now ?? (() => Date.now()),
  };
  const { supabase } = deps;

  const weekAgo = new Date(deps.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabase
    .from('support_requests')
    .select('id, account_id, session_id, metadata')
    .eq('source', 'ig_lead')
    .gte('created_at', weekAgo)
    .limit(200);

  // Two kinds of stale work: leads that never reached "ready" (→ partial brief),
  // and leads whose brief went out but the conversation kept adding details
  // (→ one "updated brief" per quiet period).
  const pending = (rows || []).filter(
    (r: any) =>
      r.metadata?.lead?.state === 'gathering' ||
      (r.metadata?.lead?.state === 'sent' && r.metadata?.lead?.fields_changed_after_brief === true),
  );
  let flushed = 0;

  // per-account config cache
  const configs: Record<string, Record<string, any>> = {};
  for (const row of pending) {
    try {
      if (!configs[row.account_id]) {
        const { data: acct } = await supabase.from('accounts').select('config').eq('id', row.account_id).single();
        configs[row.account_id] = (acct?.config || {}) as Record<string, any>;
      }
      const config = configs[row.account_id];
      const leadConfig = (config.lead_capture || {}) as LeadCaptureConfig;
      if (leadConfig.enabled !== true) continue;

      const idleMin = leadConfig.idleFlushMinutes ?? 30;
      const lastActivity = Date.parse(row.metadata?.lead?.last_activity_at || '');
      if (!Number.isFinite(lastActivity) || deps.now() - lastActivity < idleMin * 60 * 1000) continue;

      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', row.session_id)
        .order('created_at', { ascending: false })
        .limit(16);
      const transcript = (msgs || []).reverse().map((m: any) => ({ role: m.role, content: m.content }));

      const brandName = config.brandName || config.display_name || config.username || 'Account';
      const briefType = row.metadata?.lead?.state === 'sent' ? 'updated' : 'partial';
      await sendBrief({ deps, leadConfig, brandName, row, briefType, transcript });
      flushed++;
    } catch (e) {
      console.error('[lead-capture] flush failed for row', row.id, (e as Error).message);
    }
  }

  return { flushed, scanned: pending.length };
}
