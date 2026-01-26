import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

const Feature: React.FC<{ 
  icon: string; 
  title: string; 
  desc: string; 
  delay: number;
  color: string;
}> = ({ icon, title, desc, delay, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 100, stiffness: 200 }
  });

  const scale = interpolate(entrance, [0, 1], [0.5, 1]);
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const y = interpolate(entrance, [0, 1], [50, 0]);

  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}15, ${color}05)`,
      border: `2px solid ${color}40`,
      borderRadius: 24,
      padding: 40,
      transform: `scale(${scale}) translateY(${y}px)`,
      opacity,
      backdropFilter: 'blur(20px)',
      boxShadow: `0 20px 60px ${color}20`,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }}>
      <div style={{ fontSize: 80 }}>{icon}</div>
      <div style={{
        fontFamily,
        fontSize: 38,
        color: '#fff',
        fontWeight: 700,
        direction: 'rtl'
      }}>
        {title}
      </div>
      <div style={{
        fontFamily,
        fontSize: 24,
        color: '#d1d5db',
        fontWeight: 300,
        direction: 'rtl',
        lineHeight: 1.4
      }}>
        {desc}
      </div>
    </div>
  );
};

export const Scene4_Features: React.FC = () => {
  return (
    <AbsoluteFill>
      <NoiseBackground color="#0f172a" intensity={0.1} />
      
      <div style={{
        padding: 80,
        maxWidth: 1760,
        margin: '0 auto',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        
        {/* Title */}
        <div style={{ marginBottom: 60, textAlign: 'center' }}>
          <div style={{
            fontFamily,
            fontSize: 70,
            color: '#fff',
            fontWeight: 800,
            direction: 'rtl'
          }}>
            כל מה שצריך במקום אחד
          </div>
        </div>

        {/* Features Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 40,
          height: 500
        }}>
          <Feature
            icon="🤖"
            title="AI Parser"
            desc="קורא מסמכים ומחלץ נתונים אוטומטית"
            delay={0}
            color="#10b981"
          />
          <Feature
            icon="📊"
            title="Analytics"
            desc="דשבורדים מלאים על קהל, קופונים, ROI"
            delay={10}
            color="#3b82f6"
          />
          <Feature
            icon="🔔"
            title="Notifications"
            desc="התראות חכמות - אף דבר לא נופל"
            delay={20}
            color="#f59e0b"
          />
          <Feature
            icon="🤝"
            title="Partnerships"
            desc="ניהול מלא של שתפים וקמפיינים"
            delay={30}
            color="#8b5cf6"
          />
          <Feature
            icon="💬"
            title="Chatbot"
            desc="חוויית עוקב חכמה ואוטומטית"
            delay={40}
            color="#ec4899"
          />
          <Feature
            icon="📅"
            title="Calendar"
            desc="לוח זמנים מסונכרן עם Google"
            delay={50}
            color="#06b6d4"
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
