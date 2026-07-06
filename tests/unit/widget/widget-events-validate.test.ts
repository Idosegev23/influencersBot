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
});
