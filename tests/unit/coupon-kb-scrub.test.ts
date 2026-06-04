import { describe, it, expect } from 'vitest';
import { scrubTermsFromKB } from '@/lib/coupons/kb-scrub';

describe('scrubTermsFromKB', () => {
  it('replaces a known invalid code in a post caption with blocks', () => {
    const kb = { posts: [{ caption: 'מבצע ענק! קוד הנחה danielamit ל-70% הנחה' }] };
    const out = scrubTermsFromKB(kb, ['danielamit']);
    expect(out.posts[0].caption).not.toContain('danielamit');
    expect(out.posts[0].caption).toContain('███');
  });
  it('leaves text without the term untouched', () => {
    const kb = { posts: [{ caption: 'קוד קבוע ORTALAMAR' }] };
    const out = scrubTermsFromKB(kb, ['danielamit']);
    expect(out.posts[0].caption).toBe('קוד קבוע ORTALAMAR');
  });
  it('ignores terms shorter than 2 chars', () => {
    const kb = { websites: [{ text: 'a b c' }] };
    const out = scrubTermsFromKB(kb, ['a']);
    expect(out.websites[0].text).toBe('a b c');
  });
  it('drops a post that became >40% redaction noise', () => {
    const kb = { posts: [{ caption: 'hen hen hen hen' }] };
    const out = scrubTermsFromKB(kb, ['hen']);
    expect(out.posts.length).toBe(0);
  });
  it('returns kb unchanged when no usable terms', () => {
    const kb = { posts: [{ caption: 'x' }] };
    expect(scrubTermsFromKB(kb, [])).toEqual(kb);
  });
});
