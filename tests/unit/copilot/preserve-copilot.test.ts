// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { preserveCopilot, withFreshCopilot } from '@/lib/copilot/preserve-copilot';
import { memoryDb } from './memory-db';

describe('preserveCopilot', () => {
  it('the fresh copilot object wins over the stale one being written', () => {
    const out = preserveCopilot({ copilot: { tone: 'new', branding: { primary: '#111' } } }, { username: 'aba', copilot: { tone: 'old' }, tabs: [1] });
    expect(out).toEqual({ username: 'aba', copilot: { tone: 'new', branding: { primary: '#111' } }, tabs: [1] });
  });
  it('no fresh copilot: the write is unchanged (non-copilot accounts are untouched)', () => {
    const next = { username: 'brand', tabs: [] };
    expect(preserveCopilot({ username: 'brand' }, next)).toBe(next);
    expect(preserveCopilot(null, next)).toBe(next);
    expect(preserveCopilot({ copilot: 'junk' }, next)).toBe(next);
  });
});

describe('withFreshCopilot', () => {
  it('re-reads the row right before the write and carries its copilot', async () => {
    const db = memoryDb({ accounts: [{ id: 'a1', config: { username: 'aba', copilot: { tone: 'saved mid-scan' } } }] });
    const out = await withFreshCopilot(db, 'a1', { username: 'aba', copilot: { tone: 'stale' }, scan_mode: 'full' });
    expect(out.copilot).toEqual({ tone: 'saved mid-scan' });
    expect(out.scan_mode).toBe('full');
  });
  it('a failed read leaves the write as it was', async () => {
    const db = memoryDb({ accounts: [] });
    db.failNext.push({ table: 'accounts', error: { message: 'down' } });
    const next = { copilot: { tone: 'x' } };
    expect(await withFreshCopilot(db, 'a1', next)).toBe(next);
  });
});
