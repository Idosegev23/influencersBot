/**
 * Classifies one settled conversation into one immutable row.
 *
 * The model call is injected (`deps.callModel`) so the mapping, coercion,
 * pricing and retry policy are testable without a network.
 */

import { estimateCostUsd } from '@/lib/costs/pricing';
import {
  coerceInquiryType, coerceComplaintKind, coerceSentiment,
  coerceUrgency, coerceOutcome, normalizeKeywords,
  INQUIRY_TYPES, COMPLAINT_KINDS,
} from './taxonomy';
import { resolveProduct, productCatalogPrompt, type ProductIndex } from './product-resolver';

export const CLASSIFY_MODEL = 'gpt-5.6-luna';
export const RETRY_MODEL = 'gpt-5.6-terra';
export const CONFIDENCE_FLOOR = 0.6;

export interface SessionForClassification {
  id: string;
  accountId: string;
  channel: string;
  startedAt: string;
  messages: Array<{ role: string; content: string }>;
  intentHints: any[];
}

export interface ClassificationRow {
  account_id: string;
  session_id: string;
  channel: string;
  started_at: string;
  user_message_count: number;
  inquiry_type: string | null;
  topic_raw: string | null;
  is_complaint: boolean;
  complaint_kind: string | null;
  sentiment: string | null;
  urgency: string | null;
  outcome: string | null;
  product_id: string | null;
  product_mention_raw: string | null;
  product_category: string | null;
  keywords: string[];
  summary: string | null;
  confidence: number | null;
  status: 'ok' | 'failed' | 'needs_review';
  error_message: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
}

export interface ClassifyDeps {
  callModel: (args: { model: string; instructions: string; input: string }) => Promise<{
    json: any;
    usage: { input_tokens: number; cached_input_tokens?: number; output_tokens: number };
  }>;
}

/**
 * The catalog block goes LAST in the instructions but the instructions are
 * otherwise byte-stable, so the whole prefix is cacheable. 128 product names
 * across 2,000 weekly calls is $0.48 uncached versus $0.05 cached.
 */
export function buildClassifyPrompt(catalogBlock: string): string {
  return `אתה מסווג שיחות שירות ומכירה של מותג. קבל תמלול שיחה והחזר סיווג מובנה.

סוגי פנייה מותרים (בחר בדיוק אחד): ${INQUIRY_TYPES.join(', ')}
סוגי תלונה מותרים: ${COMPLAINT_KINDS.join(', ')} או none

כללים:
- is_complaint הוא ציר נפרד מסוג הפנייה. תלונה על משלוח היא order_status וגם is_complaint=true.
- topic הוא ניסוח חופשי קצר בעברית של מה שהלקוח באמת רצה, לא קטגוריה.
- product_mention: העתק את שם המוצר כפי שהלקוח כתב אותו. אל תנחש ואל תתקן. אם לא הוזכר מוצר — החזר מחרוזת ריקה.
- keywords: עד 8 מילות מפתח לחיתוך.
- summary: משפט אחד בעברית.
- confidence: 0 עד 1, כמה אתה בטוח בסיווג.

קטלוג המוצרים של המותג (לזיהוי בלבד — אל תבחר מוצר שלא הוזכר):
${catalogBlock}`;
}

export const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    inquiry_type: { type: 'string', enum: [...INQUIRY_TYPES] },
    topic: { type: 'string' },
    is_complaint: { type: 'boolean' },
    complaint_kind: { type: 'string', enum: [...COMPLAINT_KINDS, 'none'] },
    sentiment: { type: 'string', enum: ['negative', 'neutral', 'positive'] },
    urgency: { type: 'string', enum: ['low', 'normal', 'high'] },
    outcome: { type: 'string', enum: ['resolved_by_bot', 'escalated', 'abandoned', 'unknown'] },
    product_mention: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: [
    'inquiry_type', 'topic', 'is_complaint', 'complaint_kind', 'sentiment',
    'urgency', 'outcome', 'product_mention', 'keywords', 'summary', 'confidence',
  ],
  additionalProperties: false,
} as const;

