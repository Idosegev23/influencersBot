'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A validated `ibot:picked` message, handed to `onPick` once it has passed
 * origin and shape checks.
 *
 * `reserve` is what `mountInline()` in `public/widget.js` actually applies as
 * `host.style.minHeight`. The picker's raw measurement is the picked
 * element's OWN height — and since the picker only ever emits `mode: 'into'`
 * (Bestie mounted INSIDE the target), applying that raw height as `reserve`
 * would double the element's height (a 600px hero becomes 1200px). So for
 * `mode: 'into'` this component zeroes `reserve` before handing the pick
 * onward — a value that is wrong by construction should not travel as if it
 * were right — and carries the untouched measurement in `measured` so a
 * consumer can still show "this element is 480px tall" without it being
 * mistaken for something safe to save as-is.
 */
export interface InlinePick {
  selector: string;
  label: string;
  mode: 'into' | 'replace' | 'overlay';
  reserve: { desktop: number; mobile: number };
  measured: { desktop: number; mobile: number };
  theme: { font: string; accent: string | null; radius: number | null; ground: 'light' | 'dark' };
}

/**
 * The real widget, running in an iframe, driven by unsaved edits.
 *
 * Deliberately not a React re-implementation of the widget chrome. One of
 * those exists — `src/components/manage/WidgetPreview.tsx` — and it has
 * already drifted from `public/widget.js`: wrong cover height, wrong avatar
 * size, a hardcoded palette. Anything that redraws the widget by hand will
 * drift again the next time the widget changes.
 *
 * `draft` must already be in the shape `public/widget.js` reads off
 * `ibot:draft` messages: `{ banner: ResolvedBanner | null, invitation:
 * ResolvedInvitation, primaryColor: string | null }` — the same resolved
 * shape `/api/widget/config` returns, not the raw editable fields. The
 * caller resolves via `resolveBanner`/`resolveInvitation` before handing it
 * here, so an active scheduled override is reflected in preview exactly as
 * it will be in production.
 *
 * `view` picks what the iframe shows: `'open'` (default) force-opens the
 * chat panel, which is the only way to see the banner — but it also means
 * the invitation bubbles (teaser/tooltip) can never render, since both
 * early-return while the panel is open. `'teaser'` and `'tooltip'` instead
 * render the closed launcher and make widget.js explicitly invoke ONE
 * bubble renderer each — not both — so each field is independently
 * previewable despite the widget's own mutual-exclusion logic (teaser
 * always wins when both are invoked; see public/widget.js's `ibot:draft`
 * handler).
 */
