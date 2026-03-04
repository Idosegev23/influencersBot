/**
 * Website Scan Orchestrator
 * מתזמן סריקה מלאה של אתר דרך Apify + עיבוד AI + אינדוקס
 */

import { randomUUID } from 'crypto';
import { crawlWebsiteFull, saveFullCrawlResults } from './website-crawler';
import type { WebsiteCrawlResult, CrawlProgressCallback } from './website-crawler';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import type { ProgressCallback } from './newScanOrchestrator';

// ============================================
// Type Definitions
// ============================================

export interface WebsiteScanConfig {
  maxPages: number;
  maxDepth: number;
  processWithAI: boolean;
  indexForRAG: boolean;
}

export interface WebsiteScanResult {
  success: boolean;
  jobId: string;
  accountId: string;
  rootUrl: string;
  stats: {
    pagesScraped: number;
    pagesSaved: number;
    totalWords: number;
    totalImages: number;
    ragChunksCreated: number;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  duration: number;
}

const DEFAULT_CONFIG: WebsiteScanConfig = {
  maxPages: 50,
  maxDepth: 3,
  processWithAI: true,
  indexForRAG: true,
};

// ============================================
// Main Orchestrator
// ============================================

export class WebsiteScanOrchestrator {
  private repo = getScanJobsRepo();

