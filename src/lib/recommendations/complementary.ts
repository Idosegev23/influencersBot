import OpenAI from 'openai';
import { redisGet, redisSet } from '@/lib/redis';

function getClient() { return new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); }
const MODEL = 'gpt-5-nano'; // small/fast — pick 2-3 complements, cached per product

export interface CatalogItem { id: string; name: string; nameHe?: string | null; category?: string | null; description?: string | null; }

export function buildComplementaryPrompt(product: CatalogItem, catalog: CatalogItem[]): { instructions: string; input: string } {
  const list = catalog.slice(0, 60).map((p) => `[id:${p.id}] ${p.nameHe || p.name}${p.category ? ' — ' + p.category : ''}`).join('\n');
  return {
    instructions: 'You pick complementary products (cross-sell) that pair well with the product the customer just added to cart. Choose ONLY from the numbered catalog by id. Prefer different categories that complete a routine/set. Return 2-3 ids, never the added product itself.',
    input: `Added product: [id:${product.id}] ${product.nameHe || product.name}\n\nCatalog:\n${list}`,
  };
}

export function parseComplementaryIds(outputText: string, catalogIds: string[], addedId?: string): string[] {
  let ids: unknown;
  try { ids = JSON.parse(outputText).ids; } catch { return []; }
  if (!Array.isArray(ids)) return [];
  const valid = new Set(catalogIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id === 'string' && valid.has(id) && id !== addedId && !seen.has(id)) { seen.add(id); out.push(id); }
    if (out.length >= 3) break;
  }
  return out;
}

export async function generateComplementaryProducts(accountId: string, product: CatalogItem, catalog: CatalogItem[]): Promise<CatalogItem[]> {
  const cacheKey = `wc:comp:${accountId}:${product.id}`;
  const cached = await redisGet<string[]>(cacheKey);
  const byId = new Map(catalog.map((p) => [p.id, p]));
  if (Array.isArray(cached)) return cached.map((id) => byId.get(id)).filter((p): p is CatalogItem => !!p);

  const { instructions, input } = buildComplementaryPrompt(product, catalog);
  let ids: string[] = [];
  try {
    const res = await getClient().responses.create({
      model: MODEL, instructions, input,
      text: { format: { type: 'json_schema', name: 'complements', strict: true,
        schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'], additionalProperties: false } } },
    });
    ids = parseComplementaryIds((res as any).output_text || '', catalog.map((p) => p.id), product.id);
  } catch (e) {
    console.error('[complementary] LLM error:', (e as any)?.message);
  }
  if (ids.length > 0) await redisSet(cacheKey, ids, 7 * 24 * 60 * 60);
  return ids.map((id) => byId.get(id)).filter((p): p is CatalogItem => !!p);
}
