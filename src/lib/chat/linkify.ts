/**
 * Make bare URLs in a bot reply clickable.
 *
 * The chat page renders replies with react-markdown and no GFM plugin, so only
 * `[text](url)` became a link. A bare URL stayed plain text: not clickable, and
 * a long one ran off a phone screen. Each bare URL becomes `[host](url)`;
 * markdown links and `<url>` autolinks are left as they are.
 */
const URL_RE = /(\]\(|\[|<)?(https?:\/\/[^\s<>\[\]]+)/g;
const TRAILING = /[.,;:!?'"»)]+$/;

export function linkifyBareUrls(text: string): string {
  if (!text || !text.includes('http')) return text;
  return text.replace(URL_RE, (match, prefix: string | undefined, raw: string) => {
    if (prefix) return match;

    let url = raw;
    let tail = '';
    const t = url.match(TRAILING);
    if (t) {
      tail = t[0];
      url = url.slice(0, -tail.length);
    }

    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return match;
    }
    return `[${host}](${url})${tail}`;
  });
}
