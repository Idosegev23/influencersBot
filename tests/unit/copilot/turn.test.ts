// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Both throw on import under Node 20; deps are injected, but the modules are still imported.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/costs/recorder', () => ({ recordTurnCost: vi.fn(async () => {}) }));

import { runCopilotTurn, createLinkGuard, type TurnEvent } from '@/lib/copilot/turn';
import { CopilotModelError, streamCopilotModel } from '@/lib/copilot/model';
import { EMPTY_ANSWER } from '@/lib/copilot/turn';

const tenant = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot-dev.test' };
const assoc = { accountId: 'acc', partnerId: 'pA', industry: 'motorcoach', branding: {}, openingQuestions: [],
  config: { display_name: 'American Bus Association', website_url: 'https://www.buses.org', copilot: { exclusions: ['/archive'], links: { join: 'https://buses.org/join' } } } };
const visitor = { id: 'v1', partner_id: 'pA', account_id: 'acc', anon_id: 'anon_x', email: null, identity_source: null, membership: null } as any;
const sources = [
  { n: 1, id: 'c1', title: 'Membership', url: 'https://buses.org/membership/', excerpt: 'x', entityType: 'website' },
  { n: 2, id: 'c2', title: 'Marketplace', url: 'https://buses.org/marketplace/', excerpt: 'y', entityType: 'website' },
];
const events = [{ id: 'ev1', title: 'Marketplace 2027', startsOn: '2027-01-10', endsOn: null, location: null, url: 'https://buses.org/marketplace/', registrationUrl: 'https://buses.org/register', summary: null }];

// Mock adjustments vs the brief (the brief's assertions are unchanged):
// - `eq` chains any number of times, so the session-wide contact lookup
//   (`.eq(session_id).eq(role).eq(metadata->copilot->>contact_requested).limit(1)`) is modelled.
// - The history read returns `history` (newest first, as `.order(created_at desc).limit(10)` does)
//   PLUS any chat_messages rows inserted earlier in the same test, as the real table would.
// - `contactRow` makes the contact lookup find a row; `insertError` fails the insert;
//   `reads` / `queries` record what was read. With the defaults it behaves as in the brief.
function makeDb(session: any, opts: { history?: any[]; insertError?: any; contactRow?: boolean } = {}) {
  const inserted: any[] = []; const updates: any[] = []; const reads: string[] = []; const queries: any[] = [];
  const query = (t: string, cols: string, filters: Array<[string, unknown]>): any => ({
    eq: (k: string, v: unknown) => query(t, cols, [...filters, [k, v]]),
    order: () => query(t, cols, filters),
    maybeSingle: async () => { reads.push(t); queries.push({ t, cols, filters }); return { data: t === 'chat_sessions' ? session : null }; },
    limit: async () => {
      reads.push(t); queries.push({ t, cols, filters });
      if (t !== 'chat_messages') return { data: [] };
      if (filters.some(([k]) => k === 'metadata->copilot->>contact_requested')) return { data: opts.contactRow ? [{ id: 'old' }] : [] };
      const fresh = inserted.filter((i) => i.t === 'chat_messages').map((i) => ({ role: i.row.role, content: i.row.content, metadata: i.row.metadata ?? {} })).reverse();
      return { data: [...fresh, ...(opts.history ?? [])] };
    },
  });
  const db: any = {
    inserted, updates, reads, queries,
    from: (t: string) => ({
      select: (cols: string) => query(t, cols, []),
      insert: (row: any) => ({ select: () => ({ single: async () => {
        if (opts.insertError) return { data: null, error: opts.insertError };
        inserted.push({ t, row }); return { data: { id: `m${inserted.length}` }, error: null };
      } }) }),
      update: (patch: any) => ({ eq: async () => { updates.push({ t, patch }); return { error: null }; } }),
    }),
  };
  return db;
}

function modelSaying(text: string, extra: Partial<{ responseId: string | null; usage: any[]; incomplete: boolean }> = {}) {
  return vi.fn(async (p: any) => {
    for (const ch of text.match(/[\s\S]{1,7}/g) ?? []) p.onDelta(ch);
    return { text, responseId: 'resp_1', usage: [], incomplete: false, ...extra };
  });
}
function modelDeltas(deltas: string[]) {
  return vi.fn(async (p: any) => { for (const d of deltas) p.onDelta(d); return { text: deltas.join(''), responseId: 'resp_1', usage: [], incomplete: false }; });
}

const noEscalation = () => vi.fn(async () => ({ escalated: false, reason: null, notified: 0, deduped: false }));

let emitted: TurnEvent[];
const emit = (e: TurnEvent) => emitted.push(e);
beforeEach(() => { emitted = []; });

const visibleOf = (evs: TurnEvent[]) => evs.filter((e) => e.type === 'delta').map((e: any) => e.text).join('');

const META = '<<META>>{"cited":[1],"related":2,"eventId":"ev1","cta":{"kind":"join","url":"https://buses.org/join"},"askContact":true,"topic":"membership","membershipMentioned":true,"renewalMentioned":false}<</META>>';

