// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { todayIn, parseExtractedEvents } from '@/lib/copilot/events-store';

describe('todayIn', () => {
  it('uses the association time zone, not UTC', () => {
    // 2026-10-19 02:00 UTC is still 2026-10-18 in New York.
    expect(todayIn('America/New_York', new Date('2026-10-19T02:00:00Z'))).toBe('2026-10-18');
    expect(todayIn('UTC', new Date('2026-10-19T02:00:00Z'))).toBe('2026-10-19');
  });
});

describe('parseExtractedEvents', () => {
  const today = '2026-10-18';
  it('keeps future and ongoing events, drops past and malformed ones', () => {
    const out = parseExtractedEvents({ events: [
      { title: 'Marketplace 2027', starts_on: '2027-01-10', ends_on: '2027-01-13', location: 'Columbus, OH', url: 'https://buses.org/marketplace', registration_url: 'https://buses.org/register' },
      { title: 'Ongoing webinar series', starts_on: '2026-10-01', ends_on: '2026-10-30', url: 'https://buses.org/webinars' },
      { title: 'Yesterday', starts_on: '2026-10-17', url: 'https://buses.org/y' },
      { title: '', starts_on: '2027-01-01', url: 'https://buses.org/z' },
      { title: 'Bad date', starts_on: 'next spring', url: 'https://buses.org/b' },
      { title: 'No url', starts_on: '2027-02-02' },
    ] }, 'https://buses.org/events/', today);
    expect(out.map((e) => e.title)).toEqual(['Marketplace 2027', 'Ongoing webinar series', 'No url']);
    expect(out[2].url).toBe('https://buses.org/events/');
    expect(out[0]).toMatchObject({ startsOn: '2027-01-10', endsOn: '2027-01-13', registrationUrl: 'https://buses.org/register', sourceUrl: 'https://buses.org/events/' });
  });
  it('returns nothing for junk', () => {
    expect(parseExtractedEvents(null, 'https://x', today)).toEqual([]);
    expect(parseExtractedEvents({ events: 'nope' }, 'https://x', today)).toEqual([]);
  });
  it('rejects non-http urls', () => {
    expect(parseExtractedEvents({ events: [{ title: 'X', starts_on: '2027-01-01', url: 'javascript:alert(1)' }] }, 'https://buses.org/e', today)[0].url).toBe('https://buses.org/e');
  });
});
