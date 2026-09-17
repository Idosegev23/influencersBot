import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Popups that mount on `document.body` may not depend on the widget's CSS
 * custom properties.
 *
 * `--ibot-*` is declared on `#ibot-widget-container` and nowhere else, so a
 * `var(--ibot-…)` used outside that subtree resolves to nothing — and an
 * unresolved var() invalidates the whole declaration at computed-value time
 * rather than falling back to the previous value. `background` becomes
 * transparent and `color` becomes inherit.
 *
 * That is not a subtle tint: ARGANIA's "goes great with it" popup rendered as
 * a shadow with no card behind it, the product page showing straight through
 * the product names, and its text picked up the host site's color. Two of the
 * three body-mounted surfaces already guarded against it with `var(--x, #fff)`
 * fallbacks; the third did not, and nothing was checking.
 */
describe('widget popups mounted outside #ibot-widget-container', () => {
  const src = readFileSync('public/widget.js', 'utf8');

  /** Each body-mounted surface, sliced from its function header to the append. */
  const SURFACES = [
    { what: 'the complementary-products popup', from: 'function showComplementPopup(' },
    { what: 'the invitation tooltip', from: 'function showBubbleTooltip(' },
    { what: 'the proactive teaser', from: 'function showProactiveTeaser(' },
  ];

  /** A var() with no comma, i.e. no fallback value. */
  const BARE_VAR = /var\(\s*--ibot-[a-z0-9-]+\s*\)/g;

  function sliceOf(from: string): string {
    const start = src.indexOf(from);
    expect(start, `${from} — marker not found; rename the test with the code`).toBeGreaterThan(-1);
    const end = src.indexOf('document.body.appendChild', start);
    expect(end, `${from} — no body mount found after it`).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  for (const { what, from } of SURFACES) {
    it(`${what} carries its own colors`, () => {
      const found = sliceOf(from).match(BARE_VAR) ?? [];
      expect(found, `${what} reads container-scoped tokens it cannot see`).toEqual([]);
    });
  }

  it('the gate is real — a bare token in one of those slices fails it', () => {
    // Without this, the checks above could pass because the markers drifted
    // and every slice came back empty.
    const slice = sliceOf('function showComplementPopup(');
    expect(slice.length).toBeGreaterThan(200);
    expect(`${slice}background:var(--ibot-panel-bg);`.match(BARE_VAR) ?? []).toHaveLength(1);
    // A fallback is the other accepted form, and must still pass.
    expect(`${slice}background:var(--ibot-panel-bg,#fff);`.match(BARE_VAR) ?? []).toEqual([]);
  });
});
