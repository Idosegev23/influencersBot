// src/lib/pipeline/discover.ts
import { discoverSitemapUrls } from '@/lib/pipeline/sitemap';
import { chat } from '@/lib/openai';

export interface UrlGroup { pathPattern: string; count: number; sampleUrls: string[] }

export function groupUrlsByPath(urls: string[]): UrlGroup[] {
  const map = new Map<string, string[]>();
  for (const u of urls) {
    let path: string;
    try { path = new URL(u).pathname; } catch { continue; }
    const segs = path.split('/').filter(Boolean);
    const pattern = segs.length <= 1 ? '/' : `/${segs[0]}`;
    if (!map.has(pattern)) map.set(pattern, []);
    map.get(pattern)!.push(u);
  }
  return [...map.entries()]
    .map(([pathPattern, list]) => ({ pathPattern, count: list.length, sampleUrls: list.slice(0, 5) }))
    .sort((a, b) => b.count - a.count);
}

export interface Category {
  id: string;
  pathPattern: string;
  label: string;
  type: 'products' | 'articles' | 'info' | 'legal' | 'other';
  count: number;
  sampleUrls: string[];
}

const CATEGORY_TYPES: Category['type'][] = ['products', 'articles', 'info', 'legal', 'other'];

/**
 * One LLM call: map each URL group to a short Hebrew label + a type.
 * On any LLM/parse failure, falls back to label = pathPattern, type = 'other'.
 */
export async function labelCategories(groups: UrlGroup[]): Promise<Category[]> {
  const instructions = `אתה מקבל קבוצות URL מאתר. לכל קבוצה תן תווית קצרה בעברית וסוג.
סוגים אפשריים: products, articles, info, legal, other.
החזר JSON array בלבד, ללא טקסט נוסף: [{"pathPattern","label","type"}].`;
  const input = `קבוצות:\n${groups
    .map(g => `${g.pathPattern} (${g.count}) דוגמאות: ${g.sampleUrls.join(', ')}`)
    .join('\n')}`;

  const labels: Record<string, { label: string; type: Category['type'] }> = {};
  try {
    // chat() returns { response, responseId }; be robust to a plain-string mock too.
    const raw: any = await chat(instructions, input);
    const reply: string = typeof raw === 'string' ? raw : (raw?.response ?? '');
    const arr = JSON.parse(reply.replace(/```json|```/g, '').trim());
    if (Array.isArray(arr)) {
      for (const x of arr) {
        if (x && typeof x.pathPattern === 'string') {
          const type: Category['type'] = CATEGORY_TYPES.includes(x.type) ? x.type : 'other';
          labels[x.pathPattern] = { label: typeof x.label === 'string' && x.label ? x.label : x.pathPattern, type };
        }
      }
    }
  } catch {
    /* fall back to raw patterns below */
  }

  return groups.map(g => ({
    id: g.pathPattern,
    pathPattern: g.pathPattern,
    label: labels[g.pathPattern]?.label || g.pathPattern,
    type: labels[g.pathPattern]?.type || 'other',
    count: g.count,
    sampleUrls: g.sampleUrls,
  }));
}

/**
 * Discover a site's sitemap, group URLs by path segment, and AI-label the groups.
 * noSitemap: true + empty categories when the sitemap yields nothing.
 */
export async function discoverCategories(
  websiteUrl: string
): Promise<{ domain: string; noSitemap: boolean; categories: Category[] }> {
  const domain = new URL(websiteUrl).host;
  const urls = await discoverSitemapUrls(websiteUrl);
  if (!urls.length) return { domain, noSitemap: true, categories: [] };
  const categories = await labelCategories(groupUrlsByPath(urls));
  return { domain, noSitemap: false, categories };
}
