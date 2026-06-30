import { describe, it, expect } from 'vitest';
import { detectEscalation } from '@/engines/escalation/detect';

describe('detectEscalation', () => {
  it('escalates on a legal threat', () => {
    const v = detectEscalation('אם זה לא יסתדר אני אתבע אתכם בבית משפט');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('legal');
    expect(v.severity).toBe('critical');
  });

  it('escalates on abuse / cursing', () => {
    const v = detectEscalation('אתם חרא של חברה, רמאים');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('abuse');
    expect(v.severity).toBe('critical');
  });

  it('escalates on explicit human demand', () => {
    const v = detectEscalation('תפסיקו עם הבוט, אני רוצה לדבר עם נציג אנושי עכשיו');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('human_demand');
    expect(v.severity).toBe('high');
  });

  it('escalates on sustained anger across turns', () => {
    const v = detectEscalation('זה פשוט נורא, עד מתי', ['אני ממש מאוכזבת מהשירות']);
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('sustained_anger');
  });

  it('does NOT escalate a single mildly-negative message', () => {
    const v = detectEscalation('קצת מאוכזבת מהמשלוח', []);
    expect(v.escalate).toBe(false);
    expect(v.severity).toBeNull();
  });

  it('does NOT escalate a benign question', () => {
    const v = detectEscalation('היי, יש לכם שמן לשיער יבש?');
    expect(v.escalate).toBe(false);
  });

  it('matches English legal threats too', () => {
    const v = detectEscalation('I will sue you and call my lawyer');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('legal');
  });
});
