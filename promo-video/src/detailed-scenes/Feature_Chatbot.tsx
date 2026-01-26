import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * Chatbot Feature - חוויית עוקב
 * Duration: 15 seconds (450 frames)
 * 
 * Real Features:
 * - Chat UI מלא
 * - Basic Q&A
 * - Coupon delivery
 * - Satisfaction surveys
 * - Analytics tracking
 * - Session management
 */
export const Feature_Chatbot: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <NoiseBackground color="#701a75" intensity={0.12} />
      
      <div style={{ padding: 100, display: 'flex', gap: 100, alignItems: 'center', height: '100%' }}>
        
        {/* Left - Chat Interface Mockup */}
        <div style={{ 
          flex: 1,
          opacity: interpolate(frame, [0, 30], [0, 1]),
          transform: `scale(${interpolate(frame, [0, 30], [0.9, 1], { extrapolateLeft: 'clamp' })})`
        }}>
          <ChatMockup />
        </div>

        {/* Right - Text */}
        <div style={{ flex: 1, direction: 'rtl' }}>
          <div style={{
            fontFamily,
            fontSize: 70,
            fontWeight: 900,
            color: '#fff',
            marginBottom: 40,
            opacity: interpolate(frame, [20, 40], [0, 1])
          }}>
            Chatbot לעוקבים
          </div>

          <div style={{
            fontFamily,
            fontSize: 34,
            color: '#f5d0fe',
            fontWeight: 300,
            marginBottom: 50,
            opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: 'clamp' }),
            lineHeight: 1.5
          }}>
            חוויה חכמה ואוטומטית<br />
            לכל עוקב
          </div>

          {/* Features */}
          {[
            { text: 'תשובות מיידיות - פחות משניה', delay: 80 },
            { text: 'קופונים אוטומטיים - לחיצה אחת', delay: 110 },
            { text: 'מעקב שביעות רצון - feedback loop', delay: 140 },
            { text: 'Analytics מלא - כל השיחות tracked', delay: 170 }
          ].map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                marginBottom: 25,
                opacity: interpolate(frame, [item.delay, item.delay + 20], [0, 1], { extrapolateLeft: 'clamp' }),
                transform: `translateX(${interpolate(frame, [item.delay, item.delay + 20], [50, 0], { extrapolateLeft: 'clamp' })}px)`
              }}
            >
              <div style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#ec4899',
                boxShadow: '0 0 20px #ec4899'
              }} />
              <div style={{
                fontFamily,
                fontSize: 26,
                color: '#fae8ff',
                fontWeight: 400
              }}>
                {item.text}
              </div>
            </div>
          ))}

          {/* Stats */}
          <div style={{
            marginTop: 60,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 30,
            opacity: interpolate(frame, [240, 270], [0, 1], { extrapolateLeft: 'clamp' })
          }}>
            <StatBox value="245" label="שיחות סה״כ" />
            <StatBox value="8.4/10" label="שביעות רצון" />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ChatMockup: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <div style={{
      width: 500,
      height: 700,
      background: '#f3f4f6',
      borderRadius: 32,
      overflow: 'hidden',
      boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
        padding: 30,
        color: '#fff',
        fontFamily,
        fontSize: 28,
        fontWeight: 700,
        direction: 'rtl'
      }}>
        צ׳אט עם @username
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        padding: 30,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        justifyContent: 'flex-end'
      }}>
        {/* User message */}
        <ChatBubble 
          text="יש קופון?" 
          isBot={false} 
          delay={50}
        />

        {/* Bot response */}
        <ChatBubble 
          text="בטח! קוד NIKE20 - 20% הנחה 🎉" 
          isBot={true} 
          delay={100}
        />

        {/* Copy button */}
        <div style={{
          opacity: interpolate(frame, [150, 170], [0, 1], { extrapolateLeft: 'clamp' }),
          transform: `scale(${interpolate(frame, [150, 170], [0.8, 1], { extrapolateLeft: 'clamp' })})`
        }}>
          <div style={{
            background: '#8b5cf6',
            color: '#fff',
            padding: '15px 30px',
            borderRadius: 16,
            fontFamily,
            fontSize: 22,
            fontWeight: 700,
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(139, 92, 246, 0.4)'
          }}>
            📋 העתק קוד
          </div>
        </div>
      </div>
    </div>
  );
};

const ChatBubble: React.FC<{ text: string; isBot: boolean; delay: number }> = ({ text, isBot, delay }) => {
  const frame = useCurrentFrame();

  return (
    <div style={{
      alignSelf: isBot ? 'flex-start' : 'flex-end',
      maxWidth: '70%',
      opacity: interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateLeft: 'clamp' }),
      transform: `translateY(${interpolate(frame, [delay, delay + 15], [20, 0], { extrapolateLeft: 'clamp' })}px)`
    }}>
      <div style={{
        background: isBot ? '#e0e7ff' : '#8b5cf6',
        color: isBot ? '#312e81' : '#fff',
        padding: '15px 25px',
        borderRadius: 20,
        fontFamily,
        fontSize: 20,
        fontWeight: 500,
        direction: 'rtl'
      }}>
        {text}
      </div>
    </div>
  );
};

const StatBox: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div style={{
    background: 'rgba(236, 72, 153, 0.1)',
    border: '2px solid rgba(236, 72, 153, 0.3)',
    borderRadius: 16,
    padding: '20px 25px',
    textAlign: 'center'
  }}>
    <div style={{
      fontFamily,
      fontSize: 44,
      color: '#ec4899',
      fontWeight: 900,
      marginBottom: 8
    }}>
      {value}
    </div>
    <div style={{
      fontFamily,
      fontSize: 20,
      color: '#f5d0fe',
      fontWeight: 400
    }}>
      {label}
    </div>
  </div>
);
