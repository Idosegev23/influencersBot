/**
 * Agent WhatsApp conversation engine — the agent drives the whole quote flow by
 * chat: forward a brief → "build a quote?" → price (total or per-line) → we build
 * it and send the signing link. Free-text replies, interpreted with heuristics +
 * an AI fallback. One active conversation per agent (crm_agent_wa_state).
 */
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { ingestQuote } from '@/lib/crm/quote-ingest';
import { createQuote, issueQuote, signUrlFor } from '@/lib/crm/quotes';
import { computeTotals, lineItemsToDeliverables, type LineItem } from '@/lib/crm/pricing';
import { interpretYesNo, interpretPricing, normalizeAmount, isStateStale, resolveTalent, classifyConfirm } from '@/lib/crm/wa-interpret';
import type { AgentMessageResult } from '@/lib/crm/wa-outcome';
import { CHAT_MODEL } from '@/lib/openai';
import { laneModel } from '@/lib/llm/config';
import { shouldReadBack } from '@/lib/stt/confidence';

export interface WaAgent {
  id: string;
  managed_account_ids?: string[] | null;
  full_name?: string | null;
}
type Seed = { platform: string; deliverable_type: string; qty: number; unit_price?: number; notes: string };

// {reply,outcome} constructors — ✅ fires only on 'done' (see wa-outcome/route).
const done = (reply: string | null, log?: AgentMessageResult['log']): AgentMessageResult => ({ reply, outcome: 'done', log });
const needMore = (reply: string | null, log?: AgentMessageResult['log']): AgentMessageResult => ({ reply, outcome: 'need_more', log });
const fail = (reply: string, log?: AgentMessageResult['log']): AgentMessageResult => ({ reply, outcome: 'error', log });
const withLog = (r: AgentMessageResult, log: AgentMessageResult['log']): AgentMessageResult => ({ ...r, log: { ...log, ...r.log } });

async function getState(agentId: string) {
  const { data } = await supabaseAdmin.from('crm_agent_wa_state').select('*').eq('agent_id', agentId).maybeSingle();
  const fallback = { agent_id: agentId, stage: 'idle', brief_id: null, deal_id: null, context: {} as any, version: 0 };
  if (!data) return fallback;
  // §5.3 — a stale mid-flow row would read tomorrow's brief as a "yes/no". Expire it.
  if (data.stage && data.stage !== 'idle' && isStateStale(data.updated_at)) {
    return { ...data, stage: 'idle', brief_id: null, deal_id: null, context: {} };
  }
  return data;
}
async function setState(agentId: string, patch: Record<string, any>) {
  await supabaseAdmin
    .from('crm_agent_wa_state')
    .upsert({ agent_id: agentId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'agent_id' });
}

