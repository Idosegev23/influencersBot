import { supabase } from './supabase';

/**
 * Download an image from URL and upload to Supabase Storage
 * Returns the public URL of the uploaded image
 */
export async function uploadImageFromUrl(
  imageUrl: string,
  bucket: string,
  path: string
): Promise<string | null> {
  try {
    // Fetch the image with browser-like headers
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.instagram.com/',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status}`);
      return null;
    }

    const blob = await response.blob();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // Determine file extension
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const ext = extMap[contentType] || 'jpg';
    const fullPath = `${path}.${ext}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fullPath, blob, {
        contentType,
        upsert: true, // Overwrite if exists
      });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Upload image from URL error:', error);
    return null;
  }
}

/**
 * Upload profile picture for an influencer
 */
export async function uploadProfilePicture(
  username: string,
  imageUrl: string
): Promise<string | null> {
  return uploadImageFromUrl(
    imageUrl,
    'avatars',
    `influencers/${username}/profile`
  );
}

/**
 * Upload product image
 */
export async function uploadProductImage(
  influencerId: string,
  productId: string,
  imageUrl: string
): Promise<string | null> {
  return uploadImageFromUrl(
    imageUrl,
    'products',
    `${influencerId}/${productId}`
  );
}

/**
 * Upload content image
 */
export async function uploadContentImage(
  influencerId: string,
  contentId: string,
  imageUrl: string
): Promise<string | null> {
  return uploadImageFromUrl(
    imageUrl,
    'content',
    `${influencerId}/${contentId}`
  );
}





