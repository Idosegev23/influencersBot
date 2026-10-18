import { supabase } from '@/lib/supabase';

import type { UpcomingEvent } from './events-parse';

export { todayIn, parseExtractedEvents, extractorInput, type UpcomingEvent } from './events-parse';

export async function listUpcomingEvents(accountId: string, today: string, limit = 6): Promise<UpcomingEvent[]> {
  const { data, error } = await supabase.from('copilot_events')
    .select('id, title, starts_on, ends_on, location, url, registration_url, summary')
    .eq('account_id', accountId)
    .or(`ends_on.gte.${today},and(ends_on.is.null,starts_on.gte.${today})`)
    .order('starts_on', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[copilot/events-store]', 'list failed', accountId, error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    id: r.id, title: r.title, startsOn: r.starts_on, endsOn: r.ends_on, location: r.location,
    url: r.url, registrationUrl: r.registration_url, summary: r.summary,
  }));
}
