'use client';

import { useEffect, useRef } from 'react';

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
  const ready = useRef(false);

  useEffect(() => {
    const post = () => ref.current?.contentWindow?.postMessage(
      { type: 'ibot:draft', config: draft, view }, '*',
    );
    if (ready.current) post();
    // The widget only starts listening after its own config request resolves,
    // so the first draft is repeated briefly rather than sent once and lost.
    const t = setInterval(() => { if (ready.current) post(); }, 400);
    const stop = setTimeout(() => clearInterval(t), 4000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [draft, view]);

  return (
    <iframe
      ref={ref}
      onLoad={() => { ready.current = true; }}
      src={`/api/widget/preview/${accountId}`}
      className="h-[720px] w-full rounded-2xl border border-[#e5e5ea]"
      title="תצוגה מקדימה"
    />
  );
}
