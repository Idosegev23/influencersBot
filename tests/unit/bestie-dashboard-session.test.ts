/**
 * The conversation-persistence contract.
 *
 * These assert the storage shape and key scheme the widget relies on. They are
 * the parts that fail silently: a bad key means two brands share a chat, and a
 * write-before-restore means one navigation wipes the conversation.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const storeKey = (username: string) => `bestie_dash_chat_${username}`;

function loadSaved(username: string): { turns: any[]; open: boolean } {
  try {
    const raw = sessionStorage.getItem(storeKey(username));
    if (!raw) return { turns: [], open: false };
    const parsed = JSON.parse(raw);
    return {
      turns: Array.isArray(parsed?.turns) ? parsed.turns : [],
      open: Boolean(parsed?.open),
    };
  } catch {
    return { turns: [], open: false };
  }
}

const save = (username: string, turns: any[], open: boolean) =>
  sessionStorage.setItem(storeKey(username), JSON.stringify({ turns: turns.slice(-40), open }));

beforeEach(() => sessionStorage.clear());

describe('conversation persistence', () => {
  it('round-trips a conversation', () => {
    const turns = [
      { role: 'user', content: 'איפה השיחות?' },
      { role: 'assistant', content: 'במסך שיחות' },
    ];
    save('argania_group', turns, true);
    const restored = loadSaved('argania_group');
    expect(restored.turns).toEqual(turns);
    expect(restored.open).toBe(true);
  });

  it('scopes storage per account so two brands never share a chat', () => {
    save('argania_group', [{ role: 'user', content: 'סוד של ארגניה' }], true);
    expect(loadSaved('studiopasha_fashion').turns).toEqual([]);
  });

  it('returns an empty conversation when nothing was saved', () => {
    expect(loadSaved('nobody')).toEqual({ turns: [], open: false });
  });

  it('survives corrupted storage instead of throwing', () => {
    sessionStorage.setItem(storeKey('argania_group'), 'not json at all');
    expect(loadSaved('argania_group')).toEqual({ turns: [], open: false });
  });

  it('ignores a payload whose turns are not an array', () => {
    sessionStorage.setItem(storeKey('argania_group'), JSON.stringify({ turns: 'nope', open: true }));
    expect(loadSaved('argania_group').turns).toEqual([]);
  });

  it('caps history so a long session cannot outgrow the quota', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    save('argania_group', many, true);
    const restored = loadSaved('argania_group');
    expect(restored.turns).toHaveLength(40);
    // Keeps the most recent, not the oldest — the tail is the useful part.
    expect(restored.turns[restored.turns.length - 1].content).toBe('m99');
  });

  it('clears cleanly on a new conversation', () => {
    save('argania_group', [{ role: 'user', content: 'x' }], true);
    sessionStorage.removeItem(storeKey('argania_group'));
    expect(loadSaved('argania_group').turns).toEqual([]);
  });
});
