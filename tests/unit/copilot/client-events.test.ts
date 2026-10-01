import { describe, it, expect } from 'vitest';
import { sanitizeClientEvents } from '@/lib/copilot/client-events';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

describe('sanitizeClientEvents', () => {
  it('keeps allowed client events with whitelisted payload keys', () => {
    const r = sanitizeClientEvents([{ type: 'page_view', sessionId: UUID, payload: { url: 'https://buses.org/events', title: 'Events', secret: 'x' } }]);
    expect(r).toEqual({ events: [{ type: 'page_view', sessionId: UUID, payload: { url: 'https://buses.org/events', title: 'Events' } }], rejected: 0 });
  });
  it('drops a non-UUID sessionId but keeps the event', () => {
    const r = sanitizeClientEvents([{ type: 'page_view', sessionId: 's1', payload: { url: 'u' } }]);
    expect(r.rejected).toBe(0);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).not.toHaveProperty('sessionId');
  });
  it('refuses server-only types', () => {
    const r = sanitizeClientEvents([{ type: 'identified' }, { type: 'escalated' }, { type: 'link_clicked', payload: { target: 'https://x' } }]);
    expect(r.events.map((e) => e.type)).toEqual(['link_clicked']);
    expect(r.rejected).toBe(2);
  });
  it('caps the batch at 20 and truncates long strings', () => {
    const many = Array.from({ length: 25 }, () => ({ type: 'page_view', payload: { url: 'u'.repeat(900) } }));
    const r = sanitizeClientEvents(many);
    expect(r.events).toHaveLength(20);
    expect(r.rejected).toBe(5);
    expect((r.events[0].payload!.url as string).length).toBe(500);
  });
  it('treats non-arrays and junk entries as rejected', () => {
    expect(sanitizeClientEvents('nope')).toEqual({ events: [], rejected: 0 });
    expect(sanitizeClientEvents([null, 5, { payload: {} }]).rejected).toBe(3);
  });
});
