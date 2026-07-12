import { describe, it, expect } from 'vitest';
import { claimDmMessage, formatContactLabel } from '@/lib/instagram-graph/dm-guards';

describe('claimDmMessage (atomic double-reply dedup)', () => {
  it('proceeds for missing / postback mids without touching redis', async () => {
    const deps = { redisAvailable: () => true, setNx: async () => false };
    expect(await claimDmMessage(undefined, deps)).toBe(true);
    expect(await claimDmMessage('postback_123', deps)).toBe(true);
  });

  it('fails open (proceeds) when redis is unavailable — never silences the bot', async () => {
    const deps = { redisAvailable: () => false, setNx: async () => false };
    expect(await claimDmMessage('mid_1', deps)).toBe(true);
  });

  it('first delivery proceeds, duplicate delivery of the same mid is skipped', async () => {
    const store = new Set<string>();
    const deps = {
      redisAvailable: () => true,
      setNx: async (k: string) => {
        if (store.has(k)) return false; // already claimed
        store.add(k);
        return true;
      },
    };
    expect(await claimDmMessage('mid_2', deps)).toBe(true); // winner
    expect(await claimDmMessage('mid_2', deps)).toBe(false); // duplicate → skip
    expect(await claimDmMessage('mid_3', deps)).toBe(true); // different mid → proceed
  });
});

describe('formatContactLabel (sender identity)', () => {
  it('combines name and @username', () => {
    expect(formatContactLabel({ name: 'Dana Levi', username: 'dana_ig' })).toBe('Dana Levi @dana_ig');
  });
  it('handles username-only and name-only', () => {
    expect(formatContactLabel({ username: 'brandx' })).toBe('@brandx');
    expect(formatContactLabel({ name: 'Some Brand' })).toBe('Some Brand');
  });
  it('returns null when nothing usable', () => {
    expect(formatContactLabel({})).toBeNull();
    expect(formatContactLabel(null)).toBeNull();
    expect(formatContactLabel({ name: '  ', username: '' })).toBeNull();
  });
});
