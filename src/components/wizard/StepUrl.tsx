'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Instagram, ArrowLeft, AlertCircle } from 'lucide-react';
import { parseInstagramUsername } from '@/lib/utils';

interface StepUrlProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export function StepUrl({ onSubmit, isLoading }: StepUrlProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const username = parseInstagramUsername(url);
    if (!username) {
      setError('כתובת לא תקינה. הזינו URL של פרופיל אינסטגרם או שם משתמש');
      return;
    }

    onSubmit(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-xl mx-auto"
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center mx-auto mb-4">
          <Instagram className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          הזינו את כתובת האינסטגרם
        </h2>
        <p className="text-gray-600">
          הדביקו את הקישור לפרופיל האינסטגרם של המשפיען
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
            }}
            placeholder="https://instagram.com/username או @username"
            className="input text-lg py-4 text-center"
            disabled={isLoading}
            dir="ltr"
          />
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </motion.div>
        )}

        <button
          type="submit"
          disabled={!url.trim() || isLoading}
          className="w-full btn-primary flex items-center justify-center gap-2 py-4"
        >
          {isLoading ? (
            <>
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              מתחבר...
            </>
          ) : (
            <>
              המשך
              <ArrowLeft className="w-5 h-5" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 p-4 bg-gray-50 rounded-xl">
        <p className="text-sm text-gray-600 text-center">
          המערכת תשלוף אוטומטית את הפרופיל, הפוסטים והתוכן מהאינסטגרם
        </p>
      </div>
    </motion.div>
  );
}







