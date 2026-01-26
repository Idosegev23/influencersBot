import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * CTA Scene - קריאה לפעולה
 * Duration: 12 seconds (360 frames)
 */
export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const mainSpring = spring({
    frame,
    fps,
    config: { damping: 80, stiffness: 90 }
  });

  // Pulse for CTA button
  const pulse = 1 + Math.sin((frame - 120) * 0.15) * 0.06;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <NoiseBackground color="#000" intensity={0.08} />
      
      {/* Animated gradient glow */}
      <div style={{
        position: 'absolute',
        width: 1400,
        height: 1400,
        background: `radial-gradient(circle, 
          rgba(99, 102, 241, ${0.3 + Math.sin(frame * 0.05) * 0.1}) 0%, 
          rgba(139, 92, 246, ${0.2 + Math.cos(frame * 0.07) * 0.1}) 50%,
          transparent 70%)`,
        filter: 'blur(150px)',
        transform: `scale(${pulse})`
      }} />

      <div style={{ 
        transform: `scale(${interpolate(mainSpring, [0, 1], [0.8, 1])})`, 
        opacity: interpolate(mainSpring, [0, 1], [0, 1]),
        textAlign: 'center',
        zIndex: 10,
        maxWidth: 1400
      }}>
        
        {/* Main Headline */}
        <h1 style={{ 
          fontFamily, 
          fontSize: 120, 
          color: '#fff', 
          marginBottom: 50,
          fontWeight: 900,
          lineHeight: 1.2,
          direction: 'rtl',
          textShadow: '0 20px 60px rgba(0,0,0,0.8)'
        }}>
          תתחילו לעבוד חכם.<br />
          לא קשה.
        </h1>

        {/* Value Props - Quick */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 50,
          marginBottom: 70,
          opacity: interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: 'clamp' })
        }}>
          {[
            '90% פחות אדמין',
            '₪26K חיסכון/חודש',
            'אפס דדליינים שעוברים'
          ].map((text, i) => (
            <div
              key={i}
              style={{
                fontFamily,
                fontSize: 28,
                color: '#a5b4fc',
                fontWeight: 500,
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                padding: '15px 30px',
                borderRadius: 16,
                direction: 'rtl'
              }}
            >
              {text}
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <div style={{
          opacity: interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: 'clamp' }),
          transform: `scale(${interpolate(frame, [80, 100], [0.9, 1], { extrapolateLeft: 'clamp' }) * (frame > 120 ? pulse : 1)})`
        }}>
          <div style={{ 
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)', 
            padding: '35px 90px', 
            borderRadius: 70,
            fontSize: 56,
            fontFamily,
            fontWeight: 800,
            color: 'white',
            boxShadow: `
              0 20px 80px rgba(99, 102, 241, 0.6),
              0 0 100px rgba(139, 92, 246, 0.4),
              inset 0 2px 0 rgba(255,255,255,0.3)
            `,
            display: 'inline-block',
            letterSpacing: 1
          }}>
            influencer-os.com
          </div>
        </div>

        {/* Trial Info */}
        <div style={{
          fontFamily,
          fontSize: 36,
          color: '#6b7280',
          marginTop: 50,
          fontWeight: 400,
          opacity: interpolate(frame, [140, 170], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          7 ימים ניסיון חינם • אפס התחייבות
        </div>

        {/* Bottom Features */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 40,
          marginTop: 60,
          opacity: interpolate(frame, [200, 230], [0, 1], { extrapolateLeft: 'clamp' })
        }}>
          {[
            '✓ Setup תוך 30 דקות',
            '✓ Support בעברית',
            '✓ Cancel בכל רגע'
          ].map((text, i) => (
            <div
              key={i}
              style={{
                fontFamily,
                fontSize: 24,
                color: '#94a3b8',
                fontWeight: 500
              }}
            >
              {text}
            </div>
          ))}
        </div>

        {/* Final Tagline */}
        <div style={{
          fontFamily,
          fontSize: 44,
          color: '#e0e7ff',
          fontWeight: 300,
          marginTop: 60,
          opacity: interpolate(frame, [260, 290], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          המערכת שמשפיענים מחכים לה
        </div>
      </div>
    </AbsoluteFill>
  );
};
