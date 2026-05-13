'use client';

/**
 * Customers tab — for B2B SaaS accounts (b2b_saas archetype).
 * Renders the case-study tiles described in `accounts.config.case_studies`.
 *
 * Each tile = a real customer with: brand name, optional logo, the headline
 * result, an optional industry tag, and a preset prompt that opens the chat
 * pre-asking about that customer's story. The point is social proof during
 * evaluation — visitors see who else uses it, then go deeper through chat.
 */

import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import { track } from '@/lib/analytics/track';
import { getChatUiStrings, type ChatLang } from '@/lib/i18n/chat-ui';

interface CaseStudy {
  id: string;
  brand: string;
  industry?: string;
  headline: string;
  logo?: string;
  prompt?: string;
}

interface Props {
  caseStudies: CaseStudy[];
  brandColor?: string;
  language?: string;
  onAskAbout: (q: string) => void;
}

export default function CustomersTab({ caseStudies, brandColor = '#0c1013', language, onAskAbout }: Props) {
  const ui = getChatUiStrings((language as ChatLang) || 'en');
  const isEn = (language || 'en').toLowerCase() === 'en';

  if (!caseStudies || caseStudies.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-gray-500">
        {ui.empty.generic}
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-5">
        <h2 className="text-2xl font-bold" style={{ color: brandColor }}>
          {isEn ? 'Customers' : 'לקוחות'}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          {isEn
            ? 'Brands shipping with us. Tap any case to dig into the story.'
            : 'מותגים שעובדים איתנו. בחרו קייס כדי לראות את הסיפור.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {caseStudies.map((cs, idx) => {
          const prompt = cs.prompt || (isEn
            ? `Tell me about the ${cs.brand} case study`
            : `ספר/י לי על ה-case study של ${cs.brand}`);
          return (
            <motion.button
              key={cs.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.3 }}
              onClick={() => {
                try { track('case_study_clicked', { case_id: cs.id, brand: cs.brand }); } catch { /* */ }
                onAskAbout(prompt);
              }}
              className="text-left bg-white border border-gray-200 rounded-2xl p-4 hover:border-gray-400 hover:shadow-md transition-all"
              style={{ direction: isEn ? 'ltr' : 'rtl' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-50"
                  style={{ color: brandColor }}
                >
                  {cs.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cs.logo} alt={cs.brand} className="w-full h-full object-contain p-1" />
                  ) : (
                    <Building2 className="w-6 h-6" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{cs.brand}</span>
                    {cs.industry && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {cs.industry}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 mt-1 leading-snug">{cs.headline}</div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
