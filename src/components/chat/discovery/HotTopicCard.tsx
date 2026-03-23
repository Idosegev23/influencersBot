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
  variant?: 'hero' | 'compact';
}

const STATUS_CONFIG = {
  breaking: { label: 'BREAKING', color: '#FF3B30', glow: 'rgba(255,59,48,0.15)', gradient: 'linear-gradient(135deg, #FF3B30, #FF6B6B)', border: '#FF3B30' },
  hot: { label: 'HOT', color: '#FF9500', glow: 'rgba(255,149,0,0.12)', gradient: 'linear-gradient(135deg, #FF9500, #FFCC00)', border: '#FF9500' },
  cooling: { label: 'TRENDING', color: '#AF52DE', glow: 'rgba(175,82,222,0.1)', gradient: 'linear-gradient(135deg, #AF52DE, #5856D6)', border: '#AF52DE' },
  archive: { label: 'ARCHIVE', color: '#8E8E93', glow: 'transparent', gradient: 'linear-gradient(135deg, #8E8E93, #636366)', border: '#8E8E93' },
};

export function HotTopicCard({ topicName, summary, status, heatScore, tags, onClick, variant = 'compact' }: HotTopicCardProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.hot;
  const isHero = variant === 'hero';

  if (isHero) {
    return (
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className="w-full text-right overflow-hidden"
        style={{
          borderRadius: '20px',
          background: 'linear-gradient(145deg, #1C1C1E, #2C2C2E)',
          boxShadow: `0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
        dir="rtl"
      >
        {/* Accent gradient strip */}
        <div className="h-1" style={{ background: config.gradient }} />
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${status === 'breaking' ? 'animate-pulse' : ''}`}
              style={{ background: config.gradient, color: 'white' }}
            >
              {config.label}
            </span>
            {/* Heat dots */}
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: i < Math.ceil(heatScore / 20) ? config.color : 'rgba(255,255,255,0.1)',
                  }}
                />
              ))}
            </div>
          </div>
          <h2 className="font-black text-[20px] leading-tight mb-2" style={{ color: '#FFFFFF' }}>
            {topicName}
          </h2>
          {summary && (
            <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {summary}
            </p>
          )}
          {tags.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3">
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="w-full text-right flex items-stretch overflow-hidden"
      style={{
        borderRadius: '16px',
        background: '#FFFFFF',
        boxShadow: `0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)`,
      }}
      dir="rtl"
    >
      {/* Color accent bar */}
      <div className="w-1 flex-shrink-0" style={{ background: config.gradient }} />
      <div className="flex-1 p-3.5 pr-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${status === 'breaking' ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: config.glow, color: config.color }}
          >
            {config.label}
          </span>
          {/* Mini heat bar */}
          <div className="flex-1" />
          <div className="w-10 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(heatScore, 100)}%`,
                background: config.gradient,
              }}
            />
          </div>
        </div>
        <h3 className="font-bold text-[14px] leading-snug mb-0.5" style={{ color: '#1C1C1E' }}>
          {topicName}
        </h3>
        {summary && (
          <p className="text-[12px] leading-relaxed line-clamp-2" style={{ color: '#8E8E93' }}>
            {summary}
          </p>
        )}
      </div>
    </motion.button>
  );
}
