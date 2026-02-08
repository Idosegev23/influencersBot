/**
 * New Scan Orchestrator with ScrapeCreators
 * מתזמן סריקה מלאה של משפיען עם ScrapeCreators API
 */

import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { getScrapeCreatorsClient, ScrapeCreatorsError } from './scrapeCreatorsClient';
import { getGlobalRateLimiter, ScanJobLock } from './rateLimiter';
import { crawlWebsite, extractUrlsFromBio, saveWebsiteData } from './website-crawler';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';

// ============================================
// Type Definitions
// ============================================

export interface NewScanConfig {
  postsLimit: number;
  commentsPerPost: number;
  maxWebsitePages: number;
  samplesPerHighlight: number;
  transcribeReels: boolean;
}

export interface ScanResult {
  success: boolean;
  jobId: string;
  stats: ScanStats;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  duration: number;
}

export interface ScanStats {
  profileScraped: boolean;
  postsCount: number;
  commentsCount: number;
  highlightsCount: number;
  highlightItemsCount: number;
  websitesCrawled: number;
  websitePagesCount: number;
  transcriptsCount: number;
}

export interface ProgressCallback {
  (step: string, status: 'pending' | 'running' | 'completed' | 'failed', progress: number, message: string): void;
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_SCAN_CONFIG: NewScanConfig = {
  postsLimit: 50,
  commentsPerPost: 3,
  maxWebsitePages: 10,
  samplesPerHighlight: 999, // ⚡ Get ALL items from each highlight (not just samples!)
  transcribeReels: true, // ⚡ CRITICAL: Must transcribe highlights for persona + partnerships detection!
};

// ============================================
// Main Orchestrator
// ============================================

export class NewScanOrchestrator {
  private client = getScrapeCreatorsClient();
  private rateLimiter = getGlobalRateLimiter();
  private supabase: any;
  private repo = getScanJobsRepo(); // ⚡ NEW: For logging

  constructor() {
    // Supabase will be initialized in run()
  }

