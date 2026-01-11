/**
 * Utility functions for handling images
 */

/**
 * Check if a URL is from Instagram CDN
 */
export function isInstagramUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('cdninstagram.com') || 
         url.includes('fbcdn.net') || 
         url.includes('instagram.com');
}

/**
 * Convert Instagram URL to our proxy URL
 * This bypasses CORS and 403 issues
 */
export function getProxiedImageUrl(url: string): string {
  if (!url) return '/icons/icon.svg';
  
  // If it's already our storage URL, return as-is
  if (url.includes('supabase') || url.includes('localhost') || !isInstagramUrl(url)) {
    return url;
  }
  
  // Use our image proxy
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Get avatar URL with fallback
 */
export function getAvatarUrl(url: string | null | undefined, fallbackInitial?: string): string {
  if (!url) {
    return '/icons/icon.svg';
  }
  
  return getProxiedImageUrl(url);
}





