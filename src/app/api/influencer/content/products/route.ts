import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// GET — list products for an account
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');
    const category = searchParams.get('category');

    if (!accountId) {
      return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
    }

    let query = supabase
      .from('widget_products')
      .select('id, name, name_he, description, price, original_price, currency, category, subcategory, product_line, volume, key_ingredients, benefits, target_audience, image_url, product_url, is_available, is_on_sale, is_featured, priority, ai_profile')
      .eq('account_id', accountId)
      .order('category')
      .order('name');

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    return NextResponse.json({ products: data || [], total: data?.length || 0 });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — add a product
export async function POST(req: NextRequest) {
  try {
    const { accountId, product } = await req.json();

    if (!accountId || !product?.name) {
      return NextResponse.json({ error: 'Missing accountId or product name' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('widget_products')
      .insert({
        account_id: accountId,
        name: product.name,
        name_he: product.name_he || product.name,
        description: product.description || null,
        price: product.price || null,
        category: product.category || 'general',
        subcategory: product.subcategory || null,
        product_line: product.product_line || null,
        image_url: product.image_url || null,
        product_url: product.product_url || null,
        is_available: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to add product', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data });
  } catch (error) {
    console.error('Error adding product:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH — update a product
export async function PATCH(req: NextRequest) {
  try {
    const { accountId, productId, updates } = await req.json();

    if (!accountId || !productId) {
      return NextResponse.json({ error: 'Missing accountId or productId' }, { status: 400 });
    }

    const allowedFields = [
      'name', 'name_he', 'description', 'price', 'original_price',
      'category', 'subcategory', 'product_line', 'volume',
      'key_ingredients', 'benefits', 'target_audience',
      'image_url', 'product_url', 'is_available', 'is_on_sale', 'is_featured', 'priority',
    ];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }

    const { data, error } = await supabase
      .from('widget_products')
      .update(safeUpdates)
      .eq('id', productId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data });
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — remove a product
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');
    const productId = searchParams.get('productId');

    if (!accountId || !productId) {
      return NextResponse.json({ error: 'Missing accountId or productId' }, { status: 400 });
    }

    const { error } = await supabase
      .from('widget_products')
      .delete()
      .eq('id', productId)
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
