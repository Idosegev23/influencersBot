import { supabase } from '@/lib/supabase';

export interface UpcomingEvent {
  id: string; title: string; startsOn: string; endsOn: string | null; location: string | null;
  url: string; registrationUrl: string | null; summary: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIn(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function httpUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}
function text(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

export function parseExtractedEvents(raw: unknown, sourceUrl: string, today: string) {
  const list = (raw as any)?.events;
  if (!Array.isArray(list)) return [];
  const out: Array<Omit<UpcomingEvent, 'id'> & { sourceUrl: string }> = [];
  for (const e of list) {
    const title = text(e?.title, 200);
    const startsOn = typeof e?.starts_on === 'string' && ISO_DATE.test(e.starts_on) ? e.starts_on : null;
    if (!title || !startsOn) continue;
    const endsOn = typeof e?.ends_on === 'string' && ISO_DATE.test(e.ends_on) ? e.ends_on : null;
    if ((endsOn ?? startsOn) < today) continue;
    out.push({
      title, startsOn, endsOn,
      location: text(e?.location, 200),
      url: httpUrl(e?.url) ?? sourceUrl,
      registrationUrl: httpUrl(e?.registration_url),
      summary: text(e?.summary, 400),
      sourceUrl,
    });
  }
  return out;
}

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
