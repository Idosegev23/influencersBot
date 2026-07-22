import type {
  EscalationVerdict,
  EscalationTrigger,
  EscalationSeverity,
  HandoffTrigger,
  HandoffDetection,
} from './types';

const LEGAL = [
  // NOTE: bare 'עוד' ("more") was here and fired on every "ספרו לי עוד" — it was
  // an OCR-style slip of 'עו"ד' (lawyer), which is kept below. Do not re-add it.
  'תביעה', 'אתבע', 'נתבע', 'לתבוע', 'עורך דין', 'עו"ד', 'עו״ד', 'משפט',
  'בית משפט', 'תלונה למשרד', 'הגנת הצרכן', 'צרכנות', 'עילה לתביעה',
  'sue', 'lawsuit', 'lawyer', 'attorney', 'court', 'legal action',
];

const ABUSE = [
  'מטומטם', 'מטומטמת', 'אידיוט', 'אידיוטית', 'דפוק', 'דפוקה', 'מניאק',
  'חרא', 'זבל', 'בן זונה', 'זונה', 'שתוק', 'שתקי', 'נמאסתם', 'רמאים',
  'גנבים', 'נוכלים', 'שקרנים', 'מתעללים', 'אפרסם נגדכם', 'אשמיץ',
  'scam', 'scammers', 'liars', 'thieves', 'idiots', 'shut up',
];

// Unambiguous requests for a human — these fire on their own.
const HUMAN_STRONG = [
  'נציג', 'נציגה', 'בן אדם', 'בנאדם', 'אדם אמיתי', 'מענה אנושי',
  'תחזרו אליי', 'תתקשרו אליי', 'דבר איתי',
  'human', 'representative', 'real person', 'speak to a person',
];

// Manager/责-person words are homographs — 'מנהלת' is both "(the) manager" and
// the verb "manages" ("מי מנהלת הלקוח של סודה" is a normal question, not an
// escalation — it was 12 of 17 false positives). Only count these as a
// human-demand when the message also carries a request cue.
const HUMAN_MANAGER = ['מנהל', 'מנהלת', 'אחראי', 'אחראית', 'manager'];
const REQUEST_CUE = [
  'רוצה', 'תעביר', 'תעבירו', 'העבירו', 'לדבר', 'תנו לי', 'אפשר', 'צריך',
  'צריכה', 'דרוש', 'חבר אותי', 'want', 'talk', 'speak', 'get me', 'connect me',
];

