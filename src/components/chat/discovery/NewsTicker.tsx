'use client';

interface NewsTickerProps {
  headlines: Array<{
    text: string;
    status: 'breaking' | 'hot' | 'cooling';
    onClick: () => void;
  }>;
}

export function NewsTicker({ headlines }: NewsTickerProps) {
  if (headlines.length === 0) return null;

  const statusDot = (s: string) => s === 'breaking' ? '#FF3B30' : s === 'hot' ? '#FF9500' : '#AF52DE';

  // Duplicate for seamless CSS loop
  const items = [...headlines, ...headlines];

  // Calculate animation duration based on content length
  const duration = Math.max(headlines.length * 5, 20);

  return (
    <div
      className="w-full overflow-hidden"
      style={{
        background: 'linear-gradient(90deg, #0A0A0A, #1A1A2E, #0A0A0A)',
        padding: '10px 0',
      }}
    >
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(50%); }
        }
        .ticker-track {
          animation: ticker-scroll ${duration}s linear infinite;
          display: flex;
          gap: 2rem;
          width: max-content;
          direction: rtl;
        }
        .ticker-track:hover,
        .ticker-track:active {
          animation-play-state: paused;
        }
      `}</style>
      <div className="ticker-track">
        {items.map((headline, idx) => (
          <button
            key={idx}
            onClick={headline.onClick}
            className="inline-flex items-center gap-2 text-[12px] shrink-0 active:opacity-70 transition-opacity"
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: statusDot(headline.status),
                boxShadow: `0 0 6px ${statusDot(headline.status)}`,
              }}
            />
            <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
              {headline.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
