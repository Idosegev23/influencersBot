/**
 * One association chat turn: check the session belongs to this visitor, retrieve,
 * prompt, stream the answer through the META splitter and the link guard, check
 * every card against what was actually retrieved, then save, escalate, record.
 */
import { supabase } from '@/lib/supabase';
import { resolvePreviousResponseId } from '@/lib/chatbot/chain-ttl';
import { recordTurnCost } from '@/lib/costs/recorder';
import { ASSOCIATION_TOPICS } from '@/lib/rag/enrich';
import type { TokenUsage } from '@/lib/chatbot/archetypes/types';
import type { AssociationContext } from './association';
import type { AssociationTenant } from './tenant';
import type { VisitorRow } from './visitors';
import type { MemberSnapshot } from './ams/types';
import { retrieveAssociationSources, isExcluded, type CopilotSource } from './sources';
import { listUpcomingEvents, todayIn, type UpcomingEvent } from './events-store';
import { buildInstructions, buildUserInput, promptEvents, ctaUrlSets, allowedCtaUrls, findUrlSpans, isSiteHost, type PromptContext } from './prompt';
import { createVisibleTextSplitter, parseMeta, EMPTY_META, type CopilotMeta } from './protocol';
import { streamCopilotModel } from './model';
import { escalateIfNeeded, type EscalationResult } from './escalate';
import { readContactRules, shouldRequestContact } from './contact-trigger';
import { recordEvents, type InteractionEventInput } from './events';

export type TurnEvent =
  | { type: 'meta'; sessionId: string }
  | { type: 'delta'; text: string }
  | { type: 'sources'; items: Array<{ n: number; title: string; url: string }> }
  | { type: 'related'; item: { title: string; url: string } }
  | { type: 'event'; item: { id: string; title: string; startsOn: string; endsOn: string | null; location: string | null; url: string; registrationUrl: string | null } }
  | { type: 'cta'; kind: 'event' | 'join' | 'renew'; url: string }
  | { type: 'contact_request' }
  | { type: 'escalated' }
  | { type: 'done'; messageId: string | null }
  | { type: 'error'; error: string };

export interface TurnDeps {
  db: any;
  retrieveSources: (accountId: string, query: string, rules: string[]) => Promise<CopilotSource[]>;
  listEvents: (accountId: string, today: string) => Promise<UpcomingEvent[]>;
  model: typeof streamCopilotModel;
  escalate: (input: Parameters<typeof escalateIfNeeded>[0]) => Promise<EscalationResult>;
  recordEvents: typeof recordEvents;
  recordCost: (p: { accountId: string; sessionId: string | null; usage: TokenUsage[] }) => void;
  now: () => Date;
}

export function defaultTurnDeps(): TurnDeps {
  return {
    db: supabase,
    retrieveSources: retrieveAssociationSources,
    listEvents: listUpcomingEvents,
    model: streamCopilotModel,
    escalate: escalateIfNeeded,
    recordEvents,
    recordCost: (p) => { void recordTurnCost(p); },
    now: () => new Date(),
  };
}

const HISTORY_LIMIT = 10;
export const EMPTY_ANSWER = "I'm sorry, I don't have a good answer to that. Would you like me to connect you with a member of staff?";
const DEFAULT_TZ = 'America/New_York';
const TRUSTED_IDENTITY = new Set(['ams_login', 'newsletter', 'ams_email']);
const SESSION_COLS = 'id, account_id, visitor_id, message_count, last_response_id, last_turn_at, created_at';

const log = (...a: unknown[]) => console.error('[copilot/turn]', ...a);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Lowercase hostnames, `www.` stripped, from the site URL plus any staff-listed hosts. */
export function siteHostsOf(config: any): string[] {
  const out = new Set<string>();
  const add = (raw: unknown) => {
    if (typeof raw !== 'string' || !raw.trim()) return;
    let h = raw.trim().toLowerCase();
    if (h.includes('://')) { try { h = new URL(h).hostname; } catch { return; } }
    h = h.replace(/^www\./, '').replace(/\.$/, '');
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) out.add(h);
  };
  add(config?.website_url);
  const extra = config?.copilot?.site_hosts;
  if (Array.isArray(extra)) extra.forEach(add);
  return [...out];
}

