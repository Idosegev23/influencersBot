import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Ruling R8 (cross-task, pre-approved): vi.mock factories are hoisted above
// top-level const declarations, so mocks referenced from a factory must be
// declared via vi.hoisted() or the factory throws ReferenceError before any
// implementation runs. Assertions and test bodies are unchanged from the brief.
const { rpushMock, maybeSingleMock } = vi.hoisted(() => ({
  rpushMock: vi.fn().mockResolvedValue(1),
  maybeSingleMock: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ redisRPush: rpushMock }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) }) },
}));

import { sanitizeDiagnostic } from '@/lib/telemetry/diagnostics';
import { POST, OPTIONS } from '@/app/api/widget/diagnostics/route';
import { WIDGET_EVENT_TYPES } from '@/lib/analytics/widget-events';

describe('WIDGET_EVENT_TYPES', () => {
  it('accepts the three diagnostic types so they ride the existing drain', () => {
    expect(WIDGET_EVENT_TYPES.has('client_error')).toBe(true);
    expect(WIDGET_EVENT_TYPES.has('config_load_failed')).toBe(true);
    expect(WIDGET_EVENT_TYPES.has('csp_blocked')).toBe(true);
  });
});

describe('sanitizeDiagnostic', () => {
  it('keeps a well-formed report', () => {
    const out = sanitizeDiagnostic({
      type: 'client_error', message: 'x is not a function',
      stack: 'a\nb\nc\nd\ne', filename: 'https://bestie.app/widget.js',
      line: 42, widgetVersion: '4.0',
    });
    expect(out?.type).toBe('client_error');
    expect(out?.payload.message).toBe('x is not a function');
  });

  it('trims the stack to three frames', () => {
    const out = sanitizeDiagnostic({ type: 'client_error', message: 'm', stack: 'a\nb\nc\nd\ne' });
    expect(out?.payload.stack).toBe('a\nb\nc');
  });

  it('truncates a long message', () => {
    const out = sanitizeDiagnostic({ type: 'client_error', message: 'z'.repeat(5000) });
    expect((out?.payload.message as string).length).toBe(500);
  });

  it('rejects an unknown diagnostic type', () => {
    expect(sanitizeDiagnostic({ type: 'widget_opened', message: 'm' })).toBeNull();
  });

  it('keeps every inline-mount diagnostic type — "mount failure is never silent" depends on this allowlist', () => {
    const types = [
      'inline_mount_missing', 'inline_render_failed', 'inline_selector_invalid', 'inline_setup_failed',
      'inline_mount_failed',
    ];
    for (const type of types) {
      const out = sanitizeDiagnostic({ type, message: 'm' });
      expect(out?.type).toBe(type);
    }
  });

  it('keeps every inline-engagement diagnostic type — the hero conversation has no other trace', () => {
    // A send that throws inside the hero's composer leaves the conversation
    // silently unable to accept input; a type missing from the allowlist is
    // discarded by the route without a word, so this pairs the two.
    for (const type of ['inline_open_failed', 'inline_prefill_no_composer', 'inline_send_failed']) {
      const out = sanitizeDiagnostic({ type, message: 'm' });
      expect(out?.type).toBe(type);
    }
    // The paired presence/absence: this allowlist really does reject, so the
    // assertions above are not satisfied by a sanitizer that accepts anything.
    expect(sanitizeDiagnostic({ type: 'inline_send_exploded', message: 'm' })).toBeNull();
  });

  it('keeps every picker diagnostic type — an unregistered type is discarded silently', () => {
    for (const type of ['picker_no_stable_selector', 'picker_failed']) {
      const out = sanitizeDiagnostic({ type, message: 'div.hero' });
      expect(out?.type).toBe(type);
    }
  });

  it('rejects a report with no message', () => {
    expect(sanitizeDiagnostic({ type: 'client_error' })).toBeNull();
  });

  it('drops any field we did not ask for — no user text can smuggle through', () => {
    const out = sanitizeDiagnostic({
      type: 'client_error', message: 'm',
      chatText: 'my credit card is 4111 1111 1111 1111', cookie: 'session=abc',
    });
    expect(Object.keys(out!.payload).sort())
      .toEqual(['filename', 'line', 'message', 'stack', 'ua', 'widgetVersion'].sort());
  });
});

describe('POST /api/widget/diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingleMock.mockResolvedValue({ data: { id: 'acc-1' } });
  });

  it('buffers a valid report and returns 204', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/diagnostics', {
      method: 'POST',
      headers: { origin: 'https://argania-oil.co.il', 'content-type': 'text/plain' },
      body: JSON.stringify({ accountId: 'acc-1', type: 'client_error', message: 'boom' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(rpushMock).toHaveBeenCalledOnce();
  });

  it('rejects an unknown accountId without writing', async () => {
    maybeSingleMock.mockResolvedValue({ data: null });
    const req = new NextRequest('https://bestie.app/api/widget/diagnostics', {
      method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ accountId: 'nope', type: 'client_error', message: 'boom' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(204);          // never leak existence, never 500 the widget
    expect(rpushMock).not.toHaveBeenCalled();
  });

  it('rejects a payload over 2KB without writing', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/diagnostics', {
      method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ accountId: 'acc-1', type: 'client_error', message: 'z'.repeat(4000) }),
    });
    await POST(req);
    expect(rpushMock).not.toHaveBeenCalled();
  });

  it('returns 204 rather than 500 on malformed JSON', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/diagnostics', {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'not json',
    });
    expect((await POST(req)).status).toBe(204);
  });

  it('echoes the origin and sets Vary', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/diagnostics', {
      method: 'OPTIONS', headers: { origin: 'https://argania-oil.co.il' },
    });
    const res = await OPTIONS(req);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://argania-oil.co.il');
    expect(res.headers.get('vary')).toBe('Origin');
  });
});
