import { describe, it, expect } from 'vitest';
import { resolveBanner, activeOverrides } from '@/lib/widget/banner';

const CTX = { brandName: 'LDRS' };

describe('the inline banner surface', () => {
  it('inherits the widget banner, as chat does', () => {
    const config = { widget: { banner: { headline: 'ספרו לי על המותג שלכם' } } };
    const b = resolveBanner(config, 'inline', CTX)!;
    expect(b.headline).toBe('ספרו לי על המותג שלכם');
  });

  it('forces art mode to host — the page behind us owns the background', () => {
    const config = {
      widget: { banner: { headline: 'x', art: { mode: 'gradient', from: '#111', to: '#222' } } },
    };
    expect(resolveBanner(config, 'inline', CTX)!.art.mode).toBe('host');
  });

  it('never returns a reel rotation on the inline surface', () => {
    // Two autoplaying videos in one hero is the failure this prevents.
    const config = {
      widget: { banner: { headline: 'x' } },
      reels: [{ video: 'https://example.com/a.mp4', poster: null }],
    };
    const art = resolveBanner(config, 'inline', CTX)!.art;
    expect(art.mode).toBe('host');
    expect(art.reels).toBeNull();
  });

  it('still gives the widget surface its own art, untouched', () => {
    const config = {
      widget: { banner: { headline: 'x', art: { mode: 'gradient', from: '#111', to: '#222' } } },
    };
    expect(resolveBanner(config, 'widget', CTX)!.art.mode).toBe('gradient');
  });

  it('an override written for the widget surface still applies to inline, since inline has none of its own', () => {
    const config = {
      widget: { banner: { headline: 'default headline' } },
      overrides: [{ surface: 'widget', headline: 'override headline' }],
    };
    expect(resolveBanner(config, 'inline', CTX)!.headline).toBe('override headline');
    expect(activeOverrides(config, 'inline').length).toBe(1);
  });
});
