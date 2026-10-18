// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...a: any[]) => fromMock(...a) } }));
import { todayIn, parseExtractedEvents, listUpcomingEvents } from '@/lib/copilot/events-store';

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

describe('parseExtractedEvents date validation', () => {
  const today = '2026-10-18';
  it('drops impossible calendar dates', () => {
    const out = parseExtractedEvents({ events: [
      { title: 'Feb 31', starts_on: '2027-02-31', url: 'https://buses.org/a' },
      { title: 'Real', starts_on: '2027-02-28', url: 'https://buses.org/b' },
    ] }, 'https://buses.org/e', today);
    expect(out.map((e) => e.title)).toEqual(['Real']);
  });
  it('nulls an ends_on that is before starts_on or not a real date', () => {
    const out = parseExtractedEvents({ events: [
      { title: 'Backwards', starts_on: '2027-03-10', ends_on: '2027-03-01', url: 'https://buses.org/a' },
      { title: 'Bad end', starts_on: '2027-03-10', ends_on: '2027-02-31', url: 'https://buses.org/b' },
    ] }, 'https://buses.org/e', today);
    expect(out.map((e) => e.endsOn)).toEqual([null, null]);
  });
});

describe('listUpcomingEvents', () => {
  beforeEach(() => fromMock.mockReset());

  function chain(result: { data: any; error: any }) {
    const c: any = {};
    c.select = vi.fn(() => c);
    c.eq = vi.fn(() => c);
    c.or = vi.fn(() => c);
    c.order = vi.fn(() => c);
    c.limit = vi.fn(() => Promise.resolve(result));
    return c;
  }

  it('filters on account and end-or-start date, orders ascending, maps rows', async () => {
    const c = chain({ data: [{
      id: 'e1', title: 'Marketplace', starts_on: '2027-01-10', ends_on: '2027-01-13', location: 'Columbus, OH',
      url: 'https://buses.org/m', registration_url: 'https://buses.org/r', summary: 'S',
    }], error: null });
    fromMock.mockReturnValue(c);
    const out = await listUpcomingEvents('acc-1', '2026-10-18');
    expect(fromMock).toHaveBeenCalledWith('copilot_events');
    expect(c.eq).toHaveBeenCalledWith('account_id', 'acc-1');
    expect(c.or).toHaveBeenCalledWith('ends_on.gte.2026-10-18,and(ends_on.is.null,starts_on.gte.2026-10-18)');
    expect(c.order).toHaveBeenCalledWith('starts_on', { ascending: true });
    expect(c.limit).toHaveBeenCalledWith(6);
    expect(out).toEqual([{
      id: 'e1', title: 'Marketplace', startsOn: '2027-01-10', endsOn: '2027-01-13', location: 'Columbus, OH',
      url: 'https://buses.org/m', registrationUrl: 'https://buses.org/r', summary: 'S',
    }]);
  });

  it('returns [] and logs on a database error', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: { message: 'boom' } }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await listUpcomingEvents('acc-1', '2026-10-18')).toEqual([]);
    expect(spy).toHaveBeenCalledWith('[copilot/events-store]', 'list failed', 'acc-1', 'boom');
    spy.mockRestore();
  });
});
