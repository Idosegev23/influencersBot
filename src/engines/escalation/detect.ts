import type { EscalationVerdict, EscalationTrigger, EscalationSeverity } from './types';

const LEGAL = [
  'תביעה', 'אתבע', 'נתבע', 'לתבוע', 'עורך דין', 'עו"ד', 'עו״ד', 'עוד', 'משפט',
  'בית משפט', 'תלונה למשרד', 'הגנת הצרכן', 'צרכנות', 'עילה לתביעה',
  'sue', 'lawsuit', 'lawyer', 'attorney', 'court', 'legal action',
];

const ABUSE = [
  'מטומטם', 'מטומטמת', 'אידיוט', 'אידיוטית', 'דפוק', 'דפוקה', 'מניאק',
  'חרא', 'זבל', 'בן זונה', 'זונה', 'שתוק', 'שתקי', 'נמאסתם', 'רמאים',
  'גנבים', 'נוכלים', 'שקרנים', 'מתעללים', 'אפרסם נגדכם', 'אשמיץ',
  'scam', 'scammers', 'liars', 'thieves', 'idiots', 'shut up',
];

const HUMAN_DEMAND = [
  'נציג', 'נציגה', 'בן אדם', 'בנאדם', 'אדם אמיתי', 'מענה אנושי', 'מנהל',
  'מנהלת', 'אחראי', 'אחראית', 'תחזרו אליי', 'תתקשרו אליי', 'דבר איתי',
  'human', 'representative', 'real person', 'manager', 'speak to a person',
];

const NEGATIVE = [
  'כועס', 'כועסת', 'עצבני', 'עצבנית', 'מאוכזב', 'מאוכזבת', 'גרוע', 'גרועה',
  'נורא', 'בושה', 'מזעזע', 'חוצפה', 'עד מתי', 'כמה זמן עוד', 'אף אחד לא עונה',
  'מתעלמים', 'לא מקצועי', 'לא ייאמן', 'disappointed', 'angry', 'furious',
  'unacceptable', 'ridiculous', 'worst', 'terrible',
];

function hasAny(text: string, words: string[]): boolean {
  const t = (text || '').toLowerCase();
  return words.some((w) => t.includes(w.toLowerCase()));
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
  if (hasAny(msg, HUMAN_DEMAND)) triggers.push('human_demand');

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
