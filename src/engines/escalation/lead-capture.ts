/**
 * Inbound-lead capture for the IG DM, chat-page and widget paths (modeled on
 * the Bestie ads lead flow).
 *
 * A "lead" is the OPPOSITE of an escalation: a potential client showing buying
 * intent (services / collab / quote) rather than an angry customer. The bot keeps
 * answering everyone; this module watches the conversation, and once the digging
 * questions have gathered enough (or the lead leaves contact details) it emails a
 * structured brief to the account's sales contacts.
 *
 * TWO LANES. An agency does not route leads the way it routes applicants, so the
 * classifier also decides WHICH KIND of lead this is and the brief goes to the
 * matching list (config.lead_capture.routes):
 *   - 'brand'  — a brand / company / agency buying marketing services
 *   - 'talent' — a creator / influencer / candidate looking for work or representation
 *   - 'both'   — genuinely both, or two turns that disagreed (see mergeLeadType)
 * A lead never silently moves out of someone's inbox mid-conversation: a lane
 * conflict widens to 'both' rather than replacing the earlier lane.
 *
 * Leads that go quiet mid-qualification are flushed by the hourly
 * /api/cron/ig-lead-flush sweep as a "partial brief" — gathered > lost.
 *
 * Per-account opt-in: config.lead_capture = { enabled: true, routes: {...}, cc: [...] }.
 * State lives on a support_requests row (source per channel, one per session) —
 * no migration needed, and the lead shows up in the support inbox.
 */
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { laneModel } from '@/lib/llm/config';
import { buildLeadBriefEmail } from './lead-email-template';

/** Which surface the lead arrived on. Drives the support_requests.source value
 *  and the wording of the brief — "מאינסטגרם" is wrong for a website visitor. */
export type LeadChannel = 'dm' | 'chat' | 'widget';

export const LEAD_SOURCE_BY_CHANNEL: Record<LeadChannel, string> = {
  dm: 'ig_lead',
  chat: 'web_lead',
  widget: 'widget_lead',
};

/** Every source this engine owns. The flush sweep scans all of them. */
export const LEAD_SOURCES = Object.values(LEAD_SOURCE_BY_CHANNEL);

export type LeadType = 'brand' | 'talent' | 'both';

export interface LeadFields {
  // Shared
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  summary?: string | null;       // one-line Hebrew summary of what the lead wants
  // 'brand' lane — someone buying services
  service?: string | null;       // influencer campaign / social / content / 360
  brand?: string | null;         // the inquiring brand/company
  timeline?: string | null;
  goal?: string | null;          // leads / awareness / sales
  budget?: string | null;
  // 'talent' lane — someone offering themselves
  niche?: string | null;         // content vertical
  platforms?: string | null;     // instagram / tiktok / youtube ...
  audience?: string | null;      // follower count / audience size
  experience?: string | null;    // past collabs, representation status
}

export type LeadReadiness = 'not_lead' | 'gathering' | 'ready';

export interface LeadVerdict {
  is_lead: boolean;
  readiness: LeadReadiness;
  lead_type?: LeadType | null;
  fields: LeadFields;
}

export interface LeadRoute {
  to?: string[];
}

export interface LeadCaptureConfig {
  enabled?: boolean;
  /** Per-lane recipients. Absent → everything falls back to `to`. */
  routes?: Partial<Record<'brand' | 'talent', LeadRoute>>;
  /** Legacy / fallback recipients: used when no lane matched or routes are unset. */
  to?: string[];
  /** Always copied, on every lane. */
  cc?: string[];
  idleFlushMinutes?: number; // quiet-time before a partial brief goes out (default 30)
}

export interface LeadCaptureInput {
  accountId: string;
  sessionId: string;
  userMessage: string;
  /** Defaults to 'dm' — the only channel that existed before web surfaces were wired. */
  channel?: LeadChannel;
  contact?: { name?: string | null; username?: string | null } | null;
}

