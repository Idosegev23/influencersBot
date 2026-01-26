import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Img, staticFile, Sequence } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * Partnerships Feature - ניהול שת"פים
 * Duration: 18 seconds (540 frames)
 * 
 * Real Features:
 * - CRUD מלא (Create, Read, Update, Delete)
 * - 3 Views: Overview, Library, Calendar
 * - סינון: Status, Date, Brand, Search
 * - Pipeline chart
 * - Revenue tracking
 */
export const Feature_Partnerships: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <NoiseBackground color="#1e293b" intensity={0.1} />
      
      <div style={{ padding: 100, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        
        {/* Title */}
        <div style={{
          fontFamily,
          fontSize: 70,
          fontWeight: 900,
          color: '#fff',
          marginBottom: 30,
          opacity: interpolate(frame, [0, 20], [0, 1]),
          direction: 'rtl'
        }}>
          ניהול שת״פים מקצועי
        </div>

        {/* Description */}
        <div style={{
          fontFamily,
          fontSize: 36,
          color: '#cbd5e1',
          fontWeight: 300,
          marginBottom: 60,
          opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: 'clamp' }),
          direction: 'rtl'
        }}>
          כל השת״פים במקום אחד • מעקב מלא • ראות על הכל
        </div>

        {/* Features Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 40,
          marginBottom: 60
        }}>
          {[
            { title: 'Pipeline View', desc: 'מLead ועד Completed', icon: '📊', delay: 60 },
            { title: 'ספרייה מלאה', desc: 'כל המסמכים והחוזים', icon: '📚', delay: 80 },
            { title: 'לוח שנה', desc: 'deadlines ואירועים', icon: '📅', delay: 100 },
            { title: 'Revenue Tracking', desc: 'מעקב הכנסות בזמן אמת', icon: '💰', delay: 120 },
            { title: 'סינון מתקדם', desc: 'לפי סטטוס, תאריך, מותג', icon: '🔍', delay: 140 },
            { title: 'עריכה מהירה', desc: 'Inline editing', icon: '✏️', delay: 160 }
          ].map((feature, i) => (
            <FeatureCard key={i} {...feature} />
          ))}
        </div>

        {/* Screenshot Placeholder */}
        <div style={{
          opacity: interpolate(frame, [200, 230], [0, 1], { extrapolateLeft: 'clamp' }),
          transform: `translateY(${interpolate(frame, [200, 230], [30, 0], { extrapolateLeft: 'clamp' })}px)`
        }}>
          {/* כאן תכנס תמונה אמיתית */}
          {/* <Img 
            src={staticFile('screens/partnerships-overview.png')} 
            style={{
              width: '100%',
              borderRadius: 24,
              boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
              border: '2px solid rgba(99, 102, 241, 0.3)'
            }}
          /> */}
          
          {/* Temporary Placeholder */}
          <div style={{
            width: '100%',
            height: 400,
            background: 'rgba(15, 23, 42, 0.6)',
            border: '2px solid rgba(99, 102, 241, 0.3)',
            borderRadius: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily,
            fontSize: 32,
            color: '#64748b'
          }}>
            [Screenshot: Partnerships Dashboard]
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 80,
          marginTop: 50,
          opacity: interpolate(frame, [260, 290], [0, 1], { extrapolateLeft: 'clamp' })
        }}>
          <StatBadge label="CRUD מלא" value="✓" />
          <StatBadge label="3 Views" value="✓" />
          <StatBadge label="Pipeline Chart" value="✓" />
          <StatBadge label="Revenue Tracking" value="✓" />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const FeatureCard: React.FC<{
  title: string;
  desc: string;
  icon: string;
  delay: number;
}> = ({ title, desc, icon, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 100 }
  });

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.6)',
      border: '2px solid rgba(148, 163, 184, 0.2)',
      borderRadius: 20,
      padding: 30,
      transform: `scale(${interpolate(entrance, [0, 1], [0.8, 1])})`,
      opacity: interpolate(entrance, [0, 1], [0, 1])
    }}>
      <div style={{ fontSize: 48, marginBottom: 15 }}>{icon}</div>
      <div style={{
        fontFamily,
        fontSize: 28,
        color: '#fff',
        fontWeight: 700,
        marginBottom: 12,
        direction: title.match(/[א-ת]/) ? 'rtl' : 'ltr'
      }}>
        {title}
      </div>
      <div style={{
        fontFamily,
        fontSize: 20,
        color: '#cbd5e1',
        fontWeight: 300,
        lineHeight: 1.4,
        direction: 'rtl'
      }}>
        {desc}
      </div>
    </div>
  );
};

const StatBadge: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{
    fontFamily,
    textAlign: 'center'
  }}>
    <div style={{
      fontSize: 48,
      color: '#10b981',
      fontWeight: 900,
      marginBottom: 8
    }}>
      {value}
    </div>
    <div style={{
      fontSize: 20,
      color: '#94a3b8',
      fontWeight: 400,
      direction: label.match(/[א-ת]/) ? 'rtl' : 'ltr'
    }}>
      {label}
    </div>
  </div>
);
