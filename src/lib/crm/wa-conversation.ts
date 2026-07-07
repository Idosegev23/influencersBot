/**
 * Agent WhatsApp conversation engine — the agent drives the whole quote flow by
 * chat: forward a brief → "build a quote?" → price (total or per-line) → we build
 * it and send the signing link. Free-text replies, interpreted with heuristics +
 * an AI fallback. One active conversation per agent (crm_agent_wa_state).
 */
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { ingestQuote } from '@/lib/crm/quote-ingest';
import { createQuote } from '@/lib/crm/quotes';
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

  // A voice note is treated as a holistic multi-brief command ONLY when it's a
  // FRESH command (nothing in flight). A voice reply to "build? / price?" is a
  // reply to the current stage — transcribe it and let the stage machine handle
  // it below (so we don't auto-build/loop on a confirmation).
  if (opts.isVoice && text && (state.stage === 'idle' || state.stage === 'quote_sent')) {
    const v = await handleVoiceCommand(agent, waId, text, state);
    if (v !== undefined) return v;
  }

  const startNew = hasAttach || state.stage === 'idle' || state.stage === 'quote_sent';
  if (startNew) return startBrief(agent, waId, text, attachments);

  switch (state.stage) {
    case 'awaiting_talent':
      return handleTalentReply(agent, state, text);
    case 'awaiting_build_confirm':
      return handleBuildConfirm(agent, state, text);
    case 'awaiting_prices':
      return handlePrices(agent, state, text);
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

  if (!brief?.suggested_account_id) {
    await setState(agent.id, { stage: 'awaiting_talent', brief_id: briefId, deal_id: null, context: { brand } });
    return `📥 קיבלתי בריף מ-${brand}. לא זיהיתי מיוצג — עבור מי ההצעה?`;
  }

  const clientName = await accountName(brief.suggested_account_id);
  await setState(agent.id, { stage: 'awaiting_build_confirm', brief_id: briefId, deal_id: null, context: { brand, account_id: brief.suggested_account_id } });
  return `📥 קיבלתי בריף מ-${brand} עבור ${clientName}.\nלבנות הצעת מחיר? (כן/לא)`;
}

async function handleTalentReply(agent: WaAgent, state: any, text: string | null): Promise<string> {
  const ids = agent.managed_account_ids || [];
  if (!ids.length) return 'אין מיוצגים ברוסטר שלך. הוסף מיוצג ב-Bestie ואז נסה שוב.';
  const { data: accts } = await supabaseAdmin.from('accounts').select('id, config').in('id', ids);
  const q = (text || '').toLowerCase();
  const match = (accts || []).find((a) => {
    const n = String((a.config as any)?.display_name || (a.config as any)?.username || '').toLowerCase();
    return n.length >= 2 && q.includes(n);
  });
  if (!match) return 'לא מצאתי מיוצג בשם הזה ברוסטר. נסה שם אחר, או הוסף אותו ב-Bestie.';

  await supabaseAdmin.from('crm_inbound_messages').update({ suggested_account_id: match.id, brief_status: 'assigned' }).eq('id', state.brief_id);
  const clientName = (match.config as any)?.display_name || (match.config as any)?.username || 'המיוצג';
  await setState(agent.id, { stage: 'awaiting_build_confirm', context: { ...state.context, account_id: match.id } });
  return `מעולה — ${clientName}.\nלבנות הצעת מחיר? (כן/לא)`;
}

