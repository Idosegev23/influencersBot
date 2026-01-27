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
import { requireAuth } from '@/lib/auth/api-helpers';
import { ApifyClient } from 'apify-client';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

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

    // Scrape Instagram profile (posts + reels)
    console.log(`📸 Scraping Instagram for @${influencer.username}...`);
    
    // Initialize Apify client
    const apify = new ApifyClient({
      token: process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN!,
    });

    // 1. Scrape posts
    const postsLimit = influencer.scrape_settings?.posts_limit || 50;
    const postsInput = {
      directUrls: [`https://www.instagram.com/${influencer.username}/`],
      resultsType: 'posts',
      resultsLimit: postsLimit,
      searchType: 'user',
      searchLimit: 1,
      addParentData: true,
    };

    const postsRun = await apify.actor('apify/instagram-scraper').call(postsInput);
    const { items: postsItems } = await apify.dataset(postsRun.defaultDatasetId).listItems();
    const posts = postsItems.filter((item: any) => item.shortCode && item.caption);
    
    console.log(`✅ Found ${posts.length} posts with text`);

    // 2. Scrape reels
    let reels: any[] = [];
    try {
      const reelsInput = {
        username: [influencer.username],
        resultsLimit: 30,
      };
      const reelsRun = await apify.actor('apify/instagram-reel-scraper').call(reelsInput);
      const { items: reelsItems } = await apify.dataset(reelsRun.defaultDatasetId).listItems();
      reels = reelsItems.filter((item: any) => item.caption || item.videoTranscript);
      console.log(`✅ Found ${reels.length} reels with text`);
    } catch (error) {
      console.warn('⚠️ Reels scraping failed:', error);
    }

    // 3. Combine content
    const allContent = [
      ...posts.map((p: any) => ({ ...p, contentType: 'post' })),
      ...reels.map((r: any) => ({ ...r, contentType: 'reel' })),
    ];

    // Get profile info from first post's parent data
    const profile = postsItems[0]?.ownerUsername ? {
      username: postsItems[0].ownerUsername,
      followersCount: postsItems[0].ownerFollowersCount || influencer.followers_count,
      followingCount: postsItems[0].ownerFollowingCount || influencer.following_count,
      profilePicUrl: postsItems[0].ownerProfilePicUrl || influencer.avatar_url,
      biography: postsItems[0].ownerFullName || influencer.bio,
    } : null;

    // 4. Analyze with Gemini 3 Pro (or fallback to OpenAI)
    console.log(`🤖 Analyzing content...`);
    let postAnalysis;
    
    if (process.env.GOOGLE_AI_API_KEY) {
      // Use Gemini 3 Pro
      postAnalysis = await analyzeWithGemini3Pro(allContent, influencer.display_name);
    } else {
      // Fallback to OpenAI (legacy)
      postAnalysis = await analyzeAllPosts(posts as any);
    }

    // Extract brands and coupons from analysis
    const brandSet = new Set<string>();
    const couponSet = new Map<string, { code: string; brand: string; discount?: string }>();
    const extractedProducts: Partial<Product>[] = [];

    for (const [shortcode, data] of postAnalysis) {
      // Handle both legacy format and new format
      const brands = data.brands || [];
      const coupons = data.coupons || [];
      const products = data.products || [];

      brands.forEach((brand: string) => brandSet.add(brand));
      
      coupons.forEach((coupon: any) => {
        couponSet.set(coupon.code, { 
          code: coupon.code, 
          brand: coupon.brand,
          discount: coupon.discount 
        });
      });

      const post = posts.find((p: any) => p.shortCode === shortcode);
      products.forEach((product: any) => {
        extractedProducts.push({
          name: product.name,
          brand: brands[0] || product.brand || '',
          link: product.link,
          image_url: (post?.displayUrl as string) || undefined,
          is_manual: false,
        });
      });
    }

    // Save partnerships (brands)
    const partnershipIds = new Map<string, string>();
    for (const brandName of brandSet) {
      const { data: partnership } = await supabase
        .from('partnerships')
        .upsert({
          account_id: influencer.id,
          brand_name: brandName,
          category: 'Auto',
          brief: `זוהה אוטומטית מאינסטגרם`,
          is_active: true,
          status: 'active',
        }, { onConflict: 'account_id,brand_name' })
        .select()
        .single();
      
      if (partnership) {
        partnershipIds.set(brandName, partnership.id);
      }
    }

    // Save coupons
    for (const [code, coupon] of couponSet) {
      const partnershipId = partnershipIds.get(coupon.brand);
      if (partnershipId) {
        const discountValue = coupon.discount?.match(/\d+/)?.[0];
        await supabase
          .from('coupons')
          .upsert({
            partnership_id: partnershipId,
            account_id: influencer.id,
            code: code,
            discount_type: coupon.discount?.includes('%') ? 'percentage' : 'fixed',
            discount_value: discountValue ? parseFloat(discountValue) : 10,
            description: `קופון ${coupon.brand}${coupon.discount ? ` - ${coupon.discount}` : ''}`,
            is_active: true,
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          }, { onConflict: 'partnership_id,code' });
      }

      // Also add to products (backward compatibility)
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

    // Create/update chatbot persona
    const topBrands = Array.from(brandSet).slice(0, 3);
    await supabase
      .from('chatbot_persona')
      .upsert({
        account_id: influencer.id,
        name: `העוזר של ${influencer.display_name}`,
        tone: 'friendly',
        language: 'he',
        bio: profile.biography || `משפיענ/ית בתחום ${influencer.influencer_type}`,
        description: `משפיענ/ית עם ${profile.followersCount?.toLocaleString()} עוקבים`,
        interests: Array.from(brandSet).map(b => b),
        topics: Array.from(brandSet).map(b => b),
        response_style: 'warm and personal',
        emoji_usage: 'moderate',
        greeting_message: `היי! 👋 אני העוזר של ${influencer.display_name}. איך אוכל לעזור לך היום? אשמח לספר על המותגים והקופונים שלי 💝`,
        faq: [
          {
            question: 'מי את/ה?',
            answer: `אני ${influencer.display_name}, משפיענ/ית בתחום ${influencer.influencer_type}. ${profile.biography || ''}`,
          },
          {
            question: 'יש לך קופונים?',
            answer: `בטח! יש לי קופונים מעולים${topBrands.length > 0 ? ` למותגים כמו ${topBrands.join(', ')}` : ''}. מה מעניין אותך?`,
          },
          {
            question: 'איזה מותגים את/ה עובד/ת איתם?',
            answer: `אני עובד/ת עם מותגים מדהימים${topBrands.length > 0 ? `: ${topBrands.join(', ')}` : ''}!`,
          },
        ],
        instagram_username: influencer.username,
      }, { onConflict: 'account_id' });

    // Create knowledge base items for coupons
    for (const [code, coupon] of couponSet) {
      const partnershipId = partnershipIds.get(coupon.brand);
      if (partnershipId) {
        await supabase
          .from('chatbot_knowledge_base')
          .upsert({
            account_id: influencer.id,
            knowledge_type: 'coupon',
            title: `קופון ${coupon.brand}`,
            content: `מותג: ${coupon.brand}\nקוד קופון: ${code}${coupon.discount ? `\nהנחה: ${coupon.discount}` : ''}`,
            keywords: ['קופון', coupon.brand, code],
            source_type: 'partnership',
            source_id: partnershipId,
            priority: 90,
            is_active: true,
          }, { onConflict: 'account_id,source_type,source_id' });
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        products: extractedProducts.length,
        content: contentItems.length,
        posts: posts.length,
        partnerships: brandSet.size,
        coupons: couponSet.size,
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

// ============================================
// Gemini 3 Pro Analysis
// ============================================

async function analyzeWithGemini3Pro(content: any[], influencerName: string) {
  const genAI = new GoogleGenAI({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
  });

  const contentData = content.map((item) => ({
    type: item.contentType || 'post',
    caption: item.caption || '',
    transcript: item.videoTranscript || '',
    likes: item.likesCount || 0,
    comments: item.commentsCount || 0,
    views: item.videoViewCount || 0,
  }));

  const prompt = `IMPORTANT: You MUST respond with ONLY valid JSON. No text before or after the JSON. No explanations. No markdown.

Analyze Instagram content for influencer: ${influencerName}

Content data (${content.length} posts + reels):
${JSON.stringify(contentData, null, 2)}

Extract and return ONLY this JSON structure:

{
  "brands": [
    { "name": "Brand Name", "mentions": 1 }
  ],
  "coupons": [
    { "code": "SAVE20", "brand": "Nike", "discount": "20%" }
  ],
  "products": [
    { "name": "Product Name", "brand": "Brand Name" }
  ]
}

Rules:
- brands: List ALL mentioned brands (Hebrew names preferred)
- coupons: Extract coupon codes (UPPERCASE letters/numbers)
- products: Specific product names mentioned
- If nothing found, return empty arrays []
- MUST be valid JSON only

Example response:
{
  "brands": [{"name": "Nike", "mentions": 3}],
  "coupons": [{"code": "NIKE20", "brand": "Nike", "discount": "20%"}],
  "products": [{"name": "Air Max", "brand": "Nike"}]
}`;

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
        temperature: 0.7, // Lower temperature for more consistent JSON
        responseMimeType: 'application/json', // Force JSON response
      },
    });

    const text = response.text || '';
    console.log('📝 Gemini raw response:', text.substring(0, 300));
    
    // Strict validation - must start with { and end with }
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      console.warn('⚠️ Response is not JSON format (missing braces)');
      console.warn('📄 Response preview:', trimmed.substring(0, 100));
      throw new Error('Invalid JSON format - missing braces');
    }
    
    // Try to extract JSON (handle markdown code blocks if present)
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('⚠️ No JSON structure found in response');
      throw new Error('No JSON found in response');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
      
      // Validate structure
      if (!parsed.brands || !parsed.coupons || !parsed.products) {
        console.warn('⚠️ JSON missing required fields');
        throw new Error('Invalid JSON structure - missing required fields');
      }
      
      // Ensure arrays
      if (!Array.isArray(parsed.brands)) parsed.brands = [];
      if (!Array.isArray(parsed.coupons)) parsed.coupons = [];
      if (!Array.isArray(parsed.products)) parsed.products = [];
      
      console.log('✅ Valid JSON parsed:', {
        brands: parsed.brands.length,
        coupons: parsed.coupons.length,
        products: parsed.products.length
      });
      
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.error('📄 Failed text:', jsonMatch[0].substring(0, 300));
      throw new Error(`JSON parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    // Convert to legacy format (Map with shortcode keys)
    const result = new Map<string, any>();
    
    // Create a single analysis entry
    result.set('summary', {
      brands: parsed.brands?.map((b: any) => b.name) || [],
      coupons: parsed.coupons || [],
      products: parsed.products || [],
    });

    console.log('✅ Gemini analysis successful:', {
      brands: parsed.brands?.length || 0,
      coupons: parsed.coupons?.length || 0,
      products: parsed.products?.length || 0
    });

    return result;
  } catch (error) {
    console.error('❌ Gemini 3 Pro analysis failed:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
    // Fallback to empty analysis
    return new Map<string, any>();
  }
}