export interface LeadCaptureDeps {
  supabase: any;
  sendEmail: typeof sendEmail;
  classify: (input: {
    transcript: { role: string; content: string }[];
    userMessage: string;
    priorFields: LeadFields;
    priorType: LeadType | null;
    brandName: string;
  }) => Promise<LeadVerdict | null>;
  now: () => number;
}

export interface LeadCaptureOutcome {
  isLead: boolean;
  briefSent?: boolean;
  leadType?: LeadType | null;
  skipped?: string;
}

/**
 * Injected into the conversation context when lead capture is on — Yoav's
 * "בוט חופר": answer briefly, then dig ONE qualifying question per turn.
 *
 * Two ladders, because the two lanes need different questions: asking a creator
 * who wants work "what's your budget?" reads as an insult, and asking a brand
 * how many followers it has learns nothing. The bot picks the ladder itself,
 * which is also what produces the lead_type the classifier confirms.
 *
 * Every qualifying question must carry <<SUGGESTIONS>> so the surface shows
 * quick-reply chips (DM converts them to buttons; chat/widget render chips).
 */
export function leadDiggingInstruction(brandName: string): string {
  return (
    `[הנחיה פנימית לבוט של ${brandName}: כשפונה מתעניין/ת, זהה/י קודם לאיזה משני המסלולים הוא/היא שייך/ת, ` +
    `ואל תשאל/י שאלות מהמסלול השני:\n` +
    `(א) מותג, חברה או סוכנות שמחפשים שירותי שיווק, קמפיין, שיתוף פעולה או הצעת מחיר.\n` +
    `(ב) יוצר/ת תוכן, משפיען/ית או מועמד/ת שמחפשים עבודה, ייצוג או שיתוף פעולה מצד ${brandName}.\n` +
    `במסלול (א) שאל/י לפי הסדר וממה שעוד חסר: איזה שירות מעניין · לאיזה מותג/חברה · מה לוח הזמנים · ` +
    `מה המטרה (לידים/מודעות/מכירות) · מה סדר גודל התקציב · ולבסוף שם + טלפון או אימייל לחזרה.\n` +
    `במסלול (ב) שאל/י לפי הסדר וממה שעוד חסר: באיזה תחום התוכן · באילו פלטפורמות · מה גודל הקהל/מספר העוקבים · ` +
    `איזה ניסיון או שיתופי פעולה קודמים יש · ולבסוף שם + טלפון או אימייל לחזרה. ` +
    `במסלול הזה אל תשאל/י על תקציב לעולם.\n` +
    `בכל תשובה: ענה/י קצר ולעניין ושאל/י שאלה מבררת אחת בלבד. אל תשאל/י את כל השאלות בבת אחת, ואל תבטיח/י מחירים. ` +
    `לכל שאלה מבררת צרף/י בסוף התשובה שורת <<SUGGESTIONS>>אפשרות 1|אפשרות 2|אפשרות 3<</SUGGESTIONS>> ` +
    `עם 2-4 תשובות קצרות (עד 20 תווים) שמתאימות בדיוק לשאלה ששאלת. ` +
    `כשיש שם ופרטי קשר — אמור/אמרי שנציג/ה יחזרו בהקדם.]`
  );
}

// ── Routing ──

