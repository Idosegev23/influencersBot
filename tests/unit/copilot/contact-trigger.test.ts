// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { shouldRequestContact, readContactRules, DEFAULT_CONTACT_RULES } from '@/lib/copilot/contact-trigger';

const base = { rules: DEFAULT_CONTACT_RULES, questionCount: 1, topic: null, modelAsked: false, escalating: false, alreadyHaveEmail: false, alreadyRequested: false };

describe('shouldRequestContact', () => {
  it('fires on a membership question when the model judged follow-up useful', () => {
    expect(shouldRequestContact({ ...base, topic: 'membership', modelAsked: true })).toBe(true);
    expect(shouldRequestContact({ ...base, topic: 'membership', modelAsked: false })).toBe(false);
    expect(shouldRequestContact({ ...base, topic: 'safety', modelAsked: true })).toBe(false);
  });
  it('fires before an escalation', () => {
    expect(shouldRequestContact({ ...base, escalating: true })).toBe(true);
  });
  it('after_n_questions', () => {
    const rules = [{ kind: 'after_n_questions', n: 3 }] as any;
    expect(shouldRequestContact({ ...base, rules, questionCount: 2 })).toBe(false);
    expect(shouldRequestContact({ ...base, rules, questionCount: 3 })).toBe(true);
  });
  it('never asks twice or when the email is known', () => {
    expect(shouldRequestContact({ ...base, escalating: true, alreadyRequested: true })).toBe(false);
    expect(shouldRequestContact({ ...base, escalating: true, alreadyHaveEmail: true })).toBe(false);
  });
});

describe('readContactRules', () => {
  it('reads valid rules and falls back to defaults', () => {
    expect(readContactRules({ copilot: { contact_trigger: { kind: 'after_n_questions', n: 4 } } })).toEqual([{ kind: 'after_n_questions', n: 4 }]);
    expect(readContactRules({ copilot: { contact_trigger: [{ kind: 'nope' }] } })).toEqual(DEFAULT_CONTACT_RULES);
    expect(readContactRules(null)).toEqual(DEFAULT_CONTACT_RULES);
  });
});
