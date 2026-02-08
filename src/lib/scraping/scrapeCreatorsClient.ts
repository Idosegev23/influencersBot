/**
 * ScrapeCreators API Client
 * Client מלא לעבודה עם ScrapeCreators API
 * כולל retry policy, rate limiting, והגבלות קצב
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// ============================================
// Configuration
// ============================================

const SCRAPECREATORS_API_KEY = process.env.SCRAPECREATORS_API_KEY;
const SCRAPECREATORS_BASE_URL = process.env.SCRAPECREATORS_BASE_URL || 'https://api.scrapecreators.com';
const SCAN_HTTP_TIMEOUT_MS = Number(process.env.SCAN_HTTP_TIMEOUT_MS) || 60000; // ⚡ 60s for large requests
const SCAN_MAX_RETRIES = Number(process.env.SCAN_MAX_RETRIES) || 3;
const SCAN_RETRY_BASE_DELAY_MS = Number(process.env.SCAN_RETRY_BASE_DELAY_MS) || 2000;

// ============================================
// Type Definitions
// ============================================

export interface InstagramProfile {
  username: string;
  full_name?: string;
  bio?: string;
  bio_links?: string[];
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
  profile_pic_url?: string;
  is_verified?: boolean;
  is_business?: boolean;
  category?: string;
  external_url?: string;
}

export interface InstagramPost {
  post_id: string;
  shortcode: string;
  post_url: string;
  caption?: string;
  media_type: 'photo' | 'video' | 'carousel';
  media_urls: string[];
  thumbnail_url?: string;
  likes_count?: number;
  comments_count?: number;
  views_count?: number;
  posted_at?: string;
  location?: string;
  mentions?: string[];
  is_sponsored?: boolean;
}

export interface InstagramComment {
  comment_id: string;
  post_shortcode: string;
  text: string;
  author_username: string;
  author_profile_pic?: string;
  is_owner_reply: boolean;
  likes_count?: number;
  commented_at?: string;
}

export interface InstagramHighlight {
  highlight_id: string;
  title: string;
  cover_url?: string;
  items_count: number;
}

export interface InstagramHighlightDetail {
  highlight_id: string;
  title: string;
  items: Array<{
    story_id: string;
    shortcode?: string;
    media_type: 'photo' | 'video' | 'other';
    media_url: string;
    video_url?: string;
    image_url?: string;
    thumbnail_url?: string;
    timestamp?: string;
  }>;
}

export interface MediaTranscript {
  media_url: string;
  transcript: string;
  language?: string;
  confidence?: number;
}

// ============================================
// Error Types
// ============================================

export class ScrapeCreatorsError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ScrapeCreatorsError';
  }
}

// ============================================
// ScrapeCreators Client Class
// ============================================

export class ScrapeCreatorsClient {
  private client: AxiosInstance;

  constructor() {
    if (!SCRAPECREATORS_API_KEY) {
      throw new Error('SCRAPECREATORS_API_KEY is not configured');
    }

    this.client = axios.create({
      baseURL: SCRAPECREATORS_BASE_URL,
      timeout: SCAN_HTTP_TIMEOUT_MS,
      headers: {
        'x-api-key': SCRAPECREATORS_API_KEY,
        'Content-Type': 'application/json',
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        const requestId = Math.random().toString(36).substring(7);
        config.headers['x-request-id'] = requestId;
        console.log(`[ScrapeCreators] [${requestId}] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[ScrapeCreators] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        const requestId = response.config.headers['x-request-id'];
        console.log(`[ScrapeCreators] [${requestId}] ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        const requestId = error.config?.headers?.['x-request-id'];
        console.error(`[ScrapeCreators] [${requestId}] Error:`, error.message);
        return Promise.reject(error);
      }
    );
  }

  // ============================================
  // Retry Logic
  // ============================================

  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= SCAN_MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);
        const isLastAttempt = attempt === SCAN_MAX_RETRIES;

        if (!isRetryable || isLastAttempt) {
          console.error(
            `[ScrapeCreators] ${operationName} failed (attempt ${attempt}/${SCAN_MAX_RETRIES}):`,
            error.message
          );
          throw this.normalizeError(error);
        }

        // Calculate backoff delay
        const delay = SCAN_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 500;
        const totalDelay = delay + jitter;

        console.warn(
          `[ScrapeCreators] ${operationName} failed (attempt ${attempt}/${SCAN_MAX_RETRIES}), retrying in ${totalDelay.toFixed(0)}ms...`
        );

        await this.sleep(totalDelay);
      }
    }

    throw lastError || new Error(`${operationName} failed after ${SCAN_MAX_RETRIES} attempts`);
  }

  private isRetryableError(error: any): boolean {
    // Network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Axios errors
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      
      // Retry on rate limit
      if (status === 429) return true;
      
      // Retry on server errors
      if (status && status >= 500) return true;
      
      // Don't retry on client errors (except 429)
      if (status && status >= 400 && status < 500) return false;
    }

    // Retry on timeout
    if (error.message?.includes('timeout')) return true;

    // Default: don't retry
    return false;
  }

  private normalizeError(error: any): ScrapeCreatorsError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      if (status === 401 || status === 403) {
        return new ScrapeCreatorsError(
          'Authentication failed',
          status,
          'HTTP_AUTH_FAILED',
          false
        );
      }

      if (status === 404) {
        return new ScrapeCreatorsError(
          'Resource not found',
          status,
          'HTTP_NOT_FOUND',
          false
        );
      }

      if (status === 429) {
        return new ScrapeCreatorsError(
          'Rate limit exceeded',
          status,
          'HTTP_RATE_LIMIT',
          true
        );
      }

      if (status && status >= 500) {
        return new ScrapeCreatorsError(
          `Server error: ${status}`,
          status,
          'HTTP_SERVER_ERROR',
          true
        );
      }

      return new ScrapeCreatorsError(
        data?.message || error.message,
        status,
        'HTTP_ERROR',
        false
      );
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ScrapeCreatorsError(
        'Request timeout',
        undefined,
        'TIMEOUT',
        true
      );
    }

    return new ScrapeCreatorsError(
      error.message || 'Unknown error',
      undefined,
      'UNKNOWN',
      false
    );
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================
  // API Methods
  // ============================================

  /**
   * Get Instagram profile (full data)
   */
  async getProfile(username: string): Promise<InstagramProfile> {
    return this.withRetry(async () => {
      const response = await this.client.get('/v1/instagram/profile', {
        params: { handle: username },
      });

      const data = response.data;
      
      // ⚡ Debug: Log the actual response structure
      console.log('[ScrapeCreators] Profile response:', JSON.stringify(data, null, 2).substring(0, 2000));
      
      // Response format: { success: true, data: { user: { ... } } }
      const user = data.data?.user || data.user || {};
      
      return {
        username: user.username || username,
        full_name: user.full_name,
        bio: user.biography,
        bio_links: user.bio_links || [],
        followers_count: user.edge_followed_by?.count || user.follower_count || 0,
        following_count: user.edge_follow?.count || user.following_count || 0,
        posts_count: user.edge_owner_to_timeline_media?.count || user.media_count || 0,
        profile_pic_url: user.profile_pic_url_hd || user.profile_pic_url,
        is_verified: user.is_verified,
        is_business: user.is_business_account,
        category: user.category_name || user.category,
        external_url: user.external_url,
      };
    }, 'getProfile');
  }

  /**
   * Get Instagram basic profile (faster, less data)
   */
  async getBasicProfile(username: string): Promise<InstagramProfile> {
    return this.withRetry(async () => {
      const response = await this.client.get('/v1/instagram/basic-profile', {
        params: { handle: username },
      });

      const data = response.data;
      
      return {
        username: data.username || username,
        full_name: data.full_name,
        bio: data.biography,
        followers_count: data.follower_count,
        following_count: data.following_count,
        posts_count: data.media_count,
        profile_pic_url: data.profile_pic_url,
        is_verified: data.is_verified,
      };
    }, 'getBasicProfile');
  }

  /**
   * Get user posts (with v2 manual pagination)
   */
  async getPosts(username: string, limit: number = 50): Promise<InstagramPost[]> {
    return this.withRetry(async () => {
      const allPosts: any[] = [];
      let nextMaxId: string | undefined;
      let requestCount = 0;
      const maxRequests = Math.ceil(limit / 12); // v2 returns ~12 posts per page
      
      console.log(`[ScrapeCreators] Fetching up to ${limit} posts for @${username}`);

      while (allPosts.length < limit && requestCount < maxRequests) {
        requestCount++;
        
        const params: any = { 
          handle: username,
          trim: true, // Get trimmed response
        };
        
        if (nextMaxId) {
          params.next_max_id = nextMaxId;
        }

        const response = await this.client.get('/v2/instagram/user/posts', { params });
        const data = response.data;
        
        // ⚡ Debug: Log the actual response structure (only first request)
        if (requestCount === 1) {
          console.log('[ScrapeCreators] Posts API response (page 1):', JSON.stringify(data, null, 2).substring(0, 1000));
        }
        
        // Response format: { items: [...], more_available: true, ... }
        const posts = data.items || [];
        
        console.log(`[ScrapeCreators] Page ${requestCount}: Found ${posts.length} posts in response`);
        
        if (!posts.length) {
          console.log(`[ScrapeCreators] No more posts (page ${requestCount})`);
          break;
        }
        
        allPosts.push(...posts);
        
        console.log(`[ScrapeCreators] Page ${requestCount}: +${posts.length} posts (total: ${allPosts.length})`);
        
        // Check if there are more posts
        if (!data.more_available || !data.next_max_id) {
          console.log(`[ScrapeCreators] No more pages available`);
          break;
        }
        
        nextMaxId = data.next_max_id;
        
        // Small delay between pagination requests (only if we need more)
        if (allPosts.length < limit && data.more_available) {
          await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5s delay
        }
      }
      
      // Map and return up to limit
      return allPosts.slice(0, limit).map((post: any) => ({
        post_id: post.id?.split('_')[0] || post.pk || post.id,
        shortcode: post.code || post.shortcode, // ⚡ v2 uses 'code'
        post_url: post.url || `https://www.instagram.com/p/${post.code || post.shortcode}/`,
        caption: post.caption?.text || post.caption, // ⚡ v2: caption.text
        media_type: this.normalizeMediaType(post.media_type || post.type),
        media_urls: this.extractMediaUrls(post),
        thumbnail_url: post.thumbnail_url || post.image_versions2?.candidates?.[0]?.url || post.display_url,
        likes_count: post.like_count || post.likes,
        comments_count: post.comment_count || post.comments || 0,
        views_count: post.video_view_count || post.play_count || post.views,
        posted_at: post.taken_at 
          ? new Date(post.taken_at * 1000).toISOString()
          : (post.taken_at_timestamp ? new Date(post.taken_at_timestamp * 1000).toISOString() : undefined),
        location: post.location?.name,
        mentions: post.caption?.text?.match(/@(\w+)/g) || post.mentions || [],
        is_sponsored: post.is_paid_partnership || post.is_sponsored || false,
      }));
    }, 'getPosts');
  }

  /**
   * Get post comments (v2 with manual pagination)
   */
  async getPostComments(postUrl: string, limit: number = 3): Promise<InstagramComment[]> {
    return this.withRetry(async () => {
      try {
        const allComments: any[] = [];
        let cursor: string | undefined;
        const shortcode = this.extractShortcodeFromUrl(postUrl);
        
        // Get first page of comments
        const params: any = { 
          url: postUrl, // ⚡ Correct parameter name
        };
        
        const response = await this.client.get('/v2/instagram/post/comments', { params });
        const data = response.data;
        
        const comments = data?.comments || data || [];
        allComments.push(...comments);
        
        // v2 returns ~10-20 comments per page, usually enough for our needs
        // If we need more in the future, can implement pagination with cursor
        
        // Map comments with safe error handling
        const mappedComments = allComments.slice(0, limit).map((comment: any) => {
          // Safely parse timestamp
          let commentedAt: string | undefined;
          try {
            if (comment.created_at && !isNaN(comment.created_at) && comment.created_at > 0) {
              commentedAt = new Date(comment.created_at * 1000).toISOString();
            } else if (comment.created_at_utc && !isNaN(comment.created_at_utc) && comment.created_at_utc > 0) {
              commentedAt = new Date(comment.created_at_utc * 1000).toISOString();
            } else if (comment.timestamp && !isNaN(comment.timestamp) && comment.timestamp > 0) {
              commentedAt = new Date(comment.timestamp * 1000).toISOString();
            }
          } catch (e) {
            // Ignore invalid timestamps
          }

          return {
            comment_id: comment.id || comment.pk || `unknown_${Date.now()}`,
            post_shortcode: shortcode,
            text: comment.text || '',
            author_username: comment.owner?.username || comment.username || 'unknown',
            author_profile_pic: comment.owner?.profile_pic_url || comment.profile_pic_url,
            is_owner_reply: comment.is_owner_reply || false,
            likes_count: comment.like_count || 0,
            commented_at: commentedAt,
          };
        });

        return mappedComments;
        
      } catch (error: any) {
        // If error happens during mapping (not API call), log and return empty
        if (error.message?.includes('Invalid time value') || error.message?.includes('mapping')) {
          console.warn(`[ScrapeCreators] Error processing comments for ${postUrl}:`, error.message);
          return [];
        }
        // Re-throw API errors for retry
        throw error;
      }
    }, 'getPostComments');
  }

  /**
   * Get user highlights (metadata only)
   */
  async getHighlights(username: string): Promise<InstagramHighlight[]> {
    return this.withRetry(async () => {
      const response = await this.client.get('/v1/instagram/user/highlights', {
        params: { handle: username },
      });

      // ⚡ Debug: Log the actual response structure
      console.log('[ScrapeCreators] Highlights API response:', JSON.stringify(response.data, null, 2).substring(0, 1000));

      const highlights = response.data?.highlights || response.data || [];
      
      console.log(`[ScrapeCreators] Parsed ${highlights.length} highlights from response`);
      
      return highlights.map((highlight: any) => ({
        highlight_id: highlight.id,
        title: highlight.title,
        cover_url: highlight.cover_media?.cropped_image_version?.url,
        items_count: highlight.media_count || 0,
      }));
    }, 'getHighlights');
  }

  /**
   * Get highlight detail (includes all items)
   */
  async getHighlightDetail(highlightId: string): Promise<InstagramHighlightDetail> {
    return this.withRetry(async () => {
      const response = await this.client.get('/v1/instagram/user/highlight/detail', {
        params: { id: highlightId }, // ⚡ Correct parameter name
      });

      const data = response.data;
      
      return {
        highlight_id: data.id || highlightId,
        title: data.title,
        items: (data.items || []).map((item: any) => {
          // v2 API: video_versions for videos, image_versions2 for photos
          const videoUrl = item.video_versions?.[0]?.url || item.video_url;
          const imageUrl = item.image_versions2?.candidates?.[0]?.url || item.image_url;
          const thumbnailUrl = item.image_versions2?.candidates?.[0]?.url || item.thumbnail_url;
          
          return {
            story_id: item.pk || item.id,
            shortcode: item.code,
            media_type: item.media_type === 1 ? 'photo' : (item.media_type === 2 ? 'video' : 'other'),
            media_url: videoUrl || imageUrl,
            video_url: videoUrl,
            image_url: imageUrl,
            thumbnail_url: thumbnailUrl,
            timestamp: item.taken_at 
              ? new Date(item.taken_at * 1000).toISOString()
              : undefined,
          };
        }),
      };
    }, 'getHighlightDetail');
  }

  /**
   * Get media transcript (for videos/reels)
   */
  async getMediaTranscript(mediaUrl: string): Promise<MediaTranscript> {
    return this.withRetry(async () => {
      const response = await this.client.get('/v2/instagram/media/transcript', {
        params: { media_url: mediaUrl },
      });

      const data = response.data;
      
      return {
        media_url: mediaUrl,
        transcript: data.transcript || data.text || '',
        language: data.language,
        confidence: data.confidence,
      };
    }, 'getMediaTranscript');
  }

  // ============================================
  // Helper Methods
  // ============================================

  private normalizeMediaType(type: any): 'photo' | 'video' | 'carousel' {
    if (typeof type === 'string') {
      const lower = type.toLowerCase();
      if (lower.includes('video') || lower.includes('reel')) return 'video';
      if (lower.includes('carousel') || lower.includes('album')) return 'carousel';
      return 'photo';
    }

    // Instagram API numeric types
    if (type === 1) return 'photo';
    if (type === 2) return 'video';
    if (type === 8) return 'carousel';

    return 'photo'; // default
  }

  private extractMediaUrls(post: any): string[] {
    const urls: string[] = [];

    // v2 API: video_versions (for videos/reels)
    if (post.video_versions && Array.isArray(post.video_versions) && post.video_versions.length > 0) {
      urls.push(post.video_versions[0].url);
    }
    
    // Fallback: video_url (older format)
    if (post.video_url) {
      urls.push(post.video_url);
    }

    // v2 API: image_versions2 (for photos)
    if (post.image_versions2?.candidates?.[0]?.url) {
      urls.push(post.image_versions2.candidates[0].url);
    }
    
    // Fallback: display_url (older format)
    if (post.display_url) {
      urls.push(post.display_url);
    }

    // Carousel items
    if (post.carousel_media && Array.isArray(post.carousel_media)) {
      for (const item of post.carousel_media) {
        if (item.video_versions?.[0]?.url) {
          urls.push(item.video_versions[0].url);
        } else if (item.video_url) {
          urls.push(item.video_url);
        } else if (item.image_versions2?.candidates?.[0]?.url) {
          urls.push(item.image_versions2.candidates[0].url);
        } else if (item.display_url) {
          urls.push(item.display_url);
        }
      }
    }

    // Deduplicate
    return [...new Set(urls)].filter(Boolean);
  }

  private extractShortcodeFromUrl(postUrl: string): string {
    const match = postUrl.match(/\/p\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : '';
  }

  // ============================================
  // Batch Operations
  // ============================================

  /**
   * Get multiple post comments in batch
   */
  async getBatchPostComments(
    postUrls: string[],
    commentsPerPost: number = 3
  ): Promise<InstagramComment[]> {
    const allComments: InstagramComment[] = [];

    for (const postUrl of postUrls) {
      try {
        const comments = await this.getPostComments(postUrl, commentsPerPost);
        allComments.push(...comments);
        
        // Small delay between requests
        await this.sleep(500);
      } catch (error: any) {
        console.error(`[ScrapeCreators] Failed to get comments for ${postUrl}:`, error.message);
        // Continue with other posts
      }
    }

    return allComments;
  }

  /**
   * Get highlight samples (metadata + sample items from each)
   */
  async getHighlightSamples(
    username: string,
    samplesPerHighlight: number = 999, // ⚡ Default: get ALL items (not just samples)
    maxHighlights: number = 10 // ⚡ Limit number of highlights
  ): Promise<{
    highlights: InstagramHighlight[];
    samples: Array<{ highlightId: string; items: any[] }>;
  }> {
    const allHighlights = await this.getHighlights(username);
    
    // Limit to maxHighlights (most recent)
    const highlights = allHighlights.slice(0, maxHighlights);
    
    console.log(`[ScrapeCreators] Fetching samples from ${highlights.length} highlights (total available: ${allHighlights.length})`);
    
    const samples: Array<{ highlightId: string; items: any[] }> = [];

    // Get samples from each highlight
    for (let i = 0; i < highlights.length; i++) {
      const highlight = highlights[i];
      try {
        console.log(`[ScrapeCreators] Highlight ${i+1}/${highlights.length}: ${highlight.title || highlight.highlight_id}`);
        
        const detail = await this.getHighlightDetail(highlight.highlight_id);
        
        // Take first N items (999 = all items)
        const sampleItems = detail.items.slice(0, samplesPerHighlight);
        
        samples.push({
          highlightId: highlight.highlight_id,
          items: sampleItems,
        });

        console.log(`[ScrapeCreators]   ✓ Got ${sampleItems.length} items from highlight`);

        // Small delay between requests
        await this.sleep(800); // Increased delay
      } catch (error: any) {
        console.error(
          `[ScrapeCreators]   ✗ Failed to get detail for highlight ${highlight.highlight_id}:`,
          error.message
        );
        // Continue with other highlights
      }
    }

    return { highlights: allHighlights, samples };
  }

  /**
   * Get transcripts for multiple media URLs
   */
  async getBatchTranscripts(mediaUrls: string[]): Promise<MediaTranscript[]> {
    const transcripts: MediaTranscript[] = [];

    for (const mediaUrl of mediaUrls) {
      try {
        const transcript = await this.getMediaTranscript(mediaUrl);
        
        if (transcript.transcript && transcript.transcript.length > 0) {
          transcripts.push(transcript);
        }

        // Small delay between requests
        await this.sleep(500);
      } catch (error: any) {
        console.error(`[ScrapeCreators] Failed to transcribe ${mediaUrl}:`, error.message);
        // Continue with other media
      }
    }

    return transcripts;
  }
}

