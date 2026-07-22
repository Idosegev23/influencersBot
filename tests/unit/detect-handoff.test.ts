import { describe, it, expect } from 'vitest';
import { detectHandoff } from '@/engines/escalation/detect';

describe('detectHandoff', () => {
  it('flags refund/return intent', () => {
    const d = detectHandoff('אני רוצה החזר כספי על ההזמנה', []);
    expect(d.triggered).toBe(true);
    expect(d.triggers).toContain('refund_return');
    expect(d.severity).toBe('medium');
  });

  it('flags defective product', () => {
    const d = detectHandoff('המוצר הגיע שבור לגמרי', []);
    expect(d.triggers).toContain('defective_product');
  });

  it('keeps legal at high severity', () => {
    const d = detectHandoff('אני אתבע אתכם, מדבר עם עו"ד', []);
    expect(d.triggers).toEqual(expect.arrayContaining(['legal']));
    expect(d.severity).toBe('high');
  });

  it('is word-boundary safe — "בעוד" and "issue" do not fire legal', () => {
    const d1 = detectHandoff('נדבר בעוד שבוע על המשלוח', []);
    expect(d1.triggers).not.toContain('legal');
    const d2 = detectHandoff('I have an issue with sizing', []);
    expect(d2.triggers).not.toContain('legal'); // "issue" ⊃ "sue" must NOT match
  });

  it('respects the enabledTriggers toggle', () => {
    const d = detectHandoff('אני רוצה החזר כספי', [], { enabledTriggers: { refund_return: false } });
    expect(d.triggers).not.toContain('refund_return');
    expect(d.triggered).toBe(false);
  });

  it('fires low_confidence only when confidence < threshold', () => {
    const under = detectHandoff('שאלה כללית', [], { confidence: 0.2, lowConfidenceThreshold: 0.4 });
    expect(under.triggers).toContain('low_confidence');
    const over = detectHandoff('שאלה כללית', [], { confidence: 0.9, lowConfidenceThreshold: 0.4 });
    expect(over.triggered).toBe(false);
  });

  it('fires frustration only when current AND a prior message are negative', () => {
    const d = detectHandoff('זה נורא, נמאס לי', ['אתם גרועים']);
    expect(d.triggers).toContain('frustration');
    const single = detectHandoff('זה נורא', []);
    expect(single.triggers).not.toContain('frustration');
  });

  it('returns triggered=false / empty on a benign message', () => {
    const d = detectHandoff('מתי המוצר יגיע?', []);
    expect(d).toEqual({ triggered: false, triggers: [], severity: 'low', reason: '' });
  });
});
