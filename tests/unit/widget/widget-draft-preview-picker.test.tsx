import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
// The component exports `WidgetDraftPreview` as a NAMED export, not a
// default — there is no default export to import here.
import { WidgetDraftPreview } from '@/components/influencer/WidgetDraftPreview';

const PICK = {
  type: 'ibot:picked', selector: '.hero', label: 'div.hero', mode: 'into',
  reserve: { desktop: 480, mobile: 0 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'dark' },
};

function readyUp() {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'ibot:preview-ready' }, origin: window.location.origin,
    }));
  });
}

afterEach(() => cleanup());

describe('WidgetDraftPreview picker wiring', () => {
  it('hands a pick to onPick', async () => {
    const onPick = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPick={onPick} />);
    window.dispatchEvent(new MessageEvent('message', { data: PICK, origin: window.location.origin }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ selector: '.hero' })));
  });

  it('ignores a pick from another origin', async () => {
    const onPick = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPick={onPick} />);
    window.dispatchEvent(new MessageEvent('message', { data: PICK, origin: 'https://evil.example' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('ignores a malformed pick rather than passing it on', async () => {
    const onPick = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPick={onPick} />);
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'ibot:picked' }, origin: window.location.origin,
    }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onPick).not.toHaveBeenCalled();
  });

  // `reserve` is the picked element's own height, but the picker only ever
  // emits `mode: 'into'` — Bestie mounted INSIDE the target — so applying
  // that height as `reserve` (host.style.minHeight in mountInline()) would
  // double the element. This is the positive-path sibling to any assertion
  // that a raw/unsafe reserve never reaches a caller: it proves what DOES
  // reach onPick for the one mode the picker actually emits today.
  it('zeroes reserve for mode "into" but keeps the raw height as measured', async () => {
    const onPick = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPick={onPick} />);
    window.dispatchEvent(new MessageEvent('message', { data: PICK, origin: window.location.origin }));
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    const pick = onPick.mock.calls[0][0];
    expect(pick.mode).toBe('into');
    expect(pick.reserve).toEqual({ desktop: 0, mobile: 0 });
    expect(pick.measured).toEqual({ desktop: 480, mobile: 0 });
  });

  // Positive-path sibling for the down-channel: proves `ibot:picker` is
  // actually sent (not just that some other message isn't), once the frame
  // has announced readiness — the same gate the draft messages already use.
  it('tells the iframe to enter picker mode once ready, and to leave it when picking turns off', async () => {
    const posted: unknown[] = [];
    const { rerender } = render(<WidgetDraftPreview accountId="a" draft={{}} picking />);
    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });
    readyUp();
    await waitFor(() => expect(posted.some((m: any) => m?.type === 'ibot:picker' && m.on === true)).toBe(true));

    rerender(<WidgetDraftPreview accountId="a" draft={{}} picking={false} />);
    await waitFor(() => expect(posted.some((m: any) => m?.type === 'ibot:picker' && m.on === false)).toBe(true));
  });

  // WidgetDraftPreview already solved this exact problem for `draft`/`view`
  // via a `latest` ref (see the component's own comment on it) so the
  // readiness listener doesn't need to resubscribe on every keystroke. Task 4
  // will pass `onPick` as an inline arrow — a new identity on every render —
  // so the pick listener needs the same treatment: subscribe once, always
  // read the current callback out of a ref. Proves both halves in one test:
  // no extra `addEventListener('message', ...)` call across a rerender with
  // a fresh `onPick`, AND the fresh identity is the one that actually
  // receives the next pick (not the stale one from the first render) — a
  // "did not resubscribe" assertion alone could be satisfied by a listener
  // that also stopped delivering picks at all.
  it('does not resubscribe the message listener when onPick identity changes, and still delivers to the fresh identity', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <WidgetDraftPreview accountId="a" draft={{}} picking onPick={first} />,
    );
    const messageListenersAfterMount = addSpy.mock.calls.filter((c) => c[0] === 'message').length;

    rerender(<WidgetDraftPreview accountId="a" draft={{}} picking onPick={second} />);
    const messageListenersAfterRerender = addSpy.mock.calls.filter((c) => c[0] === 'message').length;
    expect(messageListenersAfterRerender).toBe(messageListenersAfterMount);

    window.dispatchEvent(new MessageEvent('message', { data: PICK, origin: window.location.origin }));
    await waitFor(() =>
      expect(second).toHaveBeenCalledWith(expect.objectContaining({ selector: '.hero' })),
    );
    expect(first).not.toHaveBeenCalled();

    addSpy.mockRestore();
  });

  // ── I3: the refusal channel ─────────────────────────────────────────────
  //
  // Before this existed, a pick the widget refused reached only our
  // diagnostics table. The dashboard showed nothing, the picker stayed armed,
  // and the click read as a broken UI.
  const FAILED = { type: 'ibot:pick-failed', label: 'h1' };

  it('hands a refusal to onPickFailed', async () => {
    const onPickFailed = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPickFailed={onPickFailed} />);
    window.dispatchEvent(new MessageEvent('message', { data: FAILED, origin: window.location.origin }));
    await waitFor(() => expect(onPickFailed).toHaveBeenCalledWith({ label: 'h1' }));
  });

  it('ignores a refusal from another origin', async () => {
    const onPickFailed = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPickFailed={onPickFailed} />);
    window.dispatchEvent(new MessageEvent('message', { data: FAILED, origin: 'https://evil.example' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onPickFailed).not.toHaveBeenCalled();
  });

  it('ignores a refusal whose label is not a string, rather than rendering it at the customer', async () => {
    const onPickFailed = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPickFailed={onPickFailed} />);
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'ibot:pick-failed', label: { toString: () => 'boom' } },
      origin: window.location.origin,
    }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onPickFailed).not.toHaveBeenCalled();
  });

  it('accepts a refusal with no label at all, reporting label null', async () => {
    // Absence of `label` is not a malformed message — the notice reads the
    // same without it. Paired with the rejection above so neither assertion
    // can pass on a listener that accepts (or drops) everything.
    const onPickFailed = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPickFailed={onPickFailed} />);
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'ibot:pick-failed' }, origin: window.location.origin,
    }));
    await waitFor(() => expect(onPickFailed).toHaveBeenCalledWith({ label: null }));
  });

  it('does not confuse a refusal with a pick, in either direction', async () => {
    const onPick = vi.fn();
    const onPickFailed = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPick={onPick} onPickFailed={onPickFailed} />);
    window.dispatchEvent(new MessageEvent('message', { data: FAILED, origin: window.location.origin }));
    await waitFor(() => expect(onPickFailed).toHaveBeenCalled());
    expect(onPick).not.toHaveBeenCalled();

    window.dispatchEvent(new MessageEvent('message', { data: PICK, origin: window.location.origin }));
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(onPickFailed).toHaveBeenCalledTimes(1);
  });

  // ── I5: the preview gate ────────────────────────────────────────────────

  it('asks the preview route for the ?bestie=1 view, so a preview mount renders here at all', async () => {
    // `inlinePreviewAllowed()` in public/widget.js reads `location.search`
    // inside the iframe. Without this param a mount stored as `enabled:
    // "preview"` — which is where EVERY fresh pick lands by design — never
    // rendered in the dashboard's own preview, while a live one did. The
    // route itself reads only `path`, so the param is inert server-side.
    render(<WidgetDraftPreview accountId="acc-7" draft={{}} />);
    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    // Both halves: the right account AND the preview flag. Asserting only
    // the flag would stay green on a src that lost the account id.
    expect(iframe.getAttribute('src')).toBe('/api/widget/preview/acc-7?bestie=1');
  });

  // Absence means today's behavior: a caller that never passes `picking` or
  // `onPick` must see no picker traffic at all. This is the sibling
  // assertion to the two "not called" tests above — proving the negative for
  // the *default* case rather than for a message that fails validation.
  it('sends no picker traffic when neither picking nor onPick is passed', async () => {
    const posted: unknown[] = [];
    render(<WidgetDraftPreview accountId="a" draft={{}} />);
    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });
    readyUp();
    await new Promise((r) => setTimeout(r, 50));
    expect(posted.some((m: any) => m?.type === 'ibot:picker')).toBe(false);
  });
});
