/**
 * Apify Actors Manager - 5 מנהלי Actors למערכת הצ'אטבוט
 * כל Actor מתמחה בסוג מידע אחר מ-Instagram
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN;

// ============================================
// Apify Actor IDs
// ============================================

const ACTORS = {
  INSTAGRAM_SCRAPER: 'apify/instagram-scraper',
  INSTAGRAM_COMMENT_SCRAPER: 'apify/instagram-comment-scraper',
  INSTAGRAM_PROFILE_SCRAPER: 'apify/instagram-profile-scraper',
  INSTAGRAM_HASHTAG_SCRAPER: 'apify/instagram-hashtag-scraper',
  INSTAGRAM_SEARCH_SCRAPER: 'apify/instagram-search-scraper',
} as const;

// ============================================
// Type Definitions
// ============================================

export interface PostData {
  shortcode: string;
  post_id?: string;
  post_url: string;
  type: 'post' | 'reel' | 'carousel' | 'video';
  caption?: string;
  hashtags: string[];
  mentions: string[];
  media_urls: string[];
  thumbnail_url?: string;
  video_duration?: number;
  likes_count: number;
  comments_count: number;
  views_count?: number;
  posted_at: string;
  location?: string;
  is_sponsored: boolean;
}

export interface CommentData {
  comment_id: string;
  post_shortcode: string;
  text: string;
  author_username: string;
  author_profile_pic?: string;
  is_owner_reply: boolean;
  parent_comment_id?: string;
  likes_count: number;
  commented_at: string;
}

export interface ProfileData {
  username: string;
  full_name?: string;
  bio?: string;
  bio_links: string[];
  followers_count: number;
  following_count: number;
  posts_count: number;
  category?: string;
  is_verified: boolean;
  is_business_account: boolean;
  profile_pic_url?: string;
}

export interface HashtagData {
  hashtag: string;
  total_posts_in_hashtag?: number;
  avg_engagement?: number;
  sample_posts: Array<{
    shortcode: string;
    caption: string;
    likes: number;
    comments: number;
  }>;
}

export interface SearchData {
  query: string;
  results: Array<{
    type: 'user' | 'hashtag' | 'place';
    name: string;
    description?: string;
  }>;
}

// ============================================
// Helper Functions
// ============================================

async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  waitForFinish: boolean = true
): Promise<any> {
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN is not configured');
  }

  const encodedActorId = actorId.replace('/', '~');
  const url = `https://api.apify.com/v2/acts/${encodedActorId}/runs?token=${APIFY_TOKEN}`;

  console.log(`[Apify] Starting actor: ${actorId}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[Apify] Error:', errorBody);
    throw new Error(`Apify API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const runId = result.data.id;

  console.log(`[Apify] Run started: ${runId}`);

  if (waitForFinish) {
    return await waitForRun(runId);
  }

  return result.data;
}

async function waitForRun(runId: string, maxWaitTime: number = 10 * 60 * 1000): Promise<any> {
  const pollInterval = 5000; // 5 seconds
  const startTime = Date.now();

  console.log(`[Apify] Waiting for run: ${runId} (max ${maxWaitTime/1000}s)`);

  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );

    if (!response.ok) {
      throw new Error(`Failed to check run status: ${response.statusText}`);
    }

    const result = await response.json();
    const run = result.data;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`[Apify] Status: ${run.status} (${elapsed}s elapsed)`);

    if (run.status === 'SUCCEEDED') {
      console.log(`[Apify] Run completed successfully in ${elapsed}s`);
      return run;
    }

    if (run.status === 'FAILED' || run.status === 'ABORTED') {
      throw new Error(`Apify run ${run.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Apify run timeout after ${maxWaitTime/1000}s`);
}

async function getDatasetItems<T>(datasetId: string, limit?: number): Promise<T[]> {
  let url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`;
  
  if (limit) {
    url += `&limit=${limit}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to get dataset: ${response.statusText}`);
  }

  return response.json();
}

function extractHashtags(text: string): string[] {
  const regex = /#([a-zA-Z0-9_\u0590-\u05ff]+)/g;
  const matches = text.match(regex);
  return matches ? matches.map(tag => tag.slice(1)) : [];
}

function extractMentions(text: string): string[] {
  const regex = /@([a-zA-Z0-9_.]+)/g;
  const matches = text.match(regex);
  return matches ? matches.map(mention => mention.slice(1)) : [];
}

// ============================================
// Instagram Actors Manager Class
// ============================================

export class InstagramActorManager {
  private username: string;

  constructor(username: string) {
    this.username = username;
  }

  /**
   * Actor 1: Instagram Posts Scraper
   * שולף עד 500 פוסטים אחרונים
   */
  async scrapePosts(limit: number = 500): Promise<PostData[]> {
    console.log(`[Actor 1] Starting posts scrape for @${this.username} (limit: ${limit})`);

    const run = await runApifyActor(ACTORS.INSTAGRAM_SCRAPER, {
      directUrls: [`https://www.instagram.com/${this.username}/`],
      resultsType: 'posts',
      resultsLimit: limit,
      searchType: 'user',
      addParentData: false,
    });

    const items = await getDatasetItems<any>(run.defaultDatasetId);

    console.log(`[Actor 1] Fetched ${items.length} posts`);

    return items.map((item: any): PostData => ({
      shortcode: item.shortCode || item.shortcode || '',
      post_id: item.id || item.postId,
      post_url: item.url || `https://www.instagram.com/p/${item.shortCode}/`,
      type: this.mapPostType(item.type || item.__typename),
      caption: item.caption || '',
      hashtags: item.hashtags || extractHashtags(item.caption || ''),
      mentions: item.mentions || extractMentions(item.caption || ''),
      media_urls: this.extractMediaUrls(item),
      thumbnail_url: item.displayUrl || item.thumbnailUrl,
      video_duration: item.videoPlayCount ? item.videoDuration : undefined,
      likes_count: item.likesCount || 0,
      comments_count: item.commentsCount || 0,
      views_count: item.videoViewCount || item.videoPlayCount,
      posted_at: item.timestamp || new Date().toISOString(),
      location: item.locationName,
      is_sponsored: item.isSponsored || false,
    }));
  }

  /**
   * Actor 2: Instagram Comments Scraper
   * שולף תגובות מפוסטים מסוימים (עד 50 למעלה לכל פוסט)
   */
  async scrapeComments(postUrls: string[], commentsPerPost: number = 50): Promise<CommentData[]> {
    console.log(`[Actor 2] Starting comments scrape for ${postUrls.length} posts (${commentsPerPost} per post)`);

    const run = await runApifyActor(ACTORS.INSTAGRAM_COMMENT_SCRAPER, {
      directUrls: postUrls,
      resultsLimit: commentsPerPost * postUrls.length,
      commentsPerPost: commentsPerPost,
    });

    const items = await getDatasetItems<any>(run.defaultDatasetId);

    console.log(`[Actor 2] Fetched ${items.length} comments`);

    // Extract shortcode from URL
    const getShortcodeFromUrl = (url: string): string => {
      const match = url.match(/\/p\/([^/]+)\//);
      return match ? match[1] : '';
    };

    return items.map((item: any): CommentData => ({
      comment_id: item.id || item.commentId || '',
      post_shortcode: item.postShortcode || getShortcodeFromUrl(item.postUrl || ''),
      text: item.text || '',
      author_username: item.ownerUsername || item.username || '',
      author_profile_pic: item.ownerProfilePicUrl,
      is_owner_reply: item.ownerUsername === this.username,
      parent_comment_id: item.parentCommentId,
      likes_count: item.likesCount || 0,
      commented_at: item.timestamp || new Date().toISOString(),
    }));
  }

  /**
   * Actor 3: Instagram Profile Scraper
   * שולף snapshot של הפרופיל
   */
  async scrapeProfile(): Promise<ProfileData> {
    console.log(`[Actor 3] Starting profile scrape for @${this.username}`);

    const run = await runApifyActor(ACTORS.INSTAGRAM_PROFILE_SCRAPER, {
      usernames: [this.username],
    });

    const items = await getDatasetItems<any>(run.defaultDatasetId, 1);

    if (items.length === 0) {
      throw new Error('Profile not found');
    }

    const profile = items[0];

    console.log(`[Actor 3] Profile fetched: ${profile.followersCount || 0} followers`);

    return {
      username: profile.username || this.username,
      full_name: profile.fullName,
      bio: profile.biography,
      bio_links: this.extractBioLinks(profile.biography || '', profile.externalUrl),
      followers_count: profile.followersCount || 0,
      following_count: profile.followsCount || 0,
      posts_count: profile.postsCount || 0,
      category: profile.category,
      is_verified: profile.verified || false,
      is_business_account: profile.businessCategoryName ? true : false,
      profile_pic_url: profile.profilePicUrlHD || profile.profilePicUrl,
    };
  }

  /**
   * Actor 4: Instagram Hashtag Scraper
   * שולף פוסטים לפי האשטגים (עד 30 פוסטים לכל האשטג)
   */
  async scrapeHashtags(hashtags: string[], postsPerHashtag: number = 30): Promise<HashtagData[]> {
    console.log(`[Actor 4] Starting hashtag scrape for ${hashtags.length} hashtags (${postsPerHashtag} posts each)`);

    const results: HashtagData[] = [];

    for (const hashtag of hashtags) {
      try {
        // Clean hashtag: remove #, spaces, special chars, keep only alphanumeric and underscore
        const cleanHashtag = hashtag
          .replace(/^#/, '') // Remove leading #
          .replace(/[^a-zA-Z0-9_\u0590-\u05FF]/g, '') // Keep only alphanumeric, underscore, and Hebrew
          .trim();
        
        if (!cleanHashtag) {
          console.warn(`[Actor 4] Skipping invalid hashtag: ${hashtag}`);
          continue;
        }

        console.log(`[Actor 4] Scraping hashtag: ${hashtag} → ${cleanHashtag}`);

        const run = await runApifyActor(ACTORS.INSTAGRAM_HASHTAG_SCRAPER, {
          hashtags: [cleanHashtag],
          resultsLimit: postsPerHashtag,
        });

        const items = await getDatasetItems<any>(run.defaultDatasetId);

        results.push({
          hashtag: cleanHashtag, // Use cleaned hashtag
          total_posts_in_hashtag: items[0]?.hashtagPostCount,
          sample_posts: items.slice(0, postsPerHashtag).map((item: any) => ({
            shortcode: item.shortCode || '',
            caption: item.caption || '',
            likes: item.likesCount || 0,
            comments: item.commentsCount || 0,
          })),
        });

        console.log(`[Actor 4] Fetched ${items.length} posts for #${cleanHashtag}`);
      } catch (error) {
        console.error(`[Actor 4] Failed to scrape hashtag ${hashtag}:`, error);
      }
    }

    return results;
  }

  /**
   * Actor 5: Instagram Search Scraper
   * מחפש את המשפיען ומילות מפתח למיקום בשוק
   */
  async scrapeSearch(queries: string[]): Promise<SearchData[]> {
    console.log(`[Actor 5] Starting search scrape for ${queries.length} queries`);

    const results: SearchData[] = [];

    for (const query of queries) {
      try {
        // Clean query: remove special chars that Apify doesn't allow
        // Allowed: letters, numbers, spaces (will be converted to commas by Apify)
        const cleanQuery = query
          .replace(/[!?.,:;\-+=*&%$#@/\\~^|<>()[\]{}\"'`]/g, '') // Remove special chars
          .trim();
        
        if (!cleanQuery || cleanQuery.length < 2) {
          console.warn(`[Actor 5] Skipping invalid query: ${query}`);
          continue;
        }

        console.log(`[Actor 5] Searching: ${query} → ${cleanQuery}`);

        const run = await runApifyActor(ACTORS.INSTAGRAM_SEARCH_SCRAPER, {
          search: cleanQuery,
          searchLimit: 20,
        });

        const items = await getDatasetItems<any>(run.defaultDatasetId);

        results.push({
          query: cleanQuery, // Use cleaned query
          results: items.map((item: any) => ({
            type: item.type || 'user',
            name: item.username || item.title || '',
            description: item.subtitle || item.biography,
          })),
        });

        console.log(`[Actor 5] Found ${items.length} results for "${query}"`);
      } catch (error) {
        console.error(`[Actor 5] Failed to search "${query}":`, error);
      }
    }

    return results;
  }

  // ============================================
  // Helper Methods
  // ============================================

  private mapPostType(apifyType: string): 'post' | 'reel' | 'carousel' | 'video' {
    const type = apifyType.toLowerCase();
    
    if (type.includes('reel') || type === 'graphvideo') return 'reel';
    if (type.includes('sidecar') || type.includes('carousel')) return 'carousel';
    if (type.includes('video')) return 'video';
    
    return 'post';
  }

  private extractMediaUrls(item: any): string[] {
    const urls: string[] = [];
    
    if (item.displayUrl) urls.push(item.displayUrl);
    if (item.videoUrl) urls.push(item.videoUrl);
    if (item.images && Array.isArray(item.images)) {
      urls.push(...item.images);
    }
    
    return urls;
  }

  private extractBioLinks(bio: string, externalUrl?: string): string[] {
    const links: string[] = [];
    
    if (externalUrl) {
      links.push(externalUrl);
    }
    
    // Extract URLs from bio
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = bio.match(urlRegex);
    if (matches) {
      links.push(...matches);
    }
    
    return [...new Set(links)]; // Remove duplicates
  }
}

// ============================================
// Helper function to select top posts for comments
// ============================================

export function selectTopPostsForComments(
  posts: PostData[],
  topCount: number = 100,
  randomCount: number = 50
): string[] {
  // Sort by engagement (likes + comments)
  const sorted = [...posts].sort((a, b) => {
    const engagementA = a.likes_count + a.comments_count;
    const engagementB = b.likes_count + b.comments_count;
    return engagementB - engagementA;
  });

  // Get top posts
  const topPosts = sorted.slice(0, topCount);
  
  // Get random posts from the rest
  const remaining = sorted.slice(topCount);
  const randomPosts = remaining
    .sort(() => Math.random() - 0.5)
    .slice(0, randomCount);

  // Combine and return URLs
  const selectedPosts = [...topPosts, ...randomPosts];
  return selectedPosts.map(post => post.post_url);
}

// ============================================
// Helper function to extract top hashtags
// ============================================

export function extractTopHashtags(posts: PostData[], limit: number = 20): string[] {
  const hashtagFrequency = new Map<string, number>();

  posts.forEach(post => {
    post.hashtags.forEach(tag => {
      hashtagFrequency.set(tag, (hashtagFrequency.get(tag) || 0) + 1);
    });
  });

  // Sort by frequency and get top N
  return Array.from(hashtagFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

// ============================================
// Helper function to extract keywords from bio
// ============================================

export function extractKeywordsFromBio(bio: string, limit: number = 10): string[] {
  // Remove URLs, mentions, hashtags
  const cleaned = bio
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/@[a-zA-Z0-9_.]+/g, '')
    .replace(/#[a-zA-Z0-9_\u0590-\u05ff]+/g, '');

  // Split into words and filter
  const words = cleaned
    .split(/\s+/)
    .map(word => word.trim().toLowerCase())
    .filter(word => word.length > 3); // Only words longer than 3 chars

  // Get unique words
  return [...new Set(words)].slice(0, limit);
}
