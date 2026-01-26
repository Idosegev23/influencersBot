import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { DashboardMockup } from '../components/DashboardMockup';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

export const Scene5_Dashboard: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <NoiseBackground color="#1e293b" intensity={0.1} />
      
      {/* Title */}
      <div style={{
        position: 'absolute',
        top: 100,
        zIndex: 10,
        textAlign: 'center',
        width: '100%'
      }}>
        <div style={{
          fontFamily,
          fontSize: 70,
          color: '#fff',
          fontWeight: 800,
          opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          שליטה מלאה בעסק
        </div>
      </div>

      {/* Dashboard */}
      <DashboardMockup />

      {/* Bottom Stats */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        display: 'flex',
        gap: 60,
        opacity: interpolate(frame, [50, 65], [0, 1], { extrapolateLeft: 'clamp' })
      }}>
        {[
          { label: 'שת"פים', value: '12', color: '#6366f1' },
          { label: 'משימות', value: '47', color: '#10b981' },
          { label: 'קופונים', value: '156', color: '#f59e0b' }
        ].map((stat, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily,
              fontSize: 48,
              color: stat.color,
              fontWeight: 900
            }}>
              {stat.value}
            </div>
            <div style={{
              fontFamily,
              fontSize: 24,
              color: '#94a3b8',
              fontWeight: 400,
              marginTop: 5,
              direction: 'rtl'
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
