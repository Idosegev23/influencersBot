import { describe, it, expect } from 'vitest';
import { glowStops, resolveBanner } from '@/lib/widget/banner';

const CTX = { brandName: 'Argania', greeting: 'היי אני העוזרת של דניאל', subtitle: 'שאלו על מתכונים' };

describe('glowStops', () => {
  it('derives three hsl stops from a brand hex', () => {
    const stops = glowStops('#6366f1');
    expect(stops).toHaveLength(3);
    stops.forEach((s) => expect(s).toMatch(/^hsl\(\d+ \d+% \d+%\)$/));
  });

  it('clamps washed-out and near-black brand colors into a visible range', () => {
    for (const hex of ['#000000', '#ffffff', '#808080']) {
      for (const stop of glowStops(hex)) {
        const [, , s, l] = stop.match(/^hsl\((\d+) (\d+)% (\d+)%\)$/)!.map(Number);
        expect(s).toBeGreaterThanOrEqual(70);
        expect(s).toBeLessThanOrEqual(95);
        expect(l).toBeGreaterThanOrEqual(58);
        expect(l).toBeLessThanOrEqual(76);
      }
    }
  });

  it('expands 3-digit hex and tolerates a missing #', () => {
    expect(glowStops('63f')).toEqual(glowStops('#6633ff'));
  });

  it('falls back to the house purple for garbage input', () => {
    expect(glowStops('not-a-color')).toEqual(glowStops(''));
  });
});

describe('resolveBanner — the enable gate', () => {
  it('returns null when no banner is configured (today\'s behavior)', () => {
    expect(resolveBanner({}, 'widget', CTX)).toBeNull();
  });

  it('returns null when enabled is explicitly false, even with a headline', () => {
    const config = { widget: { banner: { enabled: false, headline: 'שלום' } } };
    expect(resolveBanner(config, 'widget', CTX)).toBeNull();
  });

  it('renders on the widget when a headline is present without an explicit enabled', () => {
    const config = { widget: { banner: { headline: 'שלום' } } };
    expect(resolveBanner(config, 'widget', CTX)?.headline).toBe('שלום');
  });

  it('does NOT render on the widget when enabled is absent and there is no headline', () => {
    const config = { widget: { banner: { art: { mode: 'gradient' } } } };
    expect(resolveBanner(config, 'widget', CTX)).toBeNull();
  });

  it('renders a generic headline when enabled is explicitly true but no headline was written', () => {
    const config = { widget: { banner: { enabled: true, art: { mode: 'gradient' } } } };
    expect(resolveBanner(config, 'widget', CTX)?.headline).toContain('Argania');
  });
});

describe('resolveBanner — surface fallback', () => {
  it('chat falls back to the widget banner as a whole object', () => {
    const config = {
      widget: { banner: { headline: 'כותרת ווידג׳ט', eyebrow: 'אייברו ווידג׳ט' } },
    };
    const chat = resolveBanner(config, 'chat', CTX);
    expect(chat?.headline).toBe('כותרת ווידג׳ט');
    expect(chat?.eyebrow).toBe('אייברו ווידג׳ט');
  });

  it('never merges field-by-field: a chat banner shadows the widget one entirely', () => {
    const config = {
      widget: { banner: { headline: 'כותרת ווידג׳ט', eyebrow: 'אייברו ווידג׳ט' } },
      chat: { banner: { headline: 'כותרת צ׳אט' } },
    };
    const chat = resolveBanner(config, 'chat', CTX);
    expect(chat?.headline).toBe('כותרת צ׳אט');
    expect(chat?.eyebrow).toBeNull();
  });

  it('a chat banner disabled explicitly does not fall back to the widget banner', () => {
    const config = {
      widget: { banner: { headline: 'כותרת ווידג׳ט' } },
      chat: { banner: { enabled: false } },
    };
    expect(resolveBanner(config, 'chat', CTX)).toBeNull();
  });

  it('widget never reads the chat banner', () => {
    const config = { chat: { banner: { headline: 'כותרת צ׳אט' } } };
    expect(resolveBanner(config, 'widget', CTX)).toBeNull();
  });
});

describe('resolveBanner — chat inherits the copy it already has', () => {
  it('uses greeting_message and chat_subtitle when the banner writes neither', () => {
    const config = { chat: { banner: { enabled: true, art: { mode: 'gradient' } } } };
    const chat = resolveBanner(config, 'chat', CTX);
    expect(chat?.headline).toBe('היי אני העוזרת של דניאל');
    expect(chat?.subline).toBe('שאלו על מתכונים');
  });

  it('an explicit banner headline wins over the greeting', () => {
    const config = { chat: { banner: { headline: 'המטבח של דניאל' } } };
    expect(resolveBanner(config, 'chat', CTX)?.headline).toBe('המטבח של דניאל');
  });

  it('renders on chat with no explicit enabled as long as a greeting exists', () => {
    const config = { chat: { banner: { art: { mode: 'gradient' } } } };
    expect(resolveBanner(config, 'chat', CTX)?.headline).toBe('היי אני העוזרת של דניאל');
  });

  it('the widget does not borrow the chat greeting', () => {
    const config = { widget: { banner: { art: { mode: 'gradient' } } } };
    expect(resolveBanner(config, 'widget', CTX)).toBeNull();
  });
});

