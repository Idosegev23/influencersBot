// src/lib/coupons/kb-scrub.ts
// Replaces every occurrence of the given terms with ███ across ALL string
// fields of a knowledge-base object, then drops posts that became mostly
// redaction noise. Extracted verbatim from sandwichBot's bannedTerms scrub so
// both banned-terms and invalid-coupon-code scrubbing share one implementation.

export function scrubTermsFromKB<T>(kb: T, terms: string[]): T {
  const clean = (terms || []).map(t => (t || '').trim()).filter(t => t.length >= 2);
  if (clean.length === 0) return kb;
  // Longest-first so multi-word terms match before their prefixes.
  clean.sort((a, b) => b.length - a.length);
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${clean.map(escapeRe).join('|')})`, 'gi');
  const scrub = (s: any): any => (typeof s === 'string' ? s.replace(re, '███') : s);
  const scrubObj = (o: any): any => {
    if (!o || typeof o !== 'object') return o;
    const out: any = Array.isArray(o) ? [] : {};
    for (const k of Object.keys(o)) {
      const v = (o as any)[k];
      if (typeof v === 'string') out[k] = scrub(v);
      else if (Array.isArray(v)) out[k] = v.map((it: any) => (typeof it === 'string' ? scrub(it) : scrubObj(it)));
      else if (v && typeof v === 'object') out[k] = scrubObj(v);
      else out[k] = v;
    }
    return out;
  };
  const scrubbed = scrubObj(kb) as any;
  const tooMuchRedaction = (s: any) => {
    if (typeof s !== 'string' || s.length === 0) return false;
    const blocks = (s.match(/███/g) || []).length;
    return (blocks * 3) / s.length > 0.4;
  };
  if (Array.isArray(scrubbed.posts)) {
    scrubbed.posts = scrubbed.posts.filter((p: any) => !tooMuchRedaction(p?.caption));
  }
  return scrubbed as T;
}