function transcript(session: SessionForClassification): string {
  const lines = session.messages.map((m) => `${m.role === 'user' ? 'לקוח' : 'בוט'}: ${m.content}`);
  const hints = session.intentHints.length
    ? `\n\nרמזים מהמערכת (לא מחייבים): ${JSON.stringify(session.intentHints).slice(0, 500)}`
    : '';
  return lines.join('\n') + hints;
}

function emptyRow(session: SessionForClassification): ClassificationRow {
  return {
    account_id: session.accountId,
    session_id: session.id,
    channel: session.channel,
    started_at: session.startedAt,
    user_message_count: session.messages.filter((m) => m.role === 'user').length,
    inquiry_type: null, topic_raw: null, is_complaint: false, complaint_kind: null,
    sentiment: null, urgency: null, outcome: null,
    product_id: null, product_mention_raw: null, product_category: null,
    keywords: [], summary: null, confidence: null,
    status: 'ok', error_message: null,
    model: null, tokens_in: null, tokens_out: null, cost_usd: null,
  };
}

export async function classifySession(
  session: SessionForClassification,
  index: ProductIndex,
  deps: ClassifyDeps
): Promise<ClassificationRow> {
  const row = emptyRow(session);
  const instructions = buildClassifyPrompt(productCatalogPrompt(index));
  const input = transcript(session);

  let json: any = null;
  let usage: { input_tokens: number; cached_input_tokens?: number; output_tokens: number } = {
    input_tokens: 0, cached_input_tokens: 0, output_tokens: 0,
  };
  let model = CLASSIFY_MODEL;

  try {
    const first = await deps.callModel({ model: CLASSIFY_MODEL, instructions, input });
    json = first.json;
    usage = { cached_input_tokens: 0, ...first.usage };

    // One retry on the stronger model — at these volumes it costs cents and
    // buys back the tail of ambiguous conversations.
    if (Number(json?.confidence ?? 0) < CONFIDENCE_FLOOR) {
      const second = await deps.callModel({ model: RETRY_MODEL, instructions, input });
      json = second.json;
      usage = { cached_input_tokens: 0, ...second.usage };
      model = RETRY_MODEL;
    }
  } catch (e: any) {
    row.status = 'failed';
    row.error_message = String(e?.message || e).slice(0, 500);
    return row;
  }

  const mention = typeof json?.product_mention === 'string' ? json.product_mention.trim() : '';
  const resolved = resolveProduct(index, mention);
  const confidence = Number(json?.confidence);

  row.inquiry_type = coerceInquiryType(json?.inquiry_type);
  row.topic_raw = typeof json?.topic === 'string' ? json.topic.trim() || null : null;
  row.is_complaint = json?.is_complaint === true;
  row.complaint_kind = coerceComplaintKind(json?.complaint_kind);
  row.sentiment = coerceSentiment(json?.sentiment);
  row.urgency = coerceUrgency(json?.urgency);
  row.outcome = coerceOutcome(json?.outcome);
  row.product_mention_raw = mention || null;
  row.product_id = resolved.productId;
  row.product_category = resolved.category;
  row.keywords = normalizeKeywords(json?.keywords);
  row.summary = typeof json?.summary === 'string' ? json.summary.trim() || null : null;
  row.confidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : null;
  row.status = (row.confidence ?? 0) < CONFIDENCE_FLOOR ? 'needs_review' : 'ok';
  row.model = model;
  row.tokens_in = usage.input_tokens ?? 0;
  row.tokens_out = usage.output_tokens ?? 0;
  row.cost_usd = estimateCostUsd({
    model,
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.cached_input_tokens,
    outputTokens: usage.output_tokens,
  });

  return row;
}
