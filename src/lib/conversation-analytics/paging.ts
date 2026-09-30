/**
 * Read a whole result set through PostgREST, which returns at most 1,000 rows
 * per response however large a `.limit()` is asked for. The caller's query
 * must carry a total order, or consecutive pages can repeat or drop rows.
 */

export const PAGE_SIZE = 1000;

export async function pageAll<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  maxRows = Infinity
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; out.length < maxRows; from += PAGE_SIZE) {
    const page = await fetchPage(from, from + PAGE_SIZE - 1);
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return out.length > maxRows ? out.slice(0, maxRows) : out;
}
