/**
 * The model streams the answer, then one trailing machine block:
 *   <<META>>{...json...}<</META>>
 * The visible text must never contain the block, even when the marker is split
 * across stream deltas, and every reference in the block is checked against
 * what was actually retrieved: the model cannot surface a link we did not give it.
 */
export const META_OPEN = '<<META>>';
export const META_CLOSE = '<</META>>';

export interface CopilotMeta {
  cited: number[];
  related: number | null;
  eventId: string | null;
  cta: { kind: 'event' | 'join' | 'renew'; url: string } | null;
  askContact: boolean;
  topic: string | null;
  membershipMentioned: boolean;
  renewalMentioned: boolean;
}

function emptyMeta(): CopilotMeta {
  return { cited: [], related: null, eventId: null, cta: null, askContact: false, topic: null, membershipMentioned: false, renewalMentioned: false };
}

/** Shared, frozen reference value. parseMeta never returns this object. */
export const EMPTY_META: CopilotMeta = Object.freeze({ ...emptyMeta(), cited: Object.freeze([]) as unknown as number[] }) as CopilotMeta;

const MARKERS = [META_OPEN.toLowerCase(), META_CLOSE.toLowerCase()];
const STRAY_CLOSE = /<<\/META>>/gi;

/** Remove stray close markers until none is left (removal can splice a new one together). */
function stripStrayClose(s: string): string {
  let prev: string;
  do { prev = s; s = s.replace(STRAY_CLOSE, ''); } while (s !== prev);
  return s;
}

/** Length of the longest suffix of s that is a proper prefix of a marker (case-insensitive). */
function heldSuffixLength(s: string): number {
  const lower = s.toLowerCase();
  let best = 0;
  for (const m of MARKERS) {
    for (let k = Math.min(m.length - 1, lower.length); k > best; k--) {
      if (m.startsWith(lower.slice(-k))) { best = k; break; }
    }
  }
  return best;
}

export function createVisibleTextSplitter() {
  let buffer = '';
  let inMeta = false;
  let meta = '';
  return {
    push(delta: string): string {
      if (inMeta) { meta += delta; return ''; }
      buffer += delta;
      const openAt = (t: string) => t.toLowerCase().indexOf(META_OPEN.toLowerCase());
      // Strip stray close markers only from text before the real open marker, so the
      // real close marker is never eaten; re-check afterwards because removal can
      // splice a new marker together (`<<ME<</META>>TA>>`).
      let i = openAt(buffer);
      if (i >= 0) { buffer = stripStrayClose(buffer.slice(0, i)) + buffer.slice(i); } else { buffer = stripStrayClose(buffer); }
      i = openAt(buffer);
      if (i >= 0) {
        let out = buffer.slice(0, i);
        const partial = heldSuffixLength(out);
        if (partial >= 2) out = out.slice(0, out.length - partial);
        meta = buffer.slice(i + META_OPEN.length);
        buffer = '';
        inMeta = true;
        return out;
      }
      const hold = heldSuffixLength(buffer);
      const out = buffer.slice(0, buffer.length - hold);
      buffer = buffer.slice(buffer.length - hold);
      return out;
    },
    end(): { visible: string; rawMeta: string | null } {
      if (!inMeta) {
        // A held suffix of two or more characters is a partial marker from a truncated
        // stream: drop it. A single held "<" is ordinary text.
        const v = buffer.length >= 2 ? '' : stripStrayClose(buffer);
        buffer = '';
        return { visible: v, rawMeta: null };
      }
      const close = meta.toLowerCase().indexOf(META_CLOSE.toLowerCase());
      return { visible: '', rawMeta: (close >= 0 ? meta.slice(0, close) : meta).trim() || null };
    },
  };
}

export function parseMeta(
  raw: string | null,
  ctx: {
    sourceCount: number;
    eventIds: string[];
    ctaUrls: { join: string[]; renew: string[]; event: string[] };
    topics: readonly string[];
  },
): CopilotMeta {
  if (!raw) return emptyMeta();
  let text = raw.trim();
  const fence = text.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1];
  let j: any;
  try { j = JSON.parse(text); } catch { return emptyMeta(); }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return emptyMeta();
  const inRange = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= ctx.sourceCount;
  const cited = Array.isArray(j.cited) ? [...new Set(j.cited.filter(inRange) as number[])] : [];
  const related = inRange(j.related) && !cited.includes(j.related) ? j.related : null;
  const eventId = typeof j.eventId === 'string' && ctx.eventIds.includes(j.eventId) ? j.eventId : null;
  const kinds = ['event', 'join', 'renew'] as const;
  const cta = j.cta && typeof j.cta === 'object' && kinds.includes(j.cta.kind) && typeof j.cta.url === 'string'
    && (ctx.ctaUrls[j.cta.kind as 'event' | 'join' | 'renew'] ?? []).includes(j.cta.url)
    ? { kind: j.cta.kind as 'event' | 'join' | 'renew', url: j.cta.url as string } : null;
  const topic = typeof j.topic === 'string' && ctx.topics.includes(j.topic) ? j.topic : null;
  return {
    cited, related, eventId, cta, topic,
    askContact: j.askContact === true,
    membershipMentioned: j.membershipMentioned === true,
    renewalMentioned: j.renewalMentioned === true,
  };
}
