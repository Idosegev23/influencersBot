import { describe, it, expect } from 'vitest';
import { linkifyBareUrls } from '@/lib/chat/linkify';

const DRIVE = 'https://drive.google.com/drive/folders/1biex5CvgGv5qt0KcioLJwqmpRTRhxGdk';

describe('linkifyBareUrls', () => {
  it('turns a bare URL into a markdown link labelled with its host', () => {
    // The chat page renders markdown without GFM, so a bare URL was plain,
    // unclickable text that ran off a phone screen.
    expect(linkifyBareUrls(`האמת שהכנתי לה סרטון 🎬\n${DRIVE}`)).toBe(
      `האמת שהכנתי לה סרטון 🎬\n[drive.google.com](${DRIVE})`,
    );
  });

  it('leaves markdown links alone', () => {
    const md = `[לצפייה בסרטון](${DRIVE})`;
    expect(linkifyBareUrls(md)).toBe(md);
    const urlAsText = `[${DRIVE}](${DRIVE})`;
    expect(linkifyBareUrls(urlAsText)).toBe(urlAsText);
  });

  it('leaves angle-bracket autolinks alone', () => {
    expect(linkifyBareUrls(`<${DRIVE}>`)).toBe(`<${DRIVE}>`);
  });

  it('keeps trailing punctuation outside the link', () => {
    expect(linkifyBareUrls('see https://example.com/a.')).toBe('see [example.com](https://example.com/a).');
    expect(linkifyBareUrls('(https://example.com/a)')).toBe('([example.com](https://example.com/a))');
  });

  it('drops a leading www from the label', () => {
    expect(linkifyBareUrls('https://www.argania.co.il/x')).toBe('[argania.co.il](https://www.argania.co.il/x)');
  });

  it('returns text without URLs unchanged', () => {
    expect(linkifyBareUrls('שלום, איך אפשר לעזור?')).toBe('שלום, איך אפשר לעזור?');
  });
});
