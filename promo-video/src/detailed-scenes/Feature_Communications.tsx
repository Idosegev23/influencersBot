import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * Communications Hub
 * Duration: 12 seconds (360 frames)
 * 
 * Real Features:
 * - 4 קטגוריות: פיננסי, משפטי, בעיות, כללי
 * - סטטוסים: Open/Closed
 * - Thread view
 * - Escalation alerts
 */
export const Feature_Communications: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <NoiseBackground color="#1e3a8a" intensity={0.1} />
      
      <div style={{ padding: 100, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        
        {/* Title */}
        <div style={{
          fontFamily,
          fontSize: 70,
          fontWeight: 900,
          color: '#fff',
          marginBottom: 30,
          textAlign: 'center',
          opacity: interpolate(frame, [0, 20], [0, 1]),
          direction: 'rtl'
        }}>
          Communications Hub
        </div>

        <div style={{
          fontFamily,
          fontSize: 36,
          color: '#bfdbfe',
          fontWeight: 300,
          marginBottom: 60,
          textAlign: 'center',
          opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          כל התקשורת עם מותגים במקום אחד
        </div>

        {/* Categories Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 30,
          marginBottom: 60
        }}>
          {[
            { icon: '💰', title: 'פיננסי', count: 5, color: '#3b82f6', delay: 60 },
            { icon: '⚖️', title: 'משפטי', count: 2, color: '#8b5cf6', delay: 90 },
            { icon: '🚨', title: 'בעיות', count: 1, color: '#ef4444', delay: 120 },
            { icon: '📢', title: 'כללי', count: 8, color: '#10b981', delay: 150 }
          ].map((cat) => (
            <CategoryCard key={cat.title} {...cat} />
          ))}
        </div>

        {/* Features List */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 60,
          opacity: interpolate(frame, [200, 230], [0, 1], { extrapolateLeft: 'clamp' })
        }}>
          {[
            'Thread View',
            'Escalation Alerts', 
            'Auto-categorization',
            'Priority Sorting'
          ].map((feature, i) => (
            <div
              key={i}
              style={{
                fontFamily,
                fontSize: 24,
                color: '#bfdbfe',
                fontWeight: 500,
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                padding: '12px 24px',
                borderRadius: 12
              }}
            >
              {feature}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CategoryCard: React.FC<{
  icon: string;
  title: string;
  count: number;
  color: string;
  delay: number;
}> = ({ icon, title, count, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 100 }
  });

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.7)',
      border: `2px solid ${color}40`,
      borderRadius: 24,
      padding: 40,
      textAlign: 'center',
      transform: `scale(${interpolate(entrance, [0, 1], [0.7, 1])})`,
      opacity: interpolate(entrance, [0, 1], [0, 1])
    }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>{icon}</div>
      <div style={{
        fontFamily,
        fontSize: 32,
        color: '#fff',
        fontWeight: 700,
        marginBottom: 15,
        direction: 'rtl'
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 56,
        color,
        fontWeight: 900
      }}>
        {count}
      </div>
    </div>
  );
};
