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

  it('is word-boundary safe — "בעוד" and "issue"/"tissue" do not fire legal', () => {
    const d1 = detectHandoff('נדבר בעוד שבוע על המשלוח', []);
    expect(d1.triggers).not.toContain('legal');
    const d2 = detectHandoff('I have an issue with sizing', []);
    expect(d2.triggers).not.toContain('legal'); // "issue" ⊃ "sue" must NOT match
    const d3 = detectHandoff('please send a tissue-lined box', []);
    expect(d3.triggers).not.toContain('legal'); // "tissue" ⊃ "sue" must NOT match
  });

  it('is word-boundary safe — Hebrew short-token "מנהל" does not fire human_demand off the homograph "מנהלת" (the verb) without a request cue', () => {
    // "מנהלת" is a homograph: "(the female) manager" or the verb "manages". Without an
    // accompanying request cue this is an ordinary question, not an escalation — the exact
    // real-world false-positive pattern (12 of 17 FPs) that motivated the word-boundary-safe
    // `hasAny` + double-gating design detectHandoff reuses from detectEscalation.
    const d = detectHandoff('מי מנהלת הלקוח של סודה?', []);
    expect(d.triggers).not.toContain('human_demand');
    expect(d.triggered).toBe(false);
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

  it('flags an explicit human demand at high severity', () => {
    const d = detectHandoff('אני רוצה לדבר עם נציג עכשיו', []);
    expect(d.triggered).toBe(true);
    expect(d.triggers).toContain('human_demand');
    expect(d.severity).toBe('high');
  });

  it('flags abusive language at high severity', () => {
    const d = detectHandoff('אתם רמאים וגנבים, חברה של נוכלים', []);
    expect(d.triggered).toBe(true);
    expect(d.triggers).toContain('abuse');
    expect(d.severity).toBe('high');
  });

  it('flags repeated failure at medium severity', () => {
    const d = detectHandoff('זו כבר פעם שלישית שאני פונה בנושא הזה', []);
    expect(d.triggered).toBe(true);
    expect(d.triggers).toContain('repeated_failure');
    expect(d.severity).toBe('medium');
  });
});

describe('detectHandoff — enabledTriggers toggles each trigger off independently', () => {
  it('human_demand off suppresses the trigger', () => {
    const d = detectHandoff('אני רוצה לדבר עם נציג עכשיו', [], {
      enabledTriggers: { human_demand: false },
    });
    expect(d.triggers).not.toContain('human_demand');
    expect(d.triggered).toBe(false);
  });

  it('legal off suppresses the trigger', () => {
    const d = detectHandoff('אני אתבע אתכם, מדבר עם עו"ד', [], {
      enabledTriggers: { legal: false },
    });
    expect(d.triggers).not.toContain('legal');
    expect(d.triggered).toBe(false);
  });

  it('abuse off suppresses the trigger', () => {
    const d = detectHandoff('אתם רמאים וגנבים', [], { enabledTriggers: { abuse: false } });
    expect(d.triggers).not.toContain('abuse');
    expect(d.triggered).toBe(false);
  });

  it('defective_product off suppresses the trigger', () => {
    const d = detectHandoff('המוצר הגיע שבור לגמרי', [], {
      enabledTriggers: { defective_product: false },
    });
    expect(d.triggers).not.toContain('defective_product');
    expect(d.triggered).toBe(false);
  });

  it('repeated_failure off suppresses the trigger', () => {
    const d = detectHandoff('זו כבר פעם שלישית שאני פונה בנושא הזה', [], {
      enabledTriggers: { repeated_failure: false },
    });
    expect(d.triggers).not.toContain('repeated_failure');
    expect(d.triggered).toBe(false);
  });

  it('frustration off suppresses the trigger', () => {
    const d = detectHandoff('זה נורא, נמאס לי', ['אתם גרועים'], {
      enabledTriggers: { frustration: false },
    });
    expect(d.triggers).not.toContain('frustration');
    expect(d.triggered).toBe(false);
  });

  it('low_confidence off suppresses the trigger even under threshold', () => {
    const d = detectHandoff('שאלה כללית', [], {
      confidence: 0.1,
      lowConfidenceThreshold: 0.4,
      enabledTriggers: { low_confidence: false },
    });
    expect(d.triggers).not.toContain('low_confidence');
    expect(d.triggered).toBe(false);
  });
});