function uniqEmails(list: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const addr = (raw || '').trim();
    if (!addr) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

/**
 * Which inboxes this brief goes to.
 *
 * Fallback chain, deliberately never-empty-by-accident:
 *   lane list → legacy `to` → union of every configured lane.
 * An address on `to` is stripped from `cc` so nobody is addressed twice.
 * Returning `{to: []}` is still possible (nothing configured at all) and the
 * caller turns that into an admin alert rather than dropping the lead.
 */
export function resolveLeadRecipients(
  leadConfig: LeadCaptureConfig,
  leadType: LeadType | null | undefined,
): { to: string[]; cc: string[] } {
  const routes = leadConfig.routes || {};
  const lane = (k: 'brand' | 'talent') => uniqEmails(routes[k]?.to || []);

  let to: string[] = [];
  if (leadType === 'brand') to = lane('brand');
  else if (leadType === 'talent') to = lane('talent');
  else if (leadType === 'both') to = uniqEmails([...lane('brand'), ...lane('talent')]);

  if (to.length === 0) to = uniqEmails(leadConfig.to || []);
  if (to.length === 0) to = uniqEmails([...lane('brand'), ...lane('talent')]);

  const addressed = new Set(to.map((a) => a.toLowerCase()));
  const cc = uniqEmails(leadConfig.cc || []).filter((a) => !addressed.has(a.toLowerCase()));

  return { to, cc };
}

/**
 * A lane, once decided, only ever widens. Two turns that disagree mean the
 * conversation genuinely straddles both (an agency pitching its own creators is
 * the case Ido named), and the cost of widening — one extra inbox — is far below
 * the cost of a lead vanishing from the list that was already watching it.
 */
export function mergeLeadType(
  prior: LeadType | null | undefined,
  next: LeadType | null | undefined,
): LeadType | null {
  if (!next) return prior ?? null;
  if (!prior) return next;
  if (prior === next) return prior;
  return 'both';
}

// ── Default LLM classifier (cheap router lane; best-effort, null on failure) ──

async function classifyLeadLLM(input: {
  transcript: { role: string; content: string }[];
  userMessage: string;
  priorFields: LeadFields;
  priorType: LeadType | null;
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
      max_completion_tokens: 800,
      messages: [
        {
          role: 'system',
          content:
            `אתה מסווג פניות נכנסות עבור העסק "${input.brandName}". ` +
            'קבע (1) האם הפונה הוא ליד, ו-(2) לאיזה סוג. ' +
            'ליד מסוג "brand" = מותג/חברה/סוכנות שמתעניינים בשירותים, בקמפיין, בשיתוף פעולה או בהצעת מחיר. ' +
            'ליד מסוג "talent" = יוצר/ת תוכן, משפיען/ית או מועמד/ת שמחפשים עבודה, ייצוג או שיתוף פעולה מצד העסק. ' +
            'אם הפנייה היא באמת שניהם (למשל סוכנות שמציעה את המשפיענים שלה) — "both". ' +
            'עוקב/מעריץ/לקוח עם בעיית שירות אינם ליד. ' +
            'החזר JSON בלבד במבנה: {"is_lead": boolean, "readiness": "not_lead"|"gathering"|"ready", ' +
            '"lead_type": "brand"|"talent"|"both"|null, ' +
            '"fields": {"service": string|null, "brand": string|null, "timeline": string|null, "goal": string|null, ' +
            '"budget": string|null, "niche": string|null, "platforms": string|null, "audience": string|null, ' +
            '"experience": string|null, "contact_name": string|null, "contact_phone": string|null, ' +
            '"contact_email": string|null, "summary": string|null}}. ' +
            'שדות service/brand/timeline/goal/budget שייכים ל-brand; niche/platforms/audience/experience שייכים ל-talent. ' +
            'מלא שדות רק ממה שנאמר בפועל בשיחה (אל תמציא), שמור ערכים קודמים שידועים, ו-summary = משפט אחד בעברית על מה הליד רוצה. ' +
            '"ready" רק כאשר יש טלפון או אימייל לחזרה וגם ידוע מה הפונה רוצה; אחרת אם זה ליד — "gathering". ' +
            'אם עוד לא ברור לאיזה סוג הפונה שייך, החזר lead_type: null ואל תנחש.',
        },
        {
          role: 'user',
          content:
            `שדות שכבר נאספו: ${JSON.stringify(input.priorFields || {})}\n` +
            `סוג הליד שנקבע עד כה: ${input.priorType || '(עוד לא נקבע)'}\n\n` +
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
    const leadType: LeadType | null = ['brand', 'talent', 'both'].includes(parsed.lead_type)
      ? parsed.lead_type
      : null;
    return { is_lead: parsed.is_lead, readiness, lead_type: leadType, fields: parsed.fields || {} };
  } catch (e) {
    console.warn('[lead-capture] classify failed', (e as Error).message);
    return null;
  }
}

// ── Helpers ──

/**
 * Contact details, pulled straight out of the raw message.
 *
 * WHY THIS IS NOT LEFT TO THE MODEL: a phone number is not a judgement call, and
 * the cheap router-lane classifier kept losing it. Both real inbound IG leads on
 * ldrs_group reached the sales inbox with no way to call the person back —
 * אביחי מזרחי typed "0507723585" (2026-08-16) and פז טוויק typed
 * "פז טוויק - 0526894662 | מייל- paztwik@gmail.com" (2026-08-20); both briefs went
 * out with contact_phone/contact_email null and `customer_phone` null on the row.
 *
 * Deterministic first, classifier on top: this can only ADD a detail, never
 * remove one the model did find.
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
/**
 * Israeli mobile / landline, in the shapes people actually type: 0501234567,
 * 054-766-7775, 052 883 1122, +972547667775. Anchored on non-digits at both ends
 * so it cannot slice a phone out of a follower count, a budget or a year — the
 * numbers that dominate these conversations ("תקציב 250 אלף", "9,000 עוקבים",
 * "כמעט 100000 צפיות").
 */
const PHONE_RE = /(?<!\d)(?:\+?972[-.\s]?|0)(?:5\d|[2-489])[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/;

export function extractContactDetails(text: string): { phone?: string; email?: string } {
  const out: { phone?: string; email?: string } = {};
  const src = text || '';
  const email = src.match(EMAIL_RE)?.[0];
  if (email) out.email = email;
  const phone = src.match(PHONE_RE)?.[0];
  if (phone) out.phone = phone.trim();
  return out;
}

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
  channel: LeadChannel;
  transcript: { role: string; content: string }[];
}): Promise<boolean> {
  const { deps, leadConfig, brandName, row, briefType, channel, transcript } = params;
  const lead = (row.metadata?.lead || {}) as Record<string, any>;
  const leadType: LeadType | null = lead.lead_type ?? null;
  const { to, cc } = resolveLeadRecipients(leadConfig, leadType);

  const { subject, html } = buildLeadBriefEmail({
    brandName,
    contactLabel: lead.ig?.label || null,
    igUsername: lead.ig?.username || null,
    fields: lead.fields || {},
    leadType,
    channel,
    briefType,
    lastMessages: transcript.slice(-8),
    sessionId: row.session_id,
  });

  let sent = false;
  if (to.length > 0) {
    const res = await deps.sendEmail({ to, cc, subject, html });
    sent = !!res.success;
  } else {
    // Never-silent fallback, mirroring dispatch.ts — misconfig must not eat leads.
    const { sendAdminAlert } = await import('@/lib/email');
    await sendAdminAlert({
      level: 'warning',
      subject: `ליד ללא נמען — ${brandName}`,
      message: lead.fields?.summary || 'ליד נכנס אך אין נמענים מוגדרים ב-config.lead_capture',
      details: JSON.stringify({ lead_type: leadType, ...(lead.fields || {}) }, null, 2),
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
          email: { success: sent, at: new Date(deps.now()).toISOString(), to, cc },
        },
      },
      updated_at: new Date(deps.now()).toISOString(),
    })
    .eq('id', row.id);

  return sent;
}

/** support_requests.source → the channel it came from (flush needs the reverse map). */
function channelOfSource(source: string): LeadChannel {
  const hit = (Object.keys(LEAD_SOURCE_BY_CHANNEL) as LeadChannel[]).find(
    (c) => LEAD_SOURCE_BY_CHANNEL[c] === source,
  );
  return hit || 'dm';
}

// ── Per-turn check (fire-and-forget from the surface handlers) ──

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
  const channel: LeadChannel = input.channel || 'dm';
  const source = LEAD_SOURCE_BY_CHANNEL[channel];

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
    .eq('source', source)
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
  const priorType = (row?.metadata?.lead?.lead_type ?? null) as LeadType | null;
  const verdict = await deps.classify({
    transcript,
    userMessage: input.userMessage,
    priorFields,
    priorType,
    brandName,
  });
  if (!verdict) return { isLead: !!row, skipped: 'classifier_unavailable' };
  if (!verdict.is_lead && !row) return { isLead: false };

  // Deterministic contact details from the raw message go on top of whatever the
  // classifier returned — it kept losing them (see extractContactDetails).
  const detected = extractContactDetails(input.userMessage);
  const fields = mergeFields(mergeFields(priorFields, verdict.fields || {}), {
    contact_phone: detected.phone,
    contact_email: detected.email,
  });
  const leadType = mergeLeadType(priorType, verdict.lead_type);
  const fieldsChanged =
    JSON.stringify(fields) !== JSON.stringify(priorFields) || leadType !== priorType;

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
              lead_type: leadType,
              fields_changed_after_brief: true,
              last_activity_at: nowIso,
            },
          },
          // Keep the inbox column in step — a phone that arrives after the brief
          // used to stay invisible in the support list.
          ...(fields.contact_phone ? { customer_phone: fields.contact_phone } : {}),
          updated_at: nowIso,
        })
        .eq('id', row.id);
    }
    return {
      isLead: true,
      briefSent: false,
      leadType,
      skipped: fieldsChanged ? undefined : 'already_sent',
    };
  }

  const contactLabel = [input.contact?.name?.trim() || '', input.contact?.username ? `@${input.contact.username.trim()}` : '']
    .filter(Boolean)
    .join(' ');
  const nowIso = new Date(deps.now()).toISOString();
  const leadMeta = {
    ...(row?.metadata?.lead || {}),
    state: 'gathering',
    fields,
    lead_type: leadType,
    channel,
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
      .update({
        metadata: { ...(row.metadata || {}), lead: leadMeta },
        ...(fields.contact_phone ? { customer_phone: fields.contact_phone } : {}),
        updated_at: nowIso,
      })
      .eq('id', row.id);
    leadRow = { ...row, metadata: { ...(row.metadata || {}), lead: leadMeta } };
  } else {
    const { data: inserted } = await supabase
      .from('support_requests')
      .insert({
        account_id: input.accountId,
        customer_name: contactLabel || fields.contact_name || (channel === 'dm' ? 'ליד מאינסטגרם' : 'ליד מהאתר'),
        customer_phone: fields.contact_phone || null,
        message: input.userMessage,
        session_id: input.sessionId,
        status: 'in_progress',
        source,
        metadata: { lead: leadMeta },
      })
      .select('id, session_id, metadata')
      .single();
    leadRow = inserted;
  }
  if (!leadRow) return { isLead: true, leadType, skipped: 'row_write_failed' };

  // 6) enough gathered → full brief now
  if (verdict.readiness === 'ready') {
    const fullTranscript = [...transcript, { role: 'user', content: input.userMessage }];
    const sent = await sendBrief({
      deps,
      leadConfig,
      brandName,
      row: leadRow,
      briefType: 'full',
      channel,
      transcript: fullTranscript,
    });
    return { isLead: true, briefSent: sent, leadType };
  }

  return { isLead: true, briefSent: false, leadType };
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
    .select('id, account_id, session_id, source, metadata')
    .in('source', LEAD_SOURCES)
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
      const channel: LeadChannel = row.metadata?.lead?.channel || channelOfSource(row.source);
      await sendBrief({ deps, leadConfig, brandName, row, briefType, channel, transcript });
      flushed++;
    } catch (e) {
      console.error('[lead-capture] flush failed for row', row.id, (e as Error).message);
    }
  }

  return { flushed, scanned: pending.length };
}