async function handleBuildConfirm(agent: WaAgent, state: any, text: string | null): Promise<string> {
  const yn = interpretYesNo(text || '');
  if (yn === 'no') {
    await resetState(agent.id);
    return 'בסדר, הבריף שמור ב-Bestie. שלח לי מתי שתרצה לבנות הצעה.';
  }
  if (yn !== 'yes') return 'לא הבנתי — לבנות הצעת מחיר? (כן/לא)';

  const { data: brief } = await supabaseAdmin.from('crm_inbound_messages').select('parsed_data').eq('id', state.brief_id).maybeSingle();
  const seed = seedFromParsed((brief?.parsed_data as any) || {});
  await setState(agent.id, { stage: 'awaiting_prices', context: { ...state.context, seed } });
  if (!seed.length) return 'מה המחיר הכולל להצעה? (בשקלים)';
  const list = seed.map((r, i) => `${i + 1}) ${deliverableLabel(r)}`).join('\n');
  return `תמחור:\n${list}\n\nשלח סכום כולל, או מחיר לכל שורה לפי הסדר.`;
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

  const built = await buildQuoteFromBrief(agent, state.brief_id, state.context?.account_id, lineItems);
  await setState(agent.id, { stage: 'quote_sent', deal_id: built.partnershipId });
  return `✅ ההצעה מוכנה (${built.total.toLocaleString('en-US')} ₪ + מע״מ).\nקישור לחתימה — שלח/י ללקוח:\n${built.signUrl}`;
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

  const done: string[] = [];
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
    const accountId = (cmd.account_id && roster.find((r) => r.id === cmd.account_id)?.id) || brief.suggested_account_id || null;
    if (!accountId) {
      pending.push(`• ${brand}: עבור מי ההצעה?`);
      incomplete.push({ stage: 'awaiting_talent', brief_id: brief.id, deal_id: null, context: { brand } });
      continue;
    }
    await supabaseAdmin.from('crm_inbound_messages').update({ suggested_account_id: accountId, brief_status: 'assigned' }).eq('id', brief.id);
    const seed = seedFromParsed(parsed);
    const lineItems = buildLineItemsFromPricing(cmd.pricing, seed);
    if (!lineItems) {
      pending.push(`• ${brand}: מה המחיר?`);
      incomplete.push({ stage: 'awaiting_prices', brief_id: brief.id, deal_id: null, context: { account_id: accountId, seed } });
      continue;
    }
    const built = await buildQuoteFromBrief(agent, brief.id, accountId, lineItems);
    const clientName = await accountName(accountId);
    done.push(`✅ ${clientName} · ${brand}: ${built.total.toLocaleString('en-US')} ₪\n${built.signUrl}`);
  }

  // one open follow-up → keep it active so a text reply completes it; else reset.
  if (incomplete.length === 1) await setState(agent.id, incomplete[0]);
  else await resetState(agent.id);

  const parts: string[] = [];
  if (done.length) parts.push(`הוכנו ${done.length} הצעות:\n\n${done.join('\n\n')}`);
  if (pending.length) parts.push(`צריך השלמה:\n${pending.join('\n')}`);
  return parts.join('\n\n') || ai.reply || 'לא הצלחתי להבין. אפשר לנסות שוב?';
}

async function buildQuoteFromBrief(agent: WaAgent, briefId: string, accountId: string, lineItems: LineItem[]): Promise<{ partnershipId: string; signUrl: string; total: number }> {
  const { data: brief } = await supabaseAdmin.from('crm_inbound_messages').select('*').eq('id', briefId).maybeSingle();
  const parsed = (brief?.parsed_data as any) || {};
  const totals = computeTotals(lineItems);
  const brandName = parsed?.brandName || brief?.subject || 'מותג';
  const clientName = await accountName(accountId);
  // Show the brief's requested detail (in Hebrew) on the quote — not a single
  // "סה״כ" line — even when the agent priced with one total.
  const briefItems = seedFromParsed(parsed).map((r) => `${r.qty}× ${[r.deliverable_type, r.notes].filter(Boolean).join(' · ')}`.trim());
  const briefTerms = Array.isArray(parsed?.specialTerms) ? parsed.specialTerms.filter(Boolean) : [];
  const briefDeliverables = [...briefItems, ...briefTerms].filter((s) => s && s !== '1× ');
  const deliverables = briefDeliverables.length ? briefDeliverables : lineItemsToDeliverables(lineItems);

  const result = await createQuote({
    agentId: agent.id,
    accountId,
    brandName,
    clientName,
    campaignName: parsed?.campaignName || null,
    amount: totals.total,
    currency: 'ILS',
    deliverables,
    notes: brief?.raw_text || null,
    brandContactName: parsed?.contactPerson?.name || null,
    brandContactEmail: parsed?.contactPerson?.email || null,
    brandContactPhone: parsed?.contactPerson?.phone || null,
    agentName: agent.full_name,
    parsedData: parsed,
  });

  const rows = lineItems.map((li, i) => ({
    partnership_id: result.partnershipId,
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
    .update({ deal_id: result.partnershipId, partnership_id: result.partnershipId, signature_request_id: result.signatureRequestId, brief_status: 'sent' })
    .eq('id', briefId);

  return { partnershipId: result.partnershipId, signUrl: result.signUrl, total: totals.total };
}
