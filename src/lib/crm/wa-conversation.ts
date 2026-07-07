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
export async function handleAgentMessage(agent: WaAgent, waId: string, text: string | null, attachments: any[]): Promise<string | null> {
  const state = await getState(agent.id);
  const hasAttach = (attachments || []).length > 0;
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

  const built = await buildQuoteFromBrief(agent, state, lineItems);
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

async function buildQuoteFromBrief(agent: WaAgent, state: any, lineItems: LineItem[]): Promise<{ partnershipId: string; signUrl: string; total: number }> {
  const accountId = state.context?.account_id as string;
  const { data: brief } = await supabaseAdmin.from('crm_inbound_messages').select('*').eq('id', state.brief_id).maybeSingle();
  const parsed = (brief?.parsed_data as any) || {};
  const totals = computeTotals(lineItems);
  const brandName = parsed?.brandName || brief?.subject || 'מותג';
  const clientName = await accountName(accountId);
  const deliverables = lineItemsToDeliverables(lineItems);

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
    .eq('id', state.brief_id);

  return { partnershipId: result.partnershipId, signUrl: result.signUrl, total: totals.total };
}
