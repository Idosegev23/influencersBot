'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  type?: 'text' | 'number' | 'date' | 'email' | 'url' | 'textarea';
  placeholder?: string;
  validation?: (value: string) => string | null; // Returns error message or null
  className?: string;
  disabled?: boolean;
  label?: string;
  required?: boolean;
}

export function InlineEdit({
  value: initialValue,
  onSave,
  type = 'text',
  placeholder,
  validation,
  className,
  disabled = false,
  label,
  required = false,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (type === 'textarea') {
        (inputRef.current as HTMLTextAreaElement).setSelectionRange(
          inputRef.current.value.length,
          inputRef.current.value.length
        );
      } else {
        inputRef.current.select();
      }
    }
  }, [isEditing, type]);

  const handleSave = async () => {
    if (value === initialValue) {
      setIsEditing(false);
      return;
    }

    // Validation
    if (validation) {
      const errorMsg = validation(value);
      if (errorMsg) {
        setError(errorMsg);
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(value);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(initialValue);
    setError(null);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (disabled) {
    return (
      <div className={cn('text-gray-900', className)}>
        {label && <span className="text-sm text-gray-600 mb-1 block">{label}</span>}
        <div className="text-gray-500">{initialValue || placeholder || '—'}</div>
      </div>
    );
  }

  return (
    <div className={cn('inline-edit-container', className)}>
      {label && (
        <label className="text-sm text-gray-700 mb-1 block font-medium">
          {label}
          {required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}

      {!isEditing ? (
        // Display mode
        <button
          onClick={() => setIsEditing(true)}
          className={cn(
            'text-right w-full px-3 py-2 rounded-lg border border-gray-200',
            'hover:border-blue-400 hover:bg-blue-50 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-blue-500',
            !initialValue && 'text-gray-400'
          )}
        >
          {initialValue || placeholder || 'לחץ לעריכה...'}
        </button>
      ) : (
        // Edit mode
        <div className="space-y-2">
          <div className="relative">
            {type === 'textarea' ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={4}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500',
                  error ? 'border-red-500' : 'border-gray-300',
                  'text-right'
                )}
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={type}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500',
                  error ? 'border-red-500' : 'border-gray-300',
                  'text-right'
                )}
              />
            )}
          </div>

          {error && (
            <div className="text-sm text-red-600 text-right">{error}</div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Specialized version for currency
export function CurrencyInlineEdit({
  value,
  onSave,
  currency = '₪',
  ...props
}: Omit<InlineEditProps, 'type'> & { currency?: string }) {
  const formatCurrency = (val: string) => {
    const num = parseFloat(val);
    return isNaN(num) ? val : `${num.toLocaleString('he-IL')} ${currency}`;
  };

  return (
    <InlineEdit
      {...props}
      value={value}
      onSave={onSave}
      type="number"
      validation={(val) => {
        if (!val) return 'שדה חובה';
        const num = parseFloat(val);
        if (isNaN(num)) return 'חייב להיות מספר';
        if (num < 0) return 'חייב להיות חיובי';
        return null;
      }}
    />
  );
}

// Specialized version for dates
export function DateInlineEdit({
  value,
  onSave,
  minDate,
  maxDate,
  ...props
}: Omit<InlineEditProps, 'type'> & {
  minDate?: string;
  maxDate?: string;
}) {
  return (
    <InlineEdit
      {...props}
      value={value}
      onSave={onSave}
      type="date"
      validation={(val) => {
        if (!val) return null;
        const date = new Date(val);
        if (minDate && date < new Date(minDate)) {
          return `תאריך חייב להיות אחרי ${minDate}`;
        }
        if (maxDate && date > new Date(maxDate)) {
          return `תאריך חייב להיות לפני ${maxDate}`;
        }
        return null;
      }}
    />
  );
}
