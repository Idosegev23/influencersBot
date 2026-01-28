/**
 * Background Scraper
 * Runs Instagram scraping in background without blocking API response
 */

import { ApifyClient } from 'apify-client';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { 
  getInfluencerByUsername, 
  updateInfluencer,
  supabase 
} from '@/lib/supabase';
import { generatePersonaFromPosts, generateGreetingAndQuestions } from '@/lib/openai';
import { uploadProfilePicture } from '@/lib/storage';
import { 
  initProgress, 
  updateProgress, 
  completeProgress, 
  failProgress 
} from '@/lib/scraping-progress';

interface ScrapeResult {
  success: boolean;
  error?: string;
  stats?: {
    products: number;
    partnerships: number;
    coupons: number;
    content: number;
    posts: number;
    reels: number;
    profile: {
      name: string | number;
      followers: string | number;
      avatarUrl: string | null;
    };
    personaGenerated: boolean;
    greetingGenerated: boolean;
  };
}

/**
 * Run full Instagram scrape in background
 * This function can take 1-2 minutes to complete
 */
export async function runBackgroundScrape(
  username: string,
  isRescan: boolean = false
): Promise<ScrapeResult> {
  try {
    console.log(`🚀 [Background] Starting ${isRescan ? 'rescan' : 'scrape'} for ${username}...`);

    // Initialize progress
    await initProgress(username);

    // Get influencer
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      throw new Error('Influencer not found');
    }

    // Initialize Apify client
    const apify = new ApifyClient({
      token: process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN!,
    });

    // 1. Scrape posts
    const postsLimit = influencer.scrape_settings?.posts_limit || 50;
    
    await updateProgress(username, {
      status: 'scraping_posts',
      progress: 10,
      currentStep: `סורק ${postsLimit} פוסטים מאינסטגרם...`,
      estimatedTimeRemaining: 90,
    });

    const postsInput = {
      directUrls: [`https://www.instagram.com/${influencer.username}/`],
      resultsType: 'posts',
      resultsLimit: postsLimit,
      searchType: 'user',
      searchLimit: 1,
      addParentData: true,
    };

    console.log('📸 Scraping posts with Apify...');
    const postsRun = await apify.actor('apify/instagram-scraper').call(postsInput);
    const { items: postsData } = await apify.dataset(postsRun.defaultDatasetId).listItems();
    const posts = postsData || [];

    // 2. Scrape reels
    const reelsLimit = influencer.scrape_settings?.reels_limit || 30;
    
    await updateProgress(username, {
      status: 'scraping_reels',
      progress: 30,
      currentStep: `סורק ${reelsLimit} ריילס...`,
      details: { postsScraped: posts.length },
      estimatedTimeRemaining: 60,
    });

    const reelsInput = {
      usernames: [influencer.username],
      resultsLimit: reelsLimit,
    };

    console.log('🎬 Scraping reels with Apify...');
    const reelsRun = await apify.actor('apify/instagram-reel-scraper').call(reelsInput);
    const { items: reelsData } = await apify.dataset(reelsRun.defaultDatasetId).listItems();
    const reels = reelsData || [];

    console.log(`📊 Scraped ${posts.length} posts + ${reels.length} reels`);

    // 3. Analyze with Gemini 3 Pro
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

    console.log('🤖 Analyzing with Gemini 3 Pro...');
    
    // Prepare content for analysis
    const allContent = [...posts, ...reels];
    const captions = allContent
      .map((item: any) => item.caption || item.text || '')
      .filter(Boolean)
      .join('\n---\n');

    // Analyze with Gemini
    const genAI = new GoogleGenAI(process.env.GOOGLE_GEMINI_API_KEY!);
    
    const prompt = `IMPORTANT: You MUST respond with ONLY valid JSON. No text before or after the JSON. No explanations. No markdown.

Analyze this Instagram content and extract:
- brands: Brand names mentioned (Hebrew preferred, ONLY if clearly mentioned)
- coupons: Discount codes (UPPERCASE, letters/numbers only, ONLY if explicitly mentioned)
- products: Specific product names (ONLY concrete products mentioned by name)

Content:
${captions.substring(0, 50000)}

Rules:
- brands: List ALL mentioned brands (Hebrew names preferred)
- coupons: Extract coupon codes (UPPERCASE letters/numbers)
- products: Specific product names mentioned
- If nothing found, return empty arrays []
- MUST be valid JSON only

Example response:
{"brands":["Nike","אדידס"],"coupons":["SALE20","WINTER50"],"products":["נעלי ריצה Air Max","חולצת טי שירט"]}`;

    let parsed: any = { brands: [], coupons: [], products: [] };

    try {
      const response = await genAI.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      });

      const text = response.text || '';
      console.log('📝 Gemini response preview:', text.substring(0, 300));

      // Validate JSON
      const trimmed = text.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        throw new Error('Invalid JSON format');
      }

      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!parsed.brands || !parsed.coupons || !parsed.products) {
        throw new Error('Missing required fields');
      }

      // Ensure arrays
      if (!Array.isArray(parsed.brands)) parsed.brands = [];
      if (!Array.isArray(parsed.coupons)) parsed.coupons = [];
      if (!Array.isArray(parsed.products)) parsed.products = [];

      console.log('✅ Parsed:', {
        brands: parsed.brands.length,
        coupons: parsed.coupons.length,
        products: parsed.products.length,
      });

    } catch (error) {
      console.error('❌ Gemini analysis failed:', error);
      // Continue with empty data
    }

    // 4. Save to database
    const brandSet = new Set<string>(parsed.brands || []);
    const couponSet = new Set<string>(parsed.coupons || []);
    const productSet = new Set<string>(parsed.products || []);

    await updateProgress(username, {
      status: 'saving',
      progress: 70,
      currentStep: `שומר ${brandSet.size} מותגים ו-${couponSet.size} קופונים...`,
      details: {
        postsScraped: posts.length,
        reelsScraped: reels.length,
        brandsFound: brandSet.size,
        couponsFound: couponSet.size,
      },
      estimatedTimeRemaining: 30,
    });

    console.log('💾 Saving to database...');

    // Save partnerships
    const partnershipIds = new Map<string, string>();
    for (const brandName of brandSet) {
      const { data: existing } = await supabase
        .from('partnerships')
        .select('id')
        .eq('influencer_id', influencer.id)
        .eq('brand_name', brandName)
        .single();

      if (existing) {
        partnershipIds.set(brandName, existing.id);
      } else {
        const { data: newPartnership } = await supabase
          .from('partnerships')
          .insert({
            influencer_id: influencer.id,
            brand_name: brandName,
            status: 'active',
            discovered_via: 'ai_analysis',
          })
          .select('id')
          .single();

        if (newPartnership) {
          partnershipIds.set(brandName, newPartnership.id);
        }
      }
    }

    // Save coupons
    for (const couponCode of couponSet) {
      await supabase.from('coupons').upsert(
        {
          influencer_id: influencer.id,
          code: couponCode,
          status: 'active',
          discovered_via: 'ai_analysis',
        },
        { onConflict: 'influencer_id,code' }
      );
    }

    // Save products
    if (productSet.size > 0) {
      const productsToInsert = Array.from(productSet).map(name => ({
        influencer_id: influencer.id,
        name,
        category: 'כללי',
        is_manual: false,
      }));

      await supabase.from('products').upsert(productsToInsert, {
        onConflict: 'influencer_id,name',
        ignoreDuplicates: true,
      });
    }

    // 5. Generate persona (if not rescan)
    let persona = null;
    let greeting = null;

    if (!isRescan) {
      await updateProgress(username, {
        status: 'saving',
        progress: 90,
        currentStep: 'יוצר פרסונה של הבוט...',
        estimatedTimeRemaining: 10,
      });

      console.log('🎭 Generating persona...');
      persona = await generatePersonaFromPosts(posts as any);

      if (persona) {
        await supabase.from('chatbot_persona').upsert(
          {
            influencer_id: influencer.id,
            tone: persona.tone,
            emoji_style: persona.emoji_style,
            response_length: persona.response_length,
            topics: persona.topics,
          },
          { onConflict: 'influencer_id' }
        );
      }

      console.log('👋 Generating greeting...');
      greeting = await generateGreetingAndQuestions(influencer.username, posts as any);

      if (greeting) {
        await supabase.from('chatbot_persona').update({
          greeting_message: greeting.greeting,
          initial_questions: greeting.questions,
        }).eq('influencer_id', influencer.id);
      }
    }

    // 6. Update influencer record
    const profile = (posts[0] as any)?.ownerFullName ? posts[0] : reels[0];
    let avatarUrl = null;

    if (profile?.profilePicUrl) {
      try {
        avatarUrl = await uploadProfilePicture(
          String(profile.profilePicUrl),
          influencer.username
        );
      } catch (error) {
        console.error('Failed to upload avatar:', error);
      }
    }

    await updateInfluencer(influencer.id, {
      full_name: String(profile?.ownerFullName || profile?.fullName || influencer.full_name),
      followers_count: Number(profile?.followersCount) || influencer.followers_count,
      avatar_url: avatarUrl || influencer.avatar_url,
      last_scraped_at: new Date().toISOString(),
    });

    console.log(`✅ Scrape completed for ${username}`);

    // Mark as completed
    await completeProgress(username, {
      postsScraped: posts.length,
      reelsScraped: reels.length,
      brandsFound: brandSet.size,
      couponsFound: couponSet.size,
      productsFound: productSet.size,
    });

    return {
      success: true,
      stats: {
        products: productSet.size,
        partnerships: brandSet.size,
        coupons: couponSet.size,
        content: posts.length + reels.length,
        posts: posts.length,
        reels: reels.length,
        profile: {
          name: profile?.ownerFullName || profile?.fullName || '',
          followers: profile?.followersCount || 0,
          avatarUrl,
        },
        personaGenerated: !!persona,
        greetingGenerated: !!greeting,
      },
    };

  } catch (error) {
    console.error('❌ Background scrape error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Scrape failed';
    await failProgress(username, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
