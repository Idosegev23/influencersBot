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
  it('drops a partial marker left by a truncated stream', () => {
    for (const tail of ['<<META', '<<ME', '<<', '<<meta>']) {
      const s = createVisibleTextSplitter();
      const shown = s.push(`x ${tail}`) + s.end().visible;
      expect(shown).not.toContain('<<');
      expect(shown).toBe('x ');
    }
    const s = createVisibleTextSplitter();
    expect(s.push('a <') + s.end().visible).toBe('a <');
  });
  it('strips a stray close marker from visible text', () => {
    const s = createVisibleTextSplitter();
    expect(s.push('done <</ME') + s.push('TA>> ok') + s.end().visible).toBe('done  ok');
  });
  it('is correct at every split offset', () => {
    const full = 'Answer [1] a << b.\n<<META>>{"cited":[1]}<</META>> tail <<META>>{}';
    for (let i = 0; i <= full.length; i++) {
      const s = createVisibleTextSplitter();
      const shown = s.push(full.slice(0, i)) + s.push(full.slice(i));
      const end = s.end();
      expect(shown + end.visible).toBe('Answer [1] a << b.\n');
      expect(end.rawMeta).toBe('{"cited":[1]}');
    }
  });
  it('finds the close marker case-insensitively', () => {
    const s = createVisibleTextSplitter();
    s.push('Hi\n<<META>>{"cited":[1]}<</meta>> junk');
    expect(s.end().rawMeta).toBe('{"cited":[1]}');
  });
  it('strips spliced stray close markers to a fixed point', () => {
    const s = createVisibleTextSplitter();
    const shown = s.push('a <</ME<</META>>TA>> b') + s.end().visible;
    expect(shown).toBe('a  b');
    const t = createVisibleTextSplitter();
    expect(t.push('x <<ME<</META>>TA>>{"cited":[1]}').trim()).toBe('x');
    expect(t.end().rawMeta).toBe('{"cited":[1]}');
  });
  it('reports no meta when the model omits it', () => {
    const s = createVisibleTextSplitter();
    s.push('Plain answer.');
    expect(s.end()).toEqual({ visible: '', rawMeta: null });
  });
});

describe('parseMeta', () => {
  const ctx = { sourceCount: 3, eventIds: ['ev1'], ctaUrls: { join: ['https://buses.org/join'], renew: ['https://buses.org/renew'], event: ['https://buses.org/register'] }, topics: ['membership', 'events'] };
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
  it('rejects a cta whose kind does not match its url set', () => {
    for (const cta of [{ kind: 'renew', url: 'https://buses.org/join' }, { kind: 'join', url: 'https://buses.org/register' }, { kind: 'event', url: 'https://buses.org/join' }]) {
      expect(parseMeta(JSON.stringify({ cta }), ctx).cta).toBeNull();
    }
    expect(parseMeta(JSON.stringify({ cta: { kind: 'event', url: 'https://buses.org/register' } }), ctx).cta).toEqual({ kind: 'event', url: 'https://buses.org/register' });
  });
  it('accepts META wrapped in a code fence', () => {
    expect(parseMeta('```json\n{"cited":[2]}\n```', ctx).cited).toEqual([2]);
  });
  it('returns fresh objects and never the shared empty meta', () => {
    const a = parseMeta(null, ctx);
    a.cited.push(1);
    expect(parseMeta(null, ctx).cited).toEqual([]);
    expect(parseMeta('nope', ctx)).not.toBe(EMPTY_META);
    expect(EMPTY_META.cited).toEqual([]);
    expect(Object.isFrozen(EMPTY_META)).toBe(true);
  });
  it('garbage yields the empty meta', () => {
    expect(parseMeta('not json', ctx)).toEqual(EMPTY_META);
    expect(parseMeta(null, ctx)).toEqual(EMPTY_META);
  });
});
