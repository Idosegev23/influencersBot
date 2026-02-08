/**
 * Rate Limiter
 * מנגנון להגבלת קצב הבקשות למניעת חסימות
 */

// ============================================
// Configuration
// ============================================

const SCAN_STEP_DELAY_MIN_MS = Number(process.env.SCAN_STEP_DELAY_MIN_MS) || 1500;
const SCAN_STEP_DELAY_MAX_MS = Number(process.env.SCAN_STEP_DELAY_MAX_MS) || 4500;

// ============================================
// Type Definitions
// ============================================

export interface RateLimiterConfig {
  minDelayMs: number;
  maxDelayMs: number;
}

export interface DelayInfo {
  delayMs: number;
  reason: string;
}

// ============================================
// Rate Limiter Class
// ============================================

export class RateLimiter {
  private config: RateLimiterConfig;
  private lastRequestTime: number = 0;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = {
      minDelayMs: config?.minDelayMs ?? SCAN_STEP_DELAY_MIN_MS,
      maxDelayMs: config?.maxDelayMs ?? SCAN_STEP_DELAY_MAX_MS,
    };
  }

  /**
   * Wait with random delay between min and max
   */
  async waitRandom(reason: string = 'step delay'): Promise<DelayInfo> {
    const delayMs = this.getRandomDelay();
    
    console.log(`[RateLimiter] Waiting ${delayMs}ms (${reason})...`);
    
    await this.sleep(delayMs);
    this.lastRequestTime = Date.now();

    return { delayMs, reason };
  }

  /**
   * Wait for a specific amount of time
   */
  async waitFixed(ms: number, reason: string = 'fixed delay'): Promise<DelayInfo> {
    console.log(`[RateLimiter] Waiting ${ms}ms (${reason})...`);
    
    await this.sleep(ms);
    this.lastRequestTime = Date.now();

    return { delayMs: ms, reason };
  }

  /**
   * Get random delay between min and max
   */
  private getRandomDelay(): number {
    const { minDelayMs, maxDelayMs } = this.config;
    return Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get time since last request
   */
  getTimeSinceLastRequest(): number {
    if (this.lastRequestTime === 0) return Infinity;
    return Date.now() - this.lastRequestTime;
  }

  /**
   * Check if enough time has passed since last request
   */
  hasMinimumDelayPassed(): boolean {
    return this.getTimeSinceLastRequest() >= this.config.minDelayMs;
  }
}

// ============================================
// Global Rate Limiter Instance
// ============================================

let globalRateLimiter: RateLimiter | null = null;

/**
 * Get singleton rate limiter instance
 */
export function getGlobalRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter();
  }
  return globalRateLimiter;
}

/**
 * Wait with random delay (convenience function)
 */
export async function waitRandomDelay(reason?: string): Promise<DelayInfo> {
  const limiter = getGlobalRateLimiter();
  return limiter.waitRandom(reason);
}

/**
 * Wait for fixed delay (convenience function)
 */
export async function waitFixedDelay(ms: number, reason?: string): Promise<DelayInfo> {
  const limiter = getGlobalRateLimiter();
  return limiter.waitFixed(ms, reason);
}

// ============================================
// Scan Job Lock Manager
// ============================================

/**
 * Single job at a time lock
 * מבטיח שרק job אחד רץ בכל רגע
 */
export class ScanJobLock {
  private static currentJobId: string | null = null;
  private static lockTime: number = 0;
  private static readonly MAX_LOCK_TIME_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Try to acquire lock for a job
   */
  static tryAcquire(jobId: string): boolean {
    // Check if there's a stale lock
    if (this.currentJobId && Date.now() - this.lockTime > this.MAX_LOCK_TIME_MS) {
      console.warn(`[ScanJobLock] Releasing stale lock for job: ${this.currentJobId}`);
      this.release();
    }

    // Check if already locked
    if (this.currentJobId !== null) {
      console.log(`[ScanJobLock] Already locked by job: ${this.currentJobId}`);
      return false;
    }

    // Acquire lock
    this.currentJobId = jobId;
    this.lockTime = Date.now();
    console.log(`[ScanJobLock] Lock acquired by job: ${jobId}`);
    return true;
  }

  /**
   * Release the lock
   */
  static release(): void {
    if (this.currentJobId) {
      const duration = Date.now() - this.lockTime;
      console.log(`[ScanJobLock] Lock released by job: ${this.currentJobId} (held for ${duration}ms)`);
      this.currentJobId = null;
      this.lockTime = 0;
    }
  }

  /**
   * Get current lock status
   */
  static getStatus(): { locked: boolean; jobId: string | null; duration: number } {
    return {
      locked: this.currentJobId !== null,
      jobId: this.currentJobId,
      duration: this.currentJobId ? Date.now() - this.lockTime : 0,
    };
  }

  /**
   * Check if a specific job has the lock
   */
  static hasLock(jobId: string): boolean {
    return this.currentJobId === jobId;
  }
}
