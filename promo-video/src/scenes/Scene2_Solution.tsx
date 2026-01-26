import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { KineticText } from '../components/KineticText';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

export const Scene2_Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 80, stiffness: 100 }
  });

  const logoScale = interpolate(logoSpring, [0, 1], [0.5, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);

  // Pulse effect
  const pulse = 1 + Math.sin(frame * 0.1) * 0.05;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <NoiseBackground color="#1e1b4b" intensity={0.12} speed={0.003} />
      
      {/* Glow Effect */}
      <div style={{
        position: 'absolute',
        width: 800,
        height: 800,
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
        filter: 'blur(100px)',
        transform: `scale(${pulse})`
      }} />

      {/* Logo/Brand */}
      <div style={{
        transform: `scale(${logoScale})`,
        opacity: logoOpacity,
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: 140,
          fontFamily,
          fontWeight: 900,
          background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 30,
          direction: 'rtl',
          letterSpacing: -2
        }}>
          Influencer OS
        </div>

        <div style={{
          fontFamily,
          fontSize: 48,
          color: '#a5b4fc',
          fontWeight: 400,
          opacity: interpolate(frame, [20, 35], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          מערכת הפעלה למשפיענים
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily,
          fontSize: 32,
          color: '#e0e7ff',
          fontWeight: 300,
          marginTop: 40,
          opacity: interpolate(frame, [35, 50], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          AI • אוטומציה • שליטה מלאה
        </div>
      </div>
    </AbsoluteFill>
  );
};
