'use client';

/**
 * UploadProgress Component - מציג התקדמות העלאה ו-parsing
 * 
 * States:
 * 1. Uploading (0-50%): "מעלה קובץ..."
 * 2. Parsing (50-90%): "AI מנתח..."
 * 3. Complete (100%): "הושלם בהצלחה!"
 * 4. Error: "שגיאה: ..."
 * 
 * Usage:
 * <UploadProgress
 *   fileName="document.pdf"
 *   progress={75}
 *   status="parsing"
 * />
 */

import { CheckCircle2, Loader2, AlertCircle, FileText } from 'lucide-react';

export type UploadStatus = 'uploading' | 'parsing' | 'complete' | 'error';

export interface UploadProgressProps {
  fileName: string;
  progress: number; // 0-100
  status: UploadStatus;
  error?: string;
  onRetry?: () => void;
  onCancel?: () => void;
}

const STATUS_MESSAGES: Record<UploadStatus, string> = {
  uploading: 'מעלה קובץ...',
  parsing: 'AI מנתח את המסמך...',
  complete: 'הושלם בהצלחה!',
  error: 'העלאה נכשלה',
};

const STATUS_COLORS: Record<UploadStatus, string> = {
  uploading: 'blue',
  parsing: 'purple',
  complete: 'green',
  error: 'red',
};

export function UploadProgress({
  fileName,
  progress,
  status,
  error,
  onRetry,
  onCancel,
}: UploadProgressProps) {
  const color = STATUS_COLORS[status];
  const message = STATUS_MESSAGES[status];

  return (
    <div
      className={`
        rounded-lg border p-4 transition-all duration-300
        ${status === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}
        ${status === 'complete' ? 'border-green-200 bg-green-50' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-1">
          {status === 'complete' && (
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          )}
          {status === 'error' && (
            <AlertCircle className="h-6 w-6 text-red-600" />
          )}
          {(status === 'uploading' || status === 'parsing') && (
            <Loader2 className={`h-6 w-6 text-${color}-600 animate-spin`} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* File name */}
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-gray-400" />
            <p className="text-sm font-medium text-gray-900 truncate">
              {fileName}
            </p>
          </div>

          {/* Status message */}
          <p
            className={`text-sm ${
              status === 'error'
                ? 'text-red-600'
                : status === 'complete'
                ? 'text-green-600'
                : 'text-gray-600'
            }`}
          >
            {message}
          </p>

          {/* Error message */}
          {status === 'error' && error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}

          {/* Progress bar */}
          {(status === 'uploading' || status === 'parsing') && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>{Math.round(progress)}%</span>
                <span>
                  {status === 'uploading'
                    ? 'מעלה...'
                    : 'מנתח עם AI...'}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-${color}-500 transition-all duration-300 ease-out`}
                  style={{ width: `${progress}%` }}
                >
                  {/* Shimmer effect */}
                  <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {status === 'error' && (
            <div className="flex gap-2 mt-3">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                >
                  נסה שוב
                </button>
              )}
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  בטל
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * UploadProgressList - רשימת מספר uploads במקביל
 */
export interface Upload {
  id: string;
  fileName: string;
  progress: number;
  status: UploadStatus;
  error?: string;
}

export interface UploadProgressListProps {
  uploads: Upload[];
  onRetry?: (id: string) => void;
  onCancel?: (id: string) => void;
}

export function UploadProgressList({
  uploads,
  onRetry,
  onCancel,
}: UploadProgressListProps) {
  if (uploads.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700">
        העלאות ({uploads.length})
      </h3>
      
      {uploads.map((upload) => (
        <UploadProgress
          key={upload.id}
          fileName={upload.fileName}
          progress={upload.progress}
          status={upload.status}
          error={upload.error}
          onRetry={() => onRetry?.(upload.id)}
          onCancel={() => onCancel?.(upload.id)}
        />
      ))}
    </div>
  );
}
