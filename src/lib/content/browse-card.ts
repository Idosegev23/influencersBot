/**
 * Cleaning for the cards in the chat page's topic tabs (/api/content/browse).
 *
 * The cards are built from RAG chunks, whose text is written for retrieval, not for
 * reading: a website chunk opens with "Title: <page title> - <site name>\nDescription: ..."
 * and a hotel's description is its street address, phone and booking email. Shown raw,
 * every card of a 340-property directory ended in " - Dominican Republic Tourism -
 * Official Website" and led with a phone number.
 *
 * Pure functions, no I/O, so the rules can be tested without a database.
 */

const SEPARATOR = /\s+[-|–—]\s+/;

/**
 * Strip the site name that every page title ends with.
 *
 * Inferred from the titles themselves rather than configured: a trailing segment shared
 * by most of the batch is the site's branding, not the page's name. Needs a batch of at
 * least three, since two titles agreeing proves nothing. Never strips a title down to
 * nothing — the original is kept if cleaning would leave it empty.
 */
export function cleanPageTitles(titles: string[]): string[] {
  if (titles.length < 3) return titles.map((t) => decodeEntities(t).trim());
  const parts = titles.map((t) => decodeEntities(t).trim().split(SEPARATOR));
  const threshold = Math.max(3, Math.ceil(titles.length * 0.6));

  // Peel one shared trailing segment at a time: "A - Dominican Republic - Dominican
  // Republic Tourism - Official Website" loses "Official Website", then the next, and so on.
  for (;;) {
    const counts = new Map<string, number>();
    for (const p of parts) {
      if (p.length < 2) continue;
      const last = p[p.length - 1];
      counts.set(last, (counts.get(last) || 0) + 1);
    }
    let shared: string | null = null;
    for (const [seg, n] of counts) if (n >= threshold) shared = seg;
    if (!shared) break;
    for (const p of parts) if (p.length >= 2 && p[p.length - 1] === shared) p.pop();
  }

  return parts.map((p, i) => {
    const cleaned = p.join(' - ').trim();
    return cleaned || decodeEntities(titles[i]).trim();
  });
}

/** Marker noise that transcripts and captions carry: [music], [carousel], ">>". */
const MARKERS = /\[(?:music|música|musica|applause|laughter|carousel|reel|video|image|photo)\]\s*/gi;

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * One readable line for a card.
 *
 * Website chunks lose their "Title:" line (the card already shows it) and the
 * "Description:" label, and lose contact details — an email, a URL or a phone number is
 * not what a traveller browsing a list wants to read. Posts and transcripts lose their
 * markers. Hebrew retrieval annotations are dropped for every type.
 */
export function cleanExcerpt(text: string, entityType: string, max = 120): string {
  let s = decodeEntities(text || '')
    .replace(/\[שאלות קשורות:.*?\]/g, '')
    .replace(/\[סיכום:.*?\]/g, '');

  if (entityType === 'website') {
    s = s
      .replace(/^\s*Title:[^\n]*\n?/i, '')
      .replace(/^\s*Description:\s*/i, '')
      .replace(/\bProduct:[\s\S]*$/i, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '')
      // Phone numbers only in their grouped shape (809-538-3434, +1 809 538 3434) — a bare
      // run of digits and dashes is as likely a date (2026-10-15) as a number.
      .replace(/(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g, '');
  }

  s = s
    .replace(MARKERS, '')
    .replace(/>>/g, '')
    .replace(/\s*\n+\s*/g, ' · ')
    .replace(/(?:\s*·\s*){2,}/g, ' · ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
