import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { KineticText } from '../components/KineticText';
import { DocumentScan } from '../components/DocumentScan';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

export const Scene3_AI: React.FC = () => {
  const frame = useCurrentFrame();

  // Arrow animation
  const arrowOpacity = interpolate(frame, [75, 85], [0, 1], { extrapolateLeft: 'clamp' });
  const arrowX = interpolate(frame, [75, 90], [-50, 0], { extrapolateLeft: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <NoiseBackground color="#064e3b" intensity={0.15} speed={0.004} />
      
      {/* Content Container */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 120,
        maxWidth: 1600,
        padding: 50
      }}>
        
        {/* Left Side - Text */}
        <div style={{ flex: 1, zIndex: 10, textAlign: 'right' }}>
          <KineticText 
            text="AI Parsing" 
            color="#10b981" 
            fontSize={100}
            align="right"
          />
          
          <div style={{
            fontFamily,
            fontSize: 42,
            color: '#d1fae5',
            marginTop: 30,
            fontWeight: 300,
            opacity: interpolate(frame, [15, 30], [0, 1], { extrapolateLeft: 'clamp' }),
            direction: 'rtl',
            lineHeight: 1.5
          }}>
            מסמך → נתונים מובנים
          </div>

          <div style={{
            fontFamily,
            fontSize: 36,
            color: '#6ee7b7',
            marginTop: 25,
            fontWeight: 600,
            opacity: interpolate(frame, [30, 45], [0, 1], { extrapolateLeft: 'clamp' }),
            direction: 'rtl'
          }}>
            30 שניות במקום 45 דקות
          </div>

          {/* Stats */}
          <div style={{
            marginTop: 50,
            opacity: interpolate(frame, [50, 65], [0, 1], { extrapolateLeft: 'clamp' })
          }}>
            <div style={{
              fontFamily,
              fontSize: 72,
              color: '#10b981',
              fontWeight: 900,
              marginBottom: 10
            }}>
              92%
            </div>
            <div style={{
              fontFamily,
              fontSize: 28,
              color: '#a7f3d0',
              fontWeight: 400,
              direction: 'rtl'
            }}>
              דיוק ממוצע
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div style={{
          fontSize: 120,
          opacity: arrowOpacity,
          transform: `translateX(${arrowX}px)`,
          filter: 'drop-shadow(0 0 20px #10b981)'
        }}>
          →
        </div>

        {/* Right Side - Document */}
        <div style={{ flex: 1 }}>
          <DocumentScan />
        </div>
      </div>
    </AbsoluteFill>
  );
};
