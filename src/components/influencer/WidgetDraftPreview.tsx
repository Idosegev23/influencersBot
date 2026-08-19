'use client';

import { useEffect, useRef, useState } from 'react';

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
}: {
  accountId: string;
  draft: unknown;
  view?: 'open' | 'teaser' | 'tooltip';
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  // Kept in a ref so the readiness listener can send the current draft the
  // moment the widget reports in, without re-subscribing on every keystroke.
  const latest = useRef<{ draft: unknown; view: string }>({ draft, view });
  latest.current = { draft, view };

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

  return (
    <iframe
      ref={ref}
      src={`/api/widget/preview/${accountId}`}
      className="h-[720px] w-full rounded-2xl border border-[#e5e5ea]"
      title="תצוגה מקדימה"
    />
  );
}
