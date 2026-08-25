import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import { WidgetDraftPreview, type InlinePick } from '@/components/influencer/WidgetDraftPreview';
import { mountFromPick, inlineForPost } from '@/lib/widget/inline-draft';
import { resolveInlineMount } from '@/lib/widget/inline';
import { bootWidget } from './helpers/boot-widget';

/**
 * The seam nobody has proven end to end.
 *
 * Every earlier task tested its own boundary against a hand-written fixture:
 * `picker-mode.test.ts` proves what `public/widget.js` posts, given a
 * hand-typed `ibot:picked` message; `widget-draft-preview-picker.test.tsx`
 * proves `WidgetDraftPreview`'s wiring, given a hand-typed `ibot:picked`
 * message; `inline-draft.test.ts` proves `mountFromPick`/`inlineForPost`
 * round-trip through `resolveInlineMount`, given a hand-typed `InlinePick`.
 * Three hand copies of the same shape, and nothing checks that any one
 * stage's *real* output is accepted by the next stage's *real* input.
 *
 * This file closes that gap by never hand-typing the picked payload at all:
 * it boots the actual served `public/widget.js` (the same harness
 * `picker-mode.test.ts` uses), clicks a real element, and feeds the message
 * it actually posts into the actual `WidgetDraftPreview` component, whose
 * actual `onPick` output is then fed into the actual `mountFromPick` /
 * `inlineForPost` / `resolveInlineMount` chain. If any field name, shape, or
 * default drifted between stages, this is what goes red — nothing here is
 * restated by hand.
 */

// `border-top-left-radius` rather than the `border-radius` shorthand: jsdom's
// CSS engine does not expand the shorthand into individual computed
// longhands (verified directly against jsdom — `getComputedStyle` reports an
// empty `borderTopLeftRadius` for a shorthand-only rule), which would make
// `pickerSampleTheme`'s radius sample come back `null` regardless of whether
// the picker actually reads it correctly. `picker-mode.test.ts`'s HERO
// fixture hits the same limitation and simply never asserts radius; this
// file needs to, so it uses the longhand instead.
const HERO = '<section class="hero"><div class="content_home-c-hero">' +
  '<h1>We Turn Brands Into Leaders</h1>' +
  '<a class="btn" href="#" style="border-top-left-radius:8px;background:#4c3e5e">בואו נדבר</a>' +
  '</div></section>';

afterEach(() => cleanup());

/**
 * Boots the real widget.js in picker mode, clicks the hero, and returns the
 * exact `ibot:picked` message it posts — not a restatement of that shape.
 *
 * jsdom's `getBoundingClientRect()` is all zeros, which would make `reserve`/
 * `measured` pass through the whole chain at `{0,0}` whether or not they were
 * actually carried — indistinguishable from a stage that silently drops them.
 * Stubbing a distinct, non-zero rect on the hero (same technique
 * `inline-engage.test.ts` uses) makes the height a real value this test can
 * catch going missing.
 */
async function realPickedMessage(): Promise<any> {
  await bootWidget({ html: HERO, config: { inline: null }, preview: true });
  const hero = document.querySelector('.content_home-c-hero') as HTMLElement;

  const originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this === hero) {
      return { left: 0, top: 0, width: 800, height: 748, right: 800, bottom: 748, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    return originalRect.call(this);
  };

  const seen: any[] = [];
  const originalPost = window.parent.postMessage.bind(window.parent);
  (window.parent as any).postMessage = (m: any, o: any) => { seen.push(m); return originalPost(m, o); };

  try {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'ibot:picker', on: true }, origin: window.location.origin }));
    hero.click();
  } finally {
    Element.prototype.getBoundingClientRect = originalRect;
  }

  const picked = seen.find((m) => m?.type === 'ibot:picked');
  if (!picked) throw new Error('fixture is broken: public/widget.js did not emit ibot:picked for the hero click');
  return picked;
}

