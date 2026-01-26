import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * Tasks Feature
 * Duration: 15 seconds (450 frames)
 * 
 * Real Features:
 * - CRUD מלא
 * - סינון: Status, Priority, Partnership, Date
 * - Quick actions: התחל, השלם, חסום
 * - Timeline view
 * - Calendar integration (partial)
 * - Auto-notifications: 3 days, 1 day, overdue
 */
export const Feature_Tasks: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <NoiseBackground color="#312e81" intensity={0.1} />
      
      <div style={{ padding: 100, display: 'flex', gap: 100, alignItems: 'center' }}>
        
        {/* Left - Text */}
        <div style={{ flex: 1, direction: 'rtl' }}>
          <div style={{
            fontFamily,
            fontSize: 70,
            fontWeight: 900,
            color: '#fff',
            marginBottom: 40,
            opacity: interpolate(frame, [0, 20], [0, 1])
          }}>
            ניהול משימות חכם
          </div>

          <div style={{
            fontFamily,
            fontSize: 34,
            color: '#c7d2fe',
            fontWeight: 300,
            marginBottom: 50,
            opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: 'clamp' }),
            lineHeight: 1.5
          }}>
            כל המשימות במקום אחד<br />
            התראות אוטומטיות<br />
            אף דבר לא נופל
          </div>

          {/* Features List */}
          {[
            { text: 'סינון מתקדם: סטטוס, עדיפות, שת״פ', delay: 60 },
            { text: 'Quick Actions: התחל/השלם/חסום', delay: 90 },
            { text: 'Timeline View - כל המשימות בציר זמן', delay: 120 },
            { text: 'התראות: 3 ימים, יום, ובאיחור', delay: 150 },
            { text: 'יצירה אוטומטית מחוזים ובריפים', delay: 180 }
          ].map((feature, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                marginBottom: 25,
                opacity: interpolate(frame, [feature.delay, feature.delay + 20], [0, 1], { extrapolateLeft: 'clamp' }),
                transform: `translateX(${interpolate(frame, [feature.delay, feature.delay + 20], [50, 0], { extrapolateLeft: 'clamp' })}px)`
              }}
            >
              <div style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#8b5cf6',
                boxShadow: '0 0 20px #8b5cf6'
              }} />
              <div style={{
                fontFamily,
                fontSize: 26,
                color: '#e0e7ff',
                fontWeight: 400
              }}>
                {feature.text}
              </div>
            </div>
          ))}
        </div>

        {/* Right - Screenshot */}
        <div style={{ 
          flex: 1,
          opacity: interpolate(frame, [220, 250], [0, 1], { extrapolateLeft: 'clamp' }),
          transform: `translateX(${interpolate(frame, [220, 250], [50, 0], { extrapolateLeft: 'clamp' })}px)`
        }}>
          {/* Placeholder for screenshot */}
          <div style={{
            width: '100%',
            height: 600,
            background: 'rgba(15, 23, 42, 0.6)',
            border: '2px solid rgba(139, 92, 246, 0.3)',
            borderRadius: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily,
            fontSize: 28,
            color: '#64748b',
            flexDirection: 'column',
            gap: 20
          }}>
            <div>[Screenshot: Tasks Dashboard]</div>
            <div style={{ fontSize: 20, color: '#475569' }}>
              tasks-dashboard.png
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Stats */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 60,
        opacity: interpolate(frame, [280, 310], [0, 1], { extrapolateLeft: 'clamp' })
      }}>
        <Stat value="CRUD" label="מלא" />
        <Stat value="4" label="Views שונים" />
        <Stat value="✓" label="Auto-create" />
        <Stat value="✓" label="Notifications" />
      </div>
    </AbsoluteFill>
  );
};

const Stat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div style={{ textAlign: 'center', fontFamily }}>
    <div style={{ fontSize: 48, color: '#8b5cf6', fontWeight: 900, marginBottom: 8 }}>
      {value}
    </div>
    <div style={{ fontSize: 22, color: '#94a3b8', direction: label.match(/[א-ת]/) ? 'rtl' : 'ltr' }}>
      {label}
    </div>
  </div>
);