describe('resolveBanner — art', () => {
  it('derives gradient stops from primaryColor when none are written', () => {
    const config = {
      widget: { banner: { headline: 'שלום' }, primaryColor: '#6366f1' },
    };
    const art = resolveBanner(config, 'widget', CTX)!.art;
    expect(art.mode).toBe('gradient');
    expect(art.from).toMatch(/^hsl\(/);
    expect(art.to).toMatch(/^hsl\(/);
    expect(art.from).not.toBe(art.to);
  });

  it('honors explicit gradient stops', () => {
    const config = {
      widget: { banner: { headline: 'שלום', art: { mode: 'gradient', from: '#111', to: '#222' } } },
    };
    const art = resolveBanner(config, 'widget', CTX)!.art;
    expect(art.from).toBe('#111');
    expect(art.to).toBe('#222');
  });

  it('falls back to the existing coverImage in image mode', () => {
    const config = {
      widget: { banner: { headline: 'שלום', art: { mode: 'image' } }, coverImage: 'https://cdn/x.jpg' },
    };
    expect(resolveBanner(config, 'widget', CTX)!.art.image).toBe('https://cdn/x.jpg');
  });

  it('drops back to gradient when image mode has no image anywhere', () => {
    const config = { widget: { banner: { headline: 'שלום', art: { mode: 'image' } } } };
    const art = resolveBanner(config, 'widget', CTX)!.art;
    expect(art.mode).toBe('gradient');
    expect(art.from).toMatch(/^hsl\(/);
  });

  it('keeps gradient stops alongside an image so the scrim always has a color', () => {
    const config = {
      widget: { banner: { headline: 'שלום', art: { mode: 'image', image: 'https://cdn/x.jpg' } } },
    };
    const art = resolveBanner(config, 'widget', CTX)!.art;
    expect(art.mode).toBe('image');
    expect(art.from).toMatch(/^hsl\(/);
  });
});

describe('resolveBanner — video art', () => {
  const reels = [
    { video: 'https://cdn/a.mp4', poster: 'https://cdn/a.jpg' },
    { video: 'https://cdn/b.mp4', poster: 'https://cdn/b.jpg' },
  ];

  it('returns every reel so the renderer can rotate between them', () => {
    const config = { chat: { banner: { headline: 'שלום', art: { mode: 'video', reels } } } };
    const art = resolveBanner(config, 'chat', CTX)!.art;
    expect(art.mode).toBe('video');
    expect(art.reels).toHaveLength(2);
    expect(art.reels![0]).toEqual({ video: 'https://cdn/a.mp4', poster: 'https://cdn/a.jpg' });
  });

  it('keeps gradient stops in video mode — they paint the box before the first frame', () => {
    const config = { chat: { banner: { headline: 'שלום', art: { mode: 'video', reels } } } };
    const art = resolveBanner(config, 'chat', CTX)!.art;
    expect(art.from).toMatch(/^hsl\(/);
  });

  it('drops reels with no video url', () => {
    const config = {
      chat: { banner: { headline: 'שלום', art: { mode: 'video', reels: [{ poster: 'https://cdn/a.jpg' }, ...reels] } } },
    };
    expect(resolveBanner(config, 'chat', CTX)!.art.reels).toHaveLength(2);
  });

  it('drops reels whose video url is not http(s) — config is not a script sink', () => {
    const config = {
      chat: { banner: { headline: 'שלום', art: { mode: 'video', reels: [{ video: 'javascript:alert(1)' }, ...reels] } } },
    };
    expect(resolveBanner(config, 'chat', CTX)!.art.reels).toHaveLength(2);
  });

  it('allows a reel with no poster — the gradient shows until the first frame', () => {
    const config = {
      chat: { banner: { headline: 'שלום', art: { mode: 'video', reels: [{ video: 'https://cdn/a.mp4' }] } } },
    };
    expect(resolveBanner(config, 'chat', CTX)!.art.reels![0].poster).toBeNull();
  });

  it('caps the rotation at five so config cannot balloon the payload', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ video: `https://cdn/${i}.mp4` }));
    const config = { chat: { banner: { headline: 'שלום', art: { mode: 'video', reels: many } } } };
    expect(resolveBanner(config, 'chat', CTX)!.art.reels).toHaveLength(5);
  });

  it('falls back to image mode when video mode has no usable reels', () => {
    const config = {
      widget: {
        banner: { headline: 'שלום', art: { mode: 'video', reels: [] } },
        coverImage: 'https://cdn/cover.jpg',
      },
    };
    const art = resolveBanner(config, 'widget', CTX)!.art;
    expect(art.mode).toBe('image');
    expect(art.image).toBe('https://cdn/cover.jpg');
  });

  it('falls all the way back to gradient when there is no video and no image', () => {
    const config = { widget: { banner: { headline: 'שלום', art: { mode: 'video' } } } };
    const art = resolveBanner(config, 'widget', CTX)!.art;
    expect(art.mode).toBe('gradient');
    expect(art.reels).toBeNull();
  });

  it('leaves reels null in gradient and image modes', () => {
    const config = { widget: { banner: { headline: 'שלום', art: { mode: 'gradient', reels } } } };
    expect(resolveBanner(config, 'widget', CTX)!.art.reels).toBeNull();
  });
});

describe('resolveBanner — copy limits and sanitation', () => {
  it('truncates over-long copy instead of letting it break the layout', () => {
    const config = {
      widget: {
        banner: {
          eyebrow: 'א'.repeat(80),
          headline: 'ב'.repeat(200),
          subline: 'ג'.repeat(300),
          valueLine: 'ד'.repeat(300),
        },
      },
    };
    const b = resolveBanner(config, 'widget', CTX)!;
    expect(b.eyebrow!.length).toBe(32);
    expect(b.headline.length).toBe(70);
    expect(b.subline!.length).toBe(110);
    expect(b.valueLine!.length).toBe(110);
  });

  it('treats whitespace-only copy as absent', () => {
    const config = { widget: { banner: { headline: 'שלום', eyebrow: '   ', subline: '' } } };
    const b = resolveBanner(config, 'widget', CTX)!;
    expect(b.eyebrow).toBeNull();
    expect(b.subline).toBeNull();
  });
});

describe('resolveBanner — cta', () => {
  it('keeps a prefill cta with its value', () => {
    const config = {
      widget: { banner: { headline: 'שלום', cta: { label: 'רוצה לשמוע', action: 'prefill', value: 'ספרו לי' } } },
    };
    expect(resolveBanner(config, 'widget', CTX)!.cta).toEqual({
      label: 'רוצה לשמוע', action: 'prefill', value: 'ספרו לי',
    });
  });

  it('drops a cta with no label', () => {
    const config = { widget: { banner: { headline: 'שלום', cta: { action: 'prefill', value: 'x' } } } };
    expect(resolveBanner(config, 'widget', CTX)!.cta).toBeNull();
  });

  it('drops a prefill cta with no value — a button that does nothing is worse than no button', () => {
    const config = { widget: { banner: { headline: 'שלום', cta: { label: 'לחצו', action: 'prefill' } } } };
    expect(resolveBanner(config, 'widget', CTX)!.cta).toBeNull();
  });

  it('drops a url cta whose value is not an http(s) url', () => {
    for (const value of ['javascript:alert(1)', 'ftp://x', 'not a url']) {
      const config = { widget: { banner: { headline: 'שלום', cta: { label: 'לחצו', action: 'url', value } } } };
      expect(resolveBanner(config, 'widget', CTX)!.cta).toBeNull();
    }
  });

  it('keeps a url cta pointing at https', () => {
    const config = {
      widget: { banner: { headline: 'שלום', cta: { label: 'לאתר', action: 'url', value: 'https://x.co/y' } } },
    };
    expect(resolveBanner(config, 'widget', CTX)!.cta!.action).toBe('url');
  });

  it('keeps a none-action cta as a plain non-interactive label', () => {
    const config = { widget: { banner: { headline: 'שלום', cta: { label: 'בקרוב', action: 'none' } } } };
    expect(resolveBanner(config, 'widget', CTX)!.cta).toEqual({ label: 'בקרוב', action: 'none', value: null });
  });

  it('defaults an unknown action to prefill rather than dropping the button', () => {
    const config = {
      widget: { banner: { headline: 'שלום', cta: { label: 'לחצו', action: 'teleport', value: 'שאלה' } } },
    };
    expect(resolveBanner(config, 'widget', CTX)!.cta!.action).toBe('prefill');
  });
});

describe('resolveBanner — starters', () => {
  it('returns a label with null items so the dynamic chips stay in charge', () => {
    const config = { widget: { banner: { headline: 'שלום', starters: { label: 'אפשר להתחיל מכאן' } } } };
    expect(resolveBanner(config, 'widget', CTX)!.starters).toEqual({ label: 'אפשר להתחיל מכאן', items: null });
  });

  it('passes through an explicit item list, capped at four', () => {
    const items = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'];
    const config = { widget: { banner: { headline: 'שלום', starters: { items } } } };
    expect(resolveBanner(config, 'widget', CTX)!.starters!.items).toEqual(['א', 'ב', 'ג', 'ד']);
  });

  it('is null when no starters block was written', () => {
    const config = { widget: { banner: { headline: 'שלום' } } };
    expect(resolveBanner(config, 'widget', CTX)!.starters).toBeNull();
  });
});
