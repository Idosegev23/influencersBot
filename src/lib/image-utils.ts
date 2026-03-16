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
export function getProxiedImageUrl(url: string, shortcode?: string): string {
  if (!url) return '/icons/icon.svg';

  // If it's already our storage URL, return as-is
  if (url.includes('supabase') || url.includes('localhost') || !isInstagramUrl(url)) {
    return url;
  }

  // Use our image proxy with optional shortcode fallback
  const params = new URLSearchParams({ url });
  if (shortcode) params.set('shortcode', shortcode);
  return `/api/image-proxy?${params.toString()}`;
}

/**
 * Get proxy URL from shortcode only (no CDN URL needed)
 */
export function getProxiedImageByShortcode(shortcode: string): string {
  if (!shortcode) return '/icons/icon.svg';
  return `/api/image-proxy?shortcode=${encodeURIComponent(shortcode)}`;
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





