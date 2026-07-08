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
import { interpretYesNo, interpretPricing } from '@/lib/crm/wa-interpret';

export interface WaAgent {
  id: string;
  managed_account_ids?: string[] | null;
  full_name?: string | null;
}
type Seed = { platform: string; deliverable_type: string; qty: number; unit_price?: number; notes: string };

async function getState(agentId: string) {
  const { data } = await supabaseAdmin.from('crm_agent_wa_state').select('*').eq('agent_id', agentId).maybeSingle();
  return data || { agent_id: agentId, stage: 'idle', brief_id: null, deal_id: null, context: {} as any };
}
async function setState(agentId: string, patch: Record<string, any>) {
  await supabaseAdmin
    .from('crm_agent_wa_state')
    .upsert({ agent_id: agentId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'agent_id' });
}
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
  opts: { isVoice?: boolean } = {}
): Promise<string | null> {
  const state = await getState(agent.id);
  const hasAttach = (attachments || []).length > 0;
  const idle = !state.stage || state.stage === 'idle' || state.stage === 'quote_sent';

  // 0) A voice note whose transcription failed/returned empty arrives as isVoice with no
  //    text. Never document it as an empty brief — ask for a resend.
  if (opts.isVoice && !text) return 'לא הצלחתי להבין את ההקלטה 🙏 אפשר לשלוח שוב?';

  // 1) Mid-flow reply → the stage machine owns short-lived confirmations / follow-ups
  //    (so a "כן" to "ליצור?" is a confirmation, not a re-planned command).
  if (!idle) {
    switch (state.stage) {
      case 'awaiting_talent':
        return handleTalentReply(agent, state, text);
      case 'awaiting_prices':
        return handlePrices(agent, state, text);
      case 'awaiting_create_confirm':
        return handleCreateConfirm(agent, state, text);
    }
  }

  // 2) A forwarded attachment (PDF / doc / image) is always a brief → document it.
  if (hasAttach) return startBrief(agent, waId, text, attachments);

  // 3) Fresh free-form message (text or transcribed voice) → the AI brain reads the
  //    agent's live context, understands the intent, and executes the right action.
  if (text) return runBrain(agent, waId, text);

  return null;
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
    const { chat } = await import('@/lib/openai');
    const { response } = await chat(instr, text);
    return JSON.parse(String(response || '').replace(/```json|```/g, '').trim());
  } catch {
    return null;
  }
}

/** Front door for a fresh free-form message: plan the intent, then execute it. */
async function runBrain(agent: WaAgent, waId: string, text: string): Promise<string | null> {
  const ctx = await loadBrainContext(agent);
  const plan = await planFreeform(text, ctx);
  if (!plan || !plan.action) return startBrief(agent, waId, text, []); // planner failed → safest default: document

  switch (plan.action) {
    case 'answer':
    case 'clarify':
      return plan.reply || 'לא בטוח שהבנתי — אפשר לנסח שוב?';
    case 'document_brief':
      return startBrief(agent, waId, text, []);
    case 'price':
      return applyPricingCommands(agent, plan.commands || [], ctx);
    case 'issue_quote':
    case 'get_link':
      return brainDealLink(agent, plan.target || {}, ctx);
    default:
      return startBrief(agent, waId, text, []);
  }
}

