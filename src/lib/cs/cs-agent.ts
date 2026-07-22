/**
 * THE HEART of Bestie CS: the brain-led tool-calling loop (Task C6). There is NO FSM — the whole
 * conversation runs as one loop where the model emits tool_calls, we dispatch them via the CS
 * tools (Task C4), feed results back, and repeat until the model produces a final reply or an
 * interactive tool supplies one directly. Security/data gates live INSIDE the tools; this loop
 * only honors their signals (bind/learnedName/interactive/escalated) and persists the turn.
 */
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { loadCsSession, createCsSession, saveCsSession, type CsSessionRow, type CsPhase } from '@/lib/cs/cs-session';
import { getCsTools, CS_TOOL_DEFS } from '@/lib/cs/tools';
import type { CsToolCtx, CsToolResult, OpenAIFunctionDef, WaInteractive } from '@/lib/cs/tools/types';
import { buildCsSystemPrompt, buildContextDigest, stripSuggestions } from '@/lib/cs/cs-context';
import { laneModel } from '@/lib/llm/config';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import type { CsJob } from '@/lib/cs/wa-cs-queue';

export interface CsTurnResult {
  reply:
    | { kind: 'text'; body: string }
    | { kind: 'buttons'; body: string; buttons: any[]; header?: string; footer?: string }
    | { kind: 'list'; body: string; buttonLabel: string; sections: any[]; header?: string; footer?: string }
    | { kind: 'none' };
  phase: CsPhase;
}

interface CsChatMessage { role: 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: any[]; tool_call_id?: string; }
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
  const userMessage = (job.textBody || '').trim();
  let session = (await loadCsSession(waId)) || (await createCsSession(waId, job.contactId ?? null));

  // 2) Pause guard — a human owns this thread; the bot stays silent until manual resume.
  if (session.active_chat_session_id) {
    const { isBotPaused } = await import('@/lib/handoff/bot-pause'); // Phase D (D3)
    if (await isBotPaused(session.active_chat_session_id)) return { reply: { kind: 'none' }, phase: session.phase };
  }

  // 3) Code backstop — guarantee escalation even if the brain misses the cue.
  try {
    const { detectHandoff } = await import('@/engines/escalation/detect'); // Phase D (D2)
    const cfg = await escalationConfig(session.active_account_id);
    const d = detectHandoff(userMessage, await priorUserTexts(session.active_chat_session_id), { enabledTriggers: cfg?.triggers, lowConfidenceThreshold: cfg?.lowConfidenceThreshold });
    if (d.triggered && session.active_account_id && session.active_chat_session_id) {
      const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch'); // Phase D (D4)
      await runCsHandoffCheck({ accountId: session.active_account_id, chatSessionId: session.active_chat_session_id, ticketId: session.active_ticket_id, waId, userMessage, force: true });
      await saveCsSession(session, { last_activity_at: new Date().toISOString() });
      return { reply: { kind: 'text', body: 'אני מעבירה אותך לנציג/ה אנושי/ת שיחזרו אליך בהקדם 🙏' }, phase: session.phase };
    }
  } catch (e) { console.warn('[cs-agent] handoff backstop failed', e); }

  // 4) Build the brand-grounded system prompt (persona + RAG + re-entry digest — NO scripted menu).
  const openThreads = await loadOpenThreads(waId);
  const digest = await buildContextDigest(session, openThreads);
  const system = await buildCsSystemPrompt({ accountId: session.active_account_id, userMessage, digest });

  // 5) Tool-calling loop.
  const ctx: CsToolCtx = { waId, accountId: session.active_account_id, chatSessionId: session.active_chat_session_id, ticketId: session.active_ticket_id, customerName: session.customer_name, senderPhone: waId };
  const toolMap = new Map(getCsTools().map((t) => [t.def.function.name, t]));
  const history = session.active_chat_session_id ? await loadHistory(session.active_chat_session_id) : [];
  const messages: CsChatMessage[] = [...history, { role: 'user', content: userMessage }];
  let finalText: string | null = null;
  let interactive: WaInteractive | null = null;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const turn = await deps.callModel({ system, messages, tools: CS_TOOL_DEFS });
    if (!turn.toolCalls?.length) { finalText = turn.text; break; }
    messages.push({ role: 'assistant', content: turn.text, tool_calls: turn.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })) });

    let escalated = false;
    for (const tc of turn.toolCalls) {
      const tool = toolMap.get(tc.name);
      let result: CsToolResult = { ok: false, data: { reason: 'unknown_tool' } };
      if (tool) { try { result = await tool.handler(tc.args, ctx); } catch (e) { result = { ok: false, data: { reason: 'tool_error' } }; console.warn('[cs-agent] tool threw', tc.name, e); } }
      if (result.bind) session = await applyBind(session, ctx, result.bind);
      if (result.learnedName) session = await applyLearnedName(session, ctx, result.learnedName);
      if (result.interactive) interactive = result.interactive;
      if (result.escalated) escalated = true;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result.data ?? { ok: result.ok }) });
    }
    if (escalated) return { reply: { kind: 'none' }, phase: session.phase };
    if (interactive) break; // an interactive tool supplied the reply
  }

  // 6/7) Persist + reply.
  await saveCsSession(session, { last_activity_at: new Date().toISOString() });
  if (interactive) return { reply: interactive, phase: session.phase };
  const body = stripSuggestions(finalText || 'סליחה, אפשר לנסח שוב? 🙏');
  if (session.active_chat_session_id) await persistTurn(session.active_chat_session_id, userMessage, body);
  return { reply: { kind: 'text', body }, phase: session.phase };
}
