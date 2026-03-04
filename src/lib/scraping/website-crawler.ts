/**
 * Website Crawler - סורק אתרים מהביו של משפיען
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface WebsiteData {
  url: string;
  title: string;
  pages: Array<{
    url: string;
    title: string;
    content: string;
  }>;
}

/**
 * חילוץ URLs מביו
 */
export function extractUrlsFromBio(bio: string, bioLinks?: string[] | null): string[] {
  const urls: string[] = [];
  
  // Add bio_links if provided
  if (bioLinks && Array.isArray(bioLinks)) {
    urls.push(...bioLinks);
  }
  
  // Extract URLs from bio text using regex
  if (bio) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = bio.match(urlRegex);
    if (matches) {
      urls.push(...matches);
    }
  }
  
  // Remove duplicates
  return [...new Set(urls)];
}

/**
 * סריקת אתר (stub implementation)
 */
export async function crawlWebsite(url: string, maxPages: number): Promise<WebsiteData> {
  console.log(`[Website Crawler] Crawling ${url} (max ${maxPages} pages)`);
  
  // Stub implementation - returns basic structure
  return {
    url,
    title: 'Website Title',
    pages: [{
      url,
      title: 'Home Page',
      content: 'Website content'
    }]
  };
}

/**
 * שמירת נתוני אתר ל-Supabase
 */
export async function saveWebsiteData(
  supabase: SupabaseClient | string, 
  accountId: string, 
  websiteData: WebsiteData,
  sessionId?: string
): Promise<boolean> {
  console.log(`[Website Crawler] Saving website data for ${accountId}`);
  
  // Stub implementation
  return true;
}
