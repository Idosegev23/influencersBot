/**
 * Influencer Scrape Orchestrator
 * מתזמר את כל תהליך גריפת המידע להקמת משפיען
 */

import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

// Import all scrapers
import { 
  scrapeHighlightsAndStories, 
  saveHighlightsAndStories 
} from './highlights-scraper';

import { 
  extractUrlsFromBio, 
  crawlWebsite, 
  saveWebsiteData 
} from './website-crawler';

import { 
  processPendingTranscriptions 
} from '../transcription/gemini-transcriber';

import { 
  runFullProcessing,
  ProcessedInfluencerData 
} from '../processing/unified-processor';

import { InstagramActorManager, selectTopPostsForComments } from './apify-actors';

// ============================================
// Type Definitions
// ============================================

export interface ScrapeOrchestrationConfig {
  // What to scrape
  scrapeHighlights: boolean;
  scrapeStories: boolean;
  scrapePosts: boolean;
  scrapeComments: boolean;
  scrapeBioWebsites: boolean;
  scrapeReels: boolean;
  
  // Limits
  postsLimit: number;
  commentsPerPost: number;
  maxWebsitePages: number;
  
  // Processing
  transcribeVideos: boolean;
  processWithGemini: boolean;
}

export interface ScrapeOrchestrationResult {
  success: boolean;
  sessionId: string;
  stats: ScrapeStats;
  processedData?: ProcessedInfluencerData;
  error?: string;
  duration: number;
}

export interface ScrapeStats {
  highlightsSaved: number;
  highlightItemsSaved: number;
  storiesSaved: number;
  postsSaved: number;
  commentsSaved: number;
  websitePagesSaved: number;
  videosTranscribed: number;
  dataProcessed: boolean;
}

export interface ProgressCallback {
  (progress: ScrapeProgress): void;
}

