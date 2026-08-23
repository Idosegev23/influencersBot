/**
 * Date-range parsing shared by the report, drill-down and export routes.
 *
 * The comparison window is always the same length as the reported one and sits
 * immediately before it — otherwise every ▲▼ on the page is a lie.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;

export interface ParsedRange {
  fromIso: string;
  toIso: string;
  prevFromIso: string;
  prevToIso: string;
}

export function parseRange(sp: URLSearchParams, now: Date): ParsedRange {
  const from = sp.get('from');
  const to = sp.get('to');

  let start: Date;
  let end: Date;

  if (from && to && !Number.isNaN(Date.parse(from)) && !Number.isNaN(Date.parse(to))) {
    start = new Date(from);
    end = new Date(to);
    if (end <= start) end = new Date(start.getTime() + DAY_MS); // never an inverted window
  } else {
    const days = parseInt(sp.get('days') || String(DEFAULT_DAYS), 10);
    const span = Number.isFinite(days) && days > 0 ? days : DEFAULT_DAYS;
    end = new Date(now);
    start = new Date(now.getTime() - span * DAY_MS);
  }

  const span = end.getTime() - start.getTime();
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
    prevFromIso: new Date(start.getTime() - span).toISOString(),
    prevToIso: start.toISOString(),
  };
}
