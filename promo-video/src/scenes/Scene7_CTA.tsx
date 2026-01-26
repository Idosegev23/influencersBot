import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

export const Scene7_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const mainSpring = spring({
    frame,
    fps,
    config: { damping: 80, stiffness: 100 }
  });

  const scale = interpolate(mainSpring, [0, 1], [0.8, 1]);
  const opacity = interpolate(mainSpring, [0, 1], [0, 1]);

  // Pulse for CTA button
  const pulse = 1 + Math.sin(frame * 0.15) * 0.08;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <NoiseBackground color="#000" intensity={0.08} />
      
      {/* Glow Effect */}
      <div style={{
        position: 'absolute',
        width: 1200,
        height: 1200,
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%)',
        filter: 'blur(150px)',
        transform: `scale(${pulse})`
      }} />

      <div style={{ 
        transform: `scale(${scale})`, 
        opacity,
        textAlign: 'center',
        zIndex: 10
      }}>
        
        {/* Main Headline */}
        <h1 style={{ 
          fontFamily, 
          fontSize: 110, 
          color: '#fff', 
          marginBottom: 40,
          fontWeight: 900,
          lineHeight: 1.2,
          direction: 'rtl'
        }}>
          תתחילו לעבוד חכם.
        </h1>

        {/* Subheadline */}
        <div style={{
          fontFamily,
          fontSize: 44,
          color: '#9ca3af',
          marginBottom: 60,
          fontWeight: 400,
          opacity: interpolate(frame, [15, 30], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          לא קשה. רק חכם יותר.
        </div>

        {/* CTA Button */}
        <div style={{
          opacity: interpolate(frame, [30, 45], [0, 1], { extrapolateLeft: 'clamp' }),
          transform: `scale(${interpolate(frame, [30, 45], [0.9, 1], { extrapolateLeft: 'clamp' }) * pulse})`
        }}>
          <div style={{ 
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)', 
            padding: '30px 80px', 
            borderRadius: 60,
            fontSize: 48,
            fontFamily,
            fontWeight: 800,
            color: 'white',
            boxShadow: '0 20px 80px rgba(99, 102, 241, 0.6), 0 0 100px rgba(139, 92, 246, 0.4)',
            cursor: 'pointer',
            display: 'inline-block'
          }}>
            influencer-os.com
          </div>
        </div>

        {/* Bottom Tagline */}
        <div style={{
          fontFamily,
          fontSize: 32,
          color: '#6b7280',
          marginTop: 50,
          fontWeight: 300,
          opacity: interpolate(frame, [50, 65], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          7 ימים ניסיון חינם
        </div>
      </div>
    </AbsoluteFill>
  );
};
