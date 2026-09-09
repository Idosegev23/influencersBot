import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CookieConsent from '@/components/CookieConsent';

/**
 * The incident: on /demo/<id> in incognito, clicking the chat bubble did nothing.
 *
 * CookieConsent is mounted in the ROOT layout, so it renders on the demo page
 * too. Its wrapper is `fixed bottom-0 left-0 right-0` — the FULL viewport width,
 * ~97px tall — while the visible card inside is only `max-w-5xl mx-auto`. The
 * transparent strip either side of that card still caught pointer events, so it
 * swallowed every click aimed at anything in a bottom corner: the widget bubble
 * on the demo, and the same dead strip on every other page while the banner is up.
 *
 * Incognito is why it looked account-specific — with no stored consent the
 * banner always renders; a returning visitor who already accepted never sees it.
 */
describe('CookieConsent does not swallow clicks outside its card', () => {
  it('lets pointer events through the full-width wrapper', async () => {
    const { container } = render(<CookieConsent />);
    // The banner only renders when consent is unset (true in a fresh jsdom),
    // and after a 1s anti-flash delay. If this never appears the test would be
    // asserting nothing, so wait for it explicitly rather than querying once.
    await waitFor(
      () => expect(container.querySelector('.fixed.bottom-0.left-0.right-0')).not.toBeNull(),
      { timeout: 3000 },
    );
    const wrapper = container.querySelector('.fixed.bottom-0.left-0.right-0')!;
    expect(wrapper.className).toContain('pointer-events-none');
  });

  it('still accepts clicks on the card itself', async () => {
    // Presence assertion beside the one above: a wrapper that blocks pointer
    // events everywhere would satisfy the first test and break the banner.
    render(<CookieConsent />);
    const accept = await screen.findByText(/אישור הכל|Accept all/i, {}, { timeout: 3000 });
    expect(accept.closest('.pointer-events-auto')).not.toBeNull();
  });
});
