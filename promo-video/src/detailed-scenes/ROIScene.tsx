import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * ROI Scene - התוצאות
 * Duration: 15 seconds (450 frames)
 * 
 * Real Data from Sales Playbook:
 * - Time saved: 13 שעות/שבוע = ₪26,000/חודש
 * - Revenue protected: ₪10-15K/חודש
 * - Total value: ₪58,400/חודש
 * - ROI: 3,893%
 */
export const ROIScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mainSpring = spring({
    frame,
    fps,
    config: { damping: 90 }
  });

  return (
    <AbsoluteFill>
      <NoiseBackground color="#064e3b" intensity={0.15} />
      
      {/* Glow */}
      <div style={{
        position: 'absolute',
        width: 1200,
        height: 1200,
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, transparent 70%)',
        filter: 'blur(150px)',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)'
      }} />

      <div style={{ padding: 100, textAlign: 'center', position: 'relative', zIndex: 10 }}>
        
        {/* Title */}
        <div style={{
          fontFamily,
          fontSize: 70,
          fontWeight: 900,
          color: '#fff',
          marginBottom: 80,
          opacity: interpolate(frame, [0, 20], [0, 1]),
          direction: 'rtl'
        }}>
          התוצאות מדברות בעד עצמן
        </div>

        {/* Big ROI Number */}
        <div style={{
          fontSize: 240,
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
          3,893%
        </div>

        <div style={{
          fontFamily,
          fontSize: 48,
          color: '#6ee7b7',
          fontWeight: 600,
          marginBottom: 80,
          opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          החזר השקעה
        </div>

        {/* Breakdown */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 50,
          maxWidth: 1400,
          margin: '0 auto',
          opacity: interpolate(frame, [80, 110], [0, 1], { extrapolateLeft: 'clamp' })
        }}>
          <ROICard
            icon="⏱️"
            value="13 שעות"
            label="נחסכות בשבוע"
            subvalue="₪26K/חודש"
            delay={80}
          />
          <ROICard
            icon="🛡️"
            value="₪10-15K"
            label="הגנת הכנסות"
            subvalue="אפס איבודים"
            delay={110}
          />
          <ROICard
            icon="📈"
            value="+285%"
            label="ROI ממוצע"
            subvalue="לכל שת״פ"
            delay={140}
          />
        </div>

        {/* Case Study Quote */}
        <div style={{
          marginTop: 80,
          maxWidth: 1000,
          margin: '80px auto 0',
          opacity: interpolate(frame, [200, 230], [0, 1], { extrapolateLeft: 'clamp' })
        }}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 24,
            padding: '40px 50px'
          }}>
            <div style={{
              fontFamily,
              fontSize: 32,
              color: '#d1fae5',
              fontWeight: 400,
              fontStyle: 'italic',
              marginBottom: 25,
              direction: 'rtl',
              lineHeight: 1.5
            }}>
              "המערכת החזירה לי את החיים. פתאום יש לי זמן לתוכן ולא רק אקסלים!"
            </div>
            <div style={{
              fontFamily,
              fontSize: 24,
              color: '#6ee7b7',
              fontWeight: 600,
              direction: 'rtl'
            }}>
              - @liranko, 100K עוקבים
            </div>
          </div>
        </div>

        {/* Payback */}
        <div style={{
          fontFamily,
          fontSize: 40,
          color: '#a7f3d0',
          fontWeight: 700,
          marginTop: 60,
          opacity: interpolate(frame, [280, 310], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          Payback: 0.5 ימים בלבד
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ROICard: React.FC<{
  icon: string;
  value: string;
  label: string;
  subvalue: string;
  delay: number;
}> = ({ icon, value, label, subvalue, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 100 }
  });

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.5)',
      border: '2px solid rgba(16, 185, 129, 0.3)',
      borderRadius: 20,
      padding: 40,
      transform: `scale(${interpolate(entrance, [0, 1], [0.8, 1])}) translateY(${interpolate(entrance, [0, 1], [30, 0])}px)`,
      opacity: interpolate(entrance, [0, 1], [0, 1])
    }}>
      <div style={{ fontSize: 56, marginBottom: 20, textAlign: 'center' }}>{icon}</div>
      <div style={{
        fontFamily,
        fontSize: 48,
        color: '#10b981',
        fontWeight: 900,
        marginBottom: 15,
        textAlign: 'center',
        direction: value.includes('שעות') ? 'rtl' : 'ltr'
      }}>
        {value}
      </div>
      <div style={{
        fontFamily,
        fontSize: 24,
        color: '#d1fae5',
        fontWeight: 600,
        marginBottom: 12,
        textAlign: 'center',
        direction: 'rtl'
      }}>
        {label}
      </div>
      <div style={{
        fontFamily,
        fontSize: 20,
        color: '#6ee7b7',
        fontWeight: 400,
        textAlign: 'center',
        direction: 'rtl'
      }}>
        {subvalue}
      </div>
    </div>
  );
};