/** Record priced commands (documented) then ask ONCE whether to issue the quote(s). */
async function applyPricingCommands(agent: WaAgent, commands: any, ctx: Awaited<ReturnType<typeof loadBrainContext>>): Promise<string> {
  // The LLM sometimes collapses a single-element array to a bare object — normalize.
  const list: any[] = Array.isArray(commands) ? commands : commands ? [commands] : [];
  const recorded: PendingDeal[] = [];
  const pending: string[] = [];
  const incomplete: any[] = [];
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
    const lineItems = buildLineItemsFromPricing(cmd.pricing, seed);
    if (!lineItems) {
      pending.push(`• ${brand}: מה המחיר?`);
      incomplete.push({ stage: 'awaiting_prices', brief_id: brief.id, deal_id: null, context: { account_id: accountId, brand, seed } });
      continue;
    }
    recorded.push(await recordDealFromBrief(agent, brief.id, accountId, lineItems));
  }
  if (recorded.length) {
    await setState(agent.id, { stage: 'awaiting_create_confirm', context: { pending: recorded } });
    const list = recorded.map((r) => `• ${r.clientName} · ${r.brand}: ${r.subtotal.toLocaleString('en-US')} + מע״מ = ${r.total.toLocaleString('en-US')} ₪`).join('\n');
    let msg = `📝 עודכן:\n${list}\n\nליצור ${recorded.length > 1 ? recorded.length + ' הצעות מחיר' : 'הצעת מחיר'} ולשלוח קישור? (כן/לא)`;
    if (pending.length) msg += `\n\nצריך השלמה:\n${pending.join('\n')}`;
    return msg;
  }
  if (incomplete.length === 1) {
    await setState(agent.id, incomplete[0]);
    return incomplete[0].stage === 'awaiting_talent' ? (pending[0] || 'עבור מי ההצעה?') : `${pending[0] || 'מה המחיר?'} (סכום כולל, או מחיר לכל שורה)`;
  }
  await resetState(agent.id);
  return pending.length ? `צריך השלמה:\n${pending.join('\n')}` : 'לא הצלחתי להבין את התמחור. אפשר לנסות שוב?';
}

/** Resolve the agent's meant deal → return (issuing if needed) its sign link. */
async function brainDealLink(agent: WaAgent, target: any, ctx: Awaited<ReturnType<typeof loadBrainContext>>): Promise<string> {
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
    return `אין עדיין עסקה מתומחרת ל-${name}. שלח/י תמחור ואבנה.`;
  }
  return dealLink(agent, dealId);
}

/** Latest signature for a deal → existing link, "signed", or issue a fresh one. */
async function dealLink(agent: WaAgent, dealId: string): Promise<string> {
  const { data: p } = await supabaseAdmin.from('partnerships').select('brand_name, account_id').eq('id', dealId).maybeSingle();
  if (!p) return 'לא מצאתי את העסקה.';
  const clientName = await accountName(p.account_id);
  const { data: sig } = await supabaseAdmin.from('signature_requests').select('token, status').eq('partnership_id', dealId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (sig?.status === 'signed') return `ההצעה של ${clientName} · ${p.brand_name} כבר נחתמה ✓`;
  const signUrl = sig?.token ? signUrlFor(sig.token) : (await issueQuoteForDeal(agent, dealId)).signUrl;
  return `הצעת המחיר של ${clientName} · ${p.brand_name}:\n${signUrl}`;
}

async function startBrief(agent: WaAgent, waId: string, text: string | null, attachments: any[]): Promise<string | null> {
  const res = await ingestQuote({ channel: 'whatsapp', sender: waId, rawText: text, attachments, providerMessageId: null });
  if (!res.matched) return null;
  const briefId = res.inboundId;
  if (res.reason === 'parse_failed' || !briefId) {
    await resetState(agent.id);
    return 'לא הצלחתי לקרוא את הבריף. אפשר לשלוח שוב?';
  }

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
    return `📥 קיבלתי בריף מ-${brand}, תיעדתי ✓.\nכשתרצה לתמחר — שלח/י לי (ציין/י את שם המיוצג).`;
  }
  const clientName = await accountName(brief.suggested_account_id);
  return `📥 קיבלתי בריף מ-${brand} עבור ${clientName}, תיעדתי ✓.\nכשתרצה — שלח/י תמחור (למשל בהקלטה קולית) ואשאל אם ליצור הצעה.`;
}