const NEGATIVE = [
  'כועס', 'כועסת', 'עצבני', 'עצבנית', 'מאוכזב', 'מאוכזבת', 'גרוע', 'גרועה',
  'נורא', 'בושה', 'מזעזע', 'חוצפה', 'עד מתי', 'כמה זמן עוד', 'אף אחד לא עונה',
  'מתעלמים', 'לא מקצועי', 'לא ייאמן', 'disappointed', 'angry', 'furious',
  'unacceptable', 'ridiculous', 'worst', 'terrible',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Match a keyword only as a whole word, not as a substring. JS `\b` is
// ASCII-only, so 'עוד' inside 'בעוד', 'מנהל' inside 'מנהלת', 'sue' inside
// 'issue' and 'court' inside 'courtesy' all false-fired with includes().
// Unicode lookarounds (\p{L} = any letter incl. Hebrew, \p{N} = digit) give a
// real word boundary: the keyword must not be flanked by another letter/digit.
function hasAny(text: string, words: string[]): boolean {
  const t = (text || '').toLowerCase();
  if (!t) return false;
  return words.some((w) => {
    const kw = w.toLowerCase().trim();
    if (!kw) return false;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(kw)}(?![\\p{L}\\p{N}])`, 'u');
    return re.test(t);
  });
}

const TRIGGER_LABEL: Record<EscalationTrigger, string> = {
  legal: 'איום בתביעה / פנייה משפטית',
  abuse: 'התנהגות פוגענית / קללות',
  human_demand: 'דרישה מפורשת לנציג אנושי',
  sustained_anger: 'כעס מתמשך לאורך השיחה',
};

function buildReason(triggers: EscalationTrigger[]): string {
  return triggers.map((t) => TRIGGER_LABEL[t]).join(' + ');
}

export function detectEscalation(
  currentMessage: string,
  priorUserMessages: string[] = [],
): EscalationVerdict {
  const msg = currentMessage || '';
  const triggers: EscalationTrigger[] = [];

  if (hasAny(msg, LEGAL)) triggers.push('legal');
  if (hasAny(msg, ABUSE)) triggers.push('abuse');
  const humanDemand =
    hasAny(msg, HUMAN_STRONG) || (hasAny(msg, HUMAN_MANAGER) && hasAny(msg, REQUEST_CUE));
  if (humanDemand) triggers.push('human_demand');

  const currentNegative = hasAny(msg, NEGATIVE);
  const priorNegative = priorUserMessages.some((m) => hasAny(m, NEGATIVE));
  if (currentNegative && priorNegative) triggers.push('sustained_anger');

  const escalate = triggers.length > 0;
  let severity: EscalationSeverity | null = null;
  if (escalate) {
    severity = triggers.includes('legal') || triggers.includes('abuse') ? 'critical' : 'high';
  }

  return { escalate, severity, reason: buildReason(triggers), triggers };
}

/**
 * Task D2: the CS-loop's code backstop `detectHandoff`. Reuses `detectEscalation`'s
 * module-scoped word lists (`LEGAL`/`ABUSE`/`HUMAN_STRONG`/`HUMAN_MANAGER`/`REQUEST_CUE`/
 * `NEGATIVE`) and its unicode word-boundary-safe `hasAny` matcher, adding CS-specific triggers
 * (refund/return, defective product, repeated failure, low confidence) plus per-trigger
 * `enabledTriggers` toggling driven by `EscalationConfig.triggers`.
 */
const REFUND_RETURN = [
  'החזר', 'החזר כספי', 'זיכוי', 'להחזיר', 'החזרה', 'ביטול הזמנה', 'לבטל הזמנה',
  'כסף בחזרה', 'refund', 'return', 'money back', 'chargeback', 'cancel order',
];
const DEFECTIVE = [
  'פגום', 'פגומה', 'שבור', 'שבורה', 'מקולקל', 'מקולקלת', 'התקלקל', 'לא עובד',
  'לא עובדת', 'לא תקין', 'defective', 'broken', 'damaged', 'not working', 'faulty',
];
const REPEATED_FAILURE = [
  'עוד פעם', 'פעם שלישית', 'שוב אותה', 'שוב אותו', 'עדיין לא', 'כמה פעמים',
  'again and again', 'third time', 'still not', 'still broken', 'still waiting',
];
// Handoff-local additions to the shared NEGATIVE list (plural surface forms of 'גרוע'/'גרועה'
// that detectEscalation's word list doesn't include). Purely additive — does not modify the
// shared NEGATIVE const, so detectEscalation's behavior/tests are unaffected.
const NEGATIVE_EXTRA = ['גרועים', 'גרועות'];

const HANDOFF_LABEL: Record<HandoffTrigger, string> = {
  human_demand: 'דרישה מפורשת לנציג אנושי',
  refund_return: 'בקשת החזר / החזרה',
  defective_product: 'מוצר פגום',
  frustration: 'תסכול / כעס',
  legal: 'איום בתביעה / פנייה משפטית',
  abuse: 'התנהגות פוגענית / קללות',
  repeated_failure: 'כשל חוזר בטיפול',
  low_confidence: 'הבוט אינו בטוח בתשובה',
};

const SEV_RANK: Record<'low' | 'medium' | 'high', number> = { low: 1, medium: 2, high: 3 };
const TRIGGER_SEVERITY: Record<HandoffTrigger, 'low' | 'medium' | 'high'> = {
  legal: 'high',
  abuse: 'high',
  human_demand: 'high',
  refund_return: 'medium',
  defective_product: 'medium',
  repeated_failure: 'medium',
  frustration: 'low',
  low_confidence: 'low',
};

export function detectHandoff(
  message: string,
  priorUserTexts: string[] = [],
  opts?: {
    enabledTriggers?: Partial<Record<HandoffTrigger, boolean>>;
    lowConfidenceThreshold?: number;
    confidence?: number;
  },
): HandoffDetection {
  const msg = message || '';
  const on = (t: HandoffTrigger) => opts?.enabledTriggers?.[t] !== false;
  const found: HandoffTrigger[] = [];

  if (on('legal') && hasAny(msg, LEGAL)) found.push('legal');
  if (on('abuse') && hasAny(msg, ABUSE)) found.push('abuse');
  const humanDemand =
    hasAny(msg, HUMAN_STRONG) || (hasAny(msg, HUMAN_MANAGER) && hasAny(msg, REQUEST_CUE));
  if (on('human_demand') && humanDemand) found.push('human_demand');
  if (on('refund_return') && hasAny(msg, REFUND_RETURN)) found.push('refund_return');
  if (on('defective_product') && hasAny(msg, DEFECTIVE)) found.push('defective_product');
  if (on('repeated_failure') && hasAny(msg, REPEATED_FAILURE)) found.push('repeated_failure');

  const isNegative = (t: string) => hasAny(t, NEGATIVE) || hasAny(t, NEGATIVE_EXTRA);
  const currentNegative = isNegative(msg);
  const priorNegative = priorUserTexts.some(isNegative);
  if (on('frustration') && currentNegative && priorNegative) found.push('frustration');

  if (
    on('low_confidence') &&
    typeof opts?.confidence === 'number' &&
    typeof opts?.lowConfidenceThreshold === 'number' &&
    opts.confidence < opts.lowConfidenceThreshold
  ) {
    found.push('low_confidence');
  }

  let severity: 'low' | 'medium' | 'high' = 'low';
  for (const t of found) {
    if (SEV_RANK[TRIGGER_SEVERITY[t]] > SEV_RANK[severity]) severity = TRIGGER_SEVERITY[t];
  }

  return {
    triggered: found.length > 0,
    triggers: found,
    severity,
    reason: found.map((t) => HANDOFF_LABEL[t]).join(' + '),
  };
}
