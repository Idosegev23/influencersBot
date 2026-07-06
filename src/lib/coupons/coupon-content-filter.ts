// Detects coupon-code / coupon-offer content inside free text, for accounts
// with config.coupons_disabled. The invalid-code scrub in sandwichBot derives
// its term list from the `coupons` table — but for coupons_disabled accounts
// that table is empty, so codes that only live inside scraped content
// (post captions, reel transcriptions, highlight OCR — the Argania "einav"
// leak) sail straight past it. This filter catches them by PATTERN instead
// of by known code, so it needs no code registry.

const COUPON_CONTENT_PATTERNS: RegExp[] = [
  /קופון/, // any coupon mention (קופון, קופונים, לקופון...)
  /coupon/i,
  /קוד\s*הנחה/,
  /discount\s*code/i,
  /promo\s*code/i,
  // Hebrew "קוד" followed shortly by a Latin/digit code token:
  // "קוד einav", "בקוד YOVEL", "הקוד שלי einav25", "קוד: NEW".
  // (?![א-ת]) rejects longer words like "קודם"/"ברקודים" continuing in Hebrew.
  /קוד(?![א-ת])[^\n]{0,25}?\b[A-Za-z][A-Za-z0-9]{1,14}\b/,
  // English "code: NEW" / "CODE EINAV25"
  /\bcode\s*:?\s+[A-Za-z0-9]{2,15}\b/i,
];

export function containsCouponContent(text: string | null | undefined): boolean {
  if (!text) return false;
  return COUPON_CONTENT_PATTERNS.some((re) => re.test(text));
}

/**
 * Drops every knowledge-base item whose text carries coupon content, and
 * empties the structured coupons list. Whole-item removal (not redaction) is
 * deliberate: redacting just the code still leaves "יש לי הנחה מיוחדת עם
 * הקוד ███" priming the model to assert an offer it can't name.
 * Returns the filtered KB + how many items were dropped (for logging).
 */
export function stripCouponContentFromKB<T extends Record<string, any>>(
  kb: T
): { kb: T; dropped: number } {
  let dropped = 0;
  const keep = (text: string): boolean => {
    const hit = containsCouponContent(text);
    if (hit) dropped++;
    return !hit;
  };

  const out: any = { ...kb, coupons: [] };
  if (Array.isArray(out.posts)) {
    out.posts = out.posts.filter((p: any) => keep(String(p?.caption || '')));
  }
  if (Array.isArray(out.transcriptions)) {
    out.transcriptions = out.transcriptions.filter((t: any) =>
      keep([t?.text, ...(Array.isArray(t?.on_screen_text) ? t.on_screen_text : [])].join(' '))
    );
  }
  if (Array.isArray(out.highlights)) {
    out.highlights = out.highlights.filter((h: any) =>
      keep([h?.title, h?.content_text].filter(Boolean).join(' '))
    );
  }
  if (Array.isArray(out.websites)) {
    out.websites = out.websites.filter((w: any) =>
      keep([w?.title, w?.content].filter(Boolean).join(' '))
    );
  }
  if (Array.isArray(out.manualKnowledge)) {
    out.manualKnowledge = out.manualKnowledge.filter((m: any) =>
      keep([m?.title, m?.content].filter(Boolean).join(' '))
    );
  }
  if (Array.isArray(out.partnerships)) {
    out.partnerships = out.partnerships.filter((p: any) => keep(JSON.stringify(p || {})));
  }
  if (Array.isArray(out.insights)) {
    out.insights = out.insights.filter((i: any) => keep(JSON.stringify(i || {})));
  }
  return { kb: out as T, dropped };
}
