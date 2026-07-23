/**
 * THE HEART of Bestie CS: the brain-led tool-calling loop (Task C6). There is NO FSM — the whole
 * conversation runs as one loop where the model emits tool_calls, we dispatch them via the CS
 * tools (Task C4), feed results back, and repeat until the model produces a final text reply.
 * Bestie CS is PURELY CONVERSATIONAL — no button/list menu tools exist (scales to ~10,000 brands,
 * where a picker menu for brand selection is absurd), so every reply here is free text; the
 * brain disambiguates the brand via resolve_brand + a prose confirm/clarify. Security/data gates
 * live INSIDE the tools; this loop only honors their signals (bind/learnedName/escalated) and
 * persists the turn.
 */
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { loadCsSession, createCsSession, saveCsSession, type CsSessionRow, type CsPhase } from '@/lib/cs/cs-session';
import { getCsTools, CS_TOOL_DEFS } from '@/lib/cs/tools';
import type { CsToolCtx, CsToolResult, OpenAIFunctionDef } from '@/lib/cs/tools/types';
import { buildCsSystemPrompt, buildContextDigest, stripSuggestions, type CsRecentTurn } from '@/lib/cs/cs-context';
import { laneModel } from '@/lib/llm/config';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import type { CsJob } from '@/lib/cs/wa-cs-queue';

export interface CsTurnResult {
  reply:
    | { kind: 'text'; body: string }
    // 'buttons'/'list' are kept in the type for wa-cs-worker.ts's dispatch (still supports sending
    // them harmlessly) but are UNREACHABLE from this loop — no CS tool emits an interactive reply
    // anymore (purely conversational brand selection; see the file-header comment).
    | { kind: 'buttons'; body: string; buttons: any[]; header?: string; footer?: string }
    | { kind: 'list'; body: string; buttonLabel: string; sections: any[]; header?: string; footer?: string }
    | { kind: 'none' };
  phase: CsPhase;
}

// content is `string` for text turns and an OpenAI multimodal content-part array (text + image_url)
// for an image turn, so the brain literally SEES the shopper's photo.
interface CsChatMessage { role: 'user' | 'assistant' | 'tool'; content: string | any[] | null; tool_calls?: any[]; tool_call_id?: string; }
interface CsModelTurn { toolCalls: Array<{ id: string; name: string; args: any }>; text: string | null; }
export interface CsAgentDeps {
  callModel(params: { system: string; messages: CsChatMessage[]; tools: OpenAIFunctionDef[] }): Promise<CsModelTurn>;
}

const MAX_ITERS = 5;
const TERMINAL_TICKET = new Set(['resolved', 'closed', 'cancelled']);
function safeJson(s: any): any { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch { return {}; } }
function phoneVariants(waId: string): string[] {
  const wa = toWaId(waId);
  const local = wa.startsWith('972') ? '0' + wa.slice(3) : wa;
  return Array.from(new Set([waId, wa, local, '+' + wa]));
}

// Default LLM caller — native OpenAI function-calling (mirrors src/lib/chatbot/sandwich-bot-hybrid.ts).
async function defaultCallModel(params: { system: string; messages: CsChatMessage[]; tools: OpenAIFunctionDef[] }): Promise<CsModelTurn> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.chat.completions.create({
    model: laneModel('money'),
    messages: [{ role: 'system', content: params.system }, ...(params.messages as any)],
    tools: params.tools as any,
    tool_choice: 'auto',
  });
  const msg: any = res.choices?.[0]?.message;
  const toolCalls = (msg?.tool_calls || []).map((tc: any) => ({ id: tc.id, name: tc.function?.name, args: safeJson(tc.function?.arguments) }));
  return { toolCalls, text: msg?.content ?? null };
}