export function WidgetDraftPreview({
  accountId,
  draft,
  view = 'open',
  path,
  picking,
  onPick,
  onPickFailed,
  previewTitle,
}: {
  accountId: string;
  /** iframe title, for screen readers. Supplied by the caller so it follows the
   *  account language rather than being pinned to Hebrew. */
  previewTitle?: string;
  draft: unknown;
  view?: 'open' | 'teaser' | 'tooltip';
  /**
   * Which page of the customer's site to preview. The route defaults to `/`,
   * and for a customer whose real site is not at `/` that is a different
   * website: LDRS serve an English global site at `/` and their actual Hebrew
   * site at `/he`. Previewing the default showed the wrong site, and a mount
   * picked there named an element that does not exist on the page it would
   * run on — which is exactly how the first pilot pick failed.
   */
  path?: string;
  /** Puts the iframe's widget into picker mode (Task 2's `ibot:picker`). */
  picking?: boolean;
  /** Called with a validated pick once the customer clicks an element. */
  onPick?: (pick: InlinePick) => void;
  /**
   * Called when the widget refuses a clicked element (`ibot:pick-failed`) —
   * no id or class chain on it, or on any of its ancestors, that the save path
   * would store. Carries the human label of what was clicked ("h1", "div.x")
   * or null when the message omitted one.
   *
   * Without this the refusal reaches nothing but our diagnostics table: the
   * picker stays armed, the dashboard shows no change, and the click reads as
   * a broken UI.
   */
  onPickFailed?: (info: { label: string | null }) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  // Kept in a ref so the readiness listener can send the current draft the
  // moment the widget reports in, without re-subscribing on every keystroke.
  const latest = useRef<{ draft: unknown; view: string }>({ draft, view });
  latest.current = { draft, view };
  // Same reasoning as `latest` above, for `onPick`: Task 4 passes an inline
  // arrow, a new function identity on every render, and this component
  // re-renders on a 180ms debounce throughout an editing session. Without
  // this ref, a dependency array of `[onPick]` would tear down and re-add
  // the `window` listener on nearly every keystroke.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onPickFailedRef = useRef(onPickFailed);
  onPickFailedRef.current = onPickFailed;

  // The widget posts `ibot:preview-ready` once its config request resolves.
  // Before this existed the editor could only guess, so it re-sent the same
  // draft every 400ms for four seconds — and since each post triggers a full
  // re-render inside the iframe, typing meant a re-render roughly twice a
  // second, forever. That was the flicker.
  useEffect(() => {
    const onReady = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (!ev.data || ev.data.type !== 'ibot:preview-ready') return;
      setReady(true);
      ref.current?.contentWindow?.postMessage(
        { type: 'ibot:draft', config: latest.current.draft, view: latest.current.view },
        window.location.origin,
      );
    };
    window.addEventListener('message', onReady);
    return () => window.removeEventListener('message', onReady);
  }, []);

  // One message per settled edit rather than one per keystroke. 180ms is
  // below the threshold where a preview stops feeling live, and collapses a
  // burst of typing into a single re-render.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      ref.current?.contentWindow?.postMessage(
        { type: 'ibot:draft', config: draft, view },
        window.location.origin,
      );
    }, 180);
    return () => clearTimeout(t);
  }, [draft, view, ready]);

  // Only a different account reloads the iframe, which is the one case where
  // the listener inside is replaced and readiness must fall back. Deliberately
  // NOT the iframe's `load` event: widget.js announces from a fetch callback,
  // which can resolve before `load` fires on a page with slow images, and
  // resetting after the announcement would strand the preview forever.
  useEffect(() => { setReady(false); }, [accountId]);

  // Tell the widget inside the iframe to enter or leave picker mode. Sent on
  // every change of `picking` once the frame has announced itself, the same
  // readiness gate the draft messages already use. `picking === undefined`
  // means the caller never opted into the picker at all — stay silent then,
  // so a caller that passes neither new prop sees no picker traffic and
  // behaves exactly as this component does today.
  useEffect(() => {
    if (!ready || picking === undefined) return;
    ref.current?.contentWindow?.postMessage(
      { type: 'ibot:picker', on: !!picking },
      window.location.origin,
    );
  }, [picking, ready]);

  // Receive the pick. Validated here rather than trusted: this listener is on
  // `window`, so anything on the page — not just the preview iframe — can
  // post to it. Subscribed once (empty deps) and reads `onPickRef.current`
  // rather than closing over `onPick` directly, for the reason in the
  // `onPickRef` comment above — an inline `onPick` arrow must not cause a
  // teardown/re-add of this listener on every render.
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (!onPickRef.current) return;
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || d.type !== 'ibot:picked') return;
      if (typeof d.selector !== 'string' || !d.selector) return;
      const mode: InlinePick['mode'] =
        d.mode === 'replace' || d.mode === 'overlay' ? d.mode : 'into';
      const measured = {
        desktop: Number(d.reserve?.desktop) || 0,
        mobile: Number(d.reserve?.mobile) || 0,
      };
      onPickRef.current({
        selector: d.selector,
        label: typeof d.label === 'string' ? d.label : d.selector,
        mode,
        // See the InlinePick doc comment: `into` appends inside the target,
        // so applying its own measured height as reserve would double it.
        reserve: mode === 'into' ? { desktop: 0, mobile: 0 } : measured,
        measured,
        theme: {
          font: 'inherit',
          accent: typeof d.theme?.accent === 'string' ? d.theme.accent : null,
          radius: Number.isFinite(d.theme?.radius) ? d.theme.radius : null,
          ground: d.theme?.ground === 'light' ? 'light' : 'dark',
        },
      });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Receive a refusal. Validated exactly like `ibot:picked` above and for the
  // same reason — this listener is on `window`, so anything on the page can
  // post to it — and subscribed once, reading the callback out of a ref.
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (!onPickFailedRef.current) return;
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || d.type !== 'ibot:pick-failed') return;
      // `label` is display copy. Absent is fine (the notice reads the same
      // without it); a non-string is a message we did not send, so drop it
      // rather than rendering `[object Object]` at the customer.
      if (d.label !== undefined && typeof d.label !== 'string') return;
      onPickFailedRef.current({ label: typeof d.label === 'string' ? d.label : null });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <iframe
      ref={ref}
      // `?bestie=1` is inert server-side — /api/widget/preview/[accountId]
      // reads only `path` — but inside the iframe it is what
      // `inlinePreviewAllowed()` in public/widget.js checks. Without it a
      // mount stored as `enabled: 'preview'` never rendered in the dashboard's
      // own preview, which is exactly where every fresh pick lands by design:
      // a LIVE mount was visible here and a PREVIEW one was not, backwards.
      src={
        `/api/widget/preview/${accountId}?bestie=1` +
        (path && path !== '/' ? `&path=${encodeURIComponent(path)}` : '')
      }
      className="h-[720px] w-full rounded-2xl border border-[#e5e5ea]"
      title={previewTitle ?? "Widget preview"}
    />
  );
}
