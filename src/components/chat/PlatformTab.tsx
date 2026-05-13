'use client';

/**
 * Platform tab — for B2B SaaS accounts (b2b_saas archetype).
 * Renders the product/workspace tiles described in `accounts.config.platform_workspaces`.
 *
 * Each tile = a workspace with: title, summary, icon hint, optional preset prompt.
 * Tapping a tile sends the preset prompt to the chat so the bot answers about
 * that specific workspace — the user doesn't have to find the right question.
 *
 * If the account has no `platform_workspaces` configured, the tab renders an
 * empty state. This is intentional: rather than auto-deriving from RAG (noisy),
 * we want operators to curate the 5–8 tiles that matter for evaluation.
 */

import { motion } from 'framer-motion';
import { Sparkles, Search, Eye, Megaphone, Video, Bot, BarChart3, Layers } from 'lucide-react';
import { track } from '@/lib/analytics/track';
import { getChatUiStrings, type ChatLang } from '@/lib/i18n/chat-ui';

interface Workspace {
  id: string;
  title: string;
  summary: string;
  icon?: string;
  prompt?: string;
}

interface Props {
  workspaces: Workspace[];
  brandColor?: string;
  language?: string;
  onAskAbout: (q: string) => void;
}

const ICON_MAP: Record<string, typeof Sparkles> = {
  search: Search,
  eye: Eye,
  megaphone: Megaphone,
  video: Video,
  bot: Bot,
  chart: BarChart3,
  layers: Layers,
  sparkles: Sparkles,
};

export default function PlatformTab({ workspaces, brandColor = '#0c1013', language, onAskAbout }: Props) {
  const ui = getChatUiStrings((language as ChatLang) || 'en');
  const isEn = (language || 'en').toLowerCase() === 'en';

  if (!workspaces || workspaces.length === 0) {
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
          {isEn ? 'Platform' : 'פלטפורמה'}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          {isEn
            ? 'Six connected workspaces. Tap any one to learn how it fits your stack.'
            : 'שש חללי עבודה מחוברים. בחרו אחד כדי ללמוד איך הוא משתלב.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {workspaces.map((ws, idx) => {
          const Icon = ICON_MAP[ws.icon || 'sparkles'] || Sparkles;
          const prompt = ws.prompt || (isEn
            ? `Tell me more about ${ws.title}`
            : `ספר/י לי עוד על ${ws.title}`);
          return (
            <motion.button
              key={ws.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.3 }}
              onClick={() => {
                track('platform_workspace_clicked', { workspace_id: ws.id, workspace_title: ws.title });
                onAskAbout(prompt);
              }}
              className="text-left bg-white border border-gray-200 rounded-2xl p-4 hover:border-gray-400 hover:shadow-md transition-all group"
              style={{ direction: isEn ? 'ltr' : 'rtl' }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${brandColor}12`, color: brandColor }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 leading-tight">{ws.title}</div>
                  <div className="text-sm text-gray-600 mt-1 line-clamp-3">{ws.summary}</div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
