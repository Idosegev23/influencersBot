import { describe, it, expect } from 'vitest';
import { parseKbFile } from '@/lib/bestie/kb-source';

const screenFile = `---
kind: screen
title: הגדרות הבוט
route: /influencer/[username]/chatbot-settings
---
כאן מדליקים ומכבים את הבוט בכל ערוץ.

**איך מכבים את הבוט בוואטסאפ:** לשונית ערוצים ← המתג "וואטסאפ פעיל".
`;

const commercialFile = `---
kind: commercial
title: מה בסטי עושה
---
בסטי עונה ללקוחות שלך בוואטסאפ, באינסטגרם ובאתר.
`;

describe('parseKbFile', () => {
  it('parses a screen entry including its route', () => {
    const entry = parseKbFile('chatbot-settings.md', screenFile);
    expect(entry.kind).toBe('screen');
    expect(entry.title).toBe('הגדרות הבוט');
    expect(entry.route).toBe('/influencer/[username]/chatbot-settings');
    expect(entry.id).toBe('chatbot-settings');
    expect(entry.body).toContain('וואטסאפ פעיל');
    expect(entry.body).not.toContain('---');
  });

  it('parses a commercial entry, which has no route', () => {
    const entry = parseKbFile('what-bestie-does.md', commercialFile);
    expect(entry.kind).toBe('commercial');
    expect(entry.route).toBeUndefined();
  });

  it('names the offending file when frontmatter is missing', () => {
    expect(() => parseKbFile('broken.md', 'just a body, no frontmatter'))
      .toThrow(/broken\.md/);
  });

  it('rejects an unknown kind', () => {
    const bad = `---\nkind: nonsense\ntitle: x\n---\nbody\n`;
    expect(() => parseKbFile('bad.md', bad)).toThrow(/kind/);
  });

  it('requires a route on a screen entry', () => {
    const bad = `---\nkind: screen\ntitle: x\n---\nbody\n`;
    expect(() => parseKbFile('bad.md', bad)).toThrow(/route/);
  });

  it('rejects an empty body — a title alone teaches nothing', () => {
    const bad = `---\nkind: commercial\ntitle: x\n---\n\n`;
    expect(() => parseKbFile('bad.md', bad)).toThrow(/body/);
  });
});
