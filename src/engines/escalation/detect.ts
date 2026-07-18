import type { EscalationVerdict, EscalationTrigger, EscalationSeverity } from './types';

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
