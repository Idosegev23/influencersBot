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
import { ApifyClient } from 'apify-client';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { 
  initProgress, 
  updateProgress, 
  completeProgress, 
  failProgress,
  calculateETA 
} from '@/lib/scraping-progress';

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

    // Initialize progress tracking
    await initProgress(username);

    // Initialize Apify client
    const apify = new ApifyClient({
      token: process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN!,
    });

    // 1. Scrape posts
    await updateProgress(username, {
      status: 'scraping_posts',
      progress: 10,
      currentStep: `סורק ${postsLimit || 50} פוסטים מאינסטגרם...`,
      estimatedTimeRemaining: 90,
    });
    
    const postsLimit = influencer.scrape_settings?.posts_limit || 50;
    const postsInput = {
      directUrls: [`https://www.instagram.com/${influencer.username}/`],
      resultsType: 'posts',
      resultsLimit: postsLimit,
      searchType: 'user',
      searchLimit: 1,
      addParentData: true,
    };

    console.log(`📸 Scraping ${postsLimit} posts...`);
    const postsRun = await apify.actor('apify/instagram-scraper').call(postsInput);
    const { items: postsItems } = await apify.dataset(postsRun.defaultDatasetId).listItems();
    const posts = postsItems.filter((item: any) => item.shortCode && item.caption);
    
    console.log(`✅ Found ${posts.length} posts with text`);

    // 2. Scrape reels
    let reels: any[] = [];
    try {
      console.log(`🎬 Scraping reels...`);
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
      fullName: postsItems[0].ownerFullName || influencer.display_name,
    } : {
      username: influencer.username,
      followersCount: influencer.followers_count,
      followingCount: influencer.following_count,
      profilePicUrl: influencer.avatar_url,
      biography: influencer.bio,
      fullName: influencer.display_name,
    };

    console.log(`Scraped ${posts.length} posts + ${reels.length} reels for ${username}`);

    // Update progress
    await updateProgress(username, {
      status: 'analyzing',
      progress: 40,
      currentStep: `מנתח ${posts.length + reels.length} פריטי תוכן עם AI...`,
      details: {
        postsScraped: posts.length,
        reelsScraped: reels.length,
      },
      estimatedTimeRemaining: 60,
    });

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

    // Extract products, brands, and coupons
    const extractedProducts: Partial<Product>[] = [];
    const brandSet = new Set<string>();
    const couponSet = new Map<string, { code: string; brand: string; discount?: string }>();

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

    // Save to partnerships and coupons tables
    console.log(`💾 Saving ${brandSet.size} partnerships and ${couponSet.size} coupons...`);
    
    await updateProgress(username, {
      status: 'saving',
      progress: 70,
      currentStep: `שומר ${brandSet.size} מותגים ו-${couponSet.size} קופונים למסד נתונים...`,
      details: {
        postsScraped: posts.length,
        reelsScraped: reels.length,
        brandsFound: brandSet.size,
        couponsFound: couponSet.size,
      },
      estimatedTimeRemaining: 30,
    });
    
    // Save partnerships
    const partnershipIds = new Map<string, string>();
    for (const brandName of brandSet) {
      const { data: existing } = await supabase
        .from('partnerships')
        .select('id')
        .eq('account_id', influencer.id)
        .eq('brand_name', brandName)
        .single();

      if (existing) {
        partnershipIds.set(brandName, existing.id);
      } else {
        const { data: newPartnership } = await supabase
          .from('partnerships')
          .insert({
            account_id: influencer.id,
            brand_name: brandName,
            category: 'Auto',
            brief: 'זוהה אוטומטית מאינסטגרם',
            is_active: true,
          })
          .select('id')
          .single();

        if (newPartnership) {
          partnershipIds.set(brandName, newPartnership.id);
        }
      }
    }

    // Save coupons
    for (const [code, coupon] of couponSet) {
      const partnershipId = partnershipIds.get(coupon.brand);
      if (!partnershipId) continue;

      await supabase
        .from('coupons')
        .upsert({
          partnership_id: partnershipId,
          account_id: influencer.id,
          code: coupon.code,
          discount_type: 'percentage',
          discount_value: parseFloat(coupon.discount || '0') || null,
          description: `קופון ${coupon.brand}${coupon.discount ? ` - ${coupon.discount}` : ''}`,
          is_active: true,
        }, {
          onConflict: 'account_id,code',
        });
    }

    // Create/update chatbot persona
    await supabase.from('chatbot_persona').upsert({
      account_id: influencer.id,
      name: `העוזר של ${influencer.display_name}`,
      tone: 'friendly',
      language: 'he',
      greeting_message: `היי! 👋 אני העוזרת של ${influencer.display_name}. איך אפשר לעזור לך היום?`,
      faq: [
        { question: 'איך אפשר ליצור קשר?', answer: `תוכל/י ליצור קשר דרך האינסטגרם של ${influencer.display_name}` }
      ],
    }, { onConflict: 'account_id' });

    // Create knowledge base items for coupons
    for (const [code, coupon] of couponSet) {
      await supabase.from('chatbot_knowledge_base').upsert({
        account_id: influencer.id,
        knowledge_type: 'coupon',
        title: `קופון ${coupon.brand}`,
        content: `מותג: ${coupon.brand}\nקוד: ${code}${coupon.discount ? `\nהנחה: ${coupon.discount}` : ''}`,
        keywords: ['קופון', coupon.brand, code],
        priority: 90,
      }, { onConflict: 'account_id,title' });
    }

    // Extract content items from ALL posts - dynamic based on influencer type
    const contentItems: Partial<ContentItem>[] = [];
    console.log(`Extracting content from ${posts.length} posts for ${username} (type: ${influencer.influencer_type})...`);

    // Process ALL posts for content extraction (up to 50)
    const postsToProcess = posts.slice(0, 50);
    let successCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < postsToProcess.length; i++) {
      const post = postsToProcess[i] as any;
      
      // Skip posts with very short captions
      const caption = (post.caption || '') as string;
      if (!caption || caption.trim().length < 15) {
        skipCount++;
        continue;
      }
      
      try {
        const extracted = await extractContentFromPost(
          caption,
          influencer.influencer_type,
          post.displayUrl as string
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
      persona = await generatePersonaFromPosts(posts as any, profile as any, influencer.influencer_type);
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
          coupon_code: p.coupon_code ?? undefined,
        }));
        
        const greetingData = await generateGreetingAndQuestions(
          (profile.fullName as string) || influencer.display_name,
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
    let avatarUrl = profile.profilePicUrl as any;
    if (profile.profilePicUrl) {
      const uploadedUrl = await uploadProfilePicture(influencer.username, profile.profilePicUrl as string);
      if (uploadedUrl) {
        avatarUrl = uploadedUrl;
      }
    }

    // Update influencer with all new data
    const updateData: Record<string, unknown> = {
      last_synced_at: new Date().toISOString(),
      followers_count: profile.followersCount as number,
      following_count: profile.followingCount as number,
      avatar_url: avatarUrl,
      bio: profile.biography as string,
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

    // Mark progress as completed
    await completeProgress(username, {
      postsScraped: posts.length,
      reelsScraped: reels.length,
      brandsFound: brandSet.size,
      couponsFound: couponSet.size,
      productsFound: extractedProducts.length,
    });

    return NextResponse.json({
      success: true,
      stats: {
        products: extractedProducts.length,
        partnerships: brandSet.size,
        coupons: couponSet.size,
        content: contentItems.length,
        posts: posts.length,
        reels: reels.length,
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
    
    // Mark progress as failed
    const errorMessage = error instanceof Error ? error.message : 'Scrape failed';
    try {
      // Extract username from request for progress tracking
      const body = await req.json().catch(() => ({}));
      if (body.username) {
        await failProgress(body.username, errorMessage);
      }
    } catch (progressError) {
      console.error('Failed to update progress:', progressError);
    }
    
    return NextResponse.json(
      { error: errorMessage },
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