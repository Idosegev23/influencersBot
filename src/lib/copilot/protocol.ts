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

export const EMPTY_META: CopilotMeta = {
  cited: [], related: null, eventId: null, cta: null, askContact: false, topic: null, membershipMentioned: false, renewalMentioned: false,
};

function heldSuffixLength(s: string): number {
  for (let k = Math.min(META_OPEN.length - 1, s.length); k > 0; k--) {
    if (META_OPEN.startsWith(s.slice(-k))) return k;
  }
  return 0;
}

export function createVisibleTextSplitter() {
  let buffer = '';
  let inMeta = false;
  let meta = '';
  return {
    push(delta: string): string {
      if (inMeta) { meta += delta; return ''; }
      buffer += delta;
      const i = buffer.indexOf(META_OPEN);
      if (i >= 0) {
        const out = buffer.slice(0, i);
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
      if (!inMeta) { const v = buffer; buffer = ''; return { visible: v, rawMeta: null }; }
      const close = meta.indexOf(META_CLOSE);
      return { visible: '', rawMeta: (close >= 0 ? meta.slice(0, close) : meta).trim() || null };
    },
  };
}

export function parseMeta(
  raw: string | null,
  ctx: { sourceCount: number; eventIds: string[]; allowedCtaUrls: string[]; topics: readonly string[] },
): CopilotMeta {
  if (!raw) return { ...EMPTY_META };
  let j: any;
  try { j = JSON.parse(raw); } catch { return { ...EMPTY_META }; }
  if (!j || typeof j !== 'object') return { ...EMPTY_META };
  const inRange = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= ctx.sourceCount;
  const cited = Array.isArray(j.cited) ? [...new Set(j.cited.filter(inRange) as number[])] : [];
  const related = inRange(j.related) && !cited.includes(j.related) ? j.related : null;
  const eventId = typeof j.eventId === 'string' && ctx.eventIds.includes(j.eventId) ? j.eventId : null;
  const kinds = ['event', 'join', 'renew'];
  const cta = j.cta && kinds.includes(j.cta.kind) && typeof j.cta.url === 'string' && ctx.allowedCtaUrls.includes(j.cta.url)
    ? { kind: j.cta.kind, url: j.cta.url } : null;
  const topic = typeof j.topic === 'string' && ctx.topics.includes(j.topic) ? j.topic : null;
  return {
    cited, related, eventId, cta, topic,
    askContact: j.askContact === true,
    membershipMentioned: j.membershipMentioned === true,
    renewalMentioned: j.renewalMentioned === true,
  };
}