/** A stored membership snapshot, or null when it is not one (never let malformed JSON break the prompt). */
function memberOf(raw: unknown): MemberSnapshot | null {
  const m = raw as any;
  if (!m || typeof m !== 'object' || typeof m.status !== 'string') return null;
  return { ...m, registrations: Array.isArray(m.registrations) ? m.registrations.filter((r: any) => r && typeof r.title === 'string') : [] };
}

function normUrl(u: string): string {
  try { const x = new URL(u); return x.href.replace(/\/$/, ''); } catch { return u; }
}

/**
 * Streaming link guard for the visible answer. Every link-like span (scheme,
 * `www.`, protocol-relative, bare domain) is removed unless its host is on the
 * association's site, or the exact URL is one the model was given (a source URL
 * or a CTA/event link); links to excluded pages are removed either way. The
 * trailing token is held back until whitespace or the end, because a URL can
 * arrive split across deltas; URLs never contain whitespace.
 */
export function createLinkGuard(opts: { siteHosts: string[]; allowedUrls: string[]; exclusions: string[] }) {
  const allowed = new Set(opts.allowedUrls.filter(Boolean).map(normUrl));
  const keep = (url: string, host: string) => {
    if (opts.exclusions.length && isExcluded(url, opts.exclusions)) return false;
    return isSiteHost(host, opts.siteHosts) || allowed.has(normUrl(url));
  };
  let tail = '';
  let lastOut = '';

  const clean = (text: string): string => {
    let out = '';
    let pos = 0;
    for (const s of findUrlSpans(text)) {
      if (keep(s.url, s.host)) continue;
      out += text.slice(pos, s.start);
      pos = s.end;
      // Collapse the gap: drop one following space when a space already precedes the link.
      const before = out.length ? out[out.length - 1] : lastOut;
      if (/[ \t]/.test(text[pos] ?? '') && (before === '' || /\s/.test(before))) pos += 1;
    }
    out += text.slice(pos);
    if (out) lastOut = out[out.length - 1];
    return out;
  };

  return {
    push(chunk: string): string {
      tail += chunk;
      const m = tail.match(/\s(?=\S*$)/);
      if (!m) return '';
      const cut = (m.index ?? 0) + 1;
      const ready = tail.slice(0, cut);
      tail = tail.slice(cut);
      return clean(ready);
    },
    end(): string {
      const rest = tail;
      tail = '';
      return rest ? clean(rest) : '';
    },
  };
}

