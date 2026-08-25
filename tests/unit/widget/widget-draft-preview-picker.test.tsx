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
