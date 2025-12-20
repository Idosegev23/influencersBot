'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Lock, Copy, Check, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { isValidSubdomain, slugify } from '@/lib/utils';

interface StepPublishProps {
  suggestedSubdomain: string;
  onPublish: (subdomain: string, password: string) => Promise<void>;
  onBack: () => void;
  isLoading: boolean;
  error: string | null;
}

export function StepPublish({
  suggestedSubdomain,
  onPublish,
  onBack,
  isLoading,
  error,
}: StepPublishProps) {
  const [subdomain, setSubdomain] = useState(slugify(suggestedSubdomain));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState('');

  const previewUrl = `/chat/${subdomain}`;

  const handleSubdomainChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(cleaned);
    setValidationError('');
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(previewUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePublish = async () => {
    setValidationError('');

    // Validate subdomain
    if (!subdomain || subdomain.length < 3) {
      setValidationError('הכתובת חייבת להכיל לפחות 3 תווים');
      return;
    }

    if (!isValidSubdomain(subdomain)) {
      setValidationError('הכתובת יכולה להכיל רק אותיות באנגלית, מספרים ומקפים');
      return;
    }

    // Validate password
    if (!password || password.length < 6) {
      setValidationError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    if (password !== confirmPassword) {
      setValidationError('הסיסמאות לא תואמות');
      return;
    }

    await onPublish(subdomain, password);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-xl mx-auto"
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
          <Globe className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          פרסום הצ'אטבוט
        </h2>
        <p className="text-gray-600">
          בחרו כתובת והגדירו סיסמת גישה למנהל
        </p>
      </div>

      <div className="space-y-6">
        {/* Subdomain Input */}
        <div className="card p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            כתובת הצ'אטבוט
          </label>
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
            <span className="text-gray-400 text-sm">/chat/</span>
            <input
              type="text"
              value={subdomain}
              onChange={(e) => handleSubdomainChange(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none font-mono text-lg"
              placeholder="username"
              dir="ltr"
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <button
              onClick={handleCopyUrl}
              className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'הועתק!' : 'העתק כתובת'}
            </button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              תצוגה מקדימה
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Password Input */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-gray-400" />
            <label className="text-sm font-medium text-gray-700">
              סיסמת גישה לניהול
            </label>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setValidationError('');
              }}
              placeholder="סיסמה (לפחות 6 תווים)"
              className="input"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setValidationError('');
              }}
              placeholder="אימות סיסמה"
              className="input"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            סיסמה זו תשמש לגישה לפאנל הניהול של המשפיען
          </p>
        </div>

        {/* Errors */}
        {(validationError || error) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {validationError || error}
          </motion.div>
        )}

        {/* Summary */}
        <div className="card p-4 bg-indigo-50 border-indigo-200">
          <h4 className="font-medium text-indigo-900 mb-2">מה יקרה עכשיו?</h4>
          <ul className="text-sm text-indigo-700 space-y-1">
            <li>- נוצר חשבון עם הכתובת שבחרת</li>
            <li>- נבנה בוט AI עם הפרסונה שזוהתה</li>
            <li>- הצ'אטבוט יהיה זמין באופן מיידי</li>
            <li>- תוכלו לנהל מוצרים ולראות אנליטיקס</li>
          </ul>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 mt-8">
        <button onClick={onBack} className="btn-secondary flex-1" disabled={isLoading}>
          חזור
        </button>
        <button
          onClick={handlePublish}
          disabled={isLoading || !subdomain || !password}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              מפרסם...
            </>
          ) : (
            <>
              פרסם צ'אטבוט
              <ExternalLink className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}


