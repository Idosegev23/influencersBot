import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createProduct, updateProduct, deleteProduct, getProductsByInfluencer } from '@/lib/supabase';

const COOKIE_NAME = 'influencerbot_admin_session';

async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  return session?.value === 'authenticated';
}

// GET products for an influencer
export async function GET(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const influencerId = req.nextUrl.searchParams.get('influencer_id');
    if (!influencerId) {
      return NextResponse.json({ error: 'Influencer ID required' }, { status: 400 });
    }

    const products = await getProductsByInfluencer(influencerId);
    return NextResponse.json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

// CREATE a new product
export async function POST(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      influencer_id,
      name,
      brand,
      category,
      link,
      short_link,
      coupon_code,
      image_url,
      source_post_id,
    } = body;

    if (!influencer_id || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const product = await createProduct({
      influencer_id,
      name,
      brand: brand || '',
      category: category || '',
      link: link || '',
      short_link: short_link || null,
      coupon_code: coupon_code || null,
      image_url: image_url || null,
      source_post_id: source_post_id || null,
      is_manual: true,
    });

    if (!product) {
      return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
    }

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}

// UPDATE a product
export async function PUT(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    const success = await updateProduct(id, updates);
    if (!success) {
      return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// DELETE a product
export async function DELETE(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    const success = await deleteProduct(id);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}