async function handlePrices(agent: WaAgent, state: any, text: string | null): Promise<string> {
  const seed: Seed[] = state.context?.seed || [];
  const pricing = interpretPricing(text || '', seed.length);
  let lineItems: LineItem[] | null = null;

  if (seed.length === 0) {
    if (pricing.mode !== 'unclear' && (pricing.total || pricing.prices?.[0])) {
      lineItems = [{ platform: '', deliverable_type: 'הצעה', qty: 1, unit_price: pricing.total || pricing.prices![0] }];
    }
  } else if (pricing.mode === 'per_line' && pricing.prices) {
    lineItems = seed.map((r, i) => ({ ...r, unit_price: pricing.prices![i] }));
  } else if (pricing.mode === 'total' && pricing.total) {
    lineItems = [{ platform: '', deliverable_type: 'סה״כ', qty: 1, unit_price: pricing.total, notes: seed.map(deliverableLabel).join(' · ') }];
  }

  if (!lineItems) lineItems = await aiPricing(text || '', seed);
  if (!lineItems) return `לא הבנתי את התמחור. שלח סכום כולל, או ${seed.length || ''} מחירים לפי הסדר.`;

  const rec = await recordDealFromBrief(agent, state.brief_id, state.context?.account_id, lineItems);
  await setState(agent.id, { stage: 'awaiting_create_confirm', context: { pending: [rec] } });
  return `📝 עודכן: ${rec.clientName} · ${rec.brand} — ${rec.subtotal.toLocaleString('en-US')} ₪ + מע״מ = ${rec.total.toLocaleString('en-US')} ₪.\nליצור הצעת מחיר ולשלוח קישור לחתימה? (כן/לא)`;
}

async function aiPricing(text: string, seed: Seed[]): Promise<LineItem[] | null> {
  try {
    const { chat } = await import('@/lib/openai');
    const list = seed.map((r, i) => `${i + 1}) ${deliverableLabel(r)}`).join('; ');
    const instr =
      `אתה מפרש תמחור של סוכן. ${seed.length ? `יש ${seed.length} תוצרים: ${list}.` : 'אין פירוט תוצרים.'} ` +
      `הסוכן שלח תמחור בטקסט חופשי (בשקלים). החזר JSON בלבד ללא טקסט: ` +
      `{"mode":"total"|"per_line","total":number|null,"prices":number[]|null}. per_line = מספר לכל תוצר לפי הסדר.`;
    const { response } = await chat(instr, text);
    const j = JSON.parse(String(response || '').replace(/```json|```/g, '').trim());
    if (j.mode === 'per_line' && Array.isArray(j.prices) && j.prices.length === seed.length) {
      return seed.map((r, i) => ({ ...r, unit_price: Number(j.prices[i]) || 0 }));
    }
    if (j.mode === 'total' && j.total) {
      return [{ platform: '', deliverable_type: 'סה״כ', qty: 1, unit_price: Number(j.total), notes: seed.map(deliverableLabel).join(' · ') }];
    }
  } catch {
    /* fall through */
  }
  return null;
}

function buildLineItemsFromPricing(pricing: any, seed: Seed[]): LineItem[] | null {
  if (!pricing) return null;
  if (pricing.mode === 'per_line' && Array.isArray(pricing.prices) && seed.length && pricing.prices.length === seed.length) {
    return seed.map((r, i) => ({ ...r, unit_price: Number(pricing.prices[i]) || 0 }));
  }
  if (pricing.mode === 'total' && pricing.total) {
    return seed.length
      ? [{ platform: '', deliverable_type: 'סה״כ', qty: 1, unit_price: Number(pricing.total), notes: seed.map(deliverableLabel).join(' · ') }]
      : [{ platform: '', deliverable_type: 'הצעה', qty: 1, unit_price: Number(pricing.total) }];
  }
  return null;
}


type PendingDeal = { partnershipId: string; clientName: string; brand: string; subtotal: number; total: number };

