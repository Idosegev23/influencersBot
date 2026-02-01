/**
 * Scraping Progress Tracker
 * Tracks Instagram scraping progress in Redis
 */

import { redis } from './redis';

export interface ScrapeProgress {
  username: string;
  status: 'starting' | 'scraping_posts' | 'scraping_reels' | 'analyzing' | 'saving' | 'completed' | 'failed';
  progress: number; // 0-100
  currentStep: string;
  details?: {
    postsScraped?: number;
    reelsScraped?: number;
    brandsFound?: number;
    couponsFound?: number;
    productsFound?: number;
  };
  error?: string;
  startedAt: string;
  estimatedTimeRemaining?: number; // seconds
}

const PROGRESS_TTL = 300; // 5 minutes

/**
 * Initialize progress tracking for a user
 */
export async function initProgress(username: string): Promise<void> {
  // Check if Redis is available
  if (!redis.isConfigured) {
    // Redis not configured, skip progress tracking silently
    return;
  }

  const progress: ScrapeProgress = {
    username,
    status: 'starting',
    progress: 0,
    currentStep: 'מאתחל סריקה...',
    startedAt: new Date().toISOString(),
    estimatedTimeRemaining: 120, // 2 minutes estimate
  };

  try {
    await redis.setex(
      `scrape_progress:${username}`,
      PROGRESS_TTL,
      JSON.stringify(progress)
    );
  } catch (error) {
    console.error(`Failed to init progress for ${username}:`, error);
    // Don't throw, just log - progress tracking is not critical
  }
}

/**
 * Update progress
 */
export async function updateProgress(
  username: string,
  updates: Partial<ScrapeProgress>
): Promise<void> {
  // Check if Redis is available
  if (!redis.isConfigured) {
    // Redis not configured, skip progress tracking silently
    return;
  }

  const key = `scrape_progress:${username}`;
  
  try {
    const current = await redis.get(key);
    
    if (!current) {
      // Progress doesn't exist yet, initialize it first
      console.info(`Progress not found for ${username}, initializing...`);
      await initProgress(username);
      
      // Now apply the updates (without recursion)
      const freshData = await redis.get(key);
      if (!freshData) {
        console.warn(`Failed to initialize progress for ${username}`);
        return;
      }
      
      const progress: ScrapeProgress = {
        ...JSON.parse(freshData),
        ...updates,
      };
      
      await redis.setex(key, PROGRESS_TTL, JSON.stringify(progress));
      return;
    }

    const progress: ScrapeProgress = {
      ...JSON.parse(current),
      ...updates,
    };

    await redis.setex(key, PROGRESS_TTL, JSON.stringify(progress));
  } catch (error) {
    console.error(`Failed to update progress for ${username}:`, error);
    // Don't throw, just log - progress tracking is not critical
  }
}

/**
 * Get current progress
 */
export async function getProgress(username: string): Promise<ScrapeProgress | null> {
  // Check if Redis is available
  if (!redis.isConfigured) {
    return null;
  }

  try {
    const key = `scrape_progress:${username}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to get progress for ${username}:`, error);
    return null;
  }
}

/**
 * Mark as completed
 */
export async function completeProgress(
  username: string,
  details?: ScrapeProgress['details']
): Promise<void> {
  await updateProgress(username, {
    status: 'completed',
    progress: 100,
    currentStep: 'הסריקה הושלמה! ✅',
    details,
    estimatedTimeRemaining: 0,
  });
}

/**
 * Mark as failed
 */
export async function failProgress(username: string, error: string): Promise<void> {
  await updateProgress(username, {
    status: 'failed',
    currentStep: 'הסריקה נכשלה',
    error,
    estimatedTimeRemaining: 0,
  });
}

/**
 * Delete progress (cleanup)
 */
export async function deleteProgress(username: string): Promise<void> {
  // Check if Redis is available
  if (!redis.isConfigured) {
    return;
  }

  try {
    await redis.del(`scrape_progress:${username}`);
  } catch (error) {
    console.error(`Failed to delete progress for ${username}:`, error);
    // Don't throw, just log
  }
}

/**
 * Helper to calculate ETA based on elapsed time and progress
 */
export function calculateETA(startedAt: string, currentProgress: number): number {
  if (currentProgress === 0) return 120; // Default 2 minutes
  if (currentProgress === 100) return 0;

  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  const estimatedTotal = (elapsed / currentProgress) * 100;
  const remaining = Math.max(0, estimatedTotal - elapsed);
  
  return Math.round(remaining);
}
