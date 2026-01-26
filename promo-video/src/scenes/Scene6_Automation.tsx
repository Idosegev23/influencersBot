import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

export const Scene6_Automation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mainSpring = spring({
    frame,
    fps,
    config: { damping: 100 }
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <NoiseBackground color="#1e1b4b" intensity={0.12} />
      
      <div style={{ textAlign: 'center', maxWidth: 1400 }}>
        
        {/* Main Stat */}
        <div style={{
          fontSize: 200,
          fontFamily,
          fontWeight: 900,
          background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          opacity: interpolate(mainSpring, [0, 1], [0, 1]),
          transform: `scale(${interpolate(mainSpring, [0, 1], [0.5, 1])})`,
          marginBottom: 40
        }}>
          90%
        </div>

        {/* Text */}
        <div style={{
          fontFamily,
          fontSize: 60,
          color: '#fff',
          fontWeight: 700,
          marginBottom: 30,
          opacity: interpolate(frame, [20, 35], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          פחות עבודה ידנית
        </div>

        {/* Sub-stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 80,
          marginTop: 50,
          opacity: interpolate(frame, [40, 55], [0, 1], { extrapolateLeft: 'clamp' })
        }}>
          {[
            { label: 'חיסכון בזמן', value: '13 שעות/שבוע' },
            { label: 'הגנת הכנסות', value: '₪10K+/חודש' },
            { label: 'ROI', value: '3,800%' }
          ].map((item, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily,
                fontSize: 44,
                color: '#34d399',
                fontWeight: 800,
                marginBottom: 10
              }}>
                {item.value}
              </div>
              <div style={{
                fontFamily,
                fontSize: 24,
                color: '#94a3b8',
                fontWeight: 400,
                direction: 'rtl'
              }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
