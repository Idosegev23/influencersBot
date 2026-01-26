'use client';

/**
 * DocumentTypeSelector Component - בחירת סוג מסמך
 * 
 * Document Types:
 * - partnership_agreement: חוזה שת"פ
 * - invoice: חשבונית / דרישת תשלום
 * - brief: בריף
 * - proposal: הצעת מחיר
 * - general: מסמך כללי (AI מנחש)
 * 
 * Usage:
 * <DocumentTypeSelector
 *   value={selectedType}
 *   onChange={setSelectedType}
 * />
 */

import { useState } from 'react';
import { ChevronDown, FileText, Receipt, Clipboard, DollarSign, File } from 'lucide-react';

export type DocumentType = 
  | 'partnership_agreement'
  | 'invoice'
  | 'brief'
  | 'proposal'
  | 'general';

export interface DocumentTypeOption {
  value: DocumentType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DOCUMENT_TYPES: DocumentTypeOption[] = [
  {
    value: 'partnership_agreement',
    label: 'חוזה שת"פ',
    description: 'הסכם שיתוף פעולה עם מותג',
    icon: FileText,
  },
  {
    value: 'proposal',
    label: 'הצעת מחיר',
    description: 'הצעת מחיר או הצעת שת"פ',
    icon: DollarSign,
  },
  {
    value: 'invoice',
    label: 'חשבונית / דרישת תשלום',
    description: 'חשבונית, קבלה או דרישת תשלום',
    icon: Receipt,
  },
  {
    value: 'brief',
    label: 'בריף',
    description: 'בריף קמפיין או דרישות תוכן',
    icon: Clipboard,
  },
  {
    value: 'general',
    label: 'מסמך כללי',
    description: 'AI ינחש את סוג המסמך',
    icon: File,
  },
];

export interface DocumentTypeSelectorProps {
  value: DocumentType;
  onChange: (type: DocumentType) => void;
  disabled?: boolean;
  className?: string;
}

export function DocumentTypeSelector({
  value,
  onChange,
  disabled = false,
  className = '',
}: DocumentTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const selectedOption = DOCUMENT_TYPES.find((opt) => opt.value === value) || DOCUMENT_TYPES[4];
  const SelectedIcon = selectedOption.icon;

  return (
    <div className={`relative ${className}`}>
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700 mb-2">
        סוג המסמך
      </label>

      {/* Select Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-3
          px-4 py-3 bg-white border border-gray-300 rounded-lg
          text-right transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500'}
          ${isOpen ? 'border-blue-500 ring-2 ring-blue-500' : ''}
        `}
      >
        <div className="flex items-center gap-3">
          <SelectedIcon className="h-5 w-5 text-gray-400" />
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">
              {selectedOption.label}
            </p>
            <p className="text-xs text-gray-500">
              {selectedOption.description}
            </p>
          </div>
        </div>
        
        <ChevronDown
          className={`h-5 w-5 text-gray-400 transition-transform ${
            isOpen ? 'transform rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Options */}
          <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {DOCUMENT_TYPES.map((option) => {
              const Icon = option.icon;
              const isSelected = option.value === value;
              
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`
                    w-full flex items-start gap-3 px-4 py-3 text-right
                    transition-colors
                    ${isSelected ? 'bg-blue-50 border-r-2 border-blue-500' : 'hover:bg-gray-50'}
                  `}
                >
                  <Icon
                    className={`h-5 w-5 flex-shrink-0 ${
                      isSelected ? 'text-blue-600' : 'text-gray-400'
                    }`}
                  />
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium ${
                        isSelected ? 'text-blue-900' : 'text-gray-900'
                      }`}
                    >
                      {option.label}
                    </p>
                    <p className="text-xs text-gray-500">
                      {option.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * DocumentTypeTag - תג קטן להצגת סוג מסמך
 */
export interface DocumentTypeTagProps {
  type: DocumentType;
  className?: string;
}

export function DocumentTypeTag({ type, className = '' }: DocumentTypeTagProps) {
  const option = DOCUMENT_TYPES.find((opt) => opt.value === type) || DOCUMENT_TYPES[4];
  const Icon = option.icon;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1
        bg-gray-100 text-gray-700 rounded-full
        text-xs font-medium
        ${className}
      `}
    >
      <Icon className="h-3.5 w-3.5" />
      {option.label}
    </span>
  );
}
