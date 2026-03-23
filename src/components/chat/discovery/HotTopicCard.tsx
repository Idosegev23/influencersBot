'use client';

import { motion } from 'framer-motion';

interface HotTopicCardProps {
  topicName: string;
  summary: string | null;
  status: 'breaking' | 'hot' | 'cooling' | 'archive';
  heatScore: number;
  coverageCount: number;
  totalPosts: number;
  tags: string[];
  onClick: () => void;
}

const STATUS_CONFIG = {
  breaking: { label: 'BREAKING', color: '#FF0000', bg: '#FFE5E5', pulse: true },
  hot: { label: 'HOT', color: '#FF6B00', bg: '#FFF3E5', pulse: false },
  cooling: { label: 'trending', color: '#FFA500', bg: '#FFF8E5', pulse: false },
  archive: { label: 'archive', color: '#999', bg: '#f5f5f5', pulse: false },
};

export function HotTopicCard({ topicName, summary, status, heatScore, coverageCount, totalPosts, tags, onClick }: HotTopicCardProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.hot;

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="w-full text-right rounded-2xl p-4 transition-all"
      style={{
        background: 'white',
        border: `1.5px solid ${config.bg}`,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
      dir="rtl"
    >
      {/* Status badge + heat */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${config.pulse ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: config.bg, color: config.color }}
          >
            {config.label}
          </span>
        </div>

        {/* Heat bar */}
        <div className="flex items-center gap-1">
          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#f0f0f0' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(heatScore, 100)}%`,
                background: `linear-gradient(90deg, ${config.color}, #FF4444)`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Topic name */}
      <h3 className="font-bold text-[15px] leading-snug mb-1" style={{ color: '#191c1e' }}>
        {topicName}
      </h3>

      {/* Summary */}
      {summary && (
        <p className="text-[12px] leading-relaxed mb-2" style={{ color: '#555' }}>
          {summary}
        </p>
      )}

      {/* Footer: tags only — coverage/post count are internal metrics */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: '#f5f5f5', color: '#888' }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.button>
  );
}