function baseDeps(db: any, over: Record<string, any> = {}) {
  return {
    db, retrieveSources: vi.fn(async () => sources), listEvents: vi.fn(async () => events),
    model: modelSaying('Answer [1].') as any, escalate: noEscalation(),
    recordEvents: vi.fn(), recordCost: vi.fn(), now: () => new Date('2026-10-18T15:00:00Z'),
    ...over,
  };
}

describe('runCopilotTurn', () => {
  it('streams a cited answer with cards and records structured events', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const recordEvents = vi.fn();
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'How do I join?' }, emit, {
      db, retrieveSources: vi.fn(async () => sources), listEvents: vi.fn(async () => events),
      model: modelSaying(`You can join as an operator member [1].\n${META}`) as any,
      escalate: vi.fn(async () => ({ escalated: false, reason: null, notified: 0, deduped: false })),
      recordEvents, recordCost: vi.fn(), now: () => new Date('2026-10-18T15:00:00Z'),
    });
    const text = emitted.filter((e) => e.type === 'delta').map((e: any) => e.text).join('');
    expect(text).toBe('You can join as an operator member [1].\n');
    expect(text).not.toContain('<<');
    expect(emitted).toContainEqual({ type: 'sources', items: [{ n: 1, title: 'Membership', url: 'https://buses.org/membership/' }] });
    expect(emitted).toContainEqual({ type: 'related', item: { title: 'Marketplace', url: 'https://buses.org/marketplace/' } });
    expect(emitted).toContainEqual(expect.objectContaining({ type: 'event', item: expect.objectContaining({ id: 'ev1' }) }));
    expect(emitted).toContainEqual({ type: 'cta', kind: 'join', url: 'https://buses.org/join' });
    expect(emitted).toContainEqual({ type: 'contact_request' });
    expect(emitted.at(-1)).toMatchObject({ type: 'done' });
    const types = (recordEvents.mock.calls[0] as any)[1].map((e: any) => e.type);
    expect(types).toEqual(expect.arrayContaining(['question', 'topic_classified', 'resource_shown', 'related_item_shown', 'event_suggested', 'membership_prompted', 'contact_requested']));
    expect(db.updates.find((u: any) => u.t === 'chat_sessions').patch).toMatchObject({ last_response_id: 'resp_1', message_count: 2 });
  });

  it('refuses a session that belongs to another visitor without calling the model', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'someone-else', message_count: 0 });
    const model = vi.fn();
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'hi' }, emit, {
      db, retrieveSources: vi.fn(), listEvents: vi.fn(), model: model as any, escalate: vi.fn(), recordEvents: vi.fn(), recordCost: vi.fn(), now: () => new Date(),
    });
    expect(emitted).toEqual([{ type: 'error', error: 'unknown_session' }]);
    expect(model).not.toHaveBeenCalled();
    expect(db.inserted).toHaveLength(0);
  });

  it('passes the staff exclusions to retrieval', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const retrieveSources = vi.fn(async () => []);
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit, {
      db, retrieveSources, listEvents: vi.fn(async () => []), model: modelSaying('I do not have that.') as any,
      escalate: vi.fn(async () => ({ escalated: false, reason: null, notified: 0, deduped: false })), recordEvents: vi.fn(), recordCost: vi.fn(), now: () => new Date(),
    });
    expect(retrieveSources).toHaveBeenCalledWith('acc', 'q', ['/archive']);
  });

  it('never surfaces an event the model invented', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'events?' }, emit, {
      db, retrieveSources: vi.fn(async () => sources), listEvents: vi.fn(async () => []),
      model: modelSaying('See you there.\n<<META>>{"cited":[],"eventId":"ev-old"}<</META>>') as any,
      escalate: vi.fn(async () => ({ escalated: false, reason: null, notified: 0, deduped: false })), recordEvents: vi.fn(), recordCost: vi.fn(), now: () => new Date(),
    });
    expect(emitted.find((e) => e.type === 'event')).toBeUndefined();
  });

  it('reports a model failure as answer_unavailable', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit, {
      db, retrieveSources: vi.fn(async () => []), listEvents: vi.fn(async () => []), model: vi.fn(async () => { throw new Error('down'); }) as any,
      escalate: vi.fn(), recordEvents: vi.fn(), recordCost: vi.fn(), now: () => new Date(),
    });
    expect(emitted.at(-1)).toEqual({ type: 'error', error: 'answer_unavailable' });
  });

  // ---- session ownership: no write, no retrieval, no model call for a foreign or missing session ----

  it.each([
    ['another association', { id: 's1', account_id: 'other-acc', visitor_id: 'v1', message_count: 0 }],
    ['a missing session', null],
    ['a session with no visitor', { id: 's1', account_id: 'acc', visitor_id: null, message_count: 0 }],
  ])('refuses %s before any write, retrieval or model call', async (_label, session) => {
    const db = makeDb(session);
    const deps = baseDeps(db, { model: vi.fn() });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'hi' }, emit, deps);
    expect(emitted).toEqual([{ type: 'error', error: 'unknown_session' }]);
    expect(deps.model).not.toHaveBeenCalled();
    expect(deps.retrieveSources).not.toHaveBeenCalled();
    expect(deps.listEvents).not.toHaveBeenCalled();
    expect(deps.recordEvents).not.toHaveBeenCalled();
    expect(deps.escalate).not.toHaveBeenCalled();
    expect(db.inserted).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
    expect(db.reads).toEqual(['chat_sessions']);
  });

  it('refuses when the association context or visitor is for another account', async () => {
    for (const input of [
      { assoc: { ...assoc, accountId: 'other-acc' }, visitor },
      { assoc, visitor: { ...visitor, account_id: 'other-acc' } },
    ]) {
      emitted = [];
      const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
      const deps = baseDeps(db, { model: vi.fn() });
      await runCopilotTurn({ tenant, assoc: input.assoc as any, visitor: input.visitor, sessionId: 's1', message: 'hi' }, emit, deps);
      expect(emitted).toEqual([{ type: 'error', error: 'unknown_session' }]);
      expect(deps.model).not.toHaveBeenCalled();
      expect(db.inserted).toHaveLength(0);
    }
  });

  it('accepts the owned session (presence check for the refusals above)', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const deps = baseDeps(db);
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'hi' }, emit, deps);
    expect(deps.model).toHaveBeenCalledTimes(1);
    expect(db.inserted.map((i: any) => i.row.role)).toEqual(['user', 'assistant']);
  });

  it('does not call the model when the user message cannot be saved', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 }, { insertError: { message: 'boom' } });
    const deps = baseDeps(db, { model: vi.fn() });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'hi' }, emit, deps);
    expect(deps.model).not.toHaveBeenCalled();
    expect(emitted.at(-1)).toMatchObject({ type: 'error' });
  });

  // ---- chain and history ----

  it('sends the last messages oldest first plus the new one when there is no live chain', async () => {
    const history = [
      { role: 'assistant', content: 'A1', metadata: {} },
      { role: 'user', content: 'Q1', metadata: {} },
    ]; // newest first, as the DB returns it
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 2, last_response_id: null }, { history });
    const deps = baseDeps(db);
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'Q2' }, emit, deps);
    const p = (deps.model as any).mock.calls[0][0];
    expect(p.previousResponseId).toBeNull();
    expect(p.input).toEqual([{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' }, { role: 'user', content: 'Q2' }]);
  });

  it('chains with previous_response_id and sends only the new message while the chain is live', async () => {
    const history = [{ role: 'assistant', content: 'A1', metadata: {} }, { role: 'user', content: 'Q1', metadata: {} }];
    const now = new Date();
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 2, last_response_id: 'resp_0', last_turn_at: new Date(now.getTime() - 60_000).toISOString() }, { history });
    const deps = baseDeps(db, { now: () => now });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'Q2' }, emit, deps);
    const p = (deps.model as any).mock.calls[0][0];
    expect(p.previousResponseId).toBe('resp_0');
    expect(p.input).toEqual([{ role: 'user', content: 'Q2' }]);
  });

  it('saves the visible text trimmed with the copilot metadata and bumps the session', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 4 });
    const now = new Date('2026-10-18T15:00:00Z');
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'How do I join?' }, emit,
      baseDeps(db, { model: modelSaying(`  You can join [1].  \n${META}`), now: () => now }));
    const a = db.inserted.find((i: any) => i.row.role === 'assistant').row;
    expect(a.content).toBe('You can join [1].');
    expect(a.session_id).toBe('s1');
    expect(a.metadata.copilot).toMatchObject({ cited: [1], related: 2, eventId: 'ev1', cta: { kind: 'join', url: 'https://buses.org/join' }, topic: 'membership', contact_requested: true });
    expect(db.inserted[0].row).toEqual({ session_id: 's1', role: 'user', content: 'How do I join?' });
    expect(db.updates[0].patch).toEqual({ last_response_id: 'resp_1', last_turn_at: now.toISOString(), message_count: 6 });
    expect(emitted.at(-1)).toEqual({ type: 'done', messageId: 'm2' });
  });

  it('keeps an incomplete answer (no META, so no cards)', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit,
      baseDeps(db, { model: modelSaying('You can join as a', { incomplete: true }) }));
    expect(visibleOf(emitted)).toBe('You can join as a');
    expect(emitted.find((e) => e.type === 'sources' || e.type === 'cta' || e.type === 'event')).toBeUndefined();
    expect(emitted.at(-1)).toMatchObject({ type: 'done' });
    expect(db.inserted.find((i: any) => i.row.role === 'assistant').row.content).toBe('You can join as a');
  });

  it('puts the new user message in the model input exactly once, even though it is saved first', async () => {
    const history = [{ role: 'assistant', content: 'A1', metadata: {} }, { role: 'user', content: 'Q1', metadata: {} }];
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 2, last_response_id: null }, { history });
    const deps = baseDeps(db);
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'Q2' }, emit, deps);
    const p = (deps.model as any).mock.calls[0][0];
    expect(p.input.filter((m: any) => m.content === 'Q2')).toHaveLength(1);
    expect(p.fallbackInput.filter((m: any) => m.content === 'Q2')).toHaveLength(1);
    expect(db.inserted[0].row).toMatchObject({ role: 'user', content: 'Q2' });
  });

  // ---- fallback and the chain ----

  const liveChain = () => ({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 2, last_response_id: 'resp_0', last_turn_at: new Date(Date.now() - 60_000).toISOString() });
  const twoTurns = [{ role: 'assistant', content: 'A1', metadata: {} }, { role: 'user', content: 'Q1', metadata: {} }];
  const fullHistoryInput = [{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' }, { role: 'user', content: 'Q2' }];

  it('always hands the model the self-contained history input for the fallback', async () => {
    const db = makeDb(liveChain(), { history: twoTurns });
    const deps = baseDeps(db, { now: () => new Date() });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'Q2' }, emit, deps);
    const p = (deps.model as any).mock.calls[0][0];
    expect(p.input).toEqual([{ role: 'user', content: 'Q2' }]);
    expect(p.fallbackInput).toEqual(fullHistoryInput);
  });

  it('a chained turn whose primary fails falls back on the history and drops the chain', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('primary down'))
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: 'Fallback answer.', usage: { input_tokens: 5, output_tokens: 2 } });
    const db = makeDb(liveChain(), { history: twoTurns });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'Q2' }, emit,
      baseDeps(db, { now: () => new Date(), model: (p: any) => streamCopilotModel(p, { responses: { create } }) }));
    expect(create.mock.calls[0][0]).toMatchObject({ previous_response_id: 'resp_0', input: [{ role: 'user', content: 'Q2' }] });
    expect(create.mock.calls[1][0].input).toEqual(fullHistoryInput);
    expect(create.mock.calls[1][0]).not.toHaveProperty('previous_response_id');
    expect(visibleOf(emitted)).toBe('Fallback answer.');
    expect(db.updates[0].patch.last_response_id).toBeNull();
    expect(db.updates[0].patch.message_count).toBe(4);
  });

  it('a chained turn answered by the primary keeps the new response id', async () => {
    const create = vi.fn(async () => ({ async *[Symbol.asyncIterator]() {
      yield { type: 'response.output_text.delta', delta: 'Primary answer.' };
      yield { type: 'response.completed', response: { id: 'resp_new', usage: { input_tokens: 5, output_tokens: 2 } } };
    } }));
    const db = makeDb(liveChain(), { history: twoTurns });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'Q2' }, emit,
      baseDeps(db, { now: () => new Date(), model: (p: any) => streamCopilotModel(p, { responses: { create } }) }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(db.updates[0].patch.last_response_id).toBe('resp_new');
  });

  it('stores a null chain when the model reports a fallback', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit,
      baseDeps(db, { model: modelSaying('Hi.', { responseId: 'resp_fb', fellBack: true } as any) }));
    expect(db.updates[0].patch.last_response_id).toBeNull();
  });

  // ---- empty answers and failures after the model ----

  it.each([
    ['META only', '<<META>>{"cited":[1]}<</META>>'],
    ['only a removed link', 'https://evil.example/pay\n<<META>>{"cited":[]}<</META>>'],
  ])('answers with a neutral sentence when the visible answer is empty (%s)', async (_l, text) => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit, baseDeps(db, { model: modelSaying(text) }));
    expect(visibleOf(emitted).trim()).toBe(EMPTY_ANSWER);
    expect(db.inserted.find((i: any) => i.row.role === 'assistant').row.content).toBe(EMPTY_ANSWER);
    expect(emitted.at(-1)).toMatchObject({ type: 'done', messageId: 'm2' });
  });

  it('still saves the answer, finishes and records cost once when the follow-up steps throw', async () => {
    const copilot: any = { ...assoc.config.copilot };
    Object.defineProperty(copilot, 'contact_trigger', { enumerable: true, get() { throw new Error('bad config'); } });
    const badAssoc = { ...assoc, config: { ...assoc.config, copilot } };
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const recordCost = vi.fn();
    const usage = [{ model: 'gpt-6-luna', inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 }];
    await runCopilotTurn({ tenant, assoc: badAssoc as any, visitor, sessionId: 's1', message: 'How do I join?' }, emit,
      baseDeps(db, { recordCost, escalate: vi.fn(async () => ({ escalated: false, reason: null, notified: 0, deduped: false })), model: modelSaying(`Join [1].\n${META}`, { usage }) }));
    expect(visibleOf(emitted)).toBe('Join [1].\n');
    expect(db.inserted.find((i: any) => i.row.role === 'assistant').row.content).toBe('Join [1].');
    expect(emitted).not.toContainEqual({ type: 'contact_request' });
    expect(emitted.at(-1)).toMatchObject({ type: 'done', messageId: 'm2' });
    expect(recordCost).toHaveBeenCalledTimes(1);
  });

  // ---- cost ----

  it('records cost from a successful turn', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const usage = [{ model: 'gpt-6-luna', inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 }];
    const recordCost = vi.fn();
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit,
      baseDeps(db, { model: modelSaying('Hi.', { usage }), recordCost }));
    expect(recordCost).toHaveBeenCalledTimes(1);
    expect(recordCost).toHaveBeenCalledWith({ accountId: 'acc', sessionId: 's1', usage });
  });

  it('records cost from a failed turn and saves nothing but the user message', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const usage = [{ model: 'gpt-6-luna', inputTokens: 10, cachedInputTokens: 0, outputTokens: 0 }];
    const recordCost = vi.fn();
    const recordEvents = vi.fn();
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit,
      baseDeps(db, { model: vi.fn(async () => { throw new CopilotModelError('down', usage); }), recordCost, recordEvents }));
    expect(recordCost).toHaveBeenCalledTimes(1);
    expect(recordCost).toHaveBeenCalledWith({ accountId: 'acc', sessionId: 's1', usage });
    expect(emitted.at(-1)).toEqual({ type: 'error', error: 'answer_unavailable' });
    expect(db.inserted.map((i: any) => i.row.role)).toEqual(['user']);
    expect(db.updates).toHaveLength(0);
    expect(recordEvents).not.toHaveBeenCalled();
  });

  // ---- escalation and contact ----

  it('escalates with the visitor label, config, uuid session id and prior user messages', async () => {
    const history = [{ role: 'assistant', content: 'A1', metadata: {} }, { role: 'user', content: 'this is ridiculous', metadata: {} }];
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 2 }, { history });
    const escalate = vi.fn(async () => ({ escalated: true, reason: 'Asked for a staff member', notified: 1, deduped: false }));
    const recordEvents = vi.fn();
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor: { ...visitor, name: 'Pat Smith', email: 'pat@x.com' }, sessionId: 's1', message: 'Let me speak to someone' }, emit,
      baseDeps(db, { escalate, recordEvents, model: modelSaying('I will connect you.') }));
    const arg = (escalate.mock.calls[0] as any)[0];
    expect(arg).toMatchObject({ accountId: 'acc', associationName: 'American Bus Association', sessionId: 's1', visitorLabel: 'Pat Smith', userMessage: 'Let me speak to someone', priorUserMessages: ['this is ridiculous'], config: assoc.config });
    expect(arg.transcript.at(-1)).toEqual({ role: 'assistant', content: 'I will connect you.' });
    expect(emitted).toContainEqual({ type: 'escalated' });
    const evs = (recordEvents.mock.calls[0] as any)[1];
    expect(evs).toContainEqual(expect.objectContaining({ type: 'escalated', payload: { reason: 'Asked for a staff member' }, sessionId: 's1', messageId: 'm2' }));
  });

  it('falls back to the email, then a generic label, and does not re-announce a deduped escalation', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const escalate = vi.fn(async () => ({ escalated: true, reason: 'r', notified: 0, deduped: true }));
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor: { ...visitor, email: 'pat@x.com' }, sessionId: 's1', message: 'q' }, emit, baseDeps(db, { escalate }));
    expect((escalate.mock.calls[0] as any)[0].visitorLabel).toBe('pat@x.com');
    expect(emitted.find((e) => e.type === 'escalated')).toBeUndefined();
    emitted = [];
    const esc2 = vi.fn(async () => ({ escalated: false, reason: null, notified: 0, deduped: false }));
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit, baseDeps(makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1' }), { escalate: esc2 }));
    expect((esc2.mock.calls[0] as any)[0].visitorLabel).toBe('Website visitor');
  });

  it('does not ask for contact twice or when the email is already known', async () => {
    const history = [{ role: 'assistant', content: 'A1', metadata: { copilot: { contact_requested: true } } }, { role: 'user', content: 'Q1', metadata: {} }];
    let db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 2 }, { history });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'How do I join?' }, emit, baseDeps(db, { model: modelSaying(`Join [1].\n${META}`) }));
    expect(emitted).not.toContainEqual({ type: 'contact_request' });
    emitted = [];
    db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor: { ...visitor, email: 'a@b.com' }, sessionId: 's1', message: 'How do I join?' }, emit, baseDeps(db, { model: modelSaying(`Join [1].\n${META}`) }));
    expect(emitted).not.toContainEqual({ type: 'contact_request' });
  });

  it('counts questions across the whole session, not the 10-row window', async () => {
    const cfg = { ...assoc, config: { ...assoc.config, copilot: { ...assoc.config.copilot, contact_trigger: { kind: 'after_n_questions', n: 8 } } } };
    const window = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: `m${i}`, metadata: {} }));
    let db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 14 }, { history: window });
    await runCopilotTurn({ tenant, assoc: cfg as any, visitor, sessionId: 's1', message: 'q' }, emit, baseDeps(db));
    expect(emitted).toContainEqual({ type: 'contact_request' });
    emitted = [];
    db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 12 }, { history: window });
    await runCopilotTurn({ tenant, assoc: cfg as any, visitor, sessionId: 's1', message: 'q' }, emit, baseDeps(db));
    expect(emitted).not.toContainEqual({ type: 'contact_request' });
  });

  it('does not ask again when an earlier request is outside the loaded window', async () => {
    let db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 30 }, { contactRow: true });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'How do I join?' }, emit, baseDeps(db, { model: modelSaying(`Join [1].\n${META}`) }));
    expect(emitted).not.toContainEqual({ type: 'contact_request' });
    const lookup = db.queries.find((q: any) => q.filters.some(([k]: any) => k === 'metadata->copilot->>contact_requested'));
    expect(lookup.filters).toEqual([['session_id', 's1'], ['role', 'assistant'], ['metadata->copilot->>contact_requested', 'true']]);
    emitted = [];
    db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 30 }, { contactRow: false });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'How do I join?' }, emit, baseDeps(db, { model: modelSaying(`Join [1].\n${META}`) }));
    expect(emitted).toContainEqual({ type: 'contact_request' });
  });

  // ---- member data ----

  it('gives the model member data only for a trusted identity source', async () => {
    const membership = { memberRef: 'M1', email: null, name: 'Pat', company: 'Acme Coaches', status: 'lapsed', type: null, renewalDate: null, registrations: [], fetchedAt: 'x' };
    for (const [source, shown] of [['ams_login', true], ['newsletter', true], ['ams_email', false], ['email_domain', false], ['external', false], [null, false]] as const) {
      const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
      const deps = baseDeps(db);
      await runCopilotTurn({ tenant, assoc: assoc as any, visitor: { ...visitor, identity_source: source, membership }, sessionId: 's1', message: 'q' }, emit, deps);
      const instructions: string = (deps.model as any).mock.calls[0][0].instructions;
      expect(instructions.includes('Acme Coaches')).toBe(shown);
    }
  });

  it('a typed-email identity (ams_email) with a membership snapshot puts no member data in the prompt', async () => {
    const membership = { memberRef: 'M1', email: 'pat@acme.com', name: 'Pat Quill', company: 'Acme Coaches', status: 'lapsed', type: 'Operator', renewalDate: '2026-11-15', registrations: [], fetchedAt: 'x' };
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const deps = baseDeps(db);
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor: { ...visitor, identity_source: 'ams_email', membership, name: 'Pat Quill', email: 'pat@acme.com' }, sessionId: 's1', message: 'q' }, emit, deps);
    const instructions: string = (deps.model as any).mock.calls[0][0].instructions;
    for (const leak of ['Pat Quill', 'Acme Coaches', 'lapsed', '2026-11-15']) expect(instructions).not.toContain(leak);
    // Presence check: the same snapshot IS shown for a verified login, so the absence above is real.
    const db2 = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const deps2 = baseDeps(db2);
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor: { ...visitor, identity_source: 'ams_login', membership }, sessionId: 's1', message: 'q' }, emit, deps2);
    expect((deps2.model as any).mock.calls[0][0].instructions).toContain('Acme Coaches');
  });

  // ---- events: past, off-site, excluded ----

  it('drops off-site events and does not let the model cite them', async () => {
    const offSite = [{ ...events[0], id: 'ev-off', url: 'https://evil.example/conf' }];
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const deps = baseDeps(db, { listEvents: vi.fn(async () => offSite), model: modelSaying('Come.\n<<META>>{"cited":[],"eventId":"ev-off","cta":{"kind":"event","url":"https://evil.example/conf"}}<</META>>') });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'events?' }, emit, deps);
    expect(emitted.find((e) => e.type === 'event' || e.type === 'cta')).toBeUndefined();
    expect((deps.model as any).mock.calls[0][0].instructions).not.toContain('evil.example');
  });

  it('drops every event when the association has no site hosts (fail closed)', async () => {
    const noSite = { ...assoc, config: { display_name: 'ABA', copilot: {} } };
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: noSite as any, visitor, sessionId: 's1', message: 'events?' }, emit,
      baseDeps(db, { model: modelSaying('Come.\n<<META>>{"cited":[],"eventId":"ev1"}<</META>>') }));
    expect(emitted.find((e) => e.type === 'event')).toBeUndefined();
  });

  it('accepts events on extra configured site hosts', async () => {
    const withHosts = { ...assoc, config: { ...assoc.config, copilot: { ...assoc.config.copilot, site_hosts: ['Events.Example.ORG', 42] } } };
    const ev = [{ ...events[0], id: 'ev-x', url: 'https://www.events.example.org/expo', registrationUrl: null }];
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: withHosts as any, visitor, sessionId: 's1', message: 'events?' }, emit,
      baseDeps(db, { listEvents: vi.fn(async () => ev), model: modelSaying('Come.\n<<META>>{"cited":[],"eventId":"ev-x"}<</META>>') }));
    expect(emitted).toContainEqual(expect.objectContaining({ type: 'event', item: expect.objectContaining({ id: 'ev-x' }) }));
  });

  it('drops an event on an excluded page and nulls an excluded registration link', async () => {
    const ev = [
      { ...events[0], id: 'ev-arch', url: 'https://buses.org/archive/2019-expo' },
      { ...events[0], id: 'ev-ok', url: 'https://buses.org/expo', registrationUrl: 'https://buses.org/archive/register' },
    ];
    let db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    let deps = baseDeps(db, { listEvents: vi.fn(async () => ev), model: modelSaying('Come.\n<<META>>{"cited":[],"eventId":"ev-arch"}<</META>>') });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'events?' }, emit, deps);
    expect(emitted.find((e) => e.type === 'event')).toBeUndefined();
    const instructions: string = (deps.model as any).mock.calls[0][0].instructions;
    expect(instructions).not.toContain('/archive');
    expect(instructions).toContain('id=ev-ok');

    emitted = [];
    db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    deps = baseDeps(db, { listEvents: vi.fn(async () => ev), model: modelSaying('Come.\n<<META>>{"cited":[],"eventId":"ev-ok","cta":{"kind":"event","url":"https://buses.org/archive/register"}}<</META>>') });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'events?' }, emit, deps);
    const card: any = emitted.find((e) => e.type === 'event');
    expect(card.item).toMatchObject({ id: 'ev-ok', registrationUrl: null });
    expect(emitted.find((e) => e.type === 'cta')).toBeUndefined();
  });

  it('never offers a past event even if the store returns one', async () => {
    const ev = [{ ...events[0], id: 'ev-past', startsOn: '2026-10-01', endsOn: '2026-10-03' }];
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'events?' }, emit,
      baseDeps(db, { listEvents: vi.fn(async () => ev), model: modelSaying('Come.\n<<META>>{"cited":[],"eventId":"ev-past"}<</META>>') }));
    expect(emitted.find((e) => e.type === 'event')).toBeUndefined();
  });

  it('asks the store for events from today in the association time zone', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const listEvents = vi.fn(async () => []);
    // 02:00 UTC on the 19th is still the 18th in New York
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit, baseDeps(db, { listEvents, now: () => new Date('2026-10-19T02:00:00Z') }));
    expect(listEvents).toHaveBeenCalledWith('acc', '2026-10-18');
  });

  // ---- sources ----

  it('never shows an excluded source even if retrieval returned it', async () => {
    const leaky = [{ n: 1, id: 'c0', title: 'Old', url: 'https://buses.org/archive/old', excerpt: 'secret', entityType: 'website' }, ...sources.map((s) => ({ ...s, n: s.n + 1 }))];
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const deps = baseDeps(db, { retrieveSources: vi.fn(async () => leaky), model: modelSaying('Join [1].\n<<META>>{"cited":[1],"related":2}<</META>>') });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit, deps);
    const instructions: string = (deps.model as any).mock.calls[0][0].instructions;
    expect(instructions).not.toContain('/archive/old');
    expect(instructions).toContain('[1] Membership');
    expect(emitted).toContainEqual({ type: 'sources', items: [{ n: 1, title: 'Membership', url: 'https://buses.org/membership/' }] });
    expect(emitted).toContainEqual({ type: 'related', item: { title: 'Marketplace', url: 'https://buses.org/marketplace/' } });
  });

  it('lists cited sources in citation order, skips ones without a URL, and records their URLs', async () => {
    const withDoc = [...sources, { n: 3, id: 'c3', title: 'Bylaws PDF', url: null, excerpt: 'z', entityType: 'document' }];
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const recordEvents = vi.fn();
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit,
      baseDeps(db, { retrieveSources: vi.fn(async () => withDoc), recordEvents, model: modelSaying('A [2][3][1].\n<<META>>{"cited":[2,3,1,9]}<</META>>') }));
    expect(emitted).toContainEqual({ type: 'sources', items: [
      { n: 2, title: 'Marketplace', url: 'https://buses.org/marketplace/' },
      { n: 1, title: 'Membership', url: 'https://buses.org/membership/' },
    ] });
    const evs = (recordEvents.mock.calls[0] as any)[1];
    expect(evs).toContainEqual(expect.objectContaining({ type: 'resource_shown', payload: { urls: ['https://buses.org/marketplace/', 'https://buses.org/membership/'] }, sessionId: 's1', messageId: 'm2' }));
    expect(evs).toContainEqual(expect.objectContaining({ type: 'question', payload: { length: 1 } }));
  });

  it('records renewal prompts and stays quiet about membership when neither applies', async () => {
    const renewAssoc = { ...assoc, config: { ...assoc.config, copilot: { ...assoc.config.copilot, links: { join: 'https://buses.org/join', renew: 'https://buses.org/renew' } } } };
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const recordEvents = vi.fn();
    await runCopilotTurn({ tenant, assoc: renewAssoc as any, visitor, sessionId: 's1', message: 'q' }, emit,
      baseDeps(db, { recordEvents, model: modelSaying('Renew.\n<<META>>{"cited":[],"cta":{"kind":"renew","url":"https://buses.org/renew"}}<</META>>') }));
    const types = (recordEvents.mock.calls[0] as any)[1].map((e: any) => e.type);
    expect(types).toContain('renewal_prompted');
    expect(types).not.toContain('membership_prompted');
    expect(types).not.toContain('escalated');
    expect(emitted).toContainEqual({ type: 'cta', kind: 'renew', url: 'https://buses.org/renew' });
  });

  it('does not fail the turn when interaction events throw', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit,
      baseDeps(db, { recordEvents: vi.fn(async () => { throw new Error('db down'); }), recordCost: vi.fn(() => { throw new Error('x'); }) }));
    expect(emitted.at(-1)).toMatchObject({ type: 'done', messageId: 'm2' });
  });

  // ---- link guard in the streamed answer ----

  async function visibleFor(modelText: string | string[], over: Record<string, any> = {}) {
    emitted = [];
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const model = Array.isArray(modelText) ? modelDeltas(modelText) : modelSaying(modelText);
    await runCopilotTurn({ tenant, assoc: (over.assoc ?? assoc) as any, visitor, sessionId: 's1', message: 'q' }, emit, baseDeps(db, { model, ...over }));
    return { visible: visibleOf(emitted), saved: db.inserted.find((i: any) => i.row.role === 'assistant')?.row.content as string };
  }

  it('removes an off-site URL from the visible answer and the saved message', async () => {
    const { visible, saved } = await visibleFor('See https://evil.example/pay now [1]');
    expect(visible).not.toContain('evil.example');
    expect(visible).toBe('See now [1]');
    expect(saved).toBe('See now [1]');
  });

  it('keeps a bare link to the association site', async () => {
    const { visible } = await visibleFor('Please visit buses.org/join today.');
    expect(visible).toBe('Please visit buses.org/join today.');
  });

  it('catches an off-site URL split across three deltas', async () => {
    const { visible } = await visibleFor(['Pay at htt', 'ps://evil.exa', 'mple/x today.']);
    expect(visible).not.toContain('evil');
    expect(visible).not.toContain('mple');
    expect(visible).toBe('Pay at today.');
  });

  it('catches a bare off-site domain split across deltas', async () => {
    const { visible } = await visibleFor(['Go to evi', 'l.co', 'm for more.']);
    expect(visible).toBe('Go to for more.');
  });

  it('removes a domain hidden behind a file-extension suffix', async () => {
    const { visible } = await visibleFor('Download evil.com.pdf and EVIL.COM.js now.');
    expect(visible.toLowerCase()).not.toContain('evil');
    expect(visible).toBe('Download and now.');
  });

  it('keeps an allowed off-site source URL and off-site join link, but nothing else off-site', async () => {
    const offSiteSources = [{ n: 1, id: 'c9', title: 'Partner guide', url: 'https://partner.example.net/guide', excerpt: 'x', entityType: 'document' }];
    const joinOff = { ...assoc, config: { ...assoc.config, copilot: { ...assoc.config.copilot, links: { join: 'https://aba.ams-vendor.example/join' } } } };
    const { visible } = await visibleFor('Read https://partner.example.net/guide, join at https://aba.ams-vendor.example/join, not https://partner.example.net/other.', { retrieveSources: vi.fn(async () => offSiteSources), assoc: joinOff });
    expect(visible).toBe('Read https://partner.example.net/guide, join at https://aba.ams-vendor.example/join, not .');
  });

  it('handles www, protocol-relative, upper-case, userinfo and look-alike hosts', async () => {
    const { visible } = await visibleFor('A www.evil.example/x B //evil.example/y C HTTPS://EVIL.EXAMPLE D https://buses.org@evil.example/ E https://buses.org.evil.example/ F https://www.buses.org/events G https://shop.buses.org/x H');
    expect(visible).toBe('A B C D E F https://www.buses.org/events G https://shop.buses.org/x H');
  });

  it('removes a link to an excluded page of the association site', async () => {
    const { visible } = await visibleFor('Old notes are at https://buses.org/archive/notes and buses.org/archive/x here.');
    expect(visible).toBe('Old notes are at and here.');
  });

  it('leaves ordinary text, e-mails, abbreviations and file names alone', async () => {
    const text = 'E-mail info@buses.org, e.g. version 3.5, Node.js and report.pdf, U.S. members.';
    const { visible } = await visibleFor(text);
    expect(visible).toBe(text);
  });

  it('never leaks META while guarding links at the end of the answer', async () => {
    const { visible } = await visibleFor(['Bye https://evil.ex', 'ample/z<<ME', 'TA>>{"cited":[]}<</META>>']);
    expect(visible).toBe('Bye ');
    expect(visible).not.toContain('<<');
  });
});

describe('createLinkGuard', () => {
  const guard = () => createLinkGuard({ siteHosts: ['buses.org'], allowedUrls: ['https://partner.example.net/guide'], exclusions: ['/archive'] });

  it('holds the trailing token until whitespace or end', () => {
    const g = guard();
    expect(g.push('Visit www.evil')).toBe('Visit ');
    // the removed link takes its following space with it, so no double space appears
    expect(g.push('.example now')).toBe('');
    expect(g.end()).toBe('now');
  });

  it('keeps on-site and allowed links, removes excluded and off-site ones', () => {
    const g = guard();
    const out = g.push('a https://buses.org/x b https://partner.example.net/guide c https://buses.org/archive/y d evil.example e ') + g.end();
    expect(out).toBe('a https://buses.org/x b https://partner.example.net/guide c d e ');
  });

  it('streams ordinary words as soon as whitespace follows', () => {
    const g = guard();
    expect(g.push('Hello there ')).toBe('Hello there ');
    expect(g.push('friend')).toBe('');
    expect(g.end()).toBe('friend');
  });
});