  /**
   * Run full website scan
   */
  async run(
    jobId: string,
    rootUrl: string,
    accountId: string,
    config: Partial<WebsiteScanConfig> = {},
    onProgress?: ProgressCallback,
  ): Promise<WebsiteScanResult> {
    const startTime = Date.now();
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const sessionId = randomUUID();

    const stats = {
      pagesScraped: 0,
      pagesSaved: 0,
      totalWords: 0,
      totalImages: 0,
      ragChunksCreated: 0,
    };

    const progress = (step: string, status: 'pending' | 'running' | 'completed' | 'failed', pct: number, msg: string) => {
      onProgress?.(step, status, pct, msg);
      this.repo.addStepLog(jobId, step, status, pct, msg).catch(() => {});
    };

    try {
      // Mark job as running
      await this.repo.markRunning(jobId, 'website-orchestrator');

      // ============================================
      // Step 1: Validate URL
      // ============================================
      progress('validate', 'running', 5, `מאמת URL: ${rootUrl}`);

      const validatedUrl = this.validateUrl(rootUrl);
      progress('validate', 'completed', 10, 'URL תקין');

      // ============================================
      // Step 2: Crawl website via Apify
      // ============================================
      progress('crawl', 'running', 15, `סורק את ${validatedUrl}...`);

      let crawlResult: WebsiteCrawlResult;
      try {
        const crawlProgress: CrawlProgressCallback = (pagesFound, status, elapsed) => {
          const minutes = Math.floor(elapsed / 60);
          const seconds = elapsed % 60;
          const timeStr = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
          const pct = 15 + Math.min(Math.round((pagesFound / fullConfig.maxPages) * 25), 25);
          progress('crawl', 'running', pct, `סורק... נמצאו ${pagesFound} דפים (${timeStr})`);
        };

        crawlResult = await crawlWebsiteFull(validatedUrl, {
          maxPages: fullConfig.maxPages,
          maxDepth: fullConfig.maxDepth,
        }, crawlProgress);

        stats.pagesScraped = crawlResult.stats.pagesSucceeded;
        stats.totalWords = crawlResult.stats.totalWords;
        stats.totalImages = crawlResult.stats.totalImages;

        progress('crawl', 'completed', 40, `נסרקו ${stats.pagesScraped} דפים (${stats.totalWords.toLocaleString()} מילים, ${stats.totalImages} תמונות)`);
      } catch (error: any) {
        progress('crawl', 'failed', 40, `שגיאה בסריקה: ${error.message}`);
        throw error;
      }

      if (crawlResult.pages.length === 0) {
        progress('crawl', 'failed', 40, 'לא נמצאו דפים');
        throw new Error('No pages found during crawl');
      }

      // ============================================
      // Step 2.5: Analyze images with Gemini Vision
      // ============================================
      progress('images', 'running', 42, 'מנתח תמונות מוצרים...');

      try {
        const { analyzeImages, buildImageSection } = await import('./image-analyzer');
        let totalImagesAnalyzed = 0;

        for (const page of crawlResult.pages) {
          if (!page.imageData || page.imageData.length === 0) continue;

          const analyses = await analyzeImages(page.imageData, page.url, 5);
          if (analyses.length > 0) {
            const imageSection = buildImageSection(analyses);
            if (imageSection) {
              page.content += imageSection;
            }
            totalImagesAnalyzed += analyses.length;
          }
        }

        stats.totalImages = totalImagesAnalyzed;
        progress('images', 'completed', 45, `נותחו ${totalImagesAnalyzed} תמונות`);
      } catch (error: any) {
        // Image analysis failure is non-fatal
        console.error(`[WebsiteScan] Image analysis failed:`, error.message);
        progress('images', 'failed', 45, `שגיאה בניתוח תמונות: ${error.message}`);
      }

      // ============================================
      // Step 3: Save pages to DB
      // ============================================
      progress('save', 'running', 48, 'שומר דפים למסד נתונים...');

      const { saved, failed } = await saveFullCrawlResults(accountId, crawlResult, sessionId);
      stats.pagesSaved = saved;

      progress('save', 'completed', 60, `נשמרו ${saved} דפים (${failed} נכשלו)`);

      // ============================================
      // Step 4: Index for RAG (vector search)
      // ============================================
      if (fullConfig.indexForRAG) {
        progress('rag', 'running', 65, 'מאנדקס תוכן לחיפוש AI...');

        try {
          const ragChunks = await this.indexForRAG(accountId, crawlResult);
          stats.ragChunksCreated = ragChunks;
          progress('rag', 'completed', 85, `נוצרו ${ragChunks} חתיכות RAG`);
        } catch (error: any) {
          // RAG indexing failure is non-fatal
          console.error(`[WebsiteScan] RAG indexing failed:`, error.message);
          progress('rag', 'failed', 85, `שגיאה באינדוקס: ${error.message}`);
        }
      }

      // ============================================
      // Step 5: Mark job as succeeded
      // ============================================
      progress('complete', 'completed', 100, 'סריקה הושלמה בהצלחה!');

      await this.repo.markSucceeded(jobId, {
        pagesScraped: stats.pagesScraped,
        pagesSaved: stats.pagesSaved,
        totalWords: stats.totalWords,
        totalImages: stats.totalImages,
        ragChunksCreated: stats.ragChunksCreated,
        rootUrl: validatedUrl,
        domain: crawlResult.domain,
      });

      return {
        success: true,
        jobId,
        accountId,
        rootUrl: validatedUrl,
        stats,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error(`[WebsiteScan] Job ${jobId} failed:`, error.message);

      await this.repo.markFailed(jobId, 'CRAWL_ERROR', error.message).catch(() => {});

      return {
        success: false,
        jobId,
        accountId,
        rootUrl,
        stats,
        error: {
          code: 'CRAWL_ERROR',
          message: error.message,
          retryable: !error.message.includes('Invalid URL'),
        },
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate and normalize URL
   */
  private validateUrl(url: string): string {
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      const parsed = new URL(url);
      // Only allow http/https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only HTTP/HTTPS URLs are supported');
      }
      return parsed.href;
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * Index crawled pages for RAG vector search
   */
  private async indexForRAG(accountId: string, crawlResult: WebsiteCrawlResult): Promise<number> {
    try {
      const { ingestDocument } = await import('@/lib/rag/ingest');
      let totalChunks = 0;

      for (const page of crawlResult.pages) {
        if (!page.content || page.content.length < 50) continue;

        try {
          const result = await ingestDocument({
            accountId,
            entityType: 'website',
            sourceId: page.url,
            title: page.title || page.url,
            text: page.content,
            metadata: {
              url: page.url,
              imageUrls: page.imageUrls,
              wordCount: page.wordCount,
            },
          });

          if (result?.chunksCreated) {
            totalChunks += result.chunksCreated;
          }
        } catch (error: any) {
          console.error(`[WebsiteScan] RAG ingest failed for ${page.url}:`, error.message);
        }
      }

      return totalChunks;
    } catch (error: any) {
      console.error(`[WebsiteScan] RAG module import failed:`, error.message);
      return 0;
    }
  }
}

// ============================================
// Singleton
// ============================================

let orchestratorInstance: WebsiteScanOrchestrator | null = null;

export function getWebsiteScanOrchestrator(): WebsiteScanOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new WebsiteScanOrchestrator();
  }
  return orchestratorInstance;
}
