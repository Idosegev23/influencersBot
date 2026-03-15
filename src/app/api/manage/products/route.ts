/**
 * CRUD /api/manage/products
 * Product catalog management for widget owners
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateManageSession } from '@/lib/manage/auth';

/**
 * GET — list products for the account
 * Query params: ?category=hair_care&series_id=xxx
 */
export async function GET(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const seriesId = searchParams.get('series_id');

    const supabase = await createClient();
    let query = supabase
      .from('widget_products')
      .select('id, name, name_he, description, price, original_price, category, subcategory, product_line, series_id, volume, volume_ml, key_ingredients, benefits, target_audience, image_url, product_url, is_available, is_on_sale, is_featured, priority, ai_profile, created_at, updated_at')
      .eq('account_id', session.accountId)
      .order('priority', { ascending: false })
      .order('name', { ascending: true });

    if (category) query = query.eq('category', category);
    if (seriesId) query = query.eq('series_id', seriesId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    // Also get series
    const { data: series } = await supabase
      .from('widget_product_series')
      .select('*')
      .eq('account_id', session.accountId)
      .order('name');

    return NextResponse.json({
      success: true,
      products: data || [],
      series: series || [],
      total: data?.length || 0,
    });
  } catch (error: any) {
    console.error('[ManageProducts] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST — manually add a product
 */
export async function POST(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, product_url } = body;
    if (!name || !product_url) {
      return NextResponse.json({ error: 'name and product_url are required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('widget_products')
      .insert({
        account_id: session.accountId,
        name: body.name,
        name_he: body.name_he || body.name,
        description: body.description || null,
        price: body.price || null,
        original_price: body.original_price || null,
        category: body.category || 'other',
        subcategory: body.subcategory || 'other',
        product_line: body.product_line || null,
        volume: body.volume || null,
        key_ingredients: body.key_ingredients || [],
        benefits: body.benefits || [],
        target_audience: body.target_audience || [],
        image_url: body.image_url || null,
        product_url,
        is_available: body.is_available !== false,
        is_on_sale: body.is_on_sale === true,
        is_featured: body.is_featured === true,
        priority: body.priority || 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to add product', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data });
  } catch (error: any) {
    console.error('[ManageProducts] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH — edit product
 * Body: { id, ...fields }
 */
export async function PATCH(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const allowedFields = [
      'name', 'name_he', 'description', 'price', 'original_price',
      'category', 'subcategory', 'product_line', 'volume', 'volume_ml',
      'key_ingredients', 'benefits', 'target_audience',
      'image_url', 'product_url', 'is_available', 'is_on_sale',
      'is_featured', 'priority', 'series_id',
    ];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('widget_products')
      .update(safeUpdates)
      .eq('id', id)
      .eq('account_id', session.accountId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data });
  } catch (error: any) {
    console.error('[ManageProducts] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE — remove product
 * Body: { id }
 */
export async function DELETE(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('widget_products')
      .delete()
      .eq('id', id)
      .eq('account_id', session.accountId);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[ManageProducts] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