/** Renders WidgetDraftPreview and returns the InlinePick it hands to onPick for `wireMessage`. */
async function pickVia(wireMessage: unknown): Promise<InlinePick> {
  let captured: InlinePick | null = null;
  render(
    React.createElement(WidgetDraftPreview, {
      accountId: 'a',
      draft: {},
      picking: true,
      onPick: (p: InlinePick) => { captured = p; },
    }),
  );
  window.dispatchEvent(new MessageEvent('message', { data: wireMessage, origin: window.location.origin }));
  await waitFor(() => expect(captured).not.toBeNull());
  return captured as unknown as InlinePick;
}

describe('a picked mount survives the round trip, hop by hop through the real code at each seam', () => {
  it('what public/widget.js posts is what resolveInlineMount stores, by way of the real WidgetDraftPreview + mountFromPick + inlineForPost', async () => {
    const wireMessage = await realPickedMessage();

    // Pin the wire message itself first, so a failure further down is legible
    // as "stage N broke the shape" rather than "the fixture never produced
    // what I assumed it would."
    expect(wireMessage.selector).toBe('.content_home-c-hero');
    expect(wireMessage.mode).toBe('into');
    expect(wireMessage.reserve).toEqual({ desktop: 748, mobile: 0 });
    expect(wireMessage.theme).toEqual({ font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'light' });

    const pick = await pickVia(wireMessage);
    // `into` measures the target's own height as `measured` but must not
    // apply it as `reserve` (see InlinePick's doc comment — that would double
    // the element). This is where that zeroing actually happens in the real
    // chain, not asserted in isolation.
    expect(pick.reserve).toEqual({ desktop: 0, mobile: 0 });
    expect(pick.measured).toEqual({ desktop: 748, mobile: 0 });

    const draft = mountFromPick(pick, null);
    const posted = inlineForPost(draft);
    const stored = resolveInlineMount({ widget: { inline: posted } });

    expect(stored).toEqual({
      enabled: 'preview',
      selector: '.content_home-c-hero',
      paths: null,
      mode: 'into',
      preset: 'hero',
      surface: 'bare',
      reserve: { desktop: 0, mobile: 0 },
      theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'light' },
      bubble: 'after-scroll',
    });
  });

  it('a picked `label` never reaches storage — it is display-only, alongside `measured`', async () => {
    const wireMessage = await realPickedMessage();
    const pick = await pickVia(wireMessage);
    // The real WidgetDraftPreview always sets `label` on the pick (falling
    // back to `selector` when the wire message omits it) — proving the strip
    // happens downstream, not that label never arrived in the first place.
    expect(pick.label).toBeTruthy();

    const draft = mountFromPick(pick, null);
    expect(draft.label).toBe(pick.label);
    const posted = inlineForPost(draft) as Record<string, unknown>;
    expect(posted).not.toHaveProperty('label');
    expect(posted).not.toHaveProperty('measured');

    const stored = resolveInlineMount({ widget: { inline: posted } })!;
    expect('label' in stored).toBe(false);
    expect('measured' in stored).toBe(false);
  });

  it('an unsafe pick cannot round-trip even if a client forges it', async () => {
    // Not routed through the real picker DOM logic — `pickerUnsafe()` already
    // refuses to let a click on <body> reach this message at all (see
    // picker-mode.test.ts's "refuses to pick body, html or head"). This
    // simulates the message arriving anyway: `WidgetDraftPreview`'s listener
    // is on `window`, reachable by anything on the page, not only the trusted
    // iframe — so it must not be the thing standing between a forged
    // `ibot:picked` and storage.
    const forged = {
      type: 'ibot:picked',
      selector: 'body',
      label: 'body.home-page',
      mode: 'replace',
      reserve: { desktop: 600, mobile: 0 },
      theme: { font: 'inherit', accent: '#000000', radius: 4, ground: 'dark' },
    };

    const pick = await pickVia(forged);
    // WidgetDraftPreview itself does not gate on selector safety — proving
    // the earlier stages let this through is the point: the guarantee has to
    // live somewhere, and this test is here to prove where.
    expect(pick.selector).toBe('body');

    const draft = mountFromPick(pick, null);
    const posted = inlineForPost(draft);
    expect(resolveInlineMount({ widget: { inline: posted } })).toBeNull();
  });
});
