/**
 * Widget Objection Library — deterministic seeds for sales objections.
 *
 * Phase 2 of widget v4. When the previous turn's <<INTENT>> envelope flagged
 * an objection (price/fit/ingredients/shipping/trust), the handler injects a
 * short editorial seed into the next turn's system prompt. The model
 * rephrases it in voice rather than rote-quoting — but the *substance* stays
 * consistent across visitors. This is the right tool for objection handling
 * because:
 *   - Knowledge entries are retrieved by RAG (relevance ranked) — wrong abstraction
 *     for short, deterministic editorial micro-scripts.
 *   - We want consistency across visitors, not relevance ranking.
 *   - 5-10 objections per account = JSONB on the account row, not a table.
 *
 * Bestie blast radius: zero. Imported only from `widget-chat-handler.ts`,
 * which is the widget-only entry point.
 */

export type ObjectionType = 'price' | 'fit' | 'ingredients' | 'shipping' | 'trust' | 'none';

export interface ObjectionSeed {
  trigger_keywords: string[];
  response_seed: string;
  auto_offer_coupon?: boolean;
}

export type ObjectionMap = Partial<Record<Exclude<ObjectionType, 'none'>, ObjectionSeed>>;

export interface IntentEnvelope {
  stage: 'browsing' | 'comparing' | 'ready_to_buy' | 'needs_routine' | 'hesitating' | 'support';
  confidence: number;
  objection: ObjectionType;
  topic: string;
}

export const DEFAULT_OBJECTIONS: ObjectionMap = {
  price: {
    trigger_keywords: ['יקר', 'מחיר', 'תקציב', 'משתלם', 'גבוה'],
    response_seed:
      'תני רגע להראות למה זה משתלם — המוצרים שלנו עומדים לאורך זמן והמחיר ליחידה יוצא נמוך. אם יש סטים — הם תמיד הבחירה הכי משתלמת.',
    auto_offer_coupon: true,
  },
  ingredients: {
    trigger_keywords: ['מרכיבים', 'טבעי', 'פרבנים', 'סולפטים', 'בהריון', 'אלרגיה', 'רגיש'],
    response_seed:
      'הציע/י לפרט את הרכיבים הרלוונטיים מתוך המוצר/ים — בעיקר מה שמרגיע את החשש (ללא פרבנים, בטוח לעור רגיש, וכד׳). הצע/י להראות את הרכיבים המלאים אם רלוונטי.',
  },
  shipping: {
    trigger_keywords: ['משלוח', 'כמה זמן', 'מתי יגיע', 'איסוף', 'נקודת חלוקה'],
    response_seed:
      'תן/י תשובה ישירה וקצרה לגבי זמן המשלוח, עלות, ומתי הזמנה היום מגיעה. אם יש משלוח חינם מסכום מסוים — להזכיר.',
  },
  fit: {
    trigger_keywords: ['מתאים לי', 'סוג שיער', 'סוג עור', 'סוג ', 'בשבילי'],
    response_seed:
      'שאל/י שאלת אבחון אחת קצרה לפני המלצה — כדי להבין סוג שיער/עור/בעיה ולהמליץ נכון. אל תקפוץ/י להמלצה כללית.',
  },
  trust: {
    trigger_keywords: ['אמין', 'ביקורות', 'אמיתי', 'מקורי', 'איכות'],
    response_seed:
      'בנה/י אמון מהר — אם יש ביקורות או דירוג של המותג, להזכיר במשפט קצר. הצע/י להראות ביקורות רלוונטיות אם הלקוח/ה רוצה.',
  },
};

/**
 * Build an objection-injection block that the LLM weaves into the next
 * response naturally. Returns null if no objection is active.
 *
 * @param widgetConfig - the account.config.widget JSONB (may carry custom objections)
 * @param lastIntent  - the previous assistant turn's parsed <<INTENT>> envelope
 */
export function buildObjectionBlock(
  widgetConfig: { objections?: ObjectionMap } | null | undefined,
  lastIntent: IntentEnvelope | null | undefined,
): string | null {
  if (!lastIntent || lastIntent.objection === 'none') return null;

  // Shallow-merge: per-account overrides win, defaults fill gaps.
  const map: ObjectionMap = { ...DEFAULT_OBJECTIONS, ...(widgetConfig?.objections || {}) };
  const seed = map[lastIntent.objection as Exclude<ObjectionType, 'none'>];
  if (!seed) return null;

  const lines = [
    `⚡ בתשובה הקודמת זוהתה התנגדות מסוג "${lastIntent.objection}".`,
    `שלב/י את הזרע הבא בתשובה (פרזינג חופשי, לא ציטוט מילה במילה): "${seed.response_seed}"`,
  ];
  if (seed.auto_offer_coupon) {
    lines.push('💰 אם יש קופון רלוונטי לחשבון — הציע/י אותו פרואקטיבית.');
  }
  return lines.join('\n');
}

/**
 * Strip the <<INTENT>>...<</INTENT>> envelope from a streamed/finalized
 * response. Mirror of stripSuggestions. Returns the cleaned text plus the
 * parsed envelope (if present and well-formed).
 */
const INTENT_RE = /<<INTENT>>([\s\S]*?)<<\/INTENT>>/;

export function stripIntent(text: string): { cleanText: string; intent: IntentEnvelope | null } {
  if (!text) return { cleanText: text || '', intent: null };
  const match = text.match(INTENT_RE);
  if (!match) return { cleanText: text, intent: null };

  let intent: IntentEnvelope | null = null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed && typeof parsed.stage === 'string') {
      intent = {
        stage: parsed.stage,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        objection: typeof parsed.objection === 'string' ? parsed.objection : 'none',
        topic: typeof parsed.topic === 'string' ? parsed.topic : '',
      };
    }
  } catch {
    /* malformed envelope — drop silently */
  }

  // Drop the envelope and any straggling whitespace/trailing newlines.
  const cleanText = text.replace(INTENT_RE, '').replace(/\n\s*\n\s*$/, '').trim();
  return { cleanText, intent };
}

/**
 * Strip the <<PRODUCTS>>1,3<</PRODUCTS>> envelope (Approach C). The numbers are
 * 1-indexed positions into the recommendation block the model was shown; the
 * handler resolves them to the actual products so cards == what the bot featured.
 */
const PRODUCTS_RE = /<<PRODUCTS>>([\s\S]*?)<<\/PRODUCTS>>/;

export function stripProducts(text: string): { cleanText: string; positions: number[]; present: boolean } {
  if (!text) return { cleanText: text || '', positions: [], present: false };
  const match = text.match(PRODUCTS_RE);
  // `present` distinguishes an empty envelope (`<<PRODUCTS>><</PRODUCTS>>` — the
  // model deliberately featured NO products this turn, e.g. a clarifying reply)
  // from an absent one (model didn't emit the envelope at all). The handler
  // shows no cards for the former, and falls back to the engine top-N for the latter.
  if (!match) return { cleanText: text, positions: [], present: false };
  const seen = new Set<number>();
  const positions: number[] = [];
  for (const tok of match[1].split(/[,\s]+/)) {
    const n = parseInt(tok, 10);
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) { seen.add(n); positions.push(n); }
  }
  const cleanText = text.replace(PRODUCTS_RE, '').replace(/\n\s*\n\s*$/, '').trim();
  return { cleanText, positions, present: true };
}
