import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Img, staticFile } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * Problem Scene - המציאות של משפיענים היום
 * Duration: 10 seconds (300 frames)
 * 
 * Data Points (אמיתי):
 * - 80% מהזמן על אדמין
 * - 45 דקות לכל מסמך
 * - ₪10-15K אובדים לחודש
 * - 15-20 מסמכים לכל שת"פ
 */
export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Glitch effect for chaos
  const glitchX = frame % 15 < 3 ? (Math.random() - 0.5) * 20 : 0;
  const glitchY = frame % 15 < 3 ? (Math.random() - 0.5) * 10 : 0;

  return (
    <AbsoluteFill>
      <NoiseBackground color="#450a0a" intensity={0.3} speed={0.015} />
      
      {/* Chaos overlay - scattered documents */}
      <AbsoluteFill style={{ opacity: 0.15, overflow: 'hidden' }}>
        {[...Array(25)].map((_, i) => {
          const rotation = (frame + i * 20) % 360;
          const x = (i * 137) % 100;
          const y = (i * 213) % 100;
          
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                fontSize: 48,
                transform: `rotate(${rotation}deg)`,
                opacity: Math.sin(frame * 0.05 + i) * 0.3 + 0.3
              }}
            >
              📄
            </div>
          );
        })}
      </AbsoluteFill>

      {/* Main Content */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        padding: 100,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: '100%',
        transform: `translate(${glitchX}px, ${glitchY}px)`
      }}>
        
        {/* Title */}
        <div style={{
          fontFamily,
          fontSize: 90,
          fontWeight: 900,
          color: '#fca5a5',
          marginBottom: 60,
          opacity: interpolate(frame, [0, 20], [0, 1]),
          transform: `translateY(${interpolate(frame, [0, 20], [50, 0])}px)`,
          direction: 'rtl'
        }}>
          המציאות של משפיענים היום
        </div>

        {/* Pain Points */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          
          {/* Pain #1 */}
          <PainPoint
            delay={30}
            icon="⏱️"
            stat="80%"
            text="מהזמן על אדמיניסטרציה"
            subtext="במקום על תוכן ויצירה"
          />

          {/* Pain #2 */}
          <PainPoint
            delay={80}
            icon="📄"
            stat="45 דקות"
            text="להעתיק מסמך אחד ידנית"
            subtext="15-20 מסמכים לכל שת״פ"
          />

          {/* Pain #3 */}
          <PainPoint
            delay={130}
            icon="💸"
            stat="₪10-15K"
            text="אובדים כל חודש"
            subtext="תשלומים באיחור, דדליינים שעברו"
          />

          {/* Pain #4 */}
          <PainPoint
            delay={180}
            icon="🔥"
            stat="0"
            text="שליטה על העסק"
            subtext="הכל מפוזר, אין דאטה, אין החלטות"
          />
        </div>

        {/* Bottom line */}
        <div style={{
          marginTop: 80,
          fontFamily,
          fontSize: 48,
          color: '#fee2e2',
          fontWeight: 700,
          opacity: interpolate(frame, [240, 270], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl',
          textAlign: 'center'
        }}>
          צריך פתרון. עכשיו.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PainPoint: React.FC<{
  delay: number;
  icon: string;
  stat: string;
  text: string;
  subtext: string;
}> = ({ delay, icon, stat, text, subtext }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 80, stiffness: 100 }
  });

  const x = interpolate(entrance, [0, 1], [-100, 0]);
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const scale = interpolate(entrance, [0, 1], [0.8, 1]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 40,
      transform: `translateX(${x}px) scale(${scale})`,
      opacity,
      background: 'rgba(0, 0, 0, 0.4)',
      padding: '30px 40px',
      borderRadius: 20,
      border: '2px solid rgba(252, 165, 165, 0.2)',
      backdropFilter: 'blur(10px)'
    }}>
      {/* Icon */}
      <div style={{ fontSize: 72, filter: 'grayscale(1)' }}>{icon}</div>

      {/* Content */}
      <div style={{ flex: 1, direction: 'rtl' }}>
        <div style={{
          fontFamily,
          fontSize: 64,
          fontWeight: 900,
          color: '#ef4444',
          marginBottom: 10
        }}>
          {stat}
        </div>
        <div style={{
          fontFamily,
          fontSize: 36,
          fontWeight: 600,
          color: '#fca5a5',
          marginBottom: 8
        }}>
          {text}
        </div>
        <div style={{
          fontFamily,
          fontSize: 24,
          fontWeight: 300,
          color: '#fecaca',
          opacity: 0.8
        }}>
          {subtext}
        </div>
      </div>
    </div>
  );
};
