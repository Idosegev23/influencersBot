/**
 * Client-side image resize via Canvas API.
 * No npm dependencies — pure browser APIs.
 */

const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.8;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export interface ResizeResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Resize an image file for chat upload.
 * - Scales down to maxWidth (default 1200px) keeping aspect ratio
 * - Converts to JPEG at 0.8 quality (~300-500KB typically)
 * - Returns original blob if it's already small enough and within dimensions
 */
export async function resizeImageForChat(
  file: File,
  maxWidth = MAX_WIDTH
): Promise<ResizeResult> {
  // Videos pass through unchanged
  if (file.type.startsWith('video/')) {
    return { blob: file, width: 0, height: 0 };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Only resize if wider than max
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          resolve({ blob, width, height });
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Validate a media file before processing.
 * Returns error message or null if valid.
 */
export function validateMediaFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return 'הקובץ גדול מדי (מקסימום 20MB)';
  }

  const isImage = file.type.startsWith('image/');
  const isVideo = ['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type);

  if (!isImage && !isVideo) {
    return 'סוג קובץ לא נתמך. ניתן להעלות תמונות או סרטוני וידאו';
  }

  return null;
}
