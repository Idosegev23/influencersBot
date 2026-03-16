'use client';

import { useState, useCallback, useRef } from 'react';
import { resizeImageForChat, validateMediaFile } from '@/lib/chat/resize-image';
import { supabaseClient } from '@/lib/supabase-client';

export interface ChatMediaResult {
  description: string;
  mediaType: 'image' | 'video';
}

export interface UseChatMediaReturn {
  isProcessing: boolean;
  error: string | null;
  previewUrl: string | null;
  result: ChatMediaResult | null;
  processMedia: (file: File, username: string) => Promise<void>;
  clear: () => void;
}

export function useChatMedia(): UseChatMediaReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ChatMediaResult | null>(null);
  const storagePathRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    // Revoke preview URL to free memory
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    // If we uploaded but didn't complete analysis, try to clean up storage
    if (storagePathRef.current && !result) {
      supabaseClient.storage
        .from('chat-media')
        .remove([storagePathRef.current])
        .catch(() => {});
    }

    setIsProcessing(false);
    setError(null);
    setPreviewUrl(null);
    setResult(null);
    storagePathRef.current = null;
  }, [previewUrl, result]);

  const processMedia = useCallback(async (file: File, username: string) => {
    // Reset state
    setError(null);
    setResult(null);
    setIsProcessing(true);

    try {
      // 1. Validate
      const validationError = validateMediaFile(file);
      if (validationError) {
        setError(validationError);
        setIsProcessing(false);
        return;
      }

      const isVideo = file.type.startsWith('video/');
      const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

      // 2. Create preview URL
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);

      // 3. Resize (images only — videos pass through)
      let uploadBlob: Blob = file;
      if (!isVideo) {
        const { blob } = await resizeImageForChat(file);
        uploadBlob = blob;
      }

      // 4. Upload to Supabase Storage
      const ext = isVideo ? 'mp4' : 'jpg';
      const storagePath = `${username}/${Date.now()}.${ext}`;
      storagePathRef.current = storagePath;

      const { error: uploadError } = await supabaseClient.storage
        .from('chat-media')
        .upload(storagePath, uploadBlob, {
          contentType: isVideo ? file.type : 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 5. Call analyze-media API
      const response = await fetch('/api/chat/analyze-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath, mediaType, username }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Analysis failed (${response.status})`);
      }

      const analysisResult = await response.json();
      storagePathRef.current = null; // File will be deleted by server

      setResult({
        description: analysisResult.description,
        mediaType: analysisResult.mediaType,
      });
    } catch (err: any) {
      console.error('[useChatMedia] Error:', err.message);
      setError(err.message || 'שגיאה בעיבוד הקובץ');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { isProcessing, error, previewUrl, result, processMedia, clear };
}
