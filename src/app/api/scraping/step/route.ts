/**
 * POST /api/scraping/step
 * מריץ שלב בודד בתהליך הסריקה (< 10 דקות)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireInfluencerAuth } from '@/lib/auth/middleware';
import { InstagramActorManager, selectTopPostsForComments, extractTopHashtags, extractKeywordsFromBio } from '@/lib/scraping/apify-actors';
import { runPreprocessing } from '@/lib/scraping/preprocessing';
import { runGeminiBuilder, savePersonaToDatabase } from '@/lib/ai/gemini-persona-builder';
import { cookies } from 'next/headers';

const ADMIN_COOKIE_NAME = 'influencerbot_admin_session';

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME);
  return session?.value === 'authenticated';
}

// Vercel timeout: 600 seconds (10 דקות) - conservative
export const maxDuration = 600;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { jobId, step } = body;

    // Check authentication (admin or influencer)
    const isAdmin = await checkAdminAuth();
    
    if (!isAdmin) {
      // Regular influencer auth
      const authResult = await requireInfluencerAuth(request);
      if (authResult instanceof NextResponse) {
        return authResult;
      }
      // accountId will be validated from job
    }

    if (!jobId || !step) {
      return NextResponse.json(
        { error: 'jobId and step are required' },
        { status: 400 }
      );
    }

    console.log(`[Scraping Step] Starting step ${step} for job ${jobId}`);

    const supabase = await createClient();

    // Load job (without account_id filter for admin)
    let jobQuery = supabase
      .from('scraping_jobs')
      .select('*, accounts!inner(config)')
      .eq('id', jobId);

    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const username = job.accounts?.config?.username || job.accounts?.username;
    const accountId = job.account_id;

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID not found in job' },
        { status: 400 }
      );
    }

    // Update step status to 'running'
    await updateStepStatus(supabase, jobId, step, 'running', null, null);

    // Update job status to 'running' if it's pending
    if (job.status === 'pending') {
      await supabase
        .from('scraping_jobs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', jobId);
    }

    let result: any;

    // Execute the appropriate step
    switch (step) {
      case 1:
        result = await runStep1_Posts(supabase, accountId, username);
        break;

      case 2:
        result = await runStep2_Comments(supabase, accountId, username);
        break;

      case 3:
        result = await runStep3_Profile(supabase, accountId, username);
        break;

      case 4:
        result = await runStep4_Hashtags(supabase, accountId, username);
        break;

      case 5:
        result = await runStep5_Search(supabase, accountId, username);
        break;

      case 6:
        result = await runStep6_Preprocessing(supabase, accountId);
        break;

      case 7:
        result = await runStep7_GeminiPersona(supabase, accountId);
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid step number' },
          { status: 400 }
        );
    }

    // Update step status to 'completed'
    await updateStepStatus(supabase, jobId, step, 'completed', result, null);

    // Update stats
    await updateJobStats(supabase, jobId, step, result);

    const duration = Math.round((Date.now() - startTime) / 1000);
    const nextStep = step < 7 ? step + 1 : null;
    const isCompleted = step === 7;

    // If completed, update job status
    if (isCompleted) {
      await supabase
        .from('scraping_jobs')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    console.log(`[Scraping Step] Step ${step} completed in ${duration}s`);

    return NextResponse.json({
      success: true,
      step,
      result,
      nextStep,
      completed: isCompleted,
      duration,
    });

  } catch (error: any) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error('[Scraping Step] Error:', error);

    // Try to update job with error
    try {
      const body = await request.json();
      const { jobId, step } = body;
      
      if (jobId && step) {
        const supabase = await createClient();
        await updateStepStatus(supabase, jobId, step, 'failed', null, error.message);
        
        await supabase
          .from('scraping_jobs')
          .update({ 
            status: 'failed',
            error_message: error.message,
            error_step: step,
          })
          .eq('id', jobId);
      }
    } catch (updateError) {
      console.error('[Scraping Step] Failed to update error status:', updateError);
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        duration,
      },
      { status: 500 }
    );
  }
}

// ============================================
// Step 1: Scrape Posts (500)
// ============================================

async function runStep1_Posts(supabase: any, accountId: string, username: string) {
  console.log('[Step 1] Starting posts scrape...');

  const manager = new InstagramActorManager(username);
  const posts = await manager.scrapePosts(500);

  console.log(`[Step 1] Scraped ${posts.length} posts, saving to database...`);

  // Save to database
  const postsToInsert = posts.map(post => ({
    account_id: accountId,
    shortcode: post.shortcode,
    post_id: post.post_id,
    post_url: post.post_url,
    type: post.type,
    caption: post.caption,
    hashtags: post.hashtags,
    mentions: post.mentions,
    media_urls: post.media_urls,
    thumbnail_url: post.thumbnail_url,
    video_duration: post.video_duration,
    likes_count: post.likes_count,
    comments_count: post.comments_count,
    views_count: post.views_count,
    posted_at: post.posted_at,
    location: post.location,
    is_sponsored: post.is_sponsored,
    scraped_at: new Date().toISOString(),
  }));

  // Delete old posts and insert new ones (upsert approach)
  const { error: deleteError } = await supabase
    .from('instagram_posts')
    .delete()
    .eq('account_id', accountId);

  if (deleteError) {
    console.error('[Step 1] Error deleting old posts:', deleteError);
  }

  const { error: insertError } = await supabase
    .from('instagram_posts')
    .insert(postsToInsert);

  if (insertError) {
    console.error('[Step 1] Error inserting posts:', insertError);
    throw new Error(`Failed to save posts: ${insertError.message}`);
  }

  console.log(`[Step 1] Saved ${posts.length} posts successfully`);

  return {
    postsCount: posts.length,
    oldestPost: posts[posts.length - 1]?.posted_at,
    newestPost: posts[0]?.posted_at,
    avgEngagement: posts.reduce((sum, p) => sum + p.likes_count + p.comments_count, 0) / posts.length,
  };
}

// ============================================
// Step 2: Scrape Comments (150 posts × 50 comments)
// ============================================

async function runStep2_Comments(supabase: any, accountId: string, username: string) {
  console.log('[Step 2] Starting comments scrape...');

  // Load posts from database
  const { data: posts, error: postsError } = await supabase
    .from('instagram_posts')
    .select('id, post_url, likes_count, comments_count, shortcode')
    .eq('account_id', accountId)
    .order('posted_at', { ascending: false });

  if (postsError || !posts || posts.length === 0) {
    throw new Error('No posts found. Please run step 1 first.');
  }

  // Select top 150 posts (100 top + 50 random)
  const selectedUrls = selectTopPostsForComments(
    posts.map(p => ({ ...p, post_url: p.post_url })),
    100,
    50
  );

  console.log(`[Step 2] Selected ${selectedUrls.length} posts for comment scraping`);

  const manager = new InstagramActorManager(username);
  const comments = await manager.scrapeComments(selectedUrls, 50);

  console.log(`[Step 2] Scraped ${comments.length} comments, saving to database...`);

  // Map comments to posts
  const commentsToInsert = await Promise.all(
    comments.map(async (comment) => {
      // Find post by shortcode
      const post = posts.find(p => p.shortcode === comment.post_shortcode);
      
      if (!post) {
        console.warn(`[Step 2] Post not found for comment: ${comment.post_shortcode}`);
        return null;
      }

      return {
        post_id: post.id,
        account_id: accountId,
        comment_id: comment.comment_id,
        text: comment.text,
        author_username: comment.author_username,
        author_profile_pic: comment.author_profile_pic,
        is_owner_reply: comment.is_owner_reply,
        likes_count: comment.likes_count,
        commented_at: comment.commented_at,
        scraped_at: new Date().toISOString(),
      };
    })
  );

  const validComments = commentsToInsert.filter(c => c !== null);

  // Delete old comments and insert new ones
  const { error: deleteError } = await supabase
    .from('instagram_comments')
    .delete()
    .eq('account_id', accountId);

  if (deleteError) {
    console.error('[Step 2] Error deleting old comments:', deleteError);
  }

  const { error: insertError } = await supabase
    .from('instagram_comments')
    .insert(validComments);

  if (insertError) {
    console.error('[Step 2] Error inserting comments:', insertError);
    throw new Error(`Failed to save comments: ${insertError.message}`);
  }

  console.log(`[Step 2] Saved ${validComments.length} comments successfully`);

  const ownerReplies = validComments.filter(c => c?.is_owner_reply).length;

  return {
    commentsCount: validComments.length,
    postsWithComments: selectedUrls.length,
    ownerReplies,
    ownerReplyRatio: Math.round((ownerReplies / validComments.length) * 100),
  };
}

// ============================================
// Step 3: Scrape Profile
// ============================================

async function runStep3_Profile(supabase: any, accountId: string, username: string) {
  console.log('[Step 3] Starting profile scrape...');

  const manager = new InstagramActorManager(username);
  const profile = await manager.scrapeProfile();

  console.log(`[Step 3] Scraped profile: @${profile.username}, saving to database...`);

  // Save to database
  const { error } = await supabase
    .from('instagram_profile_history')
    .insert({
      account_id: accountId,
      username: profile.username,
      full_name: profile.full_name,
      bio: profile.bio,
      bio_links: profile.bio_links,
      followers_count: profile.followers_count,
      following_count: profile.following_count,
      posts_count: profile.posts_count,
      category: profile.category,
      is_verified: profile.is_verified,
      is_business_account: profile.is_business_account,
      profile_pic_url: profile.profile_pic_url,
      snapshot_date: new Date().toISOString(),
    });

  if (error) {
    console.error('[Step 3] Error saving profile:', error);
    throw new Error(`Failed to save profile: ${error.message}`);
  }

  console.log('[Step 3] Profile saved successfully');

  return {
    username: profile.username,
    followers: profile.followers_count,
    following: profile.following_count,
    posts: profile.posts_count,
    category: profile.category,
    verified: profile.is_verified,
  };
}

// ============================================
// Step 4: Scrape Hashtags (20 × 30)
// ============================================

async function runStep4_Hashtags(supabase: any, accountId: string, username: string) {
  console.log('[Step 4] Starting hashtags scrape...');

  // Load posts to extract top hashtags
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('hashtags')
    .eq('account_id', accountId);

  if (!posts || posts.length === 0) {
    throw new Error('No posts found. Please run step 1 first.');
  }

  // Extract top 20 hashtags
  const allHashtags: string[] = posts.flatMap((p: any) => p.hashtags || []);
  const topHashtags = extractTopHashtags(
    posts.map((p: any) => ({ hashtags: p.hashtags || [] } as any)),
    20
  );

  console.log(`[Step 4] Top hashtags:`, topHashtags);

  const manager = new InstagramActorManager(username);
  const hashtagsData = await manager.scrapeHashtags(topHashtags, 30);

  console.log(`[Step 4] Scraped ${hashtagsData.length} hashtags, saving to database...`);

  // Save to database
  const hashtagsToInsert = hashtagsData.map(data => ({
    account_id: accountId,
    hashtag: data.hashtag,
    frequency: allHashtags.filter(h => h === data.hashtag).length,
    last_seen: new Date().toISOString(),
    context_posts: [], // Will be populated later if needed
    total_posts_in_hashtag: data.total_posts_in_hashtag,
    avg_engagement: data.avg_engagement,
  }));

  // Delete old hashtags and insert new ones
  const { error: deleteError } = await supabase
    .from('instagram_hashtags')
    .delete()
    .eq('account_id', accountId);

  if (deleteError) {
    console.error('[Step 4] Error deleting old hashtags:', deleteError);
  }

  const { error: insertError } = await supabase
    .from('instagram_hashtags')
    .insert(hashtagsToInsert);

  if (insertError) {
    console.error('[Step 4] Error inserting hashtags:', insertError);
    throw new Error(`Failed to save hashtags: ${insertError.message}`);
  }

  console.log('[Step 4] Hashtags saved successfully');

  return {
    hashtagsTracked: hashtagsData.length,
    topHashtags: topHashtags.slice(0, 10),
    totalOccurrences: allHashtags.length,
  };
}

// ============================================
// Step 5: Scrape Search (positioning)
// ============================================

async function runStep5_Search(supabase: any, accountId: string, username: string) {
  console.log('[Step 5] Starting search scrape...');

  // Load profile to get bio keywords
  const { data: profile } = await supabase
    .from('instagram_profile_history')
    .select('bio')
    .eq('account_id', accountId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  const bio = profile?.bio || '';
  const keywords = extractKeywordsFromBio(bio, 10);
  const queries = [username, ...keywords];

  console.log(`[Step 5] Search queries:`, queries);

  const manager = new InstagramActorManager(username);
  const searchData = await manager.scrapeSearch(queries);

  console.log(`[Step 5] Completed ${searchData.length} searches`);

  // Update profile history with search results
  const { error } = await supabase
    .from('instagram_profile_history')
    .update({
      search_results: {
        queries,
        results: searchData,
        searchedAt: new Date().toISOString(),
      },
    })
    .eq('account_id', accountId)
    .order('snapshot_date', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[Step 5] Error updating profile with search results:', error);
  }

  return {
    queriesExecuted: queries.length,
    totalResults: searchData.reduce((sum, s) => sum + s.results.length, 0),
    positioning: searchData[0]?.results.slice(0, 5) || [],
  };
}

// ============================================
// Step 6: Preprocessing
// ============================================

async function runStep6_Preprocessing(supabase: any, accountId: string) {
  console.log('[Step 6] Starting preprocessing...');

  const preprocessed = await runPreprocessing(accountId);

  console.log('[Step 6] Preprocessing complete');
  console.log(`[Step 6] Stats: ${preprocessed.topTerms.length} terms, ${preprocessed.topics.length} topics`);

  return {
    stats: preprocessed.stats,
    topTermsCount: preprocessed.topTerms.length,
    topicsCount: preprocessed.topics.length,
    faqCandidatesCount: preprocessed.faqCandidates.length,
    timelineBuckets: preprocessed.timeline.length,
  };
}

// ============================================
// Step 7: Gemini Persona Builder
// ============================================

async function runStep7_GeminiPersona(supabase: any, accountId: string) {
  console.log('[Step 7] Starting Gemini persona building...');

  // Load preprocessing data from previous step
  const preprocessed = await runPreprocessing(accountId);

  // Load profile data
  const { data: profile } = await supabase
    .from('instagram_profile_history')
    .select('*')
    .eq('account_id', accountId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  // Build persona with Gemini
  const persona = await runGeminiBuilder(accountId, preprocessed, profile);

  console.log('[Step 7] Persona built, saving to database...');

  // Save to database
  await savePersonaToDatabase(
    supabase,
    accountId,
    persona,
    preprocessed,
    JSON.stringify(persona)
  );

  console.log('[Step 7] Persona saved successfully');

  return {
    coreTopics: persona.knowledgeMap.coreTopics.length,
    voiceTone: persona.voice.tone,
    identityWho: persona.identity.who,
    boundariesDiscussed: persona.boundaries.discussed.length,
    boundariesNotDiscussed: persona.boundaries.notDiscussed.length,
  };
}

// ============================================
// Helper Functions
// ============================================

async function updateStepStatus(
  supabase: any,
  jobId: string,
  step: number,
  status: 'pending' | 'running' | 'completed' | 'failed',
  result: any,
  errorMessage: string | null
) {
  // Load current job
  const { data: job } = await supabase
    .from('scraping_jobs')
    .select('step_statuses')
    .eq('id', jobId)
    .single();

  if (!job) return;

  const stepStatuses = [...(job.step_statuses || [])];
  const stepIndex = step - 1;

  if (stepStatuses[stepIndex]) {
    stepStatuses[stepIndex] = {
      ...stepStatuses[stepIndex],
      status,
    };

    if (status === 'running') {
      stepStatuses[stepIndex].startedAt = new Date().toISOString();
    }

    if (status === 'completed' || status === 'failed') {
      stepStatuses[stepIndex].completedAt = new Date().toISOString();
      
      if (stepStatuses[stepIndex].startedAt) {
        const duration = Date.now() - new Date(stepStatuses[stepIndex].startedAt).getTime();
        stepStatuses[stepIndex].duration = Math.round(duration / 1000);
      }
    }

    if (result) {
      stepStatuses[stepIndex].result = result;
    }

    if (errorMessage) {
      stepStatuses[stepIndex].error = errorMessage;
    }
  }

  // Update the job
  await supabase
    .from('scraping_jobs')
    .update({
      step_statuses: stepStatuses,
      current_step: status === 'completed' ? step : job.current_step,
    })
    .eq('id', jobId);
}

async function updateJobStats(supabase: any, jobId: string, step: number, result: any) {
  const updates: any = {};

  if (step === 1 && result.postsCount) {
    updates.total_posts_scraped = result.postsCount;
  }

  if (step === 2 && result.commentsCount) {
    updates.total_comments_scraped = result.commentsCount;
  }

  if (step === 4 && result.hashtagsTracked) {
    updates.total_hashtags_tracked = result.hashtagsTracked;
  }

  if (Object.keys(updates).length > 0) {
    await supabase
      .from('scraping_jobs')
      .update(updates)
      .eq('id', jobId);
  }

  // Also update results object
  const { data: job } = await supabase
    .from('scraping_jobs')
    .select('results')
    .eq('id', jobId)
    .single();

  if (job) {
    const results = { ...job.results, [`step${step}`]: result };
    
    await supabase
      .from('scraping_jobs')
      .update({ results })
      .eq('id', jobId);
  }
}
