import { describe, it, expect } from 'vitest';
import { groupKnowledgeGaps } from '@/lib/bestie/dashboard/gaps';

const row = (over: Partial<any> = {}) => ({
  escalation_reason: 'shipping',
  source: 'auto_escalation',
  message: 'מתי מגיע המשלוח שלי?',
  created_at: '2026-07-20T10:00:00Z',
  ...over,
});

describe('groupKnowledgeGaps', () => {
  it('groups failures by reason, most common first', () => {
    const gaps = groupKnowledgeGaps([
      row(), row(), row({ escalation_reason: 'returns', message: 'איך מחזירים?' }),
    ]);
    expect(gaps[0]).toMatchObject({ topic: 'shipping', count: 2 });
    expect(gaps[1]).toMatchObject({ topic: 'returns', count: 1 });
  });

  it('carries real customer wording as examples', () => {
    const gaps = groupKnowledgeGaps([row({ message: 'מתי זה מגיע?' })]);
    expect(gaps[0].examples).toContain('מתי זה מגיע?');
  });

  it('caps examples so one loud topic cannot flood the answer', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ message: `שאלה ${i}` }));
    expect(groupKnowledgeGaps(rows, 3)[0].examples).toHaveLength(3);
  });

  it('drops rows with no recorded reason instead of bucketing them as "unknown"', () => {
    // A fake bucket would read as a real, actionable gap. It is not one.
    expect(groupKnowledgeGaps([row({ escalation_reason: null })])).toEqual([]);
  });

  it('ignores empty and whitespace messages as examples', () => {
    const gaps = groupKnowledgeGaps([row({ message: '   ' }), row({ message: 'שאלה אמיתית' })]);
    expect(gaps[0].examples).toEqual(['שאלה אמיתית']);
  });

  it('returns nothing for no input rather than a placeholder gap', () => {
    expect(groupKnowledgeGaps([])).toEqual([]);
  });

  it('does not deduplicate distinct customers asking the same thing', () => {
    // Ten people asking the same question is the signal, not noise.
    const gaps = groupKnowledgeGaps(Array.from({ length: 10 }, () => row()));
    expect(gaps[0].count).toBe(10);
  });
});
