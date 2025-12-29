import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { sanitizeHtml, sanitizeUrl } from '@/lib/sanitize';

// Check influencer authentication
async function checkAuth(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(`influencer_auth_${username}`);
  return authCookie?.value === 'authenticated';
}

// GET - List products for an influencer
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('influencer_id', influencer.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    return NextResponse.json({ products });
  } catch (error) {
    console.error('Get products error:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

// POST - Create a new product
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, name, brand, category, link, coupon_code, image_url } = body;

    if (!username || !name || !brand || !category || !link) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check authentication
    const isAuth = await checkAuth(username);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Sanitize inputs
    const sanitizedLink = sanitizeUrl(link);
    if (!sanitizedLink) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        influencer_id: influencer.id,
        name: sanitizeHtml(name),
        brand: sanitizeHtml(brand),
        category: sanitizeHtml(category),
        link: sanitizedLink,
        coupon_code: coupon_code ? sanitizeHtml(coupon_code).toUpperCase() : null,
        image_url: image_url ? sanitizeUrl(image_url) : null,
        is_manual: true,
        click_count: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
    }

    return NextResponse.json({ product });
  } catch (error) {
    console.error('Create product error:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}

// PUT - Update an existing product
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, productId, name, brand, category, link, coupon_code, image_url } = body;

    if (!username || !productId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check authentication
    const isAuth = await checkAuth(username);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Verify product belongs to this influencer
    const { data: existing } = await supabase
      .from('products')
      .select('influencer_id')
      .eq('id', productId)
      .single();

    if (!existing || existing.influencer_id !== influencer.id) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (name) updates.name = sanitizeHtml(name);
    if (brand) updates.brand = sanitizeHtml(brand);
    if (category) updates.category = sanitizeHtml(category);
    if (link) {
      const sanitizedLink = sanitizeUrl(link);
      if (!sanitizedLink) {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
      }
      updates.link = sanitizedLink;
    }
    if (coupon_code !== undefined) {
      updates.coupon_code = coupon_code ? sanitizeHtml(coupon_code).toUpperCase() : null;
    }
    if (image_url !== undefined) {
      updates.image_url = image_url ? sanitizeUrl(image_url) : null;
    }

    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update product error:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// DELETE - Delete a product
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const productId = searchParams.get('productId');

    if (!username || !productId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check authentication
    const isAuth = await checkAuth(username);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Verify product belongs to this influencer
    const { data: existing } = await supabase
      .from('products')
      .select('influencer_id')
      .eq('id', productId)
      .single();

    if (!existing || existing.influencer_id !== influencer.id) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete product error:', error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}

