// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// No supabase mock on purpose: the extractor script imports this module before any env is loaded,
// so importing it must never pull in @/lib/supabase.
vi.mock('@/lib/supabase', () => { throw new Error('events-parse must not import @/lib/supabase'); });

import { todayIn, parseExtractedEvents, extractorInput } from '@/lib/copilot/events-parse';

describe('events-parse (env-free helpers for the extractor script)', () => {
  it('exports the pure helpers', () => {
    expect(todayIn('UTC', new Date('2026-10-19T02:00:00Z'))).toBe('2026-10-19');
    expect(parseExtractedEvents({ events: [{ title: 'Expo', starts_on: '2027-01-10' }] }, 'https://a.org/e', '2026-10-18')).toHaveLength(1);
  });
  it('extractor input contains the word JSON (required by json_object format)', () => {
    const input = extractorInput('https://a.org/e', 'page text');
    expect(input.startsWith('Return JSON. ')).toBe(true);
    expect(input).toContain('URL: https://a.org/e\n\npage text');
    expect(/json/i.test(input)).toBe(true);
  });
});
