import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { 
  getInfluencerByUsername, 
  updateInfluencer,
  supabase 
} from '@/lib/supabase';
import { scrapeInstagramProfile } from '@/lib/apify';
import { analyzeAllPosts, extractRecipeFromPost } from '@/lib/openai';
import { uploadProfilePicture } from '@/lib/storage';
import type { ContentItem, Product } from '@/types';

const COOKIE_PREFIX = 'influencer_session_';

// Check influencer authentication
async function checkAuth(username: string): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(`${COOKIE_PREFIX}${username}`);
    
    // Debug log
    console.log(`Checking auth for ${username}:`, authCookie?.value);
    
    return authCookie?.value === 'authenticated';
  } catch (error) {
    console.error('Error checking auth:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Check authentication - also check admin session
    const cookieStore = await cookies();
    const adminCookie = cookieStore.get('admin_session');
    const isAdmin = adminCookie?.value === 'authenticated';
    
    const isAuth = await checkAuth(username);
    
    if (!isAuth && !isAdmin) {
      console.log(`Auth failed for ${username}. isAuth=${isAuth}, isAdmin=${isAdmin}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get influencer
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Scrape Instagram profile
    const { profile, posts } = await scrapeInstagramProfile(
      influencer.username,
      influencer.scrape_settings || { posts_limit: 50 }
    );

    // Analyze posts
    const postAnalysis = await analyzeAllPosts(posts);

    // Extract products
    const extractedProducts: Partial<Product>[] = [];
    const brandSet = new Set<string>();
    const couponSet = new Map<string, { code: string; brand: string }>();

    for (const [shortcode, data] of postAnalysis) {
      data.brands.forEach((brand) => brandSet.add(brand));
      
      data.coupons.forEach((coupon) => {
        couponSet.set(coupon.code, coupon);
      });

      const post = posts.find((p) => p.shortCode === shortcode);
      data.products.forEach((product) => {
        extractedProducts.push({
          name: product.name,
          brand: data.brands[0] || '',
          link: product.link,
          image_url: post?.displayUrl,
          is_manual: false,
        });
      });
    }

    // Add coupon products
    for (const [code, coupon] of couponSet) {
      const exists = extractedProducts.some((p) => p.coupon_code === code);
      if (!exists) {
        extractedProducts.push({
          name: `קופון ${coupon.brand}`,
          brand: coupon.brand,
          coupon_code: code,
          is_manual: false,
        });
      }
    }

    // Extract content items
    const contentItems: Partial<ContentItem>[] = [];

    if (influencer.influencer_type === 'food') {
      for (const post of posts.slice(0, 20)) {
        const recipe = await extractRecipeFromPost(post.caption);
        if (recipe) {
          contentItems.push({
            type: 'recipe',
            title: recipe.title,
            description: post.caption.slice(0, 200),
            content: {
              ingredients: recipe.ingredients,
              instructions: recipe.instructions,
            },
            image_url: post.displayUrl,
          });
        }
      }
    }

    // Delete old products and content (that were auto-extracted)
    await supabase
      .from('products')
      .delete()
      .eq('influencer_id', influencer.id)
      .eq('is_manual', false);

    await supabase
      .from('content_items')
      .delete()
      .eq('influencer_id', influencer.id);

    // Save new products
    if (extractedProducts.length > 0) {
      const productsToInsert = extractedProducts.map(p => ({
        influencer_id: influencer.id,
        name: p.name,
        brand: p.brand || null,
        link: p.link || null,
        coupon_code: p.coupon_code || null,
        image_url: p.image_url || null,
        is_manual: false,
      }));

      await supabase.from('products').insert(productsToInsert);
    }

    // Save new content items
    if (contentItems.length > 0) {
      const contentToInsert = contentItems.map(c => ({
        influencer_id: influencer.id,
        type: c.type,
        title: c.title,
        description: c.description || null,
        content: c.content || {},
        image_url: c.image_url || null,
      }));

      await supabase.from('content_items').insert(contentToInsert);
    }

    // Upload profile picture to our storage (to avoid Instagram blocking)
    let avatarUrl = profile.profilePicUrl;
    if (profile.profilePicUrl) {
      const uploadedUrl = await uploadProfilePicture(influencer.username, profile.profilePicUrl);
      if (uploadedUrl) {
        avatarUrl = uploadedUrl;
      }
    }

    // Update influencer metadata
    await updateInfluencer(influencer.id, {
      last_synced_at: new Date().toISOString(),
      followers_count: profile.followersCount,
      following_count: profile.followingCount,
      avatar_url: avatarUrl,
      bio: profile.biography,
    });

    return NextResponse.json({
      success: true,
      stats: {
        products: extractedProducts.length,
        content: contentItems.length,
        posts: posts.length,
      },
    });
  } catch (error) {
    console.error('Rescan error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Rescan failed' },
      { status: 500 }
    );
  }
}



