import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateComplementaryProducts } from '@/lib/recommendations/complementary';

export const runtime = 'nodejs';

function getCorsHeaders(origin: string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
}
export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: getCorsHeaders(req.headers.get('origin') || '*') });
}

export async function POST(req: NextRequest) {
  const cors = getCorsHeaders(req.headers.get('origin') || '*');
  try {
    const { accountId, productId, productName, sessionId } = await req.json();
    if (!accountId || (!productId && !productName)) {
      return NextResponse.json({ products: [] }, { headers: cors });
    }
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from('widget_products')
      .select('id, name, name_he, category, description, price, original_price, is_on_sale, image_url, product_url')
      .eq('account_id', accountId).eq('is_available', true)
      .order('priority', { ascending: false, nullsFirst: false });
    const catalog = (rows || []) as any[];
    // Resolve the added product from the catalog (by id, else fuzzy by name).
    const added = catalog.find((p) => p.id === productId)
      || catalog.find((p) => productName && (p.name === productName || p.name_he === productName))
      || { id: 'q:' + String(productName || productId || 'x').toLowerCase().replace(/\s+/g, '-').slice(0, 100), name: productName || 'product' };
    const picks = await generateComplementaryProducts(accountId, { id: added.id, name: added.name, nameHe: added.name_he, category: added.category, description: added.description }, catalog.map((p) => ({ id: p.id, name: p.name, nameHe: p.name_he, category: p.category })));
    const pickRows = picks.map((pk) => catalog.find((p) => p.id === pk.id)).filter(Boolean) as any[];

    // Log to widget_recommendations (strategy complementary_cart) for attribution.
    if (pickRows.length && sessionId) {
      await supabase.from('widget_recommendations').insert(pickRows.map((p, i) => ({
        account_id: accountId, session_id: sessionId, product_id: p.id, product_name: p.name,
        strategy: 'complementary_cart', conversation_context: `added:${added.id}`, position: i + 1,
      }))).then(() => {}, () => {});
    }
    const products = pickRows.map((p) => ({
      id: p.id, name: p.name_he || p.name, image: p.image_url,
      price: p.price, originalPrice: p.original_price, isOnSale: p.is_on_sale,
      productUrl: p.product_url,
    }));
    return NextResponse.json({ products }, { headers: cors });
  } catch {
    return NextResponse.json({ products: [] }, { headers: cors });
  }
}
