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
import { interpretYesNo, interpretPricing, isRetrievalRequest } from '@/lib/crm/wa-interpret';

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

  // 1) Retrieval — "תן לי את ההצעה של X" returns an existing quote link. Runs
  //    first (text or transcribed voice) so it isn't misread as a new brief or a
  //    pricing command. Idle + no attachment only, so it can't hijack a reply.
  if (text && idle && !hasAttach && isRetrievalRequest(text)) {
    const r = await handleRetrieve(agent, text);
    if (r) return r;
  }

  // 2) A fresh voice note is a holistic multi-brief PRICING command. A voice
  //    reply to "create? (כן/לא)" or "what price?" is NOT fresh — it flows to the
  //    stage machine below, so we don't auto-build/loop on a confirmation.
  if (opts.isVoice && text && idle) {
    const v = await handleVoiceCommand(agent, waId, text, state);
    if (v !== undefined) return v;
  }

  // 3) New inbound (attachment or idle text) = a brief → DOCUMENT it (no build).
  if (hasAttach || idle) return startBrief(agent, waId, text, attachments);

  // 4) Mid-flow reply.
  switch (state.stage) {
    case 'awaiting_talent':
      return handleTalentReply(agent, state, text);
    case 'awaiting_prices':
      return handlePrices(agent, state, text);
    case 'awaiting_create_confirm':
      return handleCreateConfirm(agent, state, text);
    default:
      return startBrief(agent, waId, text, attachments);
  }
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

/**
 * Voice command — a spoken instruction that may hold MANY sub-commands, each for a
 * different brief ("for Miran at Argania 20,000; for Anna at Coca-Cola 80k; for
 * Maor at Superpharm 400 reels, 50,000 rights"). AI splits + maps each to a
 * brief + talent + price, then builds each quote. undefined → fall back.
 */
