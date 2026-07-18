/**
 * GET /api/chat/brands?username=...
 *
 * Brands + content for the public chat page. Unauthenticated by design — this
 * is the coupon/partnership strip that renders for anonymous visitors, so the
 * data here is already public-facing. What changed is the path: the page used
 * to call getBrandsByInfluencer() in the browser, which read partnerships and
 * coupons with the anon key and forced those tables to stay open.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getInfluencerByUsername,
  getBrandsByInfluencer,
  getContentByInfluencer,
} from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  try {
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const [brands, content] = await Promise.all([
      getBrandsByInfluencer(influencer.id),
      getContentByInfluencer(influencer.id),
    ]);

    return NextResponse.json({ brands, content });
  } catch (error) {
    console.error('[chat/brands] GET error:', error);
    return NextResponse.json({ error: 'Failed to load brands' }, { status: 500 });
  }
}