// --- read-helpers used to build the turn context ---
async function loadHistory(chatSessionId: string): Promise<CsChatMessage[]> {
  const { data } = await supabaseAdmin.from('chat_messages').select('role, content').eq('session_id', chatSessionId).order('created_at', { ascending: false }).limit(10);
  return ((data as any[]) || []).reverse().map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
}
async function priorUserTexts(chatSessionId: string | null): Promise<string[]> {
  if (!chatSessionId) return [];
  const { data } = await supabaseAdmin.from('chat_messages').select('role, content').eq('session_id', chatSessionId).order('created_at', { ascending: false }).limit(8);
  return ((data as any[]) || []).reverse().filter((m) => m.role === 'user').map((m) => m.content);
}
async function escalationConfig(accountId: string | null): Promise<any> {
  if (!accountId) return null;
  const { data } = await supabaseAdmin.from('accounts').select('config').eq('id', accountId).single();
  return (data as any)?.config?.escalation || null;
}
async function loadOpenThreads(waId: string): Promise<Array<{ ticketId: string; brand: string; topic: string }>> {
  const { data } = await supabaseAdmin
    .from('support_requests').select('id, account_id, status, message, metadata, accounts(config)')
    .eq('source', 'whatsapp_cs').in('customer_phone', phoneVariants(waId)).order('updated_at', { ascending: false }).limit(10);
  return ((data as any[]) || []).filter((r) => !TERMINAL_TICKET.has(r.status)).map((r) => ({
    ticketId: r.id, brand: r.accounts?.config?.display_name || r.accounts?.config?.username || 'המותג', topic: r.metadata?.topic || r.message || 'פנייה',
  }));
}

// Apply a bind side-effect: create/reuse the chat_session, set ctx + session (phase='serving').
async function applyBind(session: CsSessionRow, ctx: CsToolCtx, bind: { accountId: string; ticketId?: string | null }): Promise<CsSessionRow> {
  let chatSessionId = session.active_chat_session_id;
  if (!chatSessionId || session.active_account_id !== bind.accountId) {
    chatSessionId = randomUUID();
    await supabaseAdmin.from('chat_sessions').insert({ id: chatSessionId, account_id: bind.accountId, message_count: 0, anon_id: `wa_${session.wa_id}_${bind.accountId}` });
  }
  const patch = { active_account_id: bind.accountId, active_ticket_id: bind.ticketId ?? session.active_ticket_id, active_chat_session_id: chatSessionId, phase: 'serving' as CsPhase, last_activity_at: new Date().toISOString() };
  await saveCsSession(session, patch);
  ctx.accountId = bind.accountId; ctx.ticketId = patch.active_ticket_id; ctx.chatSessionId = chatSessionId;
  return { ...session, ...patch, version: session.version + 1 };
}

// Apply a learned-name side-effect (name is learned ONCE, stored on whatsapp_contacts).
async function applyLearnedName(session: CsSessionRow, ctx: CsToolCtx, name: string): Promise<CsSessionRow> {
  const clean = name.trim().slice(0, 60);
  await saveCsSession(session, { customer_name: clean, last_activity_at: new Date().toISOString() });
  if (session.contact_id) await supabaseAdmin.from('whatsapp_contacts').update({ profile_name: clean }).eq('id', session.contact_id);
  ctx.customerName = clean;
  return { ...session, customer_name: clean, version: session.version + 1 };
}

// While the bot is paused (a human took over), still surface the shopper's message to that human:
// to chat_messages (the transcript the resumed bot + inbox read) and, when a ticket is bound, as a
// customer_reply on its history (the support-inbox surface — mirrors what route-inbound recorded
// before whatsapp_cs/auto_escalation tickets were excluded from its phone match). Best-effort.
async function recordPausedInbound(session: CsSessionRow, userMessage: string): Promise<void> {
  try {
    if (session.active_chat_session_id) {
      await supabaseAdmin.from('chat_messages').insert({ session_id: session.active_chat_session_id, role: 'user', content: userMessage });
    }
  } catch (e) { console.warn('[cs-agent] paused-inbound chat_messages write failed', e); }
  try {
    if (session.active_ticket_id && session.active_account_id) {
      const { appendCsTicketHistory } = await import('@/lib/cs/cs-ticket'); // Phase D (D1)
      await appendCsTicketHistory({ ticketId: session.active_ticket_id, accountId: session.active_account_id, action: 'customer_reply', actor: 'customer', note: userMessage, body_text: userMessage });
    }
  } catch (e) { console.warn('[cs-agent] paused-inbound ticket append failed', e); }
}

