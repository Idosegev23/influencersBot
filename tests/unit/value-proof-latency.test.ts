import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { turnTimings } from '@/lib/analytics/value-proof/timings';

describe('turnTimings', () => {
  it('reports the elapsed milliseconds between receipt and completion', () => {
    const t = turnTimings(1_000_000, 1_004_500);
    expect(t.latencyMs).toBe(4500);
    expect(t.userCreatedAt).toBe(new Date(1_000_000).toISOString());
  });

  it('never produces a negative latency', () => {
    expect(turnTimings(1_004_500, 1_000_000).latencyMs).toBe(0);
  });

  it('stamps the user row at receipt, not at write time', () => {
    // The whole point: both rows are inserted together AFTER the turn completes,
    // so letting created_at default collapses the measurable gap to ~0.
    const received = Date.parse('2026-07-26T10:00:00.000Z');
    const completed = Date.parse('2026-07-26T10:00:06.200Z');
    const t = turnTimings(received, completed);
    expect(t.userCreatedAt).toBe('2026-07-26T10:00:00.000Z');
    expect(t.latencyMs).toBe(6200);
  });

  it('the widget chat handler stamps both the user row and the assistant latency', () => {
    const src = readFileSync('src/lib/chatbot/widget-chat-handler.ts', 'utf8');
    expect(src).toContain('turnTimings');
    expect(src).toContain('created_at: timings.userCreatedAt');
    expect(src).toContain('latency_ms: timings.latencyMs');
  });
});