export async function runCopilotTurn(
  input: { tenant: AssociationTenant; assoc: AssociationContext; visitor: VisitorRow; sessionId: string; message: string },
  emit: (e: TurnEvent) => void,
  deps: Partial<TurnDeps> = {},
): Promise<void> {
  const d: TurnDeps = { ...defaultTurnDeps(), ...deps };
  const { tenant, assoc, visitor, sessionId, message } = input;
  const accountId = tenant.accountId;

  // 1. The session must belong to this association and this visitor. Nothing is
  //    read beyond the session, written, retrieved or sent to the model otherwise.
  if (!accountId || assoc?.accountId !== accountId || visitor?.account_id !== accountId) {
    emit({ type: 'error', error: 'unknown_session' });
    return;
  }
  let session: any = null;
  try {
    const { data, error } = await d.db.from('chat_sessions').select(SESSION_COLS).eq('id', sessionId).maybeSingle();
    if (error) log('session read failed', accountId, error.message);
    session = data ?? null;
  } catch (e) {
    log('session read threw', accountId, e);
  }
  if (!session || session.id !== sessionId || session.account_id !== accountId || !visitor.id || session.visitor_id !== visitor.id) {
    emit({ type: 'error', error: 'unknown_session' });
    return;
  }

  // 2. History (oldest first), whether contact was ever requested in this session, and the chain.
  //    Both reads happen before this turn's user message is saved, so it is never in the history.
  let history: Array<{ role: string; content: string; metadata: any }> = [];
  let contactAskedBefore = false;
  await Promise.all([
    (async () => {
      try {
        const { data, error } = await d.db.from('chat_messages').select('role, content, metadata')
          .eq('session_id', sessionId).order('created_at', { ascending: false }).limit(HISTORY_LIMIT);
        if (error) log('history read failed', accountId, error.message);
        history = ((data ?? []) as any[]).filter((m) => m && typeof m.content === 'string').reverse();
      } catch (e) {
        log('history read threw', accountId, e);
      }
    })(),
    (async () => {
      // The 10-row window forgets older turns, so look across the whole session.
      try {
        const { data, error } = await d.db.from('chat_messages').select('id')
          .eq('session_id', sessionId).eq('role', 'assistant')
          .eq('metadata->copilot->>contact_requested', 'true').limit(1);
        if (error) log('contact lookup failed', accountId, error.message);
        contactAskedBefore = Array.isArray(data) && data.length > 0;
      } catch (e) {
        log('contact lookup threw', accountId, e);
      }
    })(),
  ]);
  const previousResponseId = resolvePreviousResponseId(session);

  // 3. Save the user message before anything is spent on it.
  const { error: userErr } = await d.db.from('chat_messages')
    .insert({ session_id: sessionId, role: 'user', content: message }).select('id').single();
  if (userErr) {
    log('user message insert failed', accountId, userErr.message);
    emit({ type: 'error', error: 'unavailable' });
    return;
  }

  // 4. Config.
  const config = (assoc.config ?? {}) as any;
  const cp = (config.copilot ?? {}) as any;
  const exclusions: string[] = Array.isArray(cp.exclusions) ? cp.exclusions.filter((r: unknown) => typeof r === 'string') : [];
  const links = (cp.links ?? {}) as any;
  const joinUrl = str(links.join);
  const renewUrl = str(links.renew);
  const tz = str(cp.timezone) ?? DEFAULT_TZ;
  const now = d.now();
  let today: string;
  try { today = todayIn(tz, now); } catch { today = todayIn(DEFAULT_TZ, now); }
  const tone = str(cp.tone);
  const associationName = str(config.display_name) ?? str(config.username) ?? 'the association';
  const websiteUrl = str(config.website_url);
  const siteHosts = siteHostsOf(config);

  // 5. Retrieval and events, in parallel.
  let rawSources: CopilotSource[];
  let rawEvents: UpcomingEvent[];
  try {
    [rawSources, rawEvents] = await Promise.all([
      d.retrieveSources(accountId, message, exclusions),
      d.listEvents(accountId, today).catch((e: unknown) => { log('events failed', accountId, e); return [] as UpcomingEvent[]; }),
    ]);
  } catch (e) {
    log('retrieval failed', accountId, e);
    emit({ type: 'error', error: 'answer_unavailable' });
    return;
  }
  // Defence in depth: exclusions hold even if a retriever forgot them; renumber so [n] stays dense.
  const sources: CopilotSource[] = (rawSources ?? [])
    .filter((s) => !isExcluded(s.url, exclusions))
    .map((s, i) => ({ ...s, n: i + 1 }));
  const events: UpcomingEvent[] = (rawEvents ?? [])
    .filter((e) => e && typeof e.startsOn === 'string' && (e.endsOn ?? e.startsOn) >= today)
    .filter((e) => !isExcluded(e.url, exclusions))
    .map((e) => (e.registrationUrl && isExcluded(e.registrationUrl, exclusions) ? { ...e, registrationUrl: null } : e));

  // 6. Prompt.
  const identified = !!visitor.identity_source && TRUSTED_IDENTITY.has(visitor.identity_source);
  const member = identified ? memberOf(visitor.membership) : null;
  const ctx: PromptContext = {
    associationName, websiteUrl, siteHosts, sources, events, member, identified,
    joinUrl, renewUrl, today, topics: ASSOCIATION_TOPICS, tone,
  };
  const instructions = buildInstructions(ctx);
  const shownEvents = promptEvents(ctx);
  // The self-contained input (history + the new message) is always built: it is the
  // input when there is no live chain, and the fallback model's input either way,
  // because the fallback cannot chain.
  const fullInput: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: buildUserInput(message) },
  ];
  const turnInput = previousResponseId ? [{ role: 'user' as const, content: buildUserInput(message) }] : fullInput;

  // 7. Stream: META splitter, then the link guard.
  emit({ type: 'meta', sessionId });
  const splitter = createVisibleTextSplitter();
  const guard = createLinkGuard({
    siteHosts,
    allowedUrls: [...sources.map((s) => s.url).filter((u): u is string => !!u), ...allowedCtaUrls(ctx)],
    exclusions,
  });
  let visible = '';
  const out = (t: string) => { if (t) { visible += t; emit({ type: 'delta', text: t }); } };
  const recordCostOnce = (usage: unknown) => {
    if (!Array.isArray(usage) || !usage.length) return;
    try { d.recordCost({ accountId, sessionId, usage }); } catch (err) { log('cost failed', err); }
  };

  let result: Awaited<ReturnType<typeof streamCopilotModel>>;
  try {
    result = await d.model({
      instructions, input: turnInput, fallbackInput: fullInput, previousResponseId,
      onDelta: (t: string) => out(guard.push(splitter.push(t))),
    });
  } catch (e) {
    log('model failed', accountId, e instanceof Error ? e.message : e);
    recordCostOnce((e as any)?.usage);
    emit({ type: 'error', error: 'answer_unavailable' });
    return;
  }
  // 13 (moved up). Cost is recorded exactly once, before anything below can throw.
  recordCostOnce(result?.usage);

  const { visible: lastVisible, rawMeta } = splitter.end();
  out(guard.push(lastVisible));
  out(guard.end());
  let answer = visible.trim();
  if (!answer) {
    // META only, or everything was a removed link: never leave the visitor with nothing.
    out(EMPTY_ANSWER);
    answer = EMPTY_ANSWER;
  }

  // 8 to 10 must never cost the visitor the answer: on a throw, no cards, no contact prompt.
  let meta: CopilotMeta = { ...EMPTY_META, cited: [] };
  let citedSources: Array<CopilotSource & { url: string }> = [];
  let related: { title: string; url: string } | null = null;
  let event: UpcomingEvent | null = null;
  let esc: EscalationResult = { escalated: false, reason: null, notified: 0, deduped: false };
  let contactRequested = false;
  try {
    // 8. Cards, each checked against what was retrieved.
    meta = parseMeta(rawMeta, {
      sourceCount: sources.length,
      eventIds: shownEvents.map((e) => e.id),
      ctaUrls: ctaUrlSets(ctx),
      topics: ASSOCIATION_TOPICS,
    });
    const byN = new Map(sources.map((s) => [s.n, s]));
    citedSources = meta.cited.map((n) => byN.get(n)).filter((s): s is CopilotSource & { url: string } => !!s?.url);
    if (citedSources.length) emit({ type: 'sources', items: citedSources.map((s) => ({ n: s.n, title: s.title, url: s.url })) });
    const relatedSource = meta.related != null ? byN.get(meta.related) : undefined;
    related = relatedSource?.url ? { title: relatedSource.title, url: relatedSource.url } : null;
    if (related) emit({ type: 'related', item: related });
    event = meta.eventId ? shownEvents.find((e) => e.id === meta.eventId) ?? null : null;
    if (event) {
      emit({ type: 'event', item: {
        id: event.id, title: event.title, startsOn: event.startsOn, endsOn: event.endsOn,
        location: event.location, url: event.url, registrationUrl: event.registrationUrl,
      } });
    }
    if (meta.cta) emit({ type: 'cta', kind: meta.cta.kind, url: meta.cta.url });

    // 9. Escalation.
    const priorUserMessages = history.filter((m) => m.role === 'user').map((m) => m.content);
    try {
      esc = await d.escalate({
        accountId, associationName, sessionId,
        visitorLabel: str(visitor.name) ?? str(visitor.email) ?? 'Website visitor',
        userMessage: message, priorUserMessages,
        transcript: [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
          { role: 'assistant', content: answer },
        ],
        config: assoc.config,
      }) ?? esc;
    } catch (e) {
      log('escalation failed', accountId, e);
    }
    if (esc.escalated && !esc.deduped) emit({ type: 'escalated' });

    // 10. Contact request. Counts come from the whole session, not the 10-row window.
    const alreadyRequested = contactAskedBefore || history.some((m) => m.role === 'assistant'
      && (m.metadata?.copilot?.contact_requested === true || m.metadata?.contact_requested === true));
    contactRequested = shouldRequestContact({
      rules: readContactRules(assoc.config),
      questionCount: Math.floor((session.message_count ?? 0) / 2) + 1,
      topic: meta.topic,
      modelAsked: meta.askContact,
      escalating: esc.escalated,
      alreadyHaveEmail: !!visitor.email,
      alreadyRequested,
    });
    if (contactRequested) emit({ type: 'contact_request' });
  } catch (e) {
    log('cards or follow-up failed', accountId, e);
  }
  const announceEscalation = esc.escalated && !esc.deduped;

  // 11. Save the answer and advance the session.
  let messageId: string | null = null;
  try {
    const { data, error } = await d.db.from('chat_messages').insert({
      session_id: sessionId, role: 'assistant', content: answer,
      metadata: { copilot: { cited: meta.cited, related: meta.related, eventId: event ? event.id : null, cta: meta.cta, topic: meta.topic, contact_requested: contactRequested } },
    }).select('id').single();
    if (error) log('assistant message insert failed', accountId, error.message);
    messageId = data?.id ?? null;
  } catch (e) {
    log('assistant message insert threw', accountId, e);
  }
  try {
    const { error } = await d.db.from('chat_sessions').update({
      // A fallback answer is not on the chain: drop it so the next turn rebuilds from history.
      last_response_id: result.fellBack ? null : result.responseId ?? null,
      last_turn_at: now.toISOString(),
      message_count: (session.message_count ?? 0) + 2,
    }).eq('id', sessionId);
    if (error) log('session update failed', accountId, error.message);
  } catch (e) {
    log('session update threw', accountId, e);
  }

  // 12. Interaction events (never break the turn).
  const ev = (type: InteractionEventInput['type'], payload: Record<string, unknown> = {}): InteractionEventInput => ({ type, sessionId, messageId, payload });
  const records: InteractionEventInput[] = [ev('question', { length: message.length })];
  if (meta.topic) records.push(ev('topic_classified', { topic: meta.topic }));
  if (citedSources.length) records.push(ev('resource_shown', { urls: citedSources.map((s) => s.url) }));
  if (related) records.push(ev('related_item_shown', { url: related.url, title: related.title }));
  if (event) records.push(ev('event_suggested', { eventId: event.id }));
  if (meta.membershipMentioned || meta.cta?.kind === 'join') records.push(ev('membership_prompted', { cta: meta.cta?.kind === 'join' }));
  if (meta.renewalMentioned || meta.cta?.kind === 'renew') records.push(ev('renewal_prompted', { cta: meta.cta?.kind === 'renew' }));
  if (contactRequested) records.push(ev('contact_requested'));
  if (announceEscalation) records.push(ev('escalated', { reason: esc.reason }));
  try {
    await d.recordEvents({ partnerId: tenant.partnerId, accountId, visitorId: visitor.id, industry: assoc.industry ?? null }, records);
  } catch (e) {
    log('interaction events failed', accountId, e);
  }

  // 13. Cost was recorded right after the model returned.

  // 14. Done.
  emit({ type: 'done', messageId });
}
