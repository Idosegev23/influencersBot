import { describe, it, expect } from 'vitest';
import { buildSummaryPrompt } from '@/lib/crm/agent-memory';

describe('buildSummaryPrompt (pure)', () => {
  it('carries the prior summary + the new turn and asks for a compact Hebrew summary', () => {
    const { instructions, input } = buildSummaryPrompt(
      'סיכום קודם: דיברנו על אנה.',
      'כמה עסקאות לאנה?',
      'לאנה 14 עסקאות.'
    );
    expect(instructions).toMatch(/סיכום/);
    expect(input).toContain('סיכום קודם: דיברנו על אנה.');
    expect(input).toContain('כמה עסקאות לאנה?');
    expect(input).toContain('לאנה 14 עסקאות.');
  });
  it('handles an empty prior summary', () => {
    const { input } = buildSummaryPrompt('', 'שלום', 'היי');
    expect(input).toContain('שלום');
    expect(input).toContain('(אין)');
  });
});