async function handleVoiceCommand(agent: WaAgent, waId: string, transcript: string, _state: any): Promise<string | null | undefined> {
  const { data: briefsRaw } = await supabaseAdmin
    .from('crm_inbound_messages')
    .select('id, subject, raw_text, parsed_data, suggested_account_id, brief_status')
    .eq('agent_id', agent.id)
    .in('brief_status', ['new', 'assigned'])
    .is('deal_id', null)
    .order('created_at', { ascending: false })
    .limit(20);
  const briefs = briefsRaw || [];

  const ids = agent.managed_account_ids || [];
  const { data: accts } = ids.length ? await supabaseAdmin.from('accounts').select('id, config').in('id', ids) : { data: [] as any[] };
  const roster = (accts || []).map((a: any) => ({ id: a.id, name: (a.config as any)?.display_name || (a.config as any)?.username || '' }));

  // No open brief → the voice message itself is a new brief.
  if (!briefs.length) return startBrief(agent, waId, transcript, []);

  const briefSummary = briefs.map((b) => {
    const p = (b.parsed_data as any) || {};
    const talent = b.suggested_account_id ? roster.find((r) => r.id === b.suggested_account_id)?.name || null : null;
    return { brief_id: b.id, brand: p.brandName || b.subject || 'מותג', talent, deliverables: seedFromParsed(p).map(deliverableLabel) };
  });

  let ai: any = null;
  try {
    const { chat } = await import('@/lib/openai');
    const instr =
      'אתה מנוע הבנה של סוכן משפיענים. הסוכן שלח הודעה קולית מתומללת שיכולה להכיל כמה פקודות לכמה בריפים שונים. ' +
      'לכל פקודה זהה: לאיזה בריף (לפי מותג/מיוצג), איזה מיוצג, ואיזה תמחור. החזר JSON בלבד ללא טקסט: ' +
      '{"commands":[{"brief_id":<id>,"account_id":<talent id|null>,"pricing":{"mode":"total"|"per_line"|"none","total":<number|null>,"prices":<number[]|null>}}],"reply":<string|null>}. ' +
      'per_line = מחיר לכל תוצר לפי סדר ה-deliverables של אותו בריף. ' +
      'מספרים יכולים להיות מקוצרים (80 = 80000) או במילים (מאתיים אלף = 200000) — הבן לפי הקשר (מחירי משפיענים באלפים). ' +
      'reply = שאלה מבהירה בעברית רק אם באמת אי אפשר להבין, אחרת null. ' +
      `בריפים פתוחים: ${JSON.stringify(briefSummary)}. רוסטר: ${JSON.stringify(roster)}.`;
    const { response } = await chat(instr, transcript);
    ai = JSON.parse(String(response || '').replace(/```json|```/g, '').trim());
  } catch {
    return undefined;
  }
  if (!ai) return undefined;

  const commands: any[] = Array.isArray(ai.commands) && ai.commands.length
    ? ai.commands
    : ai.brief_id
    ? [{ brief_id: ai.brief_id, account_id: ai.account_id, pricing: ai.pricing }]
    : [];
  if (!commands.length) return ai.reply || 'לא הבנתי לאיזה בריף מדובר. אפשר שם המותג או המיוצג?';

  const recorded: PendingDeal[] = [];
  const pending: string[] = [];
  const incomplete: any[] = [];

  for (const cmd of commands) {
    const brief = briefs.find((b) => b.id === cmd.brief_id);
    if (!brief) {
      pending.push('• בריף לא זוהה');
      continue;
    }
    const parsed = (brief.parsed_data as any) || {};
    const brand = parsed.brandName || brief.subject || 'מותג';
    const seed = seedFromParsed(parsed);
    const accountId = (cmd.account_id && roster.find((r) => r.id === cmd.account_id)?.id) || brief.suggested_account_id || null;
    if (!accountId) {
      // Missing talent → keep a follow-up stage so the agent's next reply (a name)
      // resolves it and prices the deal, instead of resetting to idle (which would
      // misroute the reply as a brand-new brief).
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

  // Recorded (documented) some deals → ask ONCE whether to issue quotes.
  if (recorded.length) {
    await setState(agent.id, { stage: 'awaiting_create_confirm', context: { pending: recorded } });
    const list = recorded.map((r) => `• ${r.clientName} · ${r.brand}: ${r.subtotal.toLocaleString('en-US')} + מע״מ = ${r.total.toLocaleString('en-US')} ₪`).join('\n');
    let msg = `📝 עודכן:\n${list}\n\nליצור ${recorded.length > 1 ? recorded.length + ' הצעות מחיר' : 'הצעת מחיר'} ולשלוח קישור? (כן/לא)`;
    if (pending.length) msg += `\n\nצריך השלמה:\n${pending.join('\n')}`;
    return msg;
  }

  // Nothing recorded — one open follow-up → keep it active so a reply completes it.
  if (incomplete.length === 1) {
    await setState(agent.id, incomplete[0]);
    return incomplete[0].stage === 'awaiting_talent'
      ? (pending[0] || 'עבור מי ההצעה?')
      : `${pending[0] || 'מה המחיר?'} (סכום כולל, או מחיר לכל שורה)`;
  }
  await resetState(agent.id);
  return pending.length ? `צריך השלמה:\n${pending.join('\n')}` : ai.reply || 'לא הצלחתי להבין. אפשר לנסות שוב?';
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

/** "תן לי את ההצעה של X" — return (issuing if needed) the sign link for X's latest deal. */
async function handleRetrieve(agent: WaAgent, text: string): Promise<string | null> {
  const ids = agent.managed_account_ids || [];
  if (!ids.length) return null;
  const { data: accts } = await supabaseAdmin.from('accounts').select('id, config').in('id', ids);
  const q = (text || '').toLowerCase();
  const talent = (accts || []).find((a) => {
    const n = String((a.config as any)?.display_name || (a.config as any)?.username || '').toLowerCase();
    return n.length >= 2 && q.includes(n);
  });
  if (!talent) return 'על איזה מיוצג ההצעה?';
  const clientName = (talent.config as any)?.display_name || (talent.config as any)?.username || 'המיוצג';
  const { data: deal } = await supabaseAdmin
    .from('partnerships')
    .select('id, brand_name')
    .eq('agent_id', agent.id)
    .eq('account_id', talent.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!deal) return `לא מצאתי עסקה מתומחרת ל-${clientName}. שלח/י תמחור ואבנה.`;
  // Latest signature for this deal, ANY status. 'pending'/'opened' links are still
  // live → return them (don't mint a duplicate). 'signed' → it's done. None → issue.
  const { data: sig } = await supabaseAdmin
    .from('signature_requests')
    .select('token, status')
    .eq('partnership_id', deal.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sig?.status === 'signed') return `ההצעה של ${clientName} · ${deal.brand_name} כבר נחתמה ✓`;
  let signUrl: string;
  if (sig?.token) signUrl = signUrlFor(sig.token);
  else { const r = await issueQuoteForDeal(agent, deal.id); signUrl = r.signUrl; }
  return `הצעת המחיר של ${clientName} · ${deal.brand_name}:\n${signUrl}`;
}