// ============================================
// Singleton Instance
// ============================================

let clientInstance: ScrapeCreatorsClient | null = null;

/**
 * Get singleton ScrapeCreators client instance
 */
export function getScrapeCreatorsClient(): ScrapeCreatorsClient {
  if (!clientInstance) {
    clientInstance = new ScrapeCreatorsClient();
  }
  return clientInstance;
}

// ============================================
// Convenience Functions
// ============================================

export async function scrapeInstagramProfile(username: string): Promise<InstagramProfile> {
  const client = getScrapeCreatorsClient();
  return client.getProfile(username);
}

export async function scrapeInstagramPosts(
  username: string,
  limit: number = 50
): Promise<InstagramPost[]> {
  const client = getScrapeCreatorsClient();
  return client.getPosts(username, limit);
}

export async function scrapeInstagramComments(
  postUrls: string[],
  commentsPerPost: number = 3
): Promise<InstagramComment[]> {
  const client = getScrapeCreatorsClient();
  return client.getBatchPostComments(postUrls, commentsPerPost);
}

export async function scrapeInstagramHighlights(
  username: string,
  samplesPerHighlight: number = 999 // ⚡ Default: get ALL items from each highlight
): Promise<{
  highlights: InstagramHighlight[];
  samples: Array<{ highlightId: string; items: any[] }>;
}> {
  const client = getScrapeCreatorsClient();
  return client.getHighlightSamples(username, samplesPerHighlight);
}

export async function transcribeInstagramMedia(
  mediaUrls: string[]
): Promise<MediaTranscript[]> {
  const client = getScrapeCreatorsClient();
  return client.getBatchTranscripts(mediaUrls);
}
