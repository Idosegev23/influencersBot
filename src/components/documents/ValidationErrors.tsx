'use client';

/**
 * ValidationErrors Component - הצגת שגיאות validation
 * 
 * Error types:
 * - File too large (>50MB)
 * - Unsupported file type
 * - Empty file (0 bytes)
 * - Corrupted file
 * - Network error
 * - AI parsing error
 * 
 * Usage:
 * <ValidationErrors
 *   errors={errors}
 *   onRetry={handleRetry}
 *   onDismiss={handleDismiss}
 * />
 */

import { AlertCircle, XCircle, RefreshCw, X } from 'lucide-react';

export interface ValidationError {
  id: string;
  type: 'file_size' | 'file_type' | 'file_empty' | 'file_corrupt' | 'network' | 'ai_parsing' | 'unknown';
  message: string;
  fileName?: string;
  details?: string;
  canRetry?: boolean;
}

export interface ValidationErrorsProps {
  errors: ValidationError[];
  onRetry?: (errorId: string) => void;
  onDismiss?: (errorId: string) => void;
  onDismissAll?: () => void;
}

const ERROR_MESSAGES: Record<ValidationError['type'], string> = {
  file_size: 'הקובץ גדול מדי. גודל מקסימלי: 50MB',
  file_type: 'סוג קובץ לא נתמך. נתמכים: PDF, Word, Excel, תמונות',
  file_empty: 'הקובץ ריק או פגום. נסה קובץ אחר',
  file_corrupt: 'הקובץ פגום ולא ניתן לקרוא אותו',
  network: 'שגיאת רשת. בדוק את החיבור לאינטרנט',
  ai_parsing: 'AI לא הצליח לנתח את המסמך. נסה שוב או תקן ידנית',
  unknown: 'שגיאה לא ידועה. נסה שוב',
};

export function ValidationErrors({
  errors,
  onRetry,
  onDismiss,
  onDismissAll,
}: ValidationErrorsProps) {
  if (errors.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <h3 className="text-sm font-medium text-red-900">
            שגיאות ({errors.length})
          </h3>
        </div>
        
        {onDismissAll && errors.length > 1 && (
          <button
            onClick={onDismissAll}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            נקה הכל
          </button>
        )}
      </div>

      {/* Error List */}
      <div className="space-y-2">
        {errors.map((error) => (
          <ValidationErrorItem
            key={error.id}
            error={error}
            onRetry={() => onRetry?.(error.id)}
            onDismiss={() => onDismiss?.(error.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ValidationErrorItem({
  error,
  onRetry,
  onDismiss,
}: {
  error: ValidationError;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const defaultMessage = ERROR_MESSAGES[error.type] || error.message;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* File name */}
          {error.fileName && (
            <p className="text-sm font-medium text-red-900 mb-1">
              {error.fileName}
            </p>
          )}

          {/* Error message */}
          <p className="text-sm text-red-800">
            {error.message || defaultMessage}
          </p>

          {/* Details */}
          {error.details && (
            <p className="text-xs text-red-600 mt-1">
              פרטים: {error.details}
            </p>
          )}

          {/* Actions */}
          {(error.canRetry || onRetry) && (
            <div className="flex gap-2 mt-3">
              {error.canRetry && onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  נסה שוב
                </button>
              )}
            </div>
          )}
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 p-1 hover:bg-red-100 rounded transition-colors"
            title="סגור"
          >
            <X className="h-4 w-4 text-red-600" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Alert Component - התראה כללית
 */
export interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  onClose?: () => void;
}

export function Alert({
  variant = 'info',
  title,
  message,
  onClose,
}: AlertProps) {
  const variants = {
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-900',
      icon: 'text-blue-600',
    },
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-900',
      icon: 'text-green-600',
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-900',
      icon: 'text-yellow-600',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-900',
      icon: 'text-red-600',
    },
  };

  const styles = variants[variant];

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} p-4`}>
      <div className="flex items-start gap-3">
        <AlertCircle className={`h-5 w-5 ${styles.icon} flex-shrink-0 mt-0.5`} />

        <div className="flex-1">
          {title && (
            <p className={`text-sm font-medium ${styles.text} mb-1`}>
              {title}
            </p>
          )}
          <p className={`text-sm ${styles.text}`}>
            {message}
          </p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className={`flex-shrink-0 p-1 hover:${styles.bg} rounded transition-colors`}
            title="סגור"
          >
            <X className={`h-4 w-4 ${styles.icon}`} />
          </button>
        )}
      </div>
    </div>
  );
}
