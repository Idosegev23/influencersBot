import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Img, staticFile, Sequence } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { DocumentScan } from '../components/DocumentScan';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

/**
 * AI Parser Feature - הכוכב של המערכת
 * Duration: 20 seconds (600 frames)
 * 
 * Real Data:
 * - Gemini Vision 1.5 Pro
 * - 92% דיוק ממוצע
 * - 10-30 שניות לפרסור
 * - 85-95% confidence בQuotes
 * - 80-90% confidence בContracts
 */
export const Feature_AIParser: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <NoiseBackground color="#064e3b" intensity={0.12} speed={0.004} />
      
      <div style={{
        padding: 100,
        display: 'flex',
        height: '100%',
        alignItems: 'center',
        gap: 100
      }}>
        
        {/* Left Side - Text & Data */}
        <div style={{ flex: 1, direction: 'rtl' }}>
          
          {/* Title */}
          <div style={{
            fontFamily,
            fontSize: 80,
            fontWeight: 900,
            color: '#10b981',
            marginBottom: 40,
            opacity: interpolate(frame, [0, 20], [0, 1]),
            transform: `translateY(${interpolate(frame, [0, 20], [50, 0])}px)`
          }}>
            AI Document Parser
          </div>

          {/* Description */}
          <div style={{
            fontFamily,
            fontSize: 38,
            color: '#d1fae5',
            fontWeight: 300,
            marginBottom: 60,
            opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: 'clamp' }),
            lineHeight: 1.5
          }}>
            מעלים PDF או Word
            <br />
            ה-AI קורא, מבין, ומחלץ הכל
            <br />
            מסמך → נתונים מובנים
          </div>

          {/* Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 30,
            marginBottom: 50,
            opacity: interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp' })
          }}>
            <StatCard value="92%" label="דיוק ממוצע" color="#10b981" delay={60} />
            <StatCard value="30 שניות" label="זמן פרסור" color="#34d399" delay={70} />
            <StatCard value="7 סוגים" label="מסמכים נתמכים" color="#6ee7b7" delay={80} />
            <StatCard value="50MB" label="גודל מקסימלי" color="#a7f3d0" delay={90} />
          </div>

          {/* Supported Types */}
          <div style={{
            opacity: interpolate(frame, [120, 150], [0, 1], { extrapolateLeft: 'clamp' })
          }}>
            <div style={{
              fontFamily,
              fontSize: 28,
              color: '#6ee7b7',
              fontWeight: 600,
              marginBottom: 20
            }}>
              מה ה-AI יכול לקרוא:
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 15
            }}>
              {['הצעות מחיר', 'חוזים', 'בריפים', 'חשבוניות', 'קבלות', 'תמונות', 'מסמכים כלליים'].map((type, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily,
                    fontSize: 20,
                    color: '#d1fae5',
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    padding: '10px 20px',
                    borderRadius: 12,
                    opacity: interpolate(frame, [150 + i * 5, 160 + i * 5], [0, 1], { extrapolateLeft: 'clamp' })
                  }}
                >
                  {type}
                </div>
              ))}
            </div>
          </div>

          {/* Time Comparison */}
          <div style={{
            marginTop: 50,
            opacity: interpolate(frame, [200, 230], [0, 1], { extrapolateLeft: 'clamp' })
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 30,
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '25px 35px',
              borderRadius: 16,
              border: '2px solid rgba(16, 185, 129, 0.3)'
            }}>
              <div style={{ fontFamily, fontSize: 40, color: '#fca5a5', textDecoration: 'line-through' }}>
                45 דקות
              </div>
              <div style={{ fontSize: 48, color: '#10b981' }}>→</div>
              <div style={{ fontFamily, fontSize: 56, color: '#10b981', fontWeight: 900 }}>
                30 שניות
              </div>
              <div style={{ fontFamily, fontSize: 32, color: '#6ee7b7', fontWeight: 600, marginRight: 'auto' }}>
                90x מהיר יותר!
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Visual Demo */}
        <div style={{ flex: 1 }}>
          {/* Document Scan Animation */}
          <Sequence from={30}>
            <DocumentScan />
          </Sequence>

          {/* או תמונה אמיתית */}
          {/* <Img 
            src={staticFile('screens/document-review.png')} 
            style={{
              width: '100%',
              borderRadius: 24,
              boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
              opacity: interpolate(frame, [30, 50], [0, 1])
            }}
          /> */}
        </div>
      </div>

      {/* Bottom Tech Badge */}
      <div style={{
        position: 'absolute',
        bottom: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily,
        fontSize: 24,
        color: '#6ee7b7',
        fontWeight: 500,
        opacity: interpolate(frame, [250, 280], [0, 1], { extrapolateLeft: 'clamp' }),
        background: 'rgba(0, 0, 0, 0.6)',
        padding: '15px 35px',
        borderRadius: 50,
        border: '1px solid rgba(110, 231, 183, 0.3)'
      }}>
        Powered by Google Gemini Vision 1.5 Pro
      </div>
    </AbsoluteFill>
  );
};

const StatCard: React.FC<{
  value: string;
  label: string;
  color: string;
  delay: number;
}> = ({ value, label, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 100 }
  });

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.4)',
      border: `2px solid ${color}40`,
      borderRadius: 16,
      padding: '25px 30px',
      transform: `scale(${interpolate(entrance, [0, 1], [0.8, 1])})`,
      opacity: interpolate(entrance, [0, 1], [0, 1])
    }}>
      <div style={{
        fontFamily,
        fontSize: 52,
        fontWeight: 900,
        color,
        marginBottom: 10,
        direction: label.includes('שניות') || label.includes('MB') ? 'ltr' : 'rtl'
      }}>
        {value}
      </div>
      <div style={{
        fontFamily,
        fontSize: 22,
        color: '#d1fae5',
        fontWeight: 400,
        direction: 'rtl'
      }}>
        {label}
      </div>
    </div>
  );
};
