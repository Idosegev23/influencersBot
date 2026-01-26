import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * Analytics Feature - 4 Dashboards
 * Duration: 18 seconds (540 frames)
 * 
 * Real Dashboards:
 * 1. Audience - שיחות, קופונים, המרה, שביעות רצון
 * 2. Coupons - ביצועי קופונים, המרות, הכנסות
 * 3. Conversations - ניתוח שיחות
 * 4. ROI - ROI Calculator לכל שת"פ
 */
export const Feature_Analytics: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <NoiseBackground color="#0c4a6e" intensity={0.12} />
      
      <div style={{ padding: 100, height: '100%', display: 'flex', flexDirection: 'column' }}>
        
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
          Analytics - ראות מלאה על העסק
        </div>

        {/* 4 Dashboard Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 40,
          flex: 1,
          marginTop: 40
        }}>
          
          {/* Dashboard 1: Audience */}
          <DashboardCard
            delay={40}
            title="דשבורד קהל"
            color="#3b82f6"
            metrics={[
              'סה״כ שיחות: 245',
              'קופונים הועתקו: 156',
              'שומשו: 78 (50% המרה)',
              'שביעות רצון: 8.4/10'
            ]}
          />

          {/* Dashboard 2: Coupons */}
          <DashboardCard
            delay={100}
            title="אנליטיקס קופונים"
            color="#10b981"
            metrics={[
              'סה״כ קופונים: 12',
              'הועתקו: 156 פעמים',
              'נוצלו: 78 (50%)',
              'הכנסות: ₪32,500'
            ]}
          />

          {/* Dashboard 3: Communications */}
          <DashboardCard
            delay={160}
            title="תקשורת מותגים"
            color="#f59e0b"
            metrics={[
              'פיננסי: 5 שיחות',
              'משפטי: 2 שיחות',
              'בעיות: 1 פתוח',
              'כללי: 8 שיחות'
            ]}
          />

          {/* Dashboard 4: ROI */}
          <DashboardCard
            delay={220}
            title="ROI Calculator"
            color="#8b5cf6"
            metrics={[
              'השקעה: ₪10,000',
              'הכנסות: ₪38,500',
              'רווח: ₪28,500',
              'ROI: 285%'
            ]}
          />
        </div>

        {/* Bottom Line */}
        <div style={{
          textAlign: 'center',
          fontFamily,
          fontSize: 36,
          color: '#94a3b8',
          fontWeight: 400,
          marginTop: 40,
          opacity: interpolate(frame, [300, 330], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          כל הדאטה שצריך כדי להצליח
        </div>
      </div>
    </AbsoluteFill>
  );
};

const DashboardCard: React.FC<{
  delay: number;
  title: string;
  color: string;
  metrics: string[];
}> = ({ delay, title, color, metrics }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 100, stiffness: 150 }
  });

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.7)',
      border: `2px solid ${color}40`,
      borderRadius: 24,
      padding: 40,
      transform: `scale(${interpolate(entrance, [0, 1], [0.8, 1])}) translateY(${interpolate(entrance, [0, 1], [30, 0])}px)`,
      opacity: interpolate(entrance, [0, 1], [0, 1]),
      display: 'flex',
      flexDirection: 'column',
      gap: 25
    }}>
      {/* Title */}
      <div style={{
        fontFamily,
        fontSize: 36,
        fontWeight: 700,
        color,
        marginBottom: 15,
        direction: 'rtl'
      }}>
        {title}
      </div>

      {/* Metrics */}
      {metrics.map((metric, i) => (
        <div
          key={i}
          style={{
            fontFamily,
            fontSize: 24,
            color: '#cbd5e1',
            fontWeight: 400,
            display: 'flex',
            alignItems: 'center',
            gap: 15,
            opacity: interpolate(frame, [delay + 20 + i * 10, delay + 30 + i * 10], [0, 1], { extrapolateLeft: 'clamp' }),
            direction: 'rtl'
          }}
        >
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 10px ${color}`
          }} />
          {metric}
        </div>
      ))}
    </div>
  );
};