  /**
   * Run full scan for an influencer
   */
  async run(
    jobId: string,
    username: string,
    accountId: string,
    config: Partial<NewScanConfig> = {},
    onProgress?: ProgressCallback
  ): Promise<ScanResult> {
    const startTime = Date.now();
    const fullConfig = { ...DEFAULT_SCAN_CONFIG, ...config };
    const sessionId = randomUUID();
    
    const stats: ScanStats = {
      profileScraped: false,
      postsCount: 0,
      commentsCount: 0,
      highlightsCount: 0,
      highlightItemsCount: 0,
      websitesCrawled: 0,
      websitePagesCount: 0,
      transcriptsCount: 0,
    };

    // Try to acquire lock
    if (!ScanJobLock.tryAcquire(jobId)) {
      return {
        success: false,
        jobId,
        stats,
        error: {
          code: 'LOCK_FAILED',
          message: 'Another scan is already running',
          retryable: true,
        },
        duration: 0,
      };
    }

    try {
      this.supabase = await createClient();
      
      const report = async (step: string, status: any, progress: number, message: string) => {
        console.log(`[NewScanOrchestrator] [${step}] ${message}`);
        
        // ⚡ Save to database for UI display!
        await this.repo.addStepLog(jobId, step, status, progress, message).catch(err => {
          console.error('[Orchestrator] Failed to save log:', err);
        });
        
        if (onProgress) {
          onProgress(step, status, progress, message);
        }
      };

      console.log(`\n${'='.repeat(70)}`);
      console.log(`🚀 Starting scan for @${username}`);
      console.log(`📋 Job: ${jobId}, Session: ${sessionId}`);
      console.log(`${'='.repeat(70)}\n`);

      // ==========================================
      // STEP 1: Fetch Profile
      // ==========================================
      report('profile', 'running', 5, 'סורק פרופיל...');
      
      const profile = await this.client.getProfile(username);
      
      console.log(`[NewScanOrchestrator] Profile data:`, {
        username: profile.username,
        followers: profile.followers_count,
        posts: profile.posts_count,
      });
      
      // Save to instagram_profile_history
      await this.supabase.from('instagram_profile_history').insert({
        account_id: accountId,
        username: profile.username,
        full_name: profile.full_name,
        bio: profile.bio,
        bio_links: profile.bio_links || [],
        followers_count: profile.followers_count || 0,
        following_count: profile.following_count || 0,
        posts_count: profile.posts_count || 0,
        category: profile.category,
        is_verified: profile.is_verified,
        is_business_account: profile.is_business,
        profile_pic_url: profile.profile_pic_url,
      });

      stats.profileScraped = true;
      const followersText = profile.followers_count 
        ? profile.followers_count.toLocaleString() 
        : '?';
      report('profile', 'completed', 10, `✓ פרופיל: ${followersText} עוקבים`);

      // ==========================================
      // STEP 2: Crawl Websites from Bio (if any links)
      // ==========================================
      await this.rateLimiter.waitRandom('after profile');
      
      if (profile.bio_links && profile.bio_links.length > 0) {
        report('websites', 'running', 15, 'סורק אתרים מהביו...');
        
        const bioUrls = extractUrlsFromBio(profile.bio || '', profile.bio_links);
        
        if (bioUrls.length > 0 && fullConfig.maxWebsitePages > 0) {
          console.log(`[Step 2] Found ${bioUrls.length} URLs in bio`);
          
          for (const url of bioUrls) {
            try {
              const websiteData = await crawlWebsite(url, fullConfig.maxWebsitePages);
              await saveWebsiteData(this.supabase, accountId, websiteData);
              stats.websitesCrawled++;
              stats.websitePagesCount += websiteData.pages.length;
            } catch (error) {
              console.error(`[Step 2] Failed to crawl ${url}:`, error);
            }
          }
          
          report('websites', 'completed', 20, `✓ ${stats.websitesCrawled} אתרים, ${stats.websitePagesCount} עמודים`);
        } else {
          report('websites', 'completed', 20, '✓ אין אתרים לסריקה');
        }
      } else {
        report('websites', 'completed', 20, '✓ אין לינקים בביו');
      }

      // ==========================================
      // STEP 3: Fetch Active Stories (24h)
      // ==========================================
      await this.rateLimiter.waitRandom('after websites');
      report('stories', 'running', 25, 'סורק סטוריז פעילים...');
      
      // TODO: Add getStories() to scrapeCreatorsClient
      // For now, skip stories (highlights contain historical stories)
      console.log(`[Step 3] Stories API not yet implemented - skipping`);
      report('stories', 'completed', 30, '⏭️ סטוריז - לא זמין כרגע (רק היילייטס)');

      // ==========================================
      // STEP 4: Random Delay
      // ==========================================
      await this.rateLimiter.waitRandom('after stories');

      // ==========================================
      // STEP 5: Fetch Highlights (metadata + samples)
      // ==========================================
      report('highlights', 'running', 35, 'סורק הילייטס...');
      
      const highlightsData = await this.client.getHighlightSamples(
        username,
        fullConfig.samplesPerHighlight,
        15 // ⚡ Max 15 highlights
      );

      // Save highlights metadata
      for (const highlight of highlightsData.highlights) {
        const { data: savedHighlight } = await this.supabase
          .from('instagram_highlights')
          .upsert({
            account_id: accountId,
            highlight_id: highlight.highlight_id,
            title: highlight.title,
            cover_image_url: highlight.cover_url,
            items_count: highlight.items_count,
            scraped_at: new Date().toISOString(),
          }, {
            onConflict: 'account_id,highlight_id',
          })
          .select()
          .single();

        stats.highlightsCount++;

        // Save sample items
        const sample = highlightsData.samples.find(s => s.highlightId === highlight.highlight_id);
        if (sample && savedHighlight) {
          for (let i = 0; i < sample.items.length; i++) {
            const item = sample.items[i];
            
            await this.supabase.from('instagram_highlight_items').upsert({
              highlight_id: savedHighlight.id,
              account_id: accountId,
              item_id: item.story_id,
              item_index: i,
              media_type: item.media_type === 'video' ? 'video' : 'image',
              media_url: item.media_url,
              thumbnail_url: item.thumbnail_url,
              posted_at: item.timestamp,
              scraped_at: new Date().toISOString(),
            }, {
              onConflict: 'highlight_id,item_id',
            });

            stats.highlightItemsCount++;
          }
        }
      }

      report('highlights', 'completed', 45, 
        `✓ ${stats.highlightsCount} הילייטס (${stats.highlightItemsCount} פריטים לדגימה)`);

      // ==========================================
      // STEP 6: Random Delay
      // ==========================================
      await this.rateLimiter.waitRandom('after highlights');

      // ==========================================
      // STEP 7: Fetch Posts (LAST! Most important is profile, bio, stories, highlights)
      // ==========================================
      report('posts', 'running', 50, `סורק ${fullConfig.postsLimit} פוסטים...`);
      
      const posts = await this.client.getPosts(username, fullConfig.postsLimit);
      
      for (const post of posts) {
        await this.supabase.from('instagram_posts').upsert({
          account_id: accountId,
          shortcode: post.shortcode,
          post_id: post.post_id,
          post_url: post.post_url,
          type: post.media_type === 'video' ? 'reel' : post.media_type,
          caption: post.caption,
          mentions: post.mentions || [],
          media_urls: post.media_urls,
          thumbnail_url: post.thumbnail_url,
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
        
        stats.postsCount++;
      }

      report('posts', 'completed', 70, `✓ ${stats.postsCount} פוסטים`);

      // ==========================================
      // STEP 8: Random Delay
      // ==========================================
      await this.rateLimiter.waitRandom('after posts');

      // ==========================================
      // STEP 9: Fetch Comments (from posts)
      // ==========================================
      report('comments', 'running', 75, 'סורק תגובות...');
      
      // Select posts for comments
      const postUrlsForComments = posts
        .sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0))
        .slice(0, Math.min(fullConfig.postsLimit, posts.length))
        .map(p => p.post_url);

      if (postUrlsForComments.length > 0) {
        const comments = await this.client.getBatchPostComments(
          postUrlsForComments,
          fullConfig.commentsPerPost
        );

        // Get post IDs for linking
        const { data: savedPosts } = await this.supabase
          .from('instagram_posts')
          .select('id, shortcode')
          .eq('account_id', accountId);

        const postIdMap = new Map(savedPosts?.map((p: any) => [p.shortcode, p.id]) || []);

        // Save comments
        for (const comment of comments) {
          const postId = postIdMap.get(comment.post_shortcode);
          if (!postId) continue;

          await this.supabase.from('instagram_comments').upsert({
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

          stats.commentsCount++;
        }
      }

      report('comments', 'completed', 70, `✓ ${stats.commentsCount} תגובות`);

      // ==========================================
      // STEP 8: Crawl Bio Websites
      // ==========================================
      if (profile.bio || profile.external_url) {
        await this.rateLimiter.waitRandom('before websites');
        report('websites', 'running', 75, 'סורק אתרים מהביו...');

        const urls = extractUrlsFromBio(profile.bio || '', profile.external_url);
        
        for (const url of urls) {
          try {
            const websiteResult = await crawlWebsite(url, fullConfig.maxWebsitePages);
            const saved = await saveWebsiteData(accountId, websiteResult, sessionId);
            
            stats.websitesCrawled++;
            stats.websitePagesCount += saved.pagesSaved;

            // Small delay between websites
            await this.rateLimiter.waitFixed(1000, 'between websites');
          } catch (error: any) {
            console.error(`[NewScanOrchestrator] Failed to crawl ${url}:`, error.message);
          }
        }

        report('websites', 'completed', 85, 
          `✓ ${stats.websitesCrawled} אתרים (${stats.websitePagesCount} עמודים)`);
      } else {
        report('websites', 'completed', 85, 'אין אתרים בביו');
      }

      // ==========================================
      // STEP 9: Transcribe Reels
      // ==========================================
      if (fullConfig.transcribeReels) {
        await this.rateLimiter.waitRandom('before transcription');
        report('transcription', 'running', 90, 'מתמלל רילס...');

        // Get video URLs from posts
        const videoUrls = posts
          .filter(p => p.media_type === 'video')
          .flatMap(p => p.media_urls)
          .filter(Boolean);

        if (videoUrls.length > 0) {
          try {
            const transcripts = await this.client.getBatchTranscripts(videoUrls);

            // Save transcriptions
            for (const transcript of transcripts) {
              // Find the post this belongs to
              const post = posts.find(p => p.media_urls.includes(transcript.media_url));
              
              if (post) {
                const { data: postRecord } = await this.supabase
                  .from('instagram_posts')
                  .select('id')
                  .eq('account_id', accountId)
                  .eq('shortcode', post.shortcode)
                  .single();

                if (postRecord) {
                  await this.supabase.from('instagram_transcriptions').upsert({
                    account_id: accountId,
                    source_type: 'reel',
                    source_id: postRecord.id,
                    video_url: transcript.media_url,
                    transcription_text: transcript.transcript,
                    language: transcript.language || 'he',
                    processing_status: 'completed',
                    processed_at: new Date().toISOString(),
                  }, {
                    onConflict: 'source_type,source_id',
                  });

                  stats.transcriptsCount++;
                }
              }
            }

            report('transcription', 'completed', 95, `✓ ${stats.transcriptsCount} תמלולים`);
          } catch (error: any) {
            report('transcription', 'failed', 95, `שגיאה בתמלול: ${error.message}`);
          }
        } else {
          report('transcription', 'completed', 95, 'אין רילס לתמלול');
        }
      }

      // ==========================================
      // STEP 10: Update Account
      // ==========================================
      await this.supabase
        .from('accounts')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', accountId);

      // ==========================================
      // STEP 11: Process Content & Build Persona 🎬 (Background)
      // ==========================================
      report('processing', 'running', 96, 'מתזמן עיבוד תוכן...');
      
      // ⚡ Start processing in background (don't wait!)
      console.log(`\n[Step 11/11] Starting content processing in background...`);
      
      // Fire and forget - let it run after scan completes
      startProcessingInBackground(accountId, jobId, config.transcribeReels).catch(err => {
        console.error(`[Step 11/11] Background processing error:`, err.message);
      });
      
      report('processing', 'completed', 99, '✓ עיבוד מתוזמן ברקע');
      console.log(`[Step 11/11] ✓ Processing scheduled - will continue in background`);

      // ==========================================
      // Done
      // ==========================================
      const duration = (Date.now() - startTime) / 1000;

      console.log(`\n${'='.repeat(70)}`);
      console.log(`✅ Scan completed in ${duration.toFixed(2)}s`);
      console.log(`📊 Stats:`, stats);
      console.log(`${'='.repeat(70)}\n`);

      return {
        success: true,
        jobId,
        stats,
        duration,
      };

    } catch (error: any) {
      const duration = (Date.now() - startTime) / 1000;
      
      console.error(`\n${'='.repeat(70)}`);
      console.error(`❌ Scan failed after ${duration.toFixed(2)}s`);
      console.error(`Error:`, error);
      console.error(`${'='.repeat(70)}\n`);

      // Normalize error
      let errorCode = 'UNKNOWN';
      let errorMessage = error.message || 'Unknown error';
      let retryable = false;

      if (error instanceof ScrapeCreatorsError) {
        errorCode = error.errorCode || 'UNKNOWN';
        errorMessage = error.message;
        retryable = error.retryable;
      } else if (error.code) {
        errorCode = error.code;
        retryable = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      }

      return {
        success: false,
        jobId,
        stats,
        error: {
          code: errorCode,
          message: errorMessage,
          retryable,
        },
        duration,
      };
    } finally {
      // Always release lock
      ScanJobLock.release();
    }
  }
}

// ============================================
// Background Processing
// ============================================

/**
 * Start content processing in background (fire and forget)
 */
async function startProcessingInBackground(
  accountId: string,
  scanJobId: string,
  transcribeReels: boolean
): Promise<void> {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 [Background] Starting content processing for account ${accountId}`);
    console.log(`${'='.repeat(60)}\n`);

    const { processAccountContent } = await import('@/lib/processing/content-processor-orchestrator');
    
    const result = await processAccountContent({
      accountId,
      scanJobId,
      transcribeVideos: transcribeReels,
      maxVideosToTranscribe: 999, // ⚡ Transcribe ALL videos
      buildPersona: true,
      priority: 'normal',
    });

    console.log(`\n${'='.repeat(60)}`);
    if (result.success) {
      console.log(`✅ [Background] Content processing completed!`);
      console.log(`   - Videos transcribed: ${result.stats.videosTranscribed}`);
      console.log(`   - Persona built: ${result.stats.personaBuilt ? 'Yes' : 'No'}`);
      console.log(`   - Time: ${(result.stats.processingTimeMs / 1000).toFixed(2)}s`);
    } else {
      console.log(`⚠️ [Background] Processing completed with errors`);
      console.log(`   - Errors: ${result.errors.join(', ')}`);
    }
    console.log(`${'='.repeat(60)}\n`);

  } catch (error: any) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [Background] Content processing failed:`, error.message || error);
    console.error(`${'='.repeat(60)}\n`);
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Run scan for a job
 */
export async function runScanJob(
  jobId: string,
  username: string,
  accountId: string,
  config?: Partial<NewScanConfig>,
  onProgress?: ProgressCallback
): Promise<ScanResult> {
  const orchestrator = new NewScanOrchestrator();
  return orchestrator.run(jobId, username, accountId, config, onProgress);
}

/**
 * Run quick daily rescan (only yesterday's posts)
 */
export async function runDailyRescan(
  username: string,
  accountId: string,
  onProgress?: ProgressCallback
): Promise<ScanResult> {
  const jobId = randomUUID();
  const orchestrator = new NewScanOrchestrator();
  
  return orchestrator.run(
    jobId,
    username,
    accountId,
    {
      postsLimit: 10, // Only recent posts
      commentsPerPost: 2,
      maxWebsitePages: 0, // Don't crawl websites on daily rescan
      samplesPerHighlight: 0, // Don't fetch highlights
      transcribeReels: false, // Don't transcribe on daily rescan
    },
    onProgress
  );
}
