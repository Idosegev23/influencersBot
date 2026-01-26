import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * Solution Intro - הכרת המוצר
 * Duration: 8 seconds (240 frames)
 */
export const SolutionIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mainSpring = spring({
    frame,
    fps,
    config: { damping: 90, stiffness: 90 }
  });

  const pulse = 1 + Math.sin(frame * 0.08) * 0.03;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <NoiseBackground color="#1e1b4b" intensity={0.1} speed={0.003} />
      
      {/* Glow */}
      <div style={{
        position: 'absolute',
        width: 1000,
        height: 1000,
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%)',
        filter: 'blur(120px)',
        transform: `scale(${pulse})`
      }} />

      <div style={{
        transform: `scale(${interpolate(mainSpring, [0, 1], [0.7, 1])})`,
        opacity: interpolate(mainSpring, [0, 1], [0, 1]),
        textAlign: 'center',
        maxWidth: 1400
      }}>
        
        {/* Logo */}
        <div style={{
          fontSize: 140,
          fontFamily,
          fontWeight: 900,
          background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 50,
          letterSpacing: -3
        }}>
          Influencer OS
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily,
          fontSize: 48,
          color: '#e0e7ff',
          fontWeight: 300,
          marginBottom: 70,
          opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          פלטפורמה אחת שמנהלת את כל העסק
        </div>

        {/* 3 Core Values */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 60,
          opacity: interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp' })
        }}>
          {[
            { icon: '🤖', label: 'AI Intelligence' },
            { icon: '📊', label: 'Analytics מלא' },
            { icon: '⚡', label: 'אוטומציה מלאה' }
          ].map((item, i) => (
            <div 
              key={i}
              style={{
                transform: `translateY(${interpolate(frame, [60 + i * 15, 90 + i * 15], [30, 0], { extrapolateLeft: 'clamp' })}px)`,
                opacity: interpolate(frame, [60 + i * 15, 90 + i * 15], [0, 1], { extrapolateLeft: 'clamp' })
              }}
            >
              <div style={{ fontSize: 64, marginBottom: 15 }}>{item.icon}</div>
              <div style={{
                fontFamily,
                fontSize: 28,
                color: '#c7d2fe',
                fontWeight: 500,
                direction: item.label === 'AI Intelligence' ? 'ltr' : 'rtl'
              }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {/* Status Line */}
        <div style={{
          marginTop: 80,
          fontFamily,
          fontSize: 32,
          color: '#818cf8',
          fontWeight: 400,
          opacity: interpolate(frame, [150, 180], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          15+ דשבורדים • 40+ API Endpoints • AI Parser פעיל
        </div>
      </div>
    </AbsoluteFill>
  );
};
