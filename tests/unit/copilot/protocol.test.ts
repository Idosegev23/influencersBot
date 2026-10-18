// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createVisibleTextSplitter, parseMeta, EMPTY_META } from '@/lib/copilot/protocol';

describe('createVisibleTextSplitter', () => {
  it('never shows the META marker even when split across deltas', () => {
    const s = createVisibleTextSplitter();
    let shown = '';
    for (const d of ['Dues depend on ', 'membership type [1].', '\n<<ME', 'TA>>{"cited":[1]}', '<</META>>']) shown += s.push(d);
    const end = s.end();
    shown += end.visible;
    expect(shown).toBe('Dues depend on membership type [1].\n');
    expect(shown).not.toContain('<<');
    expect(end.rawMeta).toBe('{"cited":[1]}');
  });
  it('releases a held "<<" that turned out not to be the marker', () => {
    const s = createVisibleTextSplitter();
    const shown = s.push('a << b') + s.end().visible;
    expect(shown).toBe('a << b');
  });
  it('reports no meta when the model omits it', () => {
    const s = createVisibleTextSplitter();
    s.push('Plain answer.');
    expect(s.end()).toEqual({ visible: '', rawMeta: null });
  });
});

describe('parseMeta', () => {
  const ctx = { sourceCount: 3, eventIds: ['ev1'], allowedCtaUrls: ['https://buses.org/join'], topics: ['membership', 'events'] };
  it('keeps only valid references', () => {
    const m = parseMeta(JSON.stringify({ cited: [1, 3, 3, 9, 'x'], related: 2, eventId: 'ev1', cta: { kind: 'join', url: 'https://buses.org/join' }, askContact: true, topic: 'membership', membershipMentioned: true, renewalMentioned: false }), ctx);
    expect(m).toEqual({ cited: [1, 3], related: 2, eventId: 'ev1', cta: { kind: 'join', url: 'https://buses.org/join' }, askContact: true, topic: 'membership', membershipMentioned: true, renewalMentioned: false });
  });
  it('drops invented sources, events, urls and topics', () => {
    const m = parseMeta(JSON.stringify({ cited: [4], related: 1, eventId: 'made-up', cta: { kind: 'join', url: 'https://evil.example/join' }, topic: 'crypto' }), { ...ctx, sourceCount: 3 });
    expect(m).toMatchObject({ cited: [], related: 1, eventId: null, cta: null, topic: null });
  });
  it('a related item that is also cited is dropped', () => {
    expect(parseMeta(JSON.stringify({ cited: [1], related: 1 }), ctx).related).toBeNull();
  });
  it('garbage yields the empty meta', () => {
    expect(parseMeta('not json', ctx)).toEqual(EMPTY_META);
    expect(parseMeta(null, ctx)).toEqual(EMPTY_META);
  });
});
