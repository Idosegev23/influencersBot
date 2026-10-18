/**
 * Pure event helpers with no database import. The extractor script
 * (scripts/copilot-extract-events.ts) imports this module before it loads
 * .env.local, so it must never pull in @/lib/supabase.
 */
export interface UpcomingEvent {
  id: string; title: string; startsOn: string; endsOn: string | null; location: string | null;
  url: string; registrationUrl: string | null; summary: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIn(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
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
    const startsOn = isoDate(e?.starts_on);
    if (!title || !startsOn) continue;
    const rawEnd = isoDate(e?.ends_on);
    const endsOn = rawEnd && rawEnd >= startsOn ? rawEnd : null;
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

/** Model input for one page. json_object output requires the word "json" in the input itself. */
export function extractorInput(url: string, body: string): string {
  return `Return JSON. URL: ${url}\n\n${body}`;
}
