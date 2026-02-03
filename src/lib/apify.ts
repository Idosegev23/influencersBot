import type { ApifyProfileData, ApifyPostData, ScrapeSettings, PostType } from '@/types';
import { DEFAULT_SCRAPE_SETTINGS } from '@/types';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const INSTAGRAM_SCRAPER_ACTOR = 'apify/instagram-scraper';

// Map Apify post types to our PostType
function mapApifyTypeToPostType(apifyType: string): PostType {
  const typeMap: Record<string, PostType> = {
    'Image': 'image',
    'Video': 'video',
    'Reel': 'reel',
    'Sidecar': 'carousel',
    'GraphImage': 'image',
    'GraphVideo': 'video',
    'GraphSidecar': 'carousel',
  };
  return typeMap[apifyType] || 'image';
}

interface ApifyRunResult {
  id: string;
  status: string;
  defaultDatasetId: string;
}

interface ApifyRunResponse {
  data: ApifyRunResult;
}

interface ApifyRawPost {
  shortCode: string;
  type: string;
  caption?: string;
  displayUrl: string;
  videoUrl?: string;
  likesCount: number;
  commentsCount: number;
  timestamp: string;
}

interface ApifyRawProfile {
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  profilePicUrlHD?: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  verified: boolean;
  latestPosts?: ApifyRawPost[];
}

// ============================================
// Instagram URL Parsing
// ============================================

export function parseInstagramUrl(url: string): { username: string } | null {
  // Handle various Instagram URL formats
  const patterns = [
    /instagram\.com\/([^/?]+)/,
    /instagram\.com\/([^/?]+)\/?/,
    /^@?([a-zA-Z0-9._]+)$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      const username = match[1].replace('@', '');
      // Exclude common paths
      if (!['p', 'reel', 'stories', 'explore', 'accounts'].includes(username)) {
        return { username };
      }
    }
  }

  return null;
}

// ============================================
// Apify API Functions
// ============================================

async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<ApifyRunResult> {
  // Convert actor ID format: "apify/instagram-scraper" -> "apify~instagram-scraper"
  const encodedActorId = actorId.replace('/', '~');
  
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN is not configured');
  }

  const url = `https://api.apify.com/v2/acts/${encodedActorId}/runs?token=${APIFY_TOKEN}`;
  
  console.log('Starting Apify actor:', encodedActorId);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Apify error response:', errorBody);
    throw new Error(`Apify API error: ${response.status} ${response.statusText}`);
  }

  const result: ApifyRunResponse = await response.json();
  console.log('Apify run started:', result.data.id);
  return result.data;
}

async function waitForRun(runId: string): Promise<ApifyRunResult> {
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 3000; // 3 seconds
  const startTime = Date.now();
  const maxRetries = 3;

  console.log('Waiting for run:', runId);

  while (Date.now() - startTime < maxWaitTime) {
    let lastError: Error | null = null;
    
    // Retry logic for temporary errors
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const response = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
          { signal: AbortSignal.timeout(15000) }
        );

        if (!response.ok) {
          // Retry on 502/503 (Bad Gateway / Service Unavailable)
          if (response.status === 502 || response.status === 503) {
            throw new Error(`Apify API temporarily unavailable (${response.status})`);
          }
          
          const errorBody = await response.text();
          console.error('Wait for run error:', errorBody);
          throw new Error(`Failed to check run status: ${response.status} ${response.statusText}`);
        }

        const result: ApifyRunResponse = await response.json();
        const run = result.data;

        console.log('Run status:', run.status);

        if (run.status === 'SUCCEEDED') {
          return run;
        }

        if (run.status === 'FAILED' || run.status === 'ABORTED') {
          throw new Error(`Apify run ${run.status}`);
        }

        // Success - break retry loop
        break;
      } catch (error: any) {
        lastError = error;
        
        if (retry === maxRetries - 1) {
          console.error(`Failed after ${maxRetries} retries:`, error.message);
          throw error;
        }
        
        const retryWait = 2000 * (retry + 1);
        console.warn(`Retry ${retry + 1}/${maxRetries} after ${retryWait}ms:`, error.message);
        await new Promise((r) => setTimeout(r, retryWait));
      }
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error('Apify run timeout');
}

async function getDatasetItems<T>(datasetId: string): Promise<T[]> {
  const response = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`
  );

  if (!response.ok) {
    throw new Error(`Failed to get dataset: ${response.statusText}`);
  }

  return response.json();
}

// ============================================
// Main Scraping Functions
// ============================================

export async function scrapeInstagramProfile(
  username: string,
  settings: Partial<ScrapeSettings> = {}
): Promise<{
  profile: ApifyProfileData;
  posts: ApifyPostData[];
}> {
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN not configured');
  }

  // Merge with defaults
  const scrapeSettings: ScrapeSettings = {
    ...DEFAULT_SCRAPE_SETTINGS,
    ...settings,
  };

  console.log('Scrape settings:', scrapeSettings);

  // Start the scraper with custom settings
  const run = await runApifyActor(INSTAGRAM_SCRAPER_ACTOR, {
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: 'posts',
    resultsLimit: scrapeSettings.posts_limit,
    searchType: 'user',
    searchLimit: 1,
    addParentData: true,
  });

  // Wait for completion
  const completedRun = await waitForRun(run.id);

  // Get results
  const items = await getDatasetItems<ApifyRawProfile & ApifyRawPost>(
    completedRun.defaultDatasetId
  );

  if (items.length === 0) {
    throw new Error('No data found for this profile');
  }

  // Extract profile from first item
  const firstItem = items[0];
  const profile: ApifyProfileData = {
    username: firstItem.username || username,
    fullName: firstItem.fullName || '',
    biography: firstItem.biography || '',
    profilePicUrl: firstItem.profilePicUrlHD || firstItem.profilePicUrl || '',
    followersCount: firstItem.followersCount || 0,
    followingCount: firstItem.followsCount || 0,
    postsCount: firstItem.postsCount || items.length,
    isVerified: firstItem.verified || false,
  };

  // Extract posts and filter by content types
  const posts: ApifyPostData[] = items
    .filter((item) => item.shortCode) // Only items that are posts
    .filter((item) => {
      // Filter by content type if specified
      const postType = mapApifyTypeToPostType(item.type || 'Image');
      return scrapeSettings.content_types.includes(postType);
    })
    .map((item) => ({
      shortCode: item.shortCode,
      type: item.type || 'Image',
      caption: item.caption || '',
      displayUrl: item.displayUrl || '',
      videoUrl: item.videoUrl,
      likesCount: item.likesCount || 0,
      commentsCount: item.commentsCount || 0,
      timestamp: item.timestamp || new Date().toISOString(),
    }));

  console.log(`Fetched ${posts.length} posts after filtering`);

  return { profile, posts };
}

// Legacy function for backward compatibility
export async function scrapeInstagramProfileLegacy(
  username: string,
  postsLimit: number = 50
): Promise<{
  profile: ApifyProfileData;
  posts: ApifyPostData[];
}> {
  return scrapeInstagramProfile(username, { posts_limit: postsLimit });
}

// ============================================
// Image Downloading
// ============================================

export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function downloadImageAsBase64(url: string): Promise<string> {
  const buffer = await downloadImage(url);
  return buffer.toString('base64');
}

// ============================================
// Validation
// ============================================

export function isValidInstagramUrl(url: string): boolean {
  return parseInstagramUrl(url) !== null;
}

export async function checkProfileExists(username: string): Promise<boolean> {
  try {
    const response = await fetch(`https://www.instagram.com/${username}/`, {
      method: 'HEAD',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

