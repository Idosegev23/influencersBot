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
  const overallStartTime = Date.now();
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 [${username}] Starting ${isRescan ? 'RESCAN' : 'SCRAPE'}`);
    console.log(`${'='.repeat(60)}\n`);

    // Initialize progress
    console.log(`⏱️ [${username}] Step 0: Initializing progress...`);
    await initProgress(username);

    // Get influencer
    console.log(`⏱️ [${username}] Step 1: Fetching influencer from DB...`);
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      throw new Error('Influencer not found');
    }
    console.log(`✅ [${username}] Influencer found: ${influencer.full_name || username}`);

    // Initialize Apify client
    const apify = new ApifyClient({
      token: process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN!,
    });

    // 1. Scrape posts
    const postsLimit = influencer.scrape_settings?.posts_limit || 50;
    
    console.log(`\n📸 [${username}] STAGE 1/5: Scraping ${postsLimit} posts...`);
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

    const postsStartTime = Date.now();
    const postsRun = await apify.actor('apify/instagram-scraper').call(postsInput);
    const { items: postsData } = await apify.dataset(postsRun.defaultDatasetId).listItems();
    const posts = postsData || [];
    const postsElapsed = ((Date.now() - postsStartTime) / 1000).toFixed(2);
    console.log(`✅ [${username}] Posts scraped: ${posts.length} in ${postsElapsed}s`);

    // 2. Scrape reels
    const reelsLimit = influencer.scrape_settings?.reels_limit || 30;
    
    console.log(`\n🎬 [${username}] STAGE 2/5: Scraping ${reelsLimit} reels...`);
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

    const reelsStartTime = Date.now();
    const reelsRun = await apify.actor('apify/instagram-reel-scraper').call(reelsInput);
    const { items: reelsData } = await apify.dataset(reelsRun.defaultDatasetId).listItems();
    const reels = reelsData || [];
    const reelsElapsed = ((Date.now() - reelsStartTime) / 1000).toFixed(2);
    console.log(`✅ [${username}] Reels scraped: ${reels.length} in ${reelsElapsed}s`);

    console.log(`\n📊 [${username}] Total content: ${posts.length} posts + ${reels.length} reels`);

    // 3. Analyze with Gemini 3 Pro
    console.log(`\n🤖 [${username}] STAGE 3/5: AI Analysis...`);
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

    const analysisStartTime = Date.now();
    console.log(`📊 [${username}] Content size: ${posts.length} posts + ${reels.length} reels`);
    
    // Prepare content for analysis (limit to 20,000 chars for speed)
    const allContent = [...posts, ...reels];
    const captions = allContent
      .map((item: any) => item.caption || item.text || '')
      .filter(Boolean)
      .join('\n---\n')
      .substring(0, 20000); // Reduced from 50k
    
    console.log(`📝 [${username}] Prompt length: ${captions.length} characters`);

    // Analyze with Gemini - support both env var names
    const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      throw new Error('GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY is required');
    }
    const genAI = new GoogleGenAI(GEMINI_KEY);
    
    const prompt = `IMPORTANT: You MUST respond with ONLY valid JSON. No text before or after the JSON. No explanations. No markdown.

Analyze this Instagram content and extract:
- brands: Brand names mentioned (Hebrew preferred, ONLY if clearly mentioned)
- coupons: Discount codes (UPPERCASE, letters/numbers only, ONLY if explicitly mentioned)
- products: Specific product names (ONLY concrete products mentioned by name)

Content:
${captions}

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
      console.log(`⏱️ [${username}] Starting Gemini API call...`);
      const startTime = Date.now();
      
      const response = await genAI.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MEDIUM, // Changed from HIGH to MEDIUM
          },
          temperature: 0.5, // Lower for faster, more consistent responses
          responseMimeType: 'application/json',
        },
      });

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ [${username}] Gemini API responded in ${elapsedTime}s`);

      const text = response.text || '';
      console.log(`📝 [${username}] Response length: ${text.length} characters`);
      console.log(`📝 [${username}] Response preview:`, text.substring(0, 200));

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
      const analysisElapsed = ((Date.now() - analysisStartTime) / 1000).toFixed(2);
      console.error(`❌ [${username}] Gemini analysis failed after ${analysisElapsed}s:`, error);
      // Continue with empty data
    }

    const analysisElapsed = ((Date.now() - analysisStartTime) / 1000).toFixed(2);
    console.log(`✅ [${username}] Analysis completed in ${analysisElapsed}s`);

    // 4. Save to database
    const brandSet = new Set<string>(parsed.brands || []);
    const couponSet = new Set<string>(parsed.coupons || []);
    const productSet = new Set<string>(parsed.products || []);

    console.log(`\n💾 [${username}] STAGE 4/5: Saving to database...`);
    console.log(`📊 [${username}] Found: ${brandSet.size} brands, ${couponSet.size} coupons, ${productSet.size} products`);
    
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

    const dbStartTime = Date.now();

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

    const dbElapsed = ((Date.now() - dbStartTime) / 1000).toFixed(2);
    console.log(`✅ [${username}] Database save completed in ${dbElapsed}s`);

    // 5. Generate persona (if not rescan)
    let persona = null;
    let greeting = null;

    if (!isRescan) {
      console.log(`\n🎭 [${username}] STAGE 5/5: Generating persona...`);
      await updateProgress(username, {
        status: 'saving',
        progress: 90,
        currentStep: 'יוצר פרסונה של הבוט...',
        estimatedTimeRemaining: 10,
      });

      const personaStartTime = Date.now();
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

      console.log(`⏱️ [${username}] Generating greeting...`);
      greeting = await generateGreetingAndQuestions(influencer.username, posts as any);

      if (greeting) {
        await supabase.from('chatbot_persona').update({
          greeting_message: greeting.greeting,
          initial_questions: greeting.questions,
        }).eq('influencer_id', influencer.id);
      }
      
      const personaElapsed = ((Date.now() - personaStartTime) / 1000).toFixed(2);
      console.log(`✅ [${username}] Persona generated in ${personaElapsed}s`);
    } else {
      console.log(`⏭️ [${username}] Skipping persona (rescan mode)`);
    }

    // 6. Update influencer record
    console.log(`\n🔄 [${username}] Updating influencer record...`);
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

    const overallElapsed = ((Date.now() - overallStartTime) / 1000).toFixed(2);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [${username}] SCRAPE COMPLETED in ${overallElapsed}s`);
    console.log(`${'='.repeat(60)}\n`);

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
    const overallElapsed = ((Date.now() - overallStartTime) / 1000).toFixed(2);
    
    console.log(`\n${'='.repeat(60)}`);
    console.error(`❌ [${username}] SCRAPE FAILED after ${overallElapsed}s`);
    console.error(`❌ [${username}] Error:`, error);
    console.log(`${'='.repeat(60)}\n`);
    
    const errorMessage = error instanceof Error ? error.message : 'Scrape failed';
    await failProgress(username, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
