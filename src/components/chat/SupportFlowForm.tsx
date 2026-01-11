'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface SupportFlowFormProps {
  inputType: 'name' | 'order' | 'problem' | 'phone';
  onSubmit: (value: string) => void;
  isLoading?: boolean;
}

const placeholders: Record<string, string> = {
  name: 'השם המלא...',
  order: 'מספר הזמנה...',
  problem: 'תארי את הבעיה...',
  phone: '05X-XXXXXXX'
};

const labels: Record<string, string> = {
  name: 'שם מלא',
  order: 'מספר הזמנה',
  problem: 'פירוט הבעיה',
  phone: 'מספר נייד'
};

export function SupportFlowForm({ inputType, onSubmit, isLoading }: SupportFlowFormProps) {
  const [value, setValue] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
      setValue('');
    }
  };
  
  const isTextarea = inputType === 'problem';
  
  return (
    <motion.form
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="w-full max-w-md mx-auto"
    >
      <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
        {labels[inputType]}
      </label>
      
      {isTextarea ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholders[inputType]}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-right resize-none focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
          rows={3}
          disabled={isLoading}
          autoFocus
        />
      ) : (
        <input
          type={inputType === 'phone' ? 'tel' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholders[inputType]}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-right focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
          disabled={isLoading}
          autoFocus
          dir={inputType === 'phone' ? 'ltr' : 'rtl'}
        />
      )}
      
      <button
        type="submit"
        disabled={!value.trim() || isLoading}
        className="w-full mt-3 px-4 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {isLoading ? 'שולח...' : 'המשך'}
      </button>
    </motion.form>
  );
}





