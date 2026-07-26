import { describe, it, expect } from 'vitest';
import { selectNudge } from '@/lib/bestie/nudges';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const now = new Date();

describe('selectNudge', () => {
  it('sends nothing before 24h have passed', () => {
    expect(selectNudge({ status: 'greeted', greeted_at: hoursAgo(3) } as any, now)).toBeNull();
    expect(selectNudge({ status: 'greeted', greeted_at: hoursAgo(23) } as any, now)).toBeNull();
  });

  it('sends the first nudge after 24h of silence', () => {
    expect(selectNudge({ status: 'greeted', greeted_at: hoursAgo(25) } as any, now)).toBe('nudge_24h');
  });

  it('does not repeat the first nudge', () => {
    expect(selectNudge(
      { status: 'greeted', greeted_at: hoursAgo(30), nudge_24h_at: hoursAgo(5) } as any, now
    )).toBeNull();
  });

  it('sends the second after 72h', () => {
    expect(selectNudge(
      { status: 'greeted', greeted_at: hoursAgo(80), nudge_24h_at: hoursAgo(55) } as any, now
    )).toBe('nudge_72h');
  });

  it('gives up after the second nudge goes unanswered', () => {
    expect(selectNudge(
      { status: 'greeted', greeted_at: hoursAgo(130), nudge_24h_at: hoursAgo(105), nudge_72h_at: hoursAgo(30) } as any,
      now
    )).toBe('give_up');
  });

  it('waits before giving up — silence right after a nudge is not a refusal', () => {
    expect(selectNudge(
      { status: 'greeted', greeted_at: hoursAgo(80), nudge_24h_at: hoursAgo(55), nudge_72h_at: hoursAgo(2) } as any,
      now
    )).toBeNull();
  });

  it('never nudges someone who replied', () => {
    expect(selectNudge(
      { status: 'engaged', greeted_at: hoursAgo(50), last_inbound_at: hoursAgo(40) } as any, now
    )).toBeNull();
  });

  it('never nudges someone already handed to sales', () => {
    expect(selectNudge({ status: 'handed_off', greeted_at: hoursAgo(200) } as any, now)).toBeNull();
  });

  it('never nudges a lead we could not message in the first place', () => {
    expect(selectNudge({ status: 'undeliverable', greeted_at: null } as any, now)).toBeNull();
    expect(selectNudge({ status: 'pending', greeted_at: null } as any, now)).toBeNull();
  });

  it('never nudges someone already marked unresponsive', () => {
    expect(selectNudge(
      { status: 'unresponsive', greeted_at: hoursAgo(300), nudge_24h_at: hoursAgo(280), nudge_72h_at: hoursAgo(200) } as any,
      now
    )).toBeNull();
  });
});