/** Optimistic write: only succeeds if the row's version still equals expectedVersion. */
async function setStateGuarded(agentId: string, patch: Record<string, any>, expectedVersion: number): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('crm_agent_wa_state')
    .update({ ...patch, version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq('agent_id', agentId)
    .eq('version', expectedVersion)
    .select('agent_id');
  return !!(data && data.length);
}
void setStateGuarded; // available to the worker's optimistic-retry backstop (P1)
async function resetState(agentId: string) {
  await setState(agentId, { stage: 'idle', brief_id: null, deal_id: null, context: {} });
}

async function accountName(id: string): Promise<string> {
  const { data } = await supabaseAdmin.from('accounts').select('config').eq('id', id).maybeSingle();
  return (data?.config as any)?.display_name || (data?.config as any)?.username || 'המיוצג';
}

function seedFromParsed(parsed: any): Seed[] {
  const d = parsed?.deliverables;
  const rows: Seed[] = [];
  if (Array.isArray(d)) {
    for (const x of d) {
      if (typeof x === 'string') rows.push({ platform: '', deliverable_type: x, qty: 1, notes: '' });
      else
        rows.push({
          platform: x?.platform || '',
          deliverable_type: x?.type || x?.description || '',
          qty: Number(x?.quantity) > 0 ? Math.round(Number(x.quantity)) : 1,
          notes: [x?.description, x?.cadence].filter(Boolean).join(' · '),
        });
    }
  }
  return rows;
}
function deliverableLabel(r: Seed): string {
  const kind = [r.deliverable_type, r.platform].filter(Boolean).join(' · ') || 'תוצר';
  return `${r.qty}× ${kind}`;
}

/** Main entry — returns the reply to send back to the agent, or null (not handled). */
export async function handleAgentMessage(
  agent: WaAgent,
  waId: string,
  text: string | null,
  attachments: any[],
  opts: { isVoice?: boolean; sttConfidence?: number | null } = {}
): Promise<AgentMessageResult> {
  const state = await getState(agent.id);
  const hasAttach = (attachments || []).length > 0;
  const idle = !state.stage || state.stage === 'idle' || state.stage === 'quote_sent';

  // 0) A voice note whose transcription failed/returned empty arrives as isVoice with no
  //    text. Never document it as an empty brief — ask for a resend.
  if (opts.isVoice && !text) return fail('לא הצלחתי להבין את ההקלטה 🙏 אפשר לשלוח שוב?');

  // 0.5) STT read-back — a LOW-confidence voice transcription is echoed for confirmation
  //      before any action, so a mis-heard price/talent is caught (voice-first safety).
  if (opts.isVoice && idle && text && shouldReadBack(opts.sttConfidence, text)) {
    await setState(agent.id, { stage: 'awaiting_stt_confirm', context: { sttText: text } });
    return needMore(`🎙️ שמעתי: "${text}"\nזה נכון? כתוב/י "כן", או פשוט תקן/י.`);
  }

  // 1) Mid-flow reply → the stage machine owns short-lived confirmations / follow-ups
  //    (so a "כן" to "ליצור?" is a confirmation, not a re-planned command).
  if (!idle) {
    switch (state.stage) {
      case 'awaiting_stt_confirm': {
        const heard = state.context?.sttText || '';
        await resetState(agent.id);
        // "כן" → plan the heard text; anything else IS the correction → plan the new text.
        return classifyConfirm(text || '') === 'yes' ? runBrain(agent, waId, heard) : runBrain(agent, waId, text || heard);
      }
      case 'awaiting_talent':
        return handleTalentReply(agent, state, text);
      case 'awaiting_prices':
        return handlePrices(agent, state, text);
      case 'awaiting_create_confirm':
        return handleCreateConfirm(agent, state, text, waId);
    }
  }

  // 2) A forwarded attachment (PDF / doc / image) is always a brief → document it.
  if (hasAttach) return startBrief(agent, waId, text, attachments);

  // 3) Fresh free-form message (text or transcribed voice) → the AI brain reads the
  //    agent's live context, understands the intent, and executes the right action.
  if (text) return runBrain(agent, waId, text);

  return done(null);
}

// ───────────────────────── AI brain (free-form understanding) ─────────────────────────

/** Load the agent's live context the brain reasons over: open briefs, recent deals, roster. */
async function loadBrainContext(agent: WaAgent) {
  const ids = agent.managed_account_ids || [];
  const [briefsRes, dealsRes, acctsRes] = await Promise.all([
    supabaseAdmin.from('crm_inbound_messages')
      .select('id, subject, raw_text, parsed_data, suggested_account_id, brief_status, deal_id')
      .eq('agent_id', agent.id).in('brief_status', ['new', 'assigned', 'priced'])
      .order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('partnerships')
      .select('id, account_id, brand_name, status, proposal_amount, contract_amount')
      .eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(20),
    ids.length ? supabaseAdmin.from('accounts').select('id, config').in('id', ids) : Promise.resolve({ data: [] as any[] }),
  ]);
  const roster = (acctsRes.data || []).map((a: any) => ({ id: a.id, name: (a.config as any)?.display_name || (a.config as any)?.username || '' }));
  return { briefs: briefsRes.data || [], deals: dealsRes.data || [], roster };
}

/** LLM planner: free-form message + context → a single structured action. Returns null on failure. */
async function planFreeform(text: string, ctx: Awaited<ReturnType<typeof loadBrainContext>>): Promise<any | null> {
  const nameOf = (id: string | null) => (id ? ctx.roster.find((r) => r.id === id)?.name || null : null);
  const briefSummary = ctx.briefs.map((b) => {
    const p = (b.parsed_data as any) || {};
    return {
      brief_id: b.id, brand: p.brandName || b.subject || 'מותג',
      talent: nameOf(b.suggested_account_id), talent_id: b.suggested_account_id,
      status: b.brief_status, priced: !!b.deal_id,
      deliverables: seedFromParsed(p).map(deliverableLabel),
      terms: Array.isArray(p.specialTerms) ? p.specialTerms : [],
      summary: String(b.raw_text || '').slice(0, 400),
    };
  });
  const dealSummary = ctx.deals.map((d) => ({
    deal_id: d.id, talent: nameOf(d.account_id), talent_id: d.account_id,
    brand: d.brand_name, status: d.status, amount: d.contract_amount ?? d.proposal_amount,
  }));
  const instr =
    'אתה בסטי — עוזר אישי בוואטסאפ לסוכן משפיענים. הסוכן כותב בשפה חופשית בעברית. ' +
    'הבן את הכוונה והחזר פעולה אחת. אל תמציא נתונים. אל תחשב מספרים בעצמך. ' +
    'היה החלטי — העדף לבצע פעולה על פני לשאול; שאל רק כשחסר מידע קריטי שאי אפשר להסיק מההקשר. ' +
    'החזר JSON נקי בלבד בפורמט: ' +
    '{"action":"answer"|"price"|"issue_quote"|"get_link"|"document_brief"|"clarify",' +
    '"reply":<string|null>,' +
    '"commands":[{"brief_id":<id>,"account_id":<talent_id|null>,"pricing":{"mode":"total"|"per_line","total":<number|null>,"prices":<number[]|null>}}],' +
    '"target":{"talent_id":<id|null>,"deal_id":<id|null>,"brand":<string|null>}}. ' +
    'מתי כל פעולה: ' +
    'answer = הסוכן שואל שאלה על מידע קיים ("מה רצו בבריף של אנה?","מה הסטטוס של דני?","כמה בריפים פתוחים?") — נסח ב-reply תשובה מלאה ומדויקת מתוך ההקשר (deliverables, terms, סכומים, סטטוס). ' +
    'price = הסוכן נותן או מעדכן מחיר לבריף ("תמחר את אנה ב-200 אלף","לאנה 80 לרילס 50 לזכויות") — מלא commands (per_line לפי סדר ה-deliverables; 80=80000; "מאתיים אלף"=200000). ' +
    'אם ההודעה מזהה מיוצג + מחיר, תמחר — גם אם לא כתוב כל פרט. אם יש כמה בריפים זהים לאותו מיוצג ואותו מותג, זה אותו בריף כפול: בחר את הראשון ברשימה (האחרון בזמן) ותמחר, אל תשאל. ' +
    'issue_quote = הסוכן מבקש במפורש לשלוח/להוציא הצעה ("שלח את ההצעה של אנה") — מלא target. ' +
    'get_link = הסוכן מבקש את הקישור הקיים ("תן לי את הקישור של אנה") — מלא target. ' +
    'document_brief = ההודעה עצמה היא בריף חדש שהועבר (בקשה ממותג, בד"כ טקסט ארוך עם תוצרים) — אין צורך ב-reply. ' +
    'clarify = רק כשבאמת אי אפשר להחליט — למשל למיוצג יש בריפים לכמה מותגים שונים וההודעה לא אומרת לאיזה. ב-reply דבר אנושית לחלוטין: לעולם אל תזכיר מזהים פנימיים (brief_id / account_id / id / שמות שדות) — שאל לפי שם המותג או הקמפיין ("לאיזה מותג — X או Y?"). ' +
    `בריפים פתוחים: ${JSON.stringify(briefSummary)}. עסקאות אחרונות: ${JSON.stringify(dealSummary)}. רוסטר מיוצגים: ${JSON.stringify(ctx.roster)}.`;
  try {
    const { chatModel } = await import('@/lib/openai');
    // Router + pricing EXTRACTION only — the number MATH is deterministic (normalizeAmount),
    // so low effort is safe and turns a ~40s reasoning turn into ~10s.
    const { response } = await chatModel(instr, text, laneModel('money'), { effort: 'low', timeoutMs: 45_000 });
    return JSON.parse(String(response || '').replace(/```json|```/g, '').trim());
  } catch {
    return null;
  }
}

/** Front door for a fresh free-form message: plan the intent, then execute it. */
async function runBrain(agent: WaAgent, waId: string, text: string): Promise<AgentMessageResult> {
  const ctx = await loadBrainContext(agent);
  const plan = await planFreeform(text, ctx);
  // Planner failure must NOT document a junk brief + earn a false ✅ (§5.5).
  if (!plan || !plan.action) {
    return fail('לא הצלחתי לעבד את ההודעה. אפשר לשלוח שוב? אם זה בריף חדש — אפשר להעביר אותו כקובץ.');
  }
  const tlog: AgentMessageResult['log'] = { plan_json: plan, model_used: CHAT_MODEL, router_intent: plan.action };

  switch (plan.action) {
    case 'answer': {
      // Advisory lane: the read-only tool-calling brain (SQL for numbers, RAG for meaning).
      try {
        const { answerAgentQuestion } = await import('@/lib/crm/agent-brain');
        const a = await answerAgentQuestion(agent, text);
        return done(a.reply, { ...tlog, model_used: a.modelUsed });
      } catch {
        return done(plan.reply || 'לא בטוח שהבנתי — אפשר לנסח שוב?', tlog);
      }
    }
    case 'clarify':
      return needMore(plan.reply || 'לא בטוח שהבנתי — אפשר לנסח שוב?', tlog);
    case 'document_brief':
      return withLog(await startBrief(agent, waId, text, []), tlog);
    case 'price':
      return withLog(await applyPricingCommands(agent, plan.commands || [], ctx), tlog);
    case 'issue_quote':
    case 'get_link':
      return withLog(await brainDealLink(agent, plan.target || {}, ctx), tlog);
    default:
      return fail('לא הבנתי בדיוק מה לעשות. אפשר לנסח שוב?', tlog);
  }
}

/** Record priced commands (documented) then ask ONCE whether to issue the quote(s). */
async function applyPricingCommands(agent: WaAgent, commands: any, ctx: Awaited<ReturnType<typeof loadBrainContext>>): Promise<AgentMessageResult> {
  // The LLM sometimes collapses a single-element array to a bare object — normalize.
  const list: any[] = Array.isArray(commands) ? commands : commands ? [commands] : [];
  const recorded: PendingDeal[] = [];
  const pending: string[] = [];
  const incomplete: any[] = [];
  let needsConfirmation = false;
  for (const cmd of list) {
    const brief = ctx.briefs.find((b) => b.id === cmd.brief_id);
    if (!brief) { pending.push('• בריף לא זוהה'); continue; }
    const parsed = (brief.parsed_data as any) || {};
    const brand = parsed.brandName || brief.subject || 'מותג';
    const seed = seedFromParsed(parsed);
    const accountId = (cmd.account_id && ctx.roster.find((r) => r.id === cmd.account_id)?.id) || brief.suggested_account_id || null;
    if (!accountId) {
      pending.push(`• ${brand}: עבור מי ההצעה?`);
      incomplete.push({ stage: 'awaiting_talent', brief_id: brief.id, deal_id: null, context: { brand, pricing: cmd.pricing, seed } });
      continue;
    }
    await supabaseAdmin.from('crm_inbound_messages').update({ suggested_account_id: accountId, brief_status: 'assigned' }).eq('id', brief.id);
    const built = buildLineItemsFromPricing(cmd.pricing, seed);
    if (!built) {
      pending.push(`• ${brand}: מה המחיר?`);
      incomplete.push({ stage: 'awaiting_prices', brief_id: brief.id, deal_id: null, context: { account_id: accountId, brand, seed } });
      continue;
    }
    needsConfirmation = needsConfirmation || built.needsConfirmation;
    recorded.push(await recordDealFromBrief(agent, brief.id, accountId, built.lineItems));
  }
  if (recorded.length) {
    await setState(agent.id, { stage: 'awaiting_create_confirm', context: { pending: recorded } });
    const listTxt = recorded.map((r) => `• ${r.clientName} · ${r.brand}: ${r.subtotal.toLocaleString('en-US')} + מע״מ = ${r.total.toLocaleString('en-US')} ₪`).join('\n');
    let msg = `${needsConfirmation ? 'רק לוודא שהבנתי נכון 👇\n' : ''}📝 עודכן:\n${listTxt}\n\nליצור ${recorded.length > 1 ? recorded.length + ' הצעות מחיר' : 'הצעת מחיר'} ולשלוח קישור? (כן/לא)`;
    if (pending.length) msg += `\n\nצריך השלמה:\n${pending.join('\n')}`;
    return needMore(msg, { deal_id: recorded[0]?.partnershipId, amount: recorded[0]?.total });
  }
  if (incomplete.length === 1) {
    await setState(agent.id, incomplete[0]);
    return needMore(incomplete[0].stage === 'awaiting_talent' ? (pending[0] || 'עבור מי ההצעה?') : `${pending[0] || 'מה המחיר?'} (סכום כולל, או מחיר לכל שורה)`);
  }
  await resetState(agent.id);
  return pending.length ? needMore(`צריך השלמה:\n${pending.join('\n')}`) : fail('לא הצלחתי להבין את התמחור. אפשר לנסות שוב?');
}

/** Resolve the agent's meant deal → return (issuing if needed) its sign link. */
async function brainDealLink(agent: WaAgent, target: any, ctx: Awaited<ReturnType<typeof loadBrainContext>>): Promise<AgentMessageResult> {
  let dealId: string | null = target?.deal_id || null;
  const talentId: string | null = target?.talent_id || null;
  if (!dealId) {
    const cached = ctx.deals.find((d) => (talentId && d.account_id === talentId) || (target?.brand && String(d.brand_name || '').includes(target.brand)));
    dealId = cached?.id || null;
  }
  if (!dealId && talentId) {
    const { data } = await supabaseAdmin.from('partnerships').select('id').eq('agent_id', agent.id).eq('account_id', talentId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    dealId = data?.id || null;
  }
  if (!dealId) {
    const name = ctx.roster.find((r) => r.id === talentId)?.name || 'המיוצג';
    return needMore(`אין עדיין עסקה מתומחרת ל-${name}. שלח/י תמחור ואבנה.`);
  }
  return dealLink(agent, dealId);
}

/** Latest signature for a deal → existing link, "signed", or issue a fresh one. */
async function dealLink(agent: WaAgent, dealId: string): Promise<AgentMessageResult> {
  const { data: p } = await supabaseAdmin.from('partnerships').select('brand_name, account_id').eq('id', dealId).maybeSingle();
  if (!p) return fail('לא מצאתי את העסקה.');
  const clientName = await accountName(p.account_id);
  const { data: sig } = await supabaseAdmin.from('signature_requests').select('token, status').eq('partnership_id', dealId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (sig?.status === 'signed') return done(`ההצעה של ${clientName} · ${p.brand_name} כבר נחתמה ✓`);
  try {
    const signUrl = sig?.token ? signUrlFor(sig.token) : (await issueQuoteForDeal(agent, dealId)).signUrl;
    return done(`הצעת המחיר של ${clientName} · ${p.brand_name}:\n${signUrl}`, { deal_id: dealId });
  } catch {
    return fail('לא הצלחתי ליצור את ההצעה, אפשר לנסות שוב?');
  }
}

async function startBrief(agent: WaAgent, waId: string, text: string | null, attachments: any[]): Promise<AgentMessageResult> {
  const res = await ingestQuote({ channel: 'whatsapp', sender: waId, rawText: text, attachments, providerMessageId: null });
  if (!res.matched) return done(null);
  const briefId = res.inboundId;
  if (res.reason === 'parse_failed' || !briefId) {
    await resetState(agent.id);
    return fail('לא הצלחתי לקרוא את הבריף. אפשר לשלוח שוב?');
  }
  // fire-and-forget: index this brief for the advisory RAG brain (meaning questions).
  void import('@/lib/rag/ingest-agent').then((m) => m.ingestBriefEmbeddings(supabaseAdmin, briefId)).catch(() => {});

  const { data: brief } = await supabaseAdmin
    .from('crm_inbound_messages')
    .select('parsed_data, suggested_account_id')
    .eq('id', briefId)
    .maybeSingle();
  const parsed = (brief?.parsed_data as any) || {};
  const brand = parsed?.brandName || 'מותג';

  // A brief is only DOCUMENTED on arrival. Pricing happens later, on the agent's
  // own terms (a voice note hours/days later) — Bestie does not push to build here.
  await resetState(agent.id);
  if (!brief?.suggested_account_id) {
    return done(`📥 קיבלתי בריף מ-${brand}, תיעדתי ✓.\nכשתרצה לתמחר — שלח/י לי (ציין/י את שם המיוצג).`);
  }
  const clientName = await accountName(brief.suggested_account_id);
  return done(`📥 קיבלתי בריף מ-${brand} עבור ${clientName}, תיעדתי ✓.\nכשתרצה — שלח/י תמחור (למשל בהקלטה קולית) ואשאל אם ליצור הצעה.`);
}

async function handlePrices(agent: WaAgent, state: any, text: string | null): Promise<AgentMessageResult> {
  const seed: Seed[] = state.context?.seed || [];
  const pricing = interpretPricing(text || '', seed.length); // already normalized (Task 2)
  let lineItems: LineItem[] | null = null;
  let needsConfirmation = !!pricing.needsConfirmation;

  if (seed.length === 0) {
    if (pricing.mode !== 'unclear' && (pricing.total || pricing.prices?.[0])) {
      lineItems = [{ platform: '', deliverable_type: 'הצעה', qty: 1, unit_price: pricing.total || pricing.prices![0] }];
    }
  } else if (pricing.mode === 'per_line' && pricing.prices) {
    lineItems = seed.map((r, i) => ({ ...r, unit_price: pricing.prices![i] }));
  } else if (pricing.mode === 'total' && pricing.total) {
    lineItems = [{ platform: '', deliverable_type: 'סה״כ', qty: 1, unit_price: pricing.total, notes: seed.map(deliverableLabel).join(' · ') }];
  }

  if (!lineItems) {
    const ai = await aiPricing(text || '', seed);
    if (ai) { lineItems = ai.lineItems; needsConfirmation = needsConfirmation || ai.needsConfirmation; }
  }
  if (!lineItems) return needMore(`לא הבנתי את התמחור. שלח סכום כולל, או ${seed.length || ''} מחירים לפי הסדר.`);

  const rec = await recordDealFromBrief(agent, state.brief_id, state.context?.account_id, lineItems);
  await setState(agent.id, { stage: 'awaiting_create_confirm', context: { pending: [rec] } });
  return needMore(
    `${needsConfirmation ? 'רק לוודא שהבנתי נכון 👇\n' : ''}📝 עודכן: ${rec.clientName} · ${rec.brand} — ${rec.subtotal.toLocaleString('en-US')} ₪ + מע״מ = ${rec.total.toLocaleString('en-US')} ₪.\nליצור הצעת מחיר ולשלוח קישור לחתימה? (כן/לא)`,
    { deal_id: rec.partnershipId, amount: rec.total },
  );
}

async function aiPricing(text: string, seed: Seed[]): Promise<{ lineItems: LineItem[]; needsConfirmation: boolean } | null> {
  try {
    const { chatModel } = await import('@/lib/openai');
    const list = seed.map((r, i) => `${i + 1}) ${deliverableLabel(r)}`).join('; ');
    const instr =
      `אתה מפרש תמחור של סוכן. ${seed.length ? `יש ${seed.length} תוצרים: ${list}.` : 'אין פירוט תוצרים.'} ` +
      `הסוכן שלח תמחור בטקסט חופשי (בשקלים). החזר JSON בלבד ללא טקסט: ` +
      `{"mode":"total"|"per_line","total":number|null,"prices":number[]|null}. per_line = מספר לכל תוצר לפי הסדר.`;
    const { response } = await chatModel(instr, text, laneModel('money'));
    const j = JSON.parse(String(response || '').replace(/```json|```/g, '').trim());
    if (j.mode === 'per_line' && Array.isArray(j.prices) && j.prices.length === seed.length) {
      let nc = false;
      const lineItems = seed.map((r, i) => {
        const n = normalizeAmount(Number(j.prices[i]) || 0, { scaleBare: true });
        nc = nc || n.needsConfirmation;
        return { ...r, unit_price: n.amount };
      });
      return { lineItems, needsConfirmation: nc };
    }
    if (j.mode === 'total' && j.total) {
      const n = normalizeAmount(Number(j.total), { scaleBare: true });
      return { lineItems: [{ platform: '', deliverable_type: 'סה״כ', qty: 1, unit_price: n.amount, notes: seed.map(deliverableLabel).join(' · ') }], needsConfirmation: n.needsConfirmation };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** LLM pricing → normalized line items + whether a magnitude was guessed (read-back). */
function buildLineItemsFromPricing(pricing: any, seed: Seed[]): { lineItems: LineItem[]; needsConfirmation: boolean } | null {
  if (!pricing) return null;
  if (pricing.mode === 'per_line' && Array.isArray(pricing.prices) && seed.length && pricing.prices.length === seed.length) {
    let nc = false;
    const lineItems = seed.map((r, i) => {
      const n = normalizeAmount(Number(pricing.prices[i]) || 0, { scaleBare: true });
      nc = nc || n.needsConfirmation;
      return { ...r, unit_price: n.amount };
    });
    return { lineItems, needsConfirmation: nc };
  }
  if (pricing.mode === 'total' && pricing.total) {
    const n = normalizeAmount(Number(pricing.total), { scaleBare: true });
    const lineItems = seed.length
      ? [{ platform: '', deliverable_type: 'סה״כ', qty: 1, unit_price: n.amount, notes: seed.map(deliverableLabel).join(' · ') }]
      : [{ platform: '', deliverable_type: 'הצעה', qty: 1, unit_price: n.amount }];
    return { lineItems, needsConfirmation: n.needsConfirmation };
  }
  return null;
}


type PendingDeal = { partnershipId: string; clientName: string; brand: string; subtotal: number; total: number };

// Map parser deliverable-type CODES → Hebrew (the quote is Hebrew; English codes both
// look wrong and break RTL rendering when glued to Hebrew).
const TYPE_HE: Record<string, string> = {
  beat: 'פעימה', reminder: 'תזכורת', photo_day: 'יום צילום', day_photo: 'יום צילום',
  reel: 'רילס', reels: 'רילס', story: 'סטורי', stories: 'סטוריז', post: 'פוסט', posts: 'פוסטים',
  video: 'וידאו', tiktok: 'טיקטוק', rights: 'זכויות', usage: 'זכויות שימוש', promotion: 'קידום',
  live: 'לייב', carousel: 'קרוסלה',
};
function heType(t: string): string {
  const k = String(t || '').trim().toLowerCase().replace(/\s+/g, '_');
  return TYPE_HE[k] || t;
}

/** Brief's requested deliverables rendered in Hebrew (falls back to line items). */
function briefDeliverablesOf(parsed: any, lineItems: LineItem[]): string[] {
  const items = seedFromParsed(parsed).map((r) => {
    const label = (r.notes && r.notes.trim()) || heType(r.deliverable_type); // prefer the Hebrew description
    return `${r.qty}× ${label}`.trim();
  });
  const terms = Array.isArray(parsed?.specialTerms) ? parsed.specialTerms.filter(Boolean) : [];
  const all = [...items, ...terms].filter((s) => s && s !== '1×');
  return all.length ? all : lineItemsToDeliverables(lineItems);
}

/**
 * Record the deal (documented, status 'proposal') + priced line items — but do
 * NOT issue a quote yet. The agent is asked separately whether to issue it; if
 * they decline it stays as documentation and can still be issued later on demand.
 */
async function recordDealFromBrief(agent: WaAgent, briefId: string, accountId: string, lineItems: LineItem[]): Promise<PendingDeal> {
  const { data: brief } = await supabaseAdmin.from('crm_inbound_messages').select('*').eq('id', briefId).maybeSingle();
  const parsed = (brief?.parsed_data as any) || {};
  const totals = computeTotals(lineItems);
  const brandName = parsed?.brandName || brief?.subject || 'מותג';
  const clientName = await accountName(accountId);
  const deliverables = briefDeliverablesOf(parsed, lineItems);

  const { data: partnership, error } = await supabaseAdmin
    .from('partnerships')
    .insert({
      account_id: accountId,
      agent_id: agent.id,
      brand_name: brandName,
      brand_contact_name: parsed?.contactPerson?.name || null,
      brand_contact_email: parsed?.contactPerson?.email || null,
      brand_contact_phone: parsed?.contactPerson?.phone || null,
      status: 'proposal',
      proposal_amount: totals.total,
      currency: 'ILS',
      brief: brief?.raw_text || null,
      deliverables: deliverables.length ? deliverables : null,
      proposal_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();
  if (error || !partnership) throw new Error(error?.message || 'failed to record deal');

  const rows = lineItems.map((li, i) => ({
    partnership_id: partnership.id,
    account_id: accountId,
    platform: (li as any).platform || null,
    deliverable_type: (li as any).deliverable_type || null,
    qty: Math.max(1, Math.round(Number(li.qty) || 1)),
    unit_price: Math.max(0, Number(li.unit_price) || 0),
    vat_rate: 0.18,
    notes: (li as any).notes || null,
    sort_order: i,
  }));
  await supabaseAdmin.from('deal_line_items').insert(rows);
  await supabaseAdmin
    .from('crm_inbound_messages')
    .update({ deal_id: partnership.id, partnership_id: partnership.id, brief_status: 'priced' })
    .eq('id', briefId);

  // fire-and-forget: index this deal for the advisory RAG brain.
  void import('@/lib/rag/ingest-agent').then((m) => m.ingestDealEmbeddings(supabaseAdmin, partnership.id)).catch(() => {});

  return { partnershipId: partnership.id, clientName, brand: brandName, subtotal: totals.subtotal, total: totals.total };
}

/** Issue the quote (PDF + signature link) for an already-recorded deal. */
async function issueQuoteForDeal(agent: WaAgent, partnershipId: string): Promise<{ signUrl: string; total: number; clientName: string; brand: string }> {
  const { data: p } = await supabaseAdmin.from('partnerships').select('*').eq('id', partnershipId).maybeSingle();
  if (!p) throw new Error('deal not found');
  const { data: brief } = await supabaseAdmin.from('crm_inbound_messages').select('parsed_data, raw_text').eq('deal_id', partnershipId).maybeSingle();
  const parsed = (brief?.parsed_data as any) || {};
  const clientName = await accountName(p.account_id);
  const amount = Number(p.contract_amount ?? p.proposal_amount ?? 0);
  const deliverables = Array.isArray(p.deliverables) && p.deliverables.length ? p.deliverables : briefDeliverablesOf(parsed, []);

  const result = await issueQuote(partnershipId, {
    agentId: agent.id,
    accountId: p.account_id,
    brandName: p.brand_name,
    clientName,
    campaignName: parsed?.campaignName || null,
    amount,
    currency: p.currency || 'ILS',
    deliverables,
    notes: (brief as any)?.raw_text || p.brief || null,
    brandContactName: p.brand_contact_name,
    brandContactEmail: p.brand_contact_email,
    brandContactPhone: p.brand_contact_phone,
    agentName: agent.full_name,
    parsedData: parsed,
  }, `issue:${partnershipId}`);
  await supabaseAdmin
    .from('crm_inbound_messages')
    .update({ signature_request_id: result.signatureRequestId, brief_status: 'sent' })
    .eq('deal_id', partnershipId);
  return { signUrl: result.signUrl, total: amount, clientName, brand: p.brand_name };
}

/**
 * Interpret the agent's free-form reply to a read-back ("הבנתי: אנה · קוקה-קולה ·
 * 94,400 ₪ — לשלוח?"). Deterministic yes/no first; anything else goes to the model
 * WITH the read-back context so "תשנה לאנה ל-90" is an amend, not a "no". NO buttons.
 */
export async function interpretConfirmReply(
  text: string,
  pending: PendingDeal[],
): Promise<{ decision: 'yes' | 'no' | 'amend' | 'unclear'; reply?: string }> {
  const fast = classifyConfirm(text || '');
  if (fast === 'yes') return { decision: 'yes' };
  if (fast === 'no') return { decision: 'no' };
  const summary = pending.map((p) => `${p.clientName} · ${p.brand} · ${p.total.toLocaleString('en-US')} ₪`).join(' ; ');
  const instr =
    'הסוכן קיבל אישור-חזרה (read-back) על הצעת מחיר וענה בשפה חופשית. ' +
    `ההצעה שהוקראה: ${summary}. ` +
    'סווג את התשובה. החזר JSON נקי בלבד: {"decision":"yes"|"no"|"amend"|"unclear","reply":<string|null>}. ' +
    'yes = מאשר לשלוח. no = לא לשלוח / להשאיר כתיעוד. ' +
    'amend = הסוכן מבקש שינוי (מחיר/מיוצג/מותג אחר) — reply=null. ' +
    'unclear = לא ברור; ב-reply נסח שאלה קצרה ואנושית שחוזרת על מי/כמה, בלי מזהים פנימיים.';
  try {
    const { chatModel } = await import('@/lib/openai');
    const { response } = await chatModel(instr, text || '', laneModel('money'));
    const j = JSON.parse(String(response || '').replace(/```json|```/g, '').trim());
    const decision = ['yes', 'no', 'amend', 'unclear'].includes(j?.decision) ? j.decision : 'unclear';
    return { decision, reply: j?.reply || undefined };
  } catch {
    return { decision: 'unclear', reply: 'לא בטוח שהבנתי — לשלוח את ההצעה? (כן/לא)' };
  }
}

/** After pricing, the agent confirms (free-form, model-in-context) whether to issue. */
async function handleCreateConfirm(agent: WaAgent, state: any, text: string | null, waId: string = ''): Promise<AgentMessageResult> {
  const pending: PendingDeal[] = state.context?.pending || [];
  const { decision, reply } = await interpretConfirmReply(text || '', pending);

  if (decision === 'no') {
    await resetState(agent.id);
    const who = pending[0]?.clientName || 'המיוצג';
    return done(`בסדר — נשמר כתיעוד (מתומחר, בלי הצעה שנשלחה).\nתגיד/י "תן לי את ההצעה של ${who}" מתי שתרצה קישור.`);
  }
  if (decision === 'amend') {
    // free-form change → re-plan the message in context (may re-price / re-target).
    // Pass the real waId so a document_brief re-route has a resolvable sender.
    await resetState(agent.id);
    return runBrain(agent, waId, text || '');
  }
  if (decision === 'unclear') {
    return needMore(reply || `ליצור ${pending.length > 1 ? pending.length + ' הצעות' : 'הצעת מחיר'} ולשלוח קישור? (כן/לא)`);
  }
  // decision === 'yes'
  if (!pending.length) { await resetState(agent.id); return needMore('אין מה ליצור. שלח/י תמחור.'); }
  const links: string[] = [];
  let anyOk = false;
  for (const d of pending) {
    try {
      const r = await issueQuoteForDeal(agent, d.partnershipId);
      anyOk = true;
      links.push(`✅ ${r.clientName} · ${r.brand}: ${r.total.toLocaleString('en-US')} ₪ כולל מע״מ\n${r.signUrl}`);
    } catch {
      links.push(`⚠️ ${d.clientName} · ${d.brand}: לא הצלחתי ליצור`);
    }
  }
  await resetState(agent.id);
  const msg = `הנה — שלח/י ללקוח:\n\n${links.join('\n\n')}`;
  return anyOk ? done(msg, { deal_id: pending[0]?.partnershipId, amount: pending[0]?.total }) : fail(msg);
}

/** Reply that names the talent for a priced-but-unassigned voice command → record + ask. */
async function handleTalentReply(agent: WaAgent, state: any, text: string | null): Promise<AgentMessageResult> {
  const ids = agent.managed_account_ids || [];
  if (!ids.length) { await resetState(agent.id); return needMore('אין מיוצגים ברוסטר שלך.'); }
  const { data: accts } = await supabaseAdmin.from('accounts').select('id, config').in('id', ids);
  const roster = (accts || []).map((a: any) => ({ id: a.id, name: String((a.config as any)?.display_name || (a.config as any)?.username || '') })).filter((r) => r.name.length >= 2);
  const hit = resolveTalent(text || '', roster); // fuzzy Hebrew, replaces q.includes
  if (!hit) return needMore('לא מצאתי מיוצג בשם הזה ברוסטר. נסה/י שם אחר.');
  if (hit.ambiguous?.length === 2) return needMore(`לאיזה מיוצג — ${hit.ambiguous[0].name} או ${hit.ambiguous[1].name}?`);
  const match = (accts || []).find((a: any) => a.id === hit.id)!;
  await supabaseAdmin.from('crm_inbound_messages').update({ suggested_account_id: match.id, brief_status: 'assigned' }).eq('id', state.brief_id);
  const seed: Seed[] = state.context?.seed || [];
  const built = buildLineItemsFromPricing(state.context?.pricing, seed);
  if (!built) {
    await setState(agent.id, { stage: 'awaiting_prices', context: { account_id: match.id, brand: state.context?.brand, seed } });
    return needMore(`מעולה — ${hit.name}. מה המחיר? (סכום כולל, או מחיר לכל שורה)`);
  }
  const rec = await recordDealFromBrief(agent, state.brief_id, match.id, built.lineItems);
  await setState(agent.id, { stage: 'awaiting_create_confirm', context: { pending: [rec] } });
  return needMore(
    `${built.needsConfirmation ? 'רק לוודא שהבנתי נכון 👇\n' : ''}📝 עודכן: ${rec.clientName} · ${rec.brand} — ${rec.subtotal.toLocaleString('en-US')} ₪ + מע״מ = ${rec.total.toLocaleString('en-US')} ₪.\nליצור הצעת מחיר ולשלוח קישור? (כן/לא)`,
    { deal_id: rec.partnershipId, amount: rec.total },
  );
}

