import { describe, it, expect } from 'vitest';
import { buildInlinePayload } from '@/lib/widget/inline';

describe('buildInlinePayload', () => {
  it('is null for an account with no inline config', () => {
    expect(buildInlinePayload({}, { brandName: 'LDRS' })).toBeNull();
  });

  it('carries the resolved mount and its own banner', () => {
    const config = {
      widget: {
        banner: { headline: 'ספרו לי על המותג שלכם' },
        inline: { enabled: true, selector: '.content_home-c-hero', preset: 'hero' },
      },
    };
    const payload = buildInlinePayload(config, { brandName: 'LDRS' })!;
    expect(payload.selector).toBe('.content_home-c-hero');
    expect(payload.preset).toBe('hero');
    expect(payload.banner!.headline).toBe('ספרו לי על המותג שלכם');
    expect(payload.banner!.art.mode).toBe('host');
  });

  it('still mounts when the account has no banner copy at all', () => {
    // The host page supplies the headline on LDRS; a missing banner must not
    // stop the input from rendering.
    const config = { widget: { inline: { enabled: true, selector: '#x' } } };
    const payload = buildInlinePayload(config, { brandName: 'LDRS' })!;
    expect(payload.selector).toBe('#x');
    expect(payload.banner).toBeNull();
  });
});
