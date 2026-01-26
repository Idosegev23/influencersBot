import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * Notifications Feature
 * Duration: 12 seconds (360 frames)
 * 
 * Real Features:
 * - 3 Channels: In-App, Email, WhatsApp
 * - 8 Rule Types
 * - Cron Job: כל דקה
 * - Daily Digest: כל בוקר 6:00
 */
export const Feature_Notifications: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <NoiseBackground color="#431407" intensity={0.12} />
      
      <div style={{ padding: 100, display: 'flex', gap: 100, alignItems: 'center', height: '100%' }}>
        
        {/* Left - Phone mockup with notifications */}
        <div style={{ 
          flex: 1,
          opacity: interpolate(frame, [0, 30], [0, 1]),
          transform: `scale(${interpolate(frame, [0, 30], [0.8, 1], { extrapolateLeft: 'clamp' })})`
        }}>
          <PhoneMockup />
        </div>

        {/* Right - Text & Stats */}
        <div style={{ flex: 1, direction: 'rtl' }}>
          <div style={{
            fontFamily,
            fontSize: 70,
            fontWeight: 900,
            color: '#fff',
            marginBottom: 40,
            opacity: interpolate(frame, [20, 40], [0, 1])
          }}>
            Notification Engine
          </div>

          <div style={{
            fontFamily,
            fontSize: 34,
            color: '#fed7aa',
            fontWeight: 300,
            marginBottom: 50,
            opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: 'clamp' }),
            lineHeight: 1.5
          }}>
            אף דבר לא נופל יותר
          </div>

          {/* Notification Types */}
          {[
            { icon: '⏰', text: 'משימה מתקרבת - 3 ימים לפני', delay: 80 },
            { icon: '💰', text: 'תשלום באיחור - התראה אוטומטית', delay: 110 },
            { icon: '📄', text: 'חוזה לא נחתם - escalation', delay: 140 },
            { icon: '🎯', text: 'סיכום יומי - כל בוקר 6:00', delay: 170 }
          ].map((notif, i) => (
            <NotificationItem key={i} {...notif} />
          ))}

          {/* Channels */}
          <div style={{
            marginTop: 50,
            display: 'flex',
            gap: 30,
            opacity: interpolate(frame, [220, 250], [0, 1], { extrapolateLeft: 'clamp' })
          }}>
            <Channel icon="🔔" label="In-App" />
            <Channel icon="📧" label="Email" />
            <Channel icon="💬" label="WhatsApp" />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PhoneMockup: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <div style={{
      width: 400,
      height: 700,
      background: '#000',
      borderRadius: 50,
      border: '8px solid #1f2937',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 30px 80px rgba(0,0,0,0.8)'
    }}>
      {/* Screen */}
      <div style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        padding: 30,
        paddingTop: 60
      }}>
        {/* Notifications */}
        {[
          { title: 'משימה מתקרבת', body: 'פוסט Nike - עוד 2 ימים', delay: 50, color: '#3b82f6' },
          { title: 'תשלום באיחור', body: 'Adidas - ₪3,000 | 5 ימים', delay: 100, color: '#ef4444' },
          { title: 'חשבונית אושרה', body: 'Puma - ₪5,000', delay: 150, color: '#10b981' }
        ].map((notif, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: `2px solid ${notif.color}40`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 20,
              opacity: interpolate(frame, [notif.delay, notif.delay + 20], [0, 1], { extrapolateLeft: 'clamp' }),
              transform: `translateX(${interpolate(frame, [notif.delay, notif.delay + 20], [-50, 0], { extrapolateLeft: 'clamp' })}px)`
            }}
          >
            <div style={{
              fontFamily,
              fontSize: 20,
              color: notif.color,
              fontWeight: 700,
              marginBottom: 8,
              direction: 'rtl'
            }}>
              {notif.title}
            </div>
            <div style={{
              fontFamily,
              fontSize: 16,
              color: '#cbd5e1',
              fontWeight: 400,
              direction: 'rtl'
            }}>
              {notif.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const NotificationItem: React.FC<{ icon: string; text: string; delay: number }> = ({ icon, text, delay }) => {
  const frame = useCurrentFrame();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      marginBottom: 25,
      opacity: interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateLeft: 'clamp' }),
      transform: `translateX(${interpolate(frame, [delay, delay + 20], [50, 0], { extrapolateLeft: 'clamp' })}px)`
    }}>
      <div style={{ fontSize: 40 }}>{icon}</div>
      <div style={{
        fontFamily,
        fontSize: 26,
        color: '#fed7aa',
        fontWeight: 400
      }}>
        {text}
      </div>
    </div>
  );
};

const Channel: React.FC<{ icon: string; label: string }> = ({ icon, label }) => (
  <div style={{
    background: 'rgba(251, 146, 60, 0.1)',
    border: '2px solid rgba(251, 146, 60, 0.3)',
    borderRadius: 16,
    padding: '15px 25px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontFamily
  }}>
    <div style={{ fontSize: 32 }}>{icon}</div>
    <div style={{ fontSize: 22, color: '#fed7aa', fontWeight: 600 }}>
      {label}
    </div>
  </div>
);
