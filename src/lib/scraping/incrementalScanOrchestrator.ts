/**
 * Incremental Scan Orchestrator
 * סריקה חכמה שמזהה ומעדכנת רק תוכן חדש
 */

import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { getScrapeCreatorsClient } from './scrapeCreatorsClient';
import { getGlobalRateLimiter } from './rateLimiter';

export interface IncrementalScanConfig {
  maxNewPosts: number;
  checkHighlights: boolean;
  transcribeNewReels: boolean;
  updateProfile: boolean;
}

export interface IncrementalScanResult {
  success: boolean;
  stats: {
    newPostsFound: number;
    newHighlightsFound: number;
    newHighlightItemsFound: number;
    transcriptsCreated: number;
    profileUpdated: boolean;
  };
  duration: number;
  error?: string;
}

export const DEFAULT_INCREMENTAL_CONFIG: IncrementalScanConfig = {
  maxNewPosts: 20, // רק 20 פוסטים אחרונים
  checkHighlights: true,
  transcribeNewReels: true,
  updateProfile: true,
};

export class IncrementalScanOrchestrator {
  private client = getScrapeCreatorsClient();
  private rateLimiter = getGlobalRateLimiter();
  private supabase: any;

  constructor() {}

  /**
   * סריקה חכמה - רק תוכן חדש
   */
  async run(
    username: string,
    accountId: string,
    config: Partial<IncrementalScanConfig> = {}
  ): Promise<IncrementalScanResult> {
    const startTime = Date.now();
    const fullConfig = { ...DEFAULT_INCREMENTAL_CONFIG, ...config };
    
    const stats = {
      newPostsFound: 0,
      newHighlightsFound: 0,
      newHighlightItemsFound: 0,
      transcriptsCreated: 0,
      profileUpdated: false,
    };

    try {
      this.supabase = await createClient();
      
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🔄 Incremental scan for @${username}`);
      console.log(`📋 Account: ${accountId}`);
      console.log(`${'='.repeat(70)}\n`);

      // ==========================================
      // STEP 1: Get last scan date
      // ==========================================
      const { data: lastPost } = await this.supabase
        .from('instagram_posts')
        .select('posted_at, scraped_at')
        .eq('account_id', accountId)
        .order('posted_at', { ascending: false })
        .limit(1)
        .single();

      const lastScannedDate = lastPost?.posted_at 
        ? new Date(lastPost.posted_at) 
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // אם אין, לך 30 יום אחורה

      console.log(`[Step 1] Last scanned post: ${lastScannedDate.toISOString()}`);

      // ==========================================
      // STEP 2: Update Profile (if needed)
      // ==========================================
      if (fullConfig.updateProfile) {
        console.log(`[Step 2] Updating profile...`);
        
        const profile = await this.client.getProfile(username);
        
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

        // Persist avatar to Supabase Storage so it never expires
        if (profile.profile_pic_url) {
          try {
            const picRes = await fetch(profile.profile_pic_url);
            if (picRes.ok) {
              const picBuffer = Buffer.from(await picRes.arrayBuffer());
              const picType = picRes.headers.get('content-type') || 'image/jpeg';
              const picExt = picType.includes('png') ? 'png' : 'jpg';
              await this.supabase.storage.from('avatars').upload(
                `${accountId}/profile.${picExt}`, picBuffer,
                { contentType: picType, upsert: true }
              );
              const { data: urlData } = this.supabase.storage.from('avatars').getPublicUrl(`${accountId}/profile.${picExt}`);
              if (urlData?.publicUrl) {
                const { data: acct } = await this.supabase.from('accounts').select('config').eq('id', accountId).single();
                if (acct) {
                  await this.supabase.from('accounts').update({ config: { ...acct.config, avatar_url: urlData.publicUrl } }).eq('id', accountId);
                }
              }
              console.log('[Step 2] ✓ Avatar saved to storage');
            }
          } catch (avatarErr) {
            console.warn('[Step 2] Avatar persist failed:', avatarErr);
          }
        }

        stats.profileUpdated = true;
        console.log(`[Step 2] ✓ Profile updated`);

        await this.rateLimiter.waitRandom('after profile');
      }

      // ==========================================
      // STEP 3: Fetch recent posts
      // ==========================================
      console.log(`[Step 3] Fetching ${fullConfig.maxNewPosts} recent posts...`);
      
      const posts = await this.client.getPosts(username, fullConfig.maxNewPosts);
      
      // Filter only NEW posts (after last scanned date)
      const newPosts = posts.filter(p => {
        const postedAt = new Date(p.posted_at);
        return postedAt > lastScannedDate;
      });

      console.log(`[Step 3] Found ${newPosts.length} NEW posts (out of ${posts.length} fetched)`);

      // Save only new posts
      for (const post of newPosts) {
        const { error } = await this.supabase.from('instagram_posts').upsert({
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

        if (!error) {
          stats.newPostsFound++;
        }
      }

      console.log(`[Step 3] ✓ Saved ${stats.newPostsFound} new posts`);

      await this.rateLimiter.waitRandom('after posts');

      // ==========================================
      // STEP 4: Check for new highlights
      // ==========================================
      if (fullConfig.checkHighlights) {
        console.log(`[Step 4] Checking for new highlights...`);
        
        const highlightsData = await this.client.getHighlightSamples(
          username,
          999, // Get ALL items
          15   // Max 15 highlights
        );

        // Get existing highlight IDs
        const { data: existingHighlights } = await this.supabase
          .from('instagram_highlights')
          .select('highlight_id')
          .eq('account_id', accountId);

        const existingIds = new Set(existingHighlights?.map((h: any) => h.highlight_id) || []);

        // Find NEW highlights
        const newHighlights = highlightsData.highlights.filter(
          h => !existingIds.has(h.highlight_id)
        );

        console.log(`[Step 4] Found ${newHighlights.length} NEW highlights`);

        // Save new highlights
        for (const highlight of newHighlights) {
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

          if (savedHighlight) {
            stats.newHighlightsFound++;

            // Save items
            const sample = highlightsData.samples.find(s => s.highlightId === highlight.highlight_id);
            if (sample) {
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

                stats.newHighlightItemsFound++;
              }
            }
          }
        }

        console.log(`[Step 4] ✓ Saved ${stats.newHighlightsFound} highlights (${stats.newHighlightItemsFound} items)`);
        
        await this.rateLimiter.waitRandom('after highlights');
      }

      // ==========================================
      // STEP 5: Transcription skipped — handled by Gemini in processing phase
      // All transcription (video + image OCR) is done via Gemini 3 Flash
      // in the content-processor-orchestrator after the scan completes.
      // ScrapeCreators transcript API is NOT used.
      // ==========================================
      console.log(`[Step 5] ⏭️ Transcription deferred to Gemini processing phase`);

      // ==========================================
      // STEP 6: Build RAG vectors for new content
      // ==========================================
      console.log(`[Step 6] Building RAG vector index for new content...`);

      try {
        const { ingestAllForAccount } = await import('@/lib/rag/ingest');
        const ragResult = await ingestAllForAccount(accountId);
        console.log(`[Step 6] ✓ RAG index updated: ${ragResult.total} documents (${Object.entries(ragResult.byType).map(([t,c]) => `${t}:${c}`).join(', ')})`);
        if (ragResult.errors.length > 0) {
          console.warn(`[Step 6] ⚠️ RAG errors: ${ragResult.errors.join('; ')}`);
        }
      } catch (ragError: any) {
        console.error(`[Step 6] ❌ RAG indexing failed (non-blocking):`, ragError.message);
      }

      // ==========================================
      // Done
      // ==========================================
      const duration = (Date.now() - startTime) / 1000;

      console.log(`\n${'='.repeat(70)}`);
      console.log(`✅ Incremental scan completed in ${duration.toFixed(2)}s`);
      console.log(`📊 Stats:`, stats);
      console.log(`${'='.repeat(70)}\n`);

      return {
        success: true,
        stats,
        duration,
      };

    } catch (error: any) {
      const duration = (Date.now() - startTime) / 1000;
      
      console.error(`\n${'='.repeat(70)}`);
      console.error(`❌ Incremental scan failed after ${duration.toFixed(2)}s`);
      console.error(`Error:`, error);
      console.error(`${'='.repeat(70)}\n`);

      return {
        success: false,
        stats,
        duration,
        error: error.message || 'Unknown error',
      };
    }
  }
}

/**
 * Run incremental scan
 */
export async function runIncrementalScan(
  username: string,
  accountId: string,
  config?: Partial<IncrementalScanConfig>
): Promise<IncrementalScanResult> {
  const orchestrator = new IncrementalScanOrchestrator();
  return orchestrator.run(username, accountId, config);
}
