import { describe, it, expect } from 'vitest';
import { normalizeWidgetEvents, WIDGET_EVENT_TYPES } from '@/lib/analytics/widget-events';

const ACC = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1';

describe('normalizeWidgetEvents', () => {
  it('accepts known types and strips query string from path', () => {
    const { rows, rejected } = normalizeWidgetEvents(
      { anonId: 'aw_abcd', events: [{ type: 'page_view', path: '/p?token=secret', ts: 1 }] }, ACC);
    expect(rejected).toBe(0);
    expect(rows[0].path).toBe('/p');
    expect(rows[0].account_id).toBe(ACC);
  });
  it('rejects unknown event types', () => {
    const { rows, rejected } = normalizeWidgetEvents({ events: [{ type: 'evil_event' }] }, ACC);
    expect(rows.length).toBe(0); expect(rejected).toBe(1);
  });
  it('drops malformed anonId to null', () => {
    const { rows } = normalizeWidgetEvents({ anonId: 'x', events: [{ type: 'click' }] }, ACC);
    expect(rows[0].anon_id).toBeNull();
  });
  it('caps at 50 events', () => {
    const evs = Array.from({ length: 80 }, () => ({ type: 'click' }));
    const { rows } = normalizeWidgetEvents({ events: evs }, ACC);
    expect(rows.length).toBe(50);
  });
  it('clamps a clock-skewed future ts to ~now (poison-pill guard)', () => {
    const future = Date.now() + 5 * 365 * 86400000; // ~5 years ahead
    const { rows } = normalizeWidgetEvents({ events: [{ type: 'page_view', ts: future }] }, ACC);
    const createdMs = new Date(rows[0].created_at).getTime();
    expect(createdMs).toBeLessThanOrEqual(Date.now() + 3600000);
    expect(createdMs).toBeGreaterThan(Date.now() - 60000);
  });
  it('keeps an in-window recent ts as-is', () => {
    const recent = Date.now() - 2 * 60000; // 2 min ago
    const { rows } = normalizeWidgetEvents({ events: [{ type: 'click', ts: recent }] }, ACC);
    expect(new Date(rows[0].created_at).getTime()).toBe(recent);
  });
});