/** Brief's requested deliverables rendered in Hebrew (falls back to line items). */
function briefDeliverablesOf(parsed: any, lineItems: LineItem[]): string[] {
  const items = seedFromParsed(parsed).map((r) => `${r.qty}× ${[r.deliverable_type, r.notes].filter(Boolean).join(' · ')}`.trim());
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
  });
  await supabaseAdmin
    .from('crm_inbound_messages')
    .update({ signature_request_id: result.signatureRequestId, brief_status: 'sent' })
    .eq('deal_id', partnershipId);
  return { signUrl: result.signUrl, total: amount, clientName, brand: p.brand_name };
}

/** After pricing, the agent confirms whether to issue the quote(s) + send links. */
async function handleCreateConfirm(agent: WaAgent, state: any, text: string | null): Promise<string> {
  const pending: PendingDeal[] = state.context?.pending || [];
  const yn = interpretYesNo(text || '');
  if (yn === 'no') {
    await resetState(agent.id);
    const who = pending[0]?.clientName || 'המיוצג';
    return `בסדר — נשמר כתיעוד (מתומחר, בלי הצעה שנשלחה).\nתגיד/י "תן לי את ההצעה של ${who}" מתי שתרצה קישור.`;
  }
  if (yn !== 'yes') return `ליצור ${pending.length > 1 ? pending.length + ' הצעות' : 'הצעת מחיר'} ולשלוח קישור? (כן/לא)`;
  if (!pending.length) { await resetState(agent.id); return 'אין מה ליצור. שלח/י תמחור.'; }

  const links: string[] = [];
  for (const d of pending) {
    try {
      const r = await issueQuoteForDeal(agent, d.partnershipId);
      links.push(`✅ ${r.clientName} · ${r.brand}: ${r.total.toLocaleString('en-US')} ₪ כולל מע״מ\n${r.signUrl}`);
    } catch {
      links.push(`⚠️ ${d.clientName} · ${d.brand}: לא הצלחתי ליצור`);
    }
  }
  await resetState(agent.id);
  return `הנה — שלח/י ללקוח:\n\n${links.join('\n\n')}`;
}

/** Reply that names the talent for a priced-but-unassigned voice command → record + ask. */
async function handleTalentReply(agent: WaAgent, state: any, text: string | null): Promise<string> {
  const ids = agent.managed_account_ids || [];
  if (!ids.length) { await resetState(agent.id); return 'אין מיוצגים ברוסטר שלך.'; }
  const { data: accts } = await supabaseAdmin.from('accounts').select('id, config').in('id', ids);
  const q = (text || '').toLowerCase();
  const match = (accts || []).find((a) => {
    const n = String((a.config as any)?.display_name || (a.config as any)?.username || '').toLowerCase();
    return n.length >= 2 && q.includes(n);
  });
  if (!match) return 'לא מצאתי מיוצג בשם הזה ברוסטר. נסה/י שם אחר.';
  await supabaseAdmin.from('crm_inbound_messages').update({ suggested_account_id: match.id, brief_status: 'assigned' }).eq('id', state.brief_id);
  const seed: Seed[] = state.context?.seed || [];
  const lineItems = buildLineItemsFromPricing(state.context?.pricing, seed);
  if (!lineItems) {
    await setState(agent.id, { stage: 'awaiting_prices', context: { account_id: match.id, brand: state.context?.brand, seed } });
    return `מעולה — ${(match.config as any)?.display_name || 'המיוצג'}. מה המחיר? (סכום כולל, או מחיר לכל שורה)`;
  }
  const rec = await recordDealFromBrief(agent, state.brief_id, match.id, lineItems);
  await setState(agent.id, { stage: 'awaiting_create_confirm', context: { pending: [rec] } });
  return `📝 עודכן: ${rec.clientName} · ${rec.brand} — ${rec.subtotal.toLocaleString('en-US')} ₪ + מע״מ = ${rec.total.toLocaleString('en-US')} ₪.\nליצור הצעת מחיר ולשלוח קישור? (כן/לא)`;
}

