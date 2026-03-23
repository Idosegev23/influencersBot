'use client';

import { useRef, useEffect } from 'react';

interface NewsTickerProps {
  headlines: Array<{
    text: string;
    status: 'breaking' | 'hot' | 'cooling';
    onClick: () => void;
  }>;
}

export function NewsTicker({ headlines }: NewsTickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || headlines.length === 0) return;

    let scrollPos = 0;
    let isPaused = false;

    const animate = () => {
      if (!isPaused && el) {
        scrollPos += 0.4;
        if (scrollPos >= el.scrollWidth / 2) {
          scrollPos = 0;
        }
        el.scrollLeft = scrollPos;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    const handleTouch = () => { isPaused = true; };
    const handleRelease = () => { isPaused = false; };

    el.addEventListener('touchstart', handleTouch);
    el.addEventListener('touchend', handleRelease);
    el.addEventListener('mouseenter', handleTouch);
    el.addEventListener('mouseleave', handleRelease);

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      el.removeEventListener('touchstart', handleTouch);
      el.removeEventListener('touchend', handleRelease);
      el.removeEventListener('mouseenter', handleTouch);
      el.removeEventListener('mouseleave', handleRelease);
    };
  }, [headlines]);

  if (headlines.length === 0) return null;

  const statusDot = (s: string) => s === 'breaking' ? '#FF3B30' : s === 'hot' ? '#FF9500' : '#AF52DE';

  // Duplicate for seamless loop
  const items = [...headlines, ...headlines];

  return (
    <div
      className="w-full overflow-hidden"
      style={{
        background: 'linear-gradient(90deg, #0A0A0A, #1A1A2E, #0A0A0A)',
        padding: '10px 0',
      }}
    >
      <div
        ref={scrollRef}
        className="flex gap-8 whitespace-nowrap overflow-hidden"
        dir="rtl"
      >
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
