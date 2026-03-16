'use client';

import { X, Loader2, CheckCircle, Film } from 'lucide-react';

interface MediaPreviewProps {
  previewUrl: string;
  isProcessing: boolean;
  isReady: boolean;
  isVideo: boolean;
  error: string | null;
  onClear: () => void;
}

export function MediaPreview({
  previewUrl,
  isProcessing,
  isReady,
  isVideo,
  error,
  onClear,
}: MediaPreviewProps) {
  return (
    <div className="media-preview-container">
      <div className="media-preview-thumb-wrap">
        {isVideo ? (
          <div className="media-preview-video-placeholder">
            <Film className="w-5 h-5" style={{ color: '#8b5cf6' }} />
          </div>
        ) : (
          <img src={previewUrl} alt="Preview" className="media-preview-thumb" />
        )}

        {/* Status overlay */}
        {isProcessing && (
          <div className="media-preview-overlay">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#fff' }} />
          </div>
        )}
        {isReady && !error && (
          <div className="media-preview-overlay media-preview-ready">
            <CheckCircle className="w-4 h-4" style={{ color: '#22c55e' }} />
          </div>
        )}
      </div>

      {/* Processing label */}
      <div className="media-preview-info">
        {isProcessing && <span className="media-preview-label">מנתח...</span>}
        {isReady && !error && <span className="media-preview-label media-preview-done">מוכן</span>}
        {error && <span className="media-preview-label media-preview-error">{error}</span>}
      </div>

      {/* Cancel button */}
      <button
        type="button"
        className="media-preview-close"
        onClick={onClear}
        aria-label="הסר מדיה"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
