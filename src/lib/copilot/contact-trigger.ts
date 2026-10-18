export type ContactRule =
  | { kind: 'after_n_questions'; n: number }
  | { kind: 'on_intent'; topics: string[] }
  | { kind: 'before_escalation' };

export const DEFAULT_CONTACT_RULES: ContactRule[] = [
  { kind: 'on_intent', topics: ['membership', 'events'] },
  { kind: 'before_escalation' },
];

function valid(r: any): ContactRule | null {
  if (r?.kind === 'after_n_questions' && Number.isInteger(r.n) && r.n > 0) return { kind: 'after_n_questions', n: r.n };
  if (r?.kind === 'on_intent' && Array.isArray(r.topics) && r.topics.every((t: unknown) => typeof t === 'string')) return { kind: 'on_intent', topics: r.topics };
  if (r?.kind === 'before_escalation') return { kind: 'before_escalation' };
  return null;
}

export function readContactRules(config: unknown): ContactRule[] {
  const raw = (config as any)?.copilot?.contact_trigger;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const rules = list.map(valid).filter(Boolean) as ContactRule[];
  return rules.length ? rules : DEFAULT_CONTACT_RULES;
}

export function shouldRequestContact(s: {
  rules: ContactRule[]; questionCount: number; topic: string | null; modelAsked: boolean;
  escalating: boolean; alreadyHaveEmail: boolean; alreadyRequested: boolean;
}): boolean {
  if (s.alreadyHaveEmail || s.alreadyRequested) return false;
  return s.rules.some((r) =>
    (r.kind === 'after_n_questions' && s.questionCount >= r.n) ||
    (r.kind === 'on_intent' && !!s.topic && r.topics.includes(s.topic) && s.modelAsked) ||
    (r.kind === 'before_escalation' && s.escalating));
}
