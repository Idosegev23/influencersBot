import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * Opening Scene - Logo Reveal
 * Duration: 5 seconds (150 frames)
 */
export const OpeningScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 100, stiffness: 80, mass: 1 }
  });

  const scale = interpolate(logoSpring, [0, 1], [0.3, 1]);
  const opacity = interpolate(logoSpring, [0, 1], [0, 1]);
  const blur = interpolate(logoSpring, [0, 1], [20, 0]);

  // Rotating particles
  const particleRotation = frame * 0.5;

  // Subtitle fade in
  const subtitleOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp' });

  // Tagline fade in
  const taglineOpacity = interpolate(frame, [100, 130], [0, 1], { extrapolateLeft: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <NoiseBackground color="#0f172a" intensity={0.08} speed={0.002} />
      
      {/* Animated particles background */}
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        {[...Array(30)].map((_, i) => {
          const angle = (i / 30) * 360;
          const distance = 300 + (i % 3) * 100;
          const x = Math.cos((angle + particleRotation) * Math.PI / 180) * distance;
          const y = Math.sin((angle + particleRotation) * Math.PI / 180) * distance;
          
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: `hsl(${220 + i * 5}, 70%, 60%)`,
                opacity: 0.3,
                boxShadow: `0 0 ${10 + i % 5}px hsl(${220 + i * 5}, 70%, 60%)`
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* Glow effect */}
      <div style={{
        position: 'absolute',
        width: 1200,
        height: 1200,
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
        filter: 'blur(100px)',
        opacity: interpolate(frame, [0, 60], [0, 1])
      }} />

      {/* Main Logo/Brand */}
      <div style={{
        transform: `scale(${scale})`,
        opacity,
        filter: `blur(${blur}px)`,
        textAlign: 'center',
        zIndex: 10
      }}>
        {/* Main Title */}
        <div style={{
          fontSize: 160,
          fontFamily,
          fontWeight: 900,
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: -4,
          marginBottom: 30,
          direction: 'rtl'
        }}>
          Influencer OS
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily,
          fontSize: 52,
          color: '#cbd5e1',
          fontWeight: 400,
          opacity: subtitleOpacity,
          marginBottom: 40,
          direction: 'rtl'
        }}>
          מערכת הפעלה למשפיענים
        </div>

        {/* Tagline */}
        <div style={{
          fontFamily,
          fontSize: 36,
          color: '#94a3b8',
          fontWeight: 300,
          opacity: taglineOpacity,
          direction: 'rtl',
          letterSpacing: 1
        }}>
          AI • אוטומציה • שליטה מלאה
        </div>
      </div>

      {/* Bottom Badge */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        fontFamily,
        fontSize: 24,
        color: '#64748b',
        fontWeight: 400,
        opacity: interpolate(frame, [120, 140], [0, 1], { extrapolateLeft: 'clamp' })
      }}>
        Product Demo • 2026
      </div>
    </AbsoluteFill>
  );
};
