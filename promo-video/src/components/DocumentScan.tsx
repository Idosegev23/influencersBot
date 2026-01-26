import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

export const DocumentScan: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const entrance = spring({
    frame,
    fps,
    config: { damping: 200 }
  });

  const scale = interpolate(entrance, [0, 1], [0.8, 1]);
  const opacity = interpolate(entrance, [0, 1], [0, 1]);

  // קו סריקה נע
  const scanLineY = interpolate(frame, [10, 70], [0, 600], { 
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp' 
  });

  // Data points מופיעים
  const dataPoint1 = interpolate(frame, [40, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dataPoint2 = interpolate(frame, [50, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dataPoint3 = interpolate(frame, [60, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      transform: `scale(${scale})`,
      opacity,
      width: 500,
      height: 700,
      backgroundColor: 'white',
      borderRadius: 24,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
      display: 'flex',
      flexDirection: 'column',
      padding: 50,
      gap: 30
    }}>
      {/* Fake Document Content */}
      <div style={{ 
        width: '70%', 
        height: 40, 
        background: 'linear-gradient(90deg, #ddd 0%, #f0f0f0 100%)', 
        borderRadius: 8 
      }} />
      <div style={{ width: '100%', height: 200, background: '#f5f5f5', borderRadius: 12, padding: 20 }}>
        <div style={{ width: '80%', height: 20, background: '#ddd', borderRadius: 4, marginBottom: 15 }} />
        <div style={{ width: '100%', height: 20, background: '#e5e5e5', borderRadius: 4, marginBottom: 15 }} />
        <div style={{ width: '90%', height: 20, background: '#e5e5e5', borderRadius: 4 }} />
      </div>
      <div style={{ width: '100%', height: 30, background: '#f0f0f0', borderRadius: 8 }} />
      <div style={{ width: '85%', height: 30, background: '#f0f0f0', borderRadius: 8 }} />
      
      {/* AI Scan Line */}
      {frame >= 10 && frame <= 70 && (
        <div style={{
          position: 'absolute',
          top: scanLineY,
          left: 0,
          width: '100%',
          height: 3,
          background: 'linear-gradient(90deg, transparent 0%, #00ff88 50%, transparent 100%)',
          boxShadow: '0 0 30px #00ff88, 0 0 60px #00ff88'
        }} />
      )}
      
      {/* Data Extracted Tags */}
      <div style={{
        position: 'absolute',
        top: 100,
        right: 50,
        opacity: dataPoint1,
        transform: `scale(${dataPoint1})`,
      }}>
        <DataTag text="מותג: Nike" />
      </div>

      <div style={{
        position: 'absolute',
        top: 250,
        right: 50,
        opacity: dataPoint2,
        transform: `scale(${dataPoint2})`,
      }}>
        <DataTag text="סכום: ₪10,000" />
      </div>

      <div style={{
        position: 'absolute',
        bottom: 100,
        right: 50,
        opacity: dataPoint3,
        transform: `scale(${dataPoint3})`,
      }}>
        <DataTag text="משימות: 7" color="#8b5cf6" />
      </div>

      {/* Confidence Score */}
      {frame > 70 && (
        <div style={{
          position: 'absolute',
          bottom: 50,
          left: 50,
          right: 50,
          background: 'rgba(0, 0, 0, 0.9)',
          color: '#00ff88',
          padding: '20px 30px',
          borderRadius: 16,
          fontFamily,
          fontWeight: 'bold',
          fontSize: 28,
          opacity: interpolate(frame, [70, 80], [0, 1], { extrapolateLeft: 'clamp' }),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>דיוק AI</span>
          <span style={{ fontSize: 40 }}>92%</span>
        </div>
      )}
    </div>
  );
};

const DataTag: React.FC<{ text: string; color?: string }> = ({ text, color = '#00ff88' }) => (
  <div style={{
    background: 'rgba(0, 0, 0, 0.9)',
    color,
    padding: '12px 24px',
    borderRadius: 12,
    fontFamily,
    fontWeight: 'bold',
    fontSize: 20,
    boxShadow: `0 0 20px ${color}`,
    whiteSpace: 'nowrap',
    direction: 'rtl'
  }}>
    {text}
  </div>
);
