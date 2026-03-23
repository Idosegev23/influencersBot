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
        scrollPos += 0.5;
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

  const statusEmoji = (s: string) => s === 'breaking' ? '🔴' : s === 'hot' ? '🔥' : '📢';

  // Duplicate headlines for seamless loop
  const items = [...headlines, ...headlines];

  return (
    <div
      className="w-full overflow-hidden py-2.5 px-1"
      style={{ background: 'linear-gradient(90deg, #1a1a2e, #16213e)' }}
    >
      <div
        ref={scrollRef}
        className="flex gap-6 whitespace-nowrap overflow-hidden"
        dir="rtl"
      >
        {items.map((headline, idx) => (
          <button
            key={idx}
            onClick={headline.onClick}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium shrink-0 active:opacity-70 transition-opacity"
            style={{ color: '#e0e0e0' }}
          >
            <span>{statusEmoji(headline.status)}</span>
            <span>{headline.text}</span>
            <span style={{ color: '#555' }}>|</span>
          </button>
        ))}
      </div>
    </div>
  );
}