// Persist the turn to chat_messages + bump message_count (mirror widget-chat-handler.ts).
async function persistTurn(chatSessionId: string, userMessage: string, assistantText: string): Promise<void> {
  const { data: sess } = await supabaseAdmin.from('chat_sessions').select('message_count').eq('id', chatSessionId).single();
  const msgCount = (((sess as any)?.message_count) || 0) + 2;
  await Promise.all([
    supabaseAdmin.from('chat_messages').insert({ session_id: chatSessionId, role: 'user', content: userMessage }),
    supabaseAdmin.from('chat_messages').insert({ session_id: chatSessionId, role: 'assistant', content: assistantText }),
    supabaseAdmin.from('chat_sessions').update({ message_count: msgCount }).eq('id', chatSessionId),
  ]);
}

export async function runCsTurn(job: CsJob, depsOverride?: Partial<CsAgentDeps>): Promise<CsTurnResult> {
  const deps: CsAgentDeps = { callModel: depsOverride?.callModel ?? defaultCallModel };
  const waId = job.waId;
  // Image inbound: userMessage is a short text stand-in (caption or a marker) used for persistence,
  // detectHandoff and the escalation transcript; the ACTUAL photo is threaded to the model below.
  const img = job.image;
  const userMessage = (img ? (img.caption ? `[תמונה] ${img.caption}` : '[הלקוח/ה שלח/ה תמונה]') : (job.textBody || '')).trim();
  let session = (await loadCsSession(waId)) || (await createCsSession(waId, job.contactId ?? null));

  // Lightweight pre-bind memory (Task C6 follow-up, closes an opus-review finding): chat_messages
  // history only exists AFTER bind_brand, so pre-bind onboarding turns (greeting → "which brand?" →
  // disambiguation) would otherwise have zero cross-turn memory. Ride a capped recent-exchange
  // list on session.context — appended here at turn start, appended again + persisted at turn end.
  const recentTurns: CsRecentTurn[] = Array.isArray((session.context as any)?.recentTurns)
    ? [...(session.context as any).recentTurns]
    : [];
  recentTurns.push({ role: 'user', text: userMessage });

  // 2) Pause guard — a human owns this thread; the bot stays silent until manual resume. It must
  //    still RECORD the shopper's message so the human sees it: route-inbound no longer files
  //    whatsapp_cs/auto_escalation tickets, so nothing else captures a paused-thread inbound.
  if (session.active_chat_session_id) {
    const { isBotPaused } = await import('@/lib/handoff/bot-pause'); // Phase D (D3)
    if (await isBotPaused(session.active_chat_session_id)) {
      await recordPausedInbound(session, userMessage);
      return { reply: { kind: 'none' }, phase: session.phase };
    }
  }

  // 3) Code backstop — guarantee escalation even if the brain misses the cue. FAILS CLOSED:
  // detectHandoff itself may throw (unknown Phase-D wiring, bad config, etc) — in that case we
  // genuinely don't know it's an escalation, so we proceed to the model. But once detectHandoff
  // HAS decided this is a known escalation, that decision is final — a known escalation must
  // never reach the model just because the pause/notify dispatch (runCsHandoffCheck) failed.
  let handoff: { triggered: boolean; [k: string]: any } | null = null;
  try {
    const { detectHandoff } = await import('@/engines/escalation/detect'); // Phase D (D2)
    const cfg = await escalationConfig(session.active_account_id);
    handoff = detectHandoff(userMessage, await priorUserTexts(session.active_chat_session_id), { enabledTriggers: cfg?.triggers, lowConfidenceThreshold: cfg?.lowConfidenceThreshold });
  } catch (e) {
    console.warn('[cs-agent] detectHandoff failed — treating as unknown, proceeding to the model', e);
  }
  if (handoff?.triggered && session.active_account_id && session.active_chat_session_id) {
    try {
      const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch'); // Phase D (D4)
      await runCsHandoffCheck({ accountId: session.active_account_id, chatSessionId: session.active_chat_session_id, ticketId: session.active_ticket_id, waId, userMessage, customerName: session.customer_name, imageUrl: img?.url ?? null, force: true });
    } catch (e) {
      console.error('[cs-agent] runCsHandoffCheck failed — still handing off; a known escalation must never fall through to the model', e);
    }
    try { await saveCsSession(session, { last_activity_at: new Date().toISOString() }); } catch (e) { console.warn('[cs-agent] session touch after handoff failed', e); }
    return { reply: { kind: 'text', body: 'אני מעבירה אותך לנציג/ה אנושי/ת שיחזרו אליך בהקדם 🙏' }, phase: session.phase };
  }

  // 4) Build the brand-grounded system prompt (persona + RAG + re-entry digest — NO scripted menu).
  const openThreads = await loadOpenThreads(waId);
  const digest = await buildContextDigest(session, openThreads);
  const system = await buildCsSystemPrompt({ accountId: session.active_account_id, userMessage, digest });

  // 5) Tool-calling loop.
  const ctx: CsToolCtx = { waId, accountId: session.active_account_id, chatSessionId: session.active_chat_session_id, ticketId: session.active_ticket_id, customerName: session.customer_name, senderPhone: waId, lastImageUrl: img?.url ?? null };
  const toolMap = new Map(getCsTools().map((t) => [t.def.function.name, t]));
  const history = session.active_chat_session_id ? await loadHistory(session.active_chat_session_id) : [];
  // Image turn → multimodal content (text + image_url) so the brain sees the photo; text turn → string.
  const userContent: any = img?.dataUrl
    ? [{ type: 'text', text: userMessage }, { type: 'image_url', image_url: { url: img.dataUrl } }]
    : userMessage;
  const messages: CsChatMessage[] = [...history, { role: 'user', content: userContent }];
  let finalText: string | null = null;
  let handedOff = false; // escalate_to_human fired this turn → pause FUTURE turns, but still ack THIS one

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const turn = await deps.callModel({ system, messages, tools: CS_TOOL_DEFS });
    if (!turn.toolCalls?.length) { finalText = turn.text; break; }
    messages.push({ role: 'assistant', content: turn.text, tool_calls: turn.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })) });

    for (const tc of turn.toolCalls) {
      const tool = toolMap.get(tc.name);
      let result: CsToolResult = { ok: false, data: { reason: 'unknown_tool' } };
      if (tool) { try { result = await tool.handler(tc.args, ctx); } catch (e) { result = { ok: false, data: { reason: 'tool_error' } }; console.warn('[cs-agent] tool threw', tc.name, e); } }
      if (result.bind) session = await applyBind(session, ctx, result.bind);
      if (result.learnedName) session = await applyLearnedName(session, ctx, result.learnedName);
      if (result.escalated) handedOff = true;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result.data ?? { ok: result.ok }) });
    }
    // Do NOT short-circuit on a hand-off. escalate_to_human pauses the bot for FUTURE turns, but the
    // shopper who just reported a problem must get a reply NOW, not silence — so let the loop run one
    // more iteration and let the model compose a brief empathetic hand-off ack from the tool result.
  }

  // 6/7) Persist + reply. No CS tool returns an interactive payload (purely conversational — see file
  // header), so the reply is always text. On a hand-off, if the model produced no closing text we fall
  // back to an empathetic ack — NEVER the rephrase fallback, which reads as nonsense after an escalation.
  const HANDOFF_ACK = 'אני מעבירה את זה לנציג/ה אנושי/ת שיחזרו אליך בהקדם 🙏';
  const replyBody = stripSuggestions(finalText || (handedOff ? HANDOFF_ACK : 'סליחה, אפשר לנסח שוב? 🙏'));
  if (replyBody) recentTurns.push({ role: 'assistant', text: replyBody });
  await saveCsSession(session, { context: { ...(session.context || {}), recentTurns: recentTurns.slice(-8) }, last_activity_at: new Date().toISOString() });
  if (session.active_chat_session_id) await persistTurn(session.active_chat_session_id, userMessage, replyBody);
  return { reply: { kind: 'text', body: replyBody }, phase: session.phase };
}
