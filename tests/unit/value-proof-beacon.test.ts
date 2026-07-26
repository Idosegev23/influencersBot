import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isAllowedEvent, eventCategory, eventSurface } from '@/lib/analytics/event-catalog';

describe('value-proof event wiring', () => {
  it('widget_conversion_detected is already an allowed conversion event', () => {
    // Reused deliberately: the beacon rides the existing widget_events pipeline,
    // so there is no new table, endpoint or ingest path.
    expect(isAllowedEvent('widget_conversion_detected')).toBe(true);
    expect(eventCategory('widget_conversion_detected')).toBe('conversion');
    expect(eventSurface('widget_conversion_detected')).toBe('widget');
  });

  it('dashboard_visit is an allowed session event', () => {
    expect(isAllowedEvent('dashboard_visit')).toBe(true);
    expect(eventCategory('dashboard_visit')).toBe('session');
  });

  it('widget.js emits the conversion beacon and accepts the host-page hook', () => {
    const src = readFileSync('public/widget.js', 'utf8');
    expect(src).toContain('widget_conversion_detected');
    expect(src).toContain('bestieai:order_placed');
    // Detection must be opt-in: with no hook and no configured pattern nothing
    // fires, so the assisted tier stays honestly empty rather than guessed at.
    expect(src).toContain('detectConversionFromPage');
  });
});
