'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Check, AlertCircle, Phone, User, Package, FileText } from 'lucide-react';

export type FormType = 'phone' | 'name' | 'order' | 'problem' | 'email' | 'text';

interface InlineFormProps {
  type: FormType;
  onSubmit: (value: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  label?: string;
}

const formConfigs: Record<FormType, {
  icon: typeof Phone;
  label: string;
  placeholder: string;
  inputType: string;
  dir: 'ltr' | 'rtl';
  validation?: (value: string) => boolean;
  errorMessage?: string;
}> = {
  phone: {
    icon: Phone,
    label: 'מספר טלפון',
    placeholder: '05X-XXXXXXX',
    inputType: 'tel',
    dir: 'ltr',
    validation: (v) => /^05\d{8,9}$/.test(v.replace(/[-\s]/g, '')),
    errorMessage: 'נא להזין מספר טלפון תקין',
  },
  name: {
    icon: User,
    label: 'שם מלא',
    placeholder: 'השם שלך...',
    inputType: 'text',
    dir: 'rtl',
    validation: (v) => v.trim().length >= 2,
    errorMessage: 'נא להזין שם',
  },
  order: {
    icon: Package,
    label: 'מספר הזמנה',
    placeholder: 'מספר ההזמנה...',
    inputType: 'text',
    dir: 'ltr',
    validation: (v) => v.trim().length >= 3,
    errorMessage: 'נא להזין מספר הזמנה',
  },
  problem: {
    icon: FileText,
    label: 'תיאור הבעיה',
    placeholder: 'תאר/י את הבעיה...',
    inputType: 'textarea',
    dir: 'rtl',
    validation: (v) => v.trim().length >= 10,
    errorMessage: 'נא לתאר את הבעיה',
  },
  email: {
    icon: Send,
    label: 'אימייל',
    placeholder: 'your@email.com',
    inputType: 'email',
    dir: 'ltr',
    validation: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    errorMessage: 'נא להזין אימייל תקין',
  },
  text: {
    icon: FileText,
    label: 'הודעה',
    placeholder: 'כתוב/י כאן...',
    inputType: 'text',
    dir: 'rtl',
  },
};

export function InlineForm({
  type,
  onSubmit,
  isLoading = false,
  placeholder,
  label,
}: InlineFormProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const config = formConfigs[type];
  const Icon = config.icon;
  const isTextarea = config.inputType === 'textarea';

  const validate = () => {
    if (config.validation && !config.validation(value)) {
      setError(config.errorMessage || 'ערך לא תקין');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    
    if (!validate()) return;
    
    onSubmit(value.trim());
    setValue('');
    setTouched(false);
    setError(null);
  };

  const handleBlur = () => {
    setTouched(true);
    validate();
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="w-full bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
    >
      {/* Label */}
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
        <Icon className="w-4 h-4 text-[var(--color-primary)]" />
        {label || config.label}
      </label>

      {/* Input */}
      <div className="relative">
        {isTextarea ? (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder || config.placeholder}
            dir={config.dir}
            rows={3}
            disabled={isLoading}
            className={`
              w-full px-4 py-3 rounded-lg border text-sm resize-none
              focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 
              focus:border-[var(--color-primary)]
              disabled:bg-gray-50 disabled:cursor-not-allowed
              ${touched && error 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                : 'border-gray-200'
              }
            `}
          />
        ) : (
          <input
            type={config.inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder || config.placeholder}
            dir={config.dir}
            disabled={isLoading}
            className={`
              w-full px-4 py-3 rounded-lg border text-sm
              focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 
              focus:border-[var(--color-primary)]
              disabled:bg-gray-50 disabled:cursor-not-allowed
              ${touched && error 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                : 'border-gray-200'
              }
            `}
          />
        )}

        {/* Error message */}
        {touched && error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1 mt-1.5 text-xs text-red-500"
          >
            <AlertCircle className="w-3 h-3" />
            <span>{error}</span>
          </motion.div>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={!value.trim() || isLoading}
        className={`
          w-full mt-3 py-3 rounded-lg font-medium text-sm
          flex items-center justify-center gap-2
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isLoading 
            ? 'bg-gray-100 text-gray-500' 
            : 'bg-[var(--color-primary)] text-white hover:opacity-90'
          }
        `}
      >
        {isLoading ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full"
            />
            <span>שולח...</span>
          </>
        ) : (
          <>
            <Check className="w-4 h-4" />
            <span>המשך</span>
          </>
        )}
      </button>
    </motion.form>
  );
}