export interface ScrapeProgress {
  step: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number; // 0-100
  message: string;
  details?: any;
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_SCRAPE_CONFIG: ScrapeOrchestrationConfig = {
  scrapeHighlights: true,
  scrapeStories: true,
  scrapePosts: true,
  scrapeComments: true,
  scrapeBioWebsites: true,
  scrapeReels: true,
  
  postsLimit: 150, // Upgraded from 10 to 150 for deeper content analysis
  commentsPerPost: 3,
  maxWebsitePages: 6,
  
  transcribeVideos: true,
  processWithGemini: true,
};

// ============================================
// Main Orchestration Function
// ============================================

/**
 * Run full influencer scrape orchestration
 */
export async function runInfluencerScrapeOrchestration(
  username: string,
  accountId: string,
  config: Partial<ScrapeOrchestrationConfig> = {},
  onProgress?: ProgressCallback
): Promise<ScrapeOrchestrationResult> {
  const startTime = Date.now();
  const sessionId = randomUUID();
  const fullConfig = { ...DEFAULT_SCRAPE_CONFIG, ...config };
  
  const stats: ScrapeStats = {
    highlightsSaved: 0,
    highlightItemsSaved: 0,
    storiesSaved: 0,
    postsSaved: 0,
    commentsSaved: 0,
    websitePagesSaved: 0,
    videosTranscribed: 0,
    dataProcessed: false,
  };

  const supabase = await createClient();
  const actorManager = new InstagramActorManager(username);

  const reportProgress = (step: string, status: ScrapeProgress['status'], progress: number, message: string, details?: any) => {
    if (onProgress) {
      onProgress({ step, status, progress, message, details });
    }
    console.log(`[Orchestrator] [${step}] ${message}`);
  };

  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 [Orchestrator] Starting scrape for @${username}`);
    console.log(`📋 Session: ${sessionId}`);
    console.log(`${'='.repeat(60)}\n`);

    // ============================
    // STEP 1: Scrape Profile
    // ============================
    reportProgress('profile', 'running', 5, 'סורק פרופיל...');
    
    let profile;
    try {
      profile = await actorManager.scrapeProfile();
      
      // Save profile snapshot
      await supabase.from('instagram_profile_history').insert({
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
      });

      // Save raw data
      await supabase.from('influencer_raw_data').insert({
        account_id: accountId,
        data_type: 'profile',
        raw_json: profile,
        source_actor: 'apify/instagram-profile-scraper',
        scrape_session_id: sessionId,
      });

      reportProgress('profile', 'completed', 10, `פרופיל נסרק: ${profile.followers_count} עוקבים`);
    } catch (error: any) {
      reportProgress('profile', 'failed', 10, `שגיאה בסריקת פרופיל: ${error.message}`);
      throw error;
    }

    // ============================
    // STEP 2: Scrape Highlights & Stories
    // ============================
    if (fullConfig.scrapeHighlights || fullConfig.scrapeStories) {
      reportProgress('highlights', 'running', 15, 'סורק הילייטס וסטוריז...');
      
      try {
        const highlightsResult = await scrapeHighlightsAndStories(username);
        const saved = await saveHighlightsAndStories(accountId, highlightsResult, sessionId);
        
        stats.highlightsSaved = saved.highlightsSaved;
        stats.highlightItemsSaved = saved.highlightItemsSaved;
        stats.storiesSaved = saved.storiesSaved;

        reportProgress('highlights', 'completed', 25, 
          `נסרקו ${stats.highlightsSaved} הילייטס (${stats.highlightItemsSaved} פריטים), ${stats.storiesSaved} סטוריז`);
      } catch (error: any) {
        reportProgress('highlights', 'failed', 25, `שגיאה בסריקת הילייטס: ${error.message}`);
        // Continue with other steps
      }
    } else {
      reportProgress('highlights', 'skipped', 25, 'דילוג על הילייטס וסטוריז');
    }

    // ============================
    // STEP 3: Scrape Posts
    // ============================
    if (fullConfig.scrapePosts) {
      reportProgress('posts', 'running', 30, `סורק ${fullConfig.postsLimit} פוסטים אחרונים...`);
      
      try {
        const posts = await actorManager.scrapePosts(fullConfig.postsLimit);
        
        // Save posts (without hashtags in caption for cleaner data)
        for (const post of posts) {
          await supabase.from('instagram_posts').upsert({
            account_id: accountId,
            shortcode: post.shortcode,
            post_id: post.post_id,
            post_url: post.post_url,
            type: post.type,
            caption: post.caption, // We'll filter hashtags in processing
            hashtags: [], // Don't save hashtags as requested
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
          }, {
            onConflict: 'account_id,shortcode',
          });
          
          stats.postsSaved++;
        }

        // Save raw data
        await supabase.from('influencer_raw_data').insert({
          account_id: accountId,
          data_type: 'posts',
          raw_json: posts,
          source_actor: 'apify/instagram-scraper',
          scrape_session_id: sessionId,
        });

        reportProgress('posts', 'completed', 45, `נסרקו ${stats.postsSaved} פוסטים`);

        // ============================
        // STEP 4: Scrape Comments
        // ============================
        if (fullConfig.scrapeComments && posts.length > 0) {
          reportProgress('comments', 'running', 50, 'סורק תגובות...');
          
          try {
            // Select posts to get comments from (prioritize high engagement)
            const postUrls = selectTopPostsForComments(posts, fullConfig.postsLimit, 0)
              .slice(0, fullConfig.postsLimit);
            
            const comments = await actorManager.scrapeComments(postUrls, fullConfig.commentsPerPost);
            
            // Get post IDs for linking
            const { data: savedPosts } = await supabase
              .from('instagram_posts')
              .select('id, shortcode')
              .eq('account_id', accountId);
            
            const postIdMap = new Map(savedPosts?.map(p => [p.shortcode, p.id]) || []);

            // Save comments
            for (const comment of comments) {
              const postId = postIdMap.get(comment.post_shortcode);
              if (!postId) continue;

              await supabase.from('instagram_comments').upsert({
                post_id: postId,
                account_id: accountId,
                comment_id: comment.comment_id,
                text: comment.text,
                author_username: comment.author_username,
                author_profile_pic: comment.author_profile_pic,
                is_owner_reply: comment.is_owner_reply,
                likes_count: comment.likes_count,
                commented_at: comment.commented_at,
                scraped_at: new Date().toISOString(),
              }, {
                onConflict: 'post_id,comment_id',
              });
              
              stats.commentsSaved++;
            }

            // Save raw data
            await supabase.from('influencer_raw_data').insert({
              account_id: accountId,
              data_type: 'comments',
              raw_json: comments,
              source_actor: 'apify/instagram-comment-scraper',
              scrape_session_id: sessionId,
            });

            reportProgress('comments', 'completed', 60, `נסרקו ${stats.commentsSaved} תגובות`);
          } catch (error: any) {
            reportProgress('comments', 'failed', 60, `שגיאה בסריקת תגובות: ${error.message}`);
          }
        }
      } catch (error: any) {
        reportProgress('posts', 'failed', 45, `שגיאה בסריקת פוסטים: ${error.message}`);
      }
    } else {
      reportProgress('posts', 'skipped', 60, 'דילוג על פוסטים');
    }

    // ============================
    // STEP 5: Scrape Bio Websites
    // ============================
    if (fullConfig.scrapeBioWebsites && profile?.bio) {
      reportProgress('websites', 'running', 65, 'סורק אתרים מהביו...');
      
      try {
        const urls = extractUrlsFromBio(profile.bio, profile.bio_links?.[0]);
        
        for (const url of urls) {
          try {
            const websiteResult = await crawlWebsite(url, fullConfig.maxWebsitePages);
            const saved = await saveWebsiteData(accountId, websiteResult, sessionId);
            stats.websitePagesSaved += saved.pagesSaved;
          } catch (error: any) {
            console.error(`[Orchestrator] Failed to crawl ${url}:`, error.message);
          }
        }

        reportProgress('websites', 'completed', 75, `נסרקו ${stats.websitePagesSaved} עמודים מ-${urls.length} אתרים`);
      } catch (error: any) {
        reportProgress('websites', 'failed', 75, `שגיאה בסריקת אתרים: ${error.message}`);
      }
    } else {
      reportProgress('websites', 'skipped', 75, 'דילוג על אתרים');
    }

    // ============================
    // STEP 6: Transcribe Videos
    // ============================
    if (fullConfig.transcribeVideos) {
      reportProgress('transcription', 'running', 80, 'מתמלל סרטונים...');
      
      try {
        const transcriptionResult = await processPendingTranscriptions(accountId, 30); // Upgraded from 10 to 30 for deeper coverage
        stats.videosTranscribed = transcriptionResult.succeeded;

        reportProgress('transcription', 'completed', 90, 
          `תומללו ${stats.videosTranscribed} סרטונים (${transcriptionResult.failed} נכשלו)`);
      } catch (error: any) {
        reportProgress('transcription', 'failed', 90, `שגיאה בתמלול: ${error.message}`);
      }
    } else {
      reportProgress('transcription', 'skipped', 90, 'דילוג על תמלול');
    }

    // ============================
    // STEP 7: Process with Gemini
    // ============================
    let processedData: ProcessedInfluencerData | undefined;
    
    if (fullConfig.processWithGemini) {
      reportProgress('processing', 'running', 92, 'מעבד את כל המידע עם AI...');
      
      try {
        const processingResult = await runFullProcessing(accountId);
        
        if (processingResult.success && processingResult.data) {
          processedData = processingResult.data;
          stats.dataProcessed = true;

          reportProgress('processing', 'completed', 100, 
            `עובד בהצלחה: ${processedData.coupons.length} קופונים, ${processedData.partnerships.length} שת"פים`);
        } else {
          reportProgress('processing', 'failed', 100, processingResult.error || 'עיבוד נכשל');
        }
      } catch (error: any) {
        reportProgress('processing', 'failed', 100, `שגיאה בעיבוד: ${error.message}`);
      }
    } else {
      reportProgress('processing', 'skipped', 100, 'דילוג על עיבוד');
    }

    // ============================
    // DONE
    // ============================
    const duration = (Date.now() - startTime) / 1000;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [Orchestrator] Completed in ${duration.toFixed(2)}s`);
    console.log(`📊 Stats:`, stats);
    console.log(`${'='.repeat(60)}\n`);

    return {
      success: true,
      sessionId,
      stats,
      processedData,
      duration,
    };

  } catch (error: any) {
    const duration = (Date.now() - startTime) / 1000;
    
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [Orchestrator] Failed after ${duration.toFixed(2)}s`);
    console.error(`Error:`, error.message);
    console.error(`${'='.repeat(60)}\n`);

    return {
      success: false,
      sessionId,
      stats,
      error: error.message,
      duration,
    };
  }
}

// ============================================
// Quick Rescan Function (minimal scrape)
// ============================================

/**
 * Quick rescan - only get new posts and process
 */
export async function runQuickRescan(
  username: string,
  accountId: string,
  onProgress?: ProgressCallback
): Promise<ScrapeOrchestrationResult> {
  return runInfluencerScrapeOrchestration(
    username,
    accountId,
    {
      scrapeHighlights: false,
      scrapeStories: false,
      scrapePosts: true,
      scrapeComments: true,
      scrapeBioWebsites: false,
      scrapeReels: true,
      postsLimit: 5,
      commentsPerPost: 2,
      transcribeVideos: true,
      processWithGemini: true,
    },
    onProgress
  );
}

// ============================================
// Export types
// ============================================
export type {
  ProcessedInfluencerData
} from '../processing/unified-processor';
