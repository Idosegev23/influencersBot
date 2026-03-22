'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';

interface LeadMagnetPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, email: string) => void;
  influencerName: string;
}

export function LeadMagnetPopup({ isOpen, onClose, onSubmit, influencerName }: LeadMagnetPopupProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setIsSubmitting(true);
    await onSubmit(name.trim(), email.trim());
    setIsSubmitting(false);
  }, [name, email, onSubmit]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Popup */}
          <motion.div
            className="relative w-full max-w-[360px] bg-white rounded-3xl overflow-hidden shadow-2xl"
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            dir="rtl"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 left-3 z-10 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>

            {/* Header area */}
            <div className="px-6 pt-8 pb-4 text-center">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#7c3aed15' }}>
                <Sparkles className="w-7 h-7" style={{ color: '#7c3aed' }} />
              </div>
              <h3 className="text-[20px] font-bold mb-1.5" style={{ color: '#0c1013' }}>
                נהנים מהתוכן? 🔥
              </h3>
              <p className="text-[14px] leading-relaxed" style={{ color: '#676767' }}>
                השאירו פרטים וקבלו גישה לתוכן בלעדי של {influencerName}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-6 pb-6">
              <div className="flex flex-col gap-3 mb-4">
                <input
                  type="text"
                  placeholder="שם"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl text-[14px] outline-none transition-all focus:ring-2 focus:ring-purple-500/25"
                  style={{
                    backgroundColor: '#f4f5f7',
                    border: '1px solid #e5e5ea',
                    color: '#0c1013',
                  }}
                  required
                />
                <input
                  type="email"
                  placeholder="אימייל"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl text-[14px] outline-none transition-all focus:ring-2"
                  style={{
                    backgroundColor: '#f4f5f7',
                    border: '1px solid #e5e5ea',
                    color: '#0c1013',
                  }}
                  dir="ltr"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !name.trim() || !email.trim()}
                className="w-full py-3.5 rounded-2xl text-[15px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                style={{ backgroundColor: '#7c3aed' }}
              >
                {isSubmitting ? 'שולח...' : 'קבלו גישה'}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full mt-2 py-2 text-[13px] transition-colors"
                style={{ color: '#999' }}
              >
                לא עכשיו
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
