/**
 * Reading a link into an account's knowledge base.
 *
 * One function, used by both the "add a link" action and the nightly refresh,
 * so a page that is re-read a month later is turned into knowledge exactly the
 * way it was the first time.
 *
 * The page's OWN text is what gets stored, extracted with the same rules the
 * site crawl uses. Gemini's url tool was tried first and rejected on evidence:
 * asked to read buses.org it returned a Hebrew apology about being blocked by
 * bot protection, which is prose of a plausible length and would have been
 * stored as that page's knowledge — for an English-speaking customer.
 */
import { ingestDocument } from '@/lib/rag/ingest';
import { extractReadableText } from '@/lib/pipeline/crawl';
import { isSiteChallenged, startApifyCrawl, getApifyRunState, fetchApifyPages } from '@/lib/pipeline/apify-crawl';

export interface LinkReadResult {
  ok: boolean;
  title: string;
  content: string;
  error?: string;
}

/** Reject anything that is not an http(s) page before spending a model call. */
export function normalizeKnowledgeUrl(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // A bare hostname with no dot is a typo, not a site.
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** Plain fetch. Free, and enough for most pages. */
async function fetchDirect(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html') && !ct.includes('text')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Drive a real browser for one page, via the same transport the site crawl uses
 * for challenged sites. Gemini's url tool is not used here: asked to read
 * buses.org it came back with an apology about being blocked by bot protection,
 * and — because that apology is prose of a plausible length — it would have been
 * stored as the page's knowledge. This path is the one already proven to get
 * through that exact protection.
 */
async function fetchViaBrowser(url: string): Promise<string | null> {
  try {
    const handle = await startApifyCrawl(url, 1);
    // ~90s ceiling: a customer is waiting on this request.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const state = await getApifyRunState(handle.runId);
      if (state === 'failed') return null;
      const pages = await fetchApifyPages(handle.datasetId, 0, 1);
      if (pages.length > 0 && pages[0].html) return pages[0].html;
      if (state === 'succeeded') return null;
    }
    return null;
  } catch (err) {
    console.error('[link-ingest] browser fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fetch a page and shape it into a knowledge entry. Never throws.
 *
 * The page's OWN text is stored, extracted with the same rules the site crawl
 * uses, so a page added by hand reads the way the same page would if the
 * crawler had found it — and stays in its original language, which a
 * model-written summary would not.
 */
export async function readLink(url: string): Promise<LinkReadResult> {
  let html = await fetchDirect(url);

  // A bot challenge answers with a page, so "we got HTML" is not "we got the
  // content". Check before trusting it, and fall back to a real browser.
  if (!html || (await isSiteChallenged(url))) {
    const viaBrowser = await fetchViaBrowser(url);
    if (viaBrowser) html = viaBrowser;
  }

  if (!html) {
    return { ok: false, title: '', content: '', error: 'Could not reach that page' };
  }

  const { title, text } = extractReadableText(html);

  // A page we reached but got nothing readable from is a failure, not an empty
  // entry — storing a blank one would show a link in the dashboard that
  // silently contributes nothing to any answer.
  if (text.length < 120) {
    return { ok: false, title: '', content: '', error: 'That page has no readable text we can use' };
  }

  let fallbackTitle = url;
  try {
    fallbackTitle = new URL(url).pathname.replace(/\/+$/, '').split('/').pop() || url;
  } catch { /* keep the url */ }

  return {
    ok: true,
    title: (title || fallbackTitle).slice(0, 200),
    content: text.slice(0, 40000),
  };
}

/**
 * Index a knowledge row so the assistant can retrieve it.
 *
 * Shared with the typed-entry path: ingestDocument replaces by
 * (account, entityType, sourceId), so re-reading a link on refresh updates its
 * chunks in place rather than accumulating stale copies of the same page.
 */
export async function indexKnowledgeEntry(input: {
  accountId: string;
  entryId: string;
  title: string;
  content: string;
  knowledgeType?: string;
  sourceUrl?: string | null;
}): Promise<boolean> {
  try {
    await ingestDocument({
      accountId: input.accountId,
      entityType: 'knowledge_base',
      sourceId: input.entryId,
      title: input.title,
      text: input.content,
      metadata: {
        knowledgeType: input.knowledgeType || 'link',
        ...(input.sourceUrl ? { url: input.sourceUrl } : {}),
      },
    });
    return true;
  } catch (err) {
    console.error('[knowledge] indexing failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
