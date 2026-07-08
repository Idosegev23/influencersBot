// src/lib/pipeline/discover.ts
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
