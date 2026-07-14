import { describe, it, expect } from 'vitest';
import { parseRecipients, resolveBrandName } from '@/lib/pipeline/notify-helpers';

describe('parseRecipients', () => {
  it('parses a comma list into normalized wa ids', () => {
    const r = parseRecipients('972523000584, 972547667775');
    expect(r).toEqual(['972523000584', '972547667775']);
  });
  it('normalizes local IL numbers to E.164 digits', () => {
    expect(parseRecipients('0523000584')).toEqual(['972523000584']);
  });
  it('falls back to the three defaults when empty/blank', () => {
    expect(parseRecipients('')).toHaveLength(3);
    expect(parseRecipients(null)).toHaveLength(3);
    expect(parseRecipients('  ,  ')).toHaveLength(3);
  });
});

describe('resolveBrandName', () => {
  it('prefers display_name, then username, then job username', () => {
    expect(resolveBrandName({ display_name: 'Nike', username: 'nike_il' }, 'x')).toBe('Nike');
    expect(resolveBrandName({ username: 'nike_il' }, 'x')).toBe('nike_il');
    expect(resolveBrandName({}, 'jobuser')).toBe('jobuser');
    expect(resolveBrandName(null, '')).toBe('החשבון');
  });
});
