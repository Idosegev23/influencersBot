import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { 
  getInfluencerByUsername, 
  updateInfluencer,
  supabase 
} from '@/lib/supabase';
import { scrapeInstagramProfile } from '@/lib/apify';
import { analyzeAllPosts, extractContentFromPost, generatePersonaFromPosts, generateGreetingAndQuestions } from '@/lib/openai';
import { uploadProfilePicture } from '@/lib/storage';
import type { ContentItem, Product, InfluencerPersona } from '@/types';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Admin scrape endpoint - full scrape with persona generation
export async function POST(req: NextRequest) {
  try {
    const { username, adminPassword } = await req.json();

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Check admin authentication - either via cookie or password in request
    const cookieStore = await cookies();
    const adminCookie = cookieStore.get('influencerbot_admin_session');
    const isAdminCookie = adminCookie?.value === 'authenticated';
    const isAdminPassword = adminPassword === ADMIN_PASSWORD;
    
    if (!isAdminCookie && !isAdminPassword) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    // Get influencer
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    console.log(`Starting full scrape for ${username}...`);

    // Scrape Instagram profile
    const { profile, posts } = await scrapeInstagramProfile(
      influencer.username,
      influencer.scrape_settings || { posts_limit: 50 }
    );

    console.log(`Scraped ${posts.length} posts for ${username}`);

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
          coupon_code: undefined,
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

    // Extract content items from ALL posts - dynamic based on influencer type
    const contentItems: Partial<ContentItem>[] = [];
    console.log(`Extracting content from ${posts.length} posts for ${username} (type: ${influencer.influencer_type})...`);

    // Process ALL posts for content extraction (up to 50)
    const postsToProcess = posts.slice(0, 50);
    let successCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < postsToProcess.length; i++) {
      const post = postsToProcess[i];
      
      // Skip posts with very short captions
      if (!post.caption || post.caption.trim().length < 15) {
        skipCount++;
        continue;
      }
      
      try {
        const extracted = await extractContentFromPost(
          post.caption,
          influencer.influencer_type,
          post.displayUrl
        );
        
        if (extracted && extracted.title) {
          contentItems.push({
            type: extracted.type as ContentItem['type'],
            title: extracted.title,
            description: extracted.description,
            content: extracted.content,
            image_url: post.displayUrl,
          });
          successCount++;
          console.log(`  [${i+1}/${postsToProcess.length}] ${extracted.type}: ${extracted.title.slice(0, 50)}...`);
        } else {
          skipCount++;
        }
        
        // Smaller delay for faster processing
        if (i < postsToProcess.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (error) {
        console.error(`Error extracting content from post ${i}:`, error);
        skipCount++;
      }
    }
    
    console.log(`Content extraction complete: ${successCount} extracted, ${skipCount} skipped`);

    // Generate persona from posts
    console.log(`Generating persona for ${username}...`);
    let persona: InfluencerPersona | null = null;
    try {
      persona = await generatePersonaFromPosts(posts, profile, influencer.influencer_type);
    } catch (error) {
      console.error('Error generating persona:', error);
    }

    // Generate greeting and questions
    console.log(`Generating greeting for ${username}...`);
    let greeting = influencer.greeting_message;
    let questions = influencer.suggested_questions;
    
    if (persona) {
      try {
        // Build products list for context
        const productsList = extractedProducts.map(p => ({
          name: p.name || '',
          brand: p.brand,
          coupon_code: p.coupon_code,
        }));
        
        const greetingData = await generateGreetingAndQuestions(
          profile.fullName || influencer.display_name,
          influencer.influencer_type,
          persona,
          productsList,
          contentItems.map(c => ({ title: c.title || '', type: c.type || 'tip' }))
        );
        greeting = greetingData.greeting;
        questions = greetingData.questions;
      } catch (error) {
        console.error('Error generating greeting:', error);
      }
    }

    // Only delete non-manual products
    await supabase
      .from('products')
      .delete()
      .eq('influencer_id', influencer.id)
      .eq('is_manual', false);

    // Delete old content items
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
        category: 'כללי',
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

      console.log(`Inserting ${contentToInsert.length} content items...`);
      console.log('Sample content item:', JSON.stringify(contentToInsert[0], null, 2));
      
      const { data: insertedData, error: contentError } = await supabase
        .from('content_items')
        .insert(contentToInsert)
        .select('id');
        
      if (contentError) {
        console.error('Error inserting content items:', contentError.message, contentError.code, contentError.details);
      } else {
        console.log(`Content items inserted successfully: ${insertedData?.length || 0} items`);
      }
    }

    // Upload profile picture to our storage
    let avatarUrl = profile.profilePicUrl;
    if (profile.profilePicUrl) {
      const uploadedUrl = await uploadProfilePicture(influencer.username, profile.profilePicUrl);
      if (uploadedUrl) {
        avatarUrl = uploadedUrl;
      }
    }

    // Update influencer with all new data
    const updateData: Record<string, unknown> = {
      last_synced_at: new Date().toISOString(),
      followers_count: profile.followersCount,
      following_count: profile.followingCount,
      avatar_url: avatarUrl,
      bio: profile.biography,
      display_name: profile.fullName || influencer.display_name,
    };

    if (persona) {
      updateData.persona = persona;
    }

    if (greeting) {
      updateData.greeting_message = greeting;
    }

    if (questions && questions.length > 0) {
      updateData.suggested_questions = questions;
    }

    await updateInfluencer(influencer.id, updateData);

    console.log(`Scrape completed for ${username}`);

    return NextResponse.json({
      success: true,
      stats: {
        products: extractedProducts.length,
        content: contentItems.length,
        posts: posts.length,
        profile: {
          name: profile.fullName,
          followers: profile.followersCount,
          avatarUrl: avatarUrl,
        },
        personaGenerated: !!persona,
        greetingGenerated: !!greeting,
      },
    });
  } catch (error) {
    console.error('Admin scrape error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}

