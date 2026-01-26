import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { NoiseBackground } from '../components/NoiseBackground';
import { KineticText } from '../components/KineticText';

export const Scene1_Problem: React.FC = () => {
  const frame = useCurrentFrame();

  // Glitch effect לבעיה
  const glitchX = frame % 10 < 2 ? Math.random() * 10 - 5 : 0;
  const glitchOpacity = frame % 10 < 2 ? 0.8 : 1;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <NoiseBackground color="#7f1d1d" intensity={0.25} speed={0.02} />
      
      {/* Chaos Icons - רקע */}
      <AbsoluteFill style={{ opacity: 0.2 }}>
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i * 123) % 100}%`,
              top: `${(i * 456) % 100}%`,
              fontSize: 60,
              opacity: interpolate(frame, [i * 3, i * 3 + 20], [0, 0.3], { extrapolateLeft: 'clamp' }),
              transform: `rotate(${frame * (i % 2 === 0 ? 1 : -1)}deg)`
            }}
          >
            📄
          </div>
        ))}
      </AbsoluteFill>

      {/* Main Text */}
      <div style={{ 
        zIndex: 10, 
        textAlign: 'center',
        transform: `translateX(${glitchX}px)`,
        opacity: glitchOpacity
      }}>
        <KineticText 
          text="80% מהזמן על אדמין" 
          color="#ef4444" 
          fontSize={90}
          delay={0}
        />
        
        <div style={{ marginTop: 60, opacity: interpolate(frame, [20, 35], [0, 1], { extrapolateLeft: 'clamp' }) }}>
          <KineticText 
            text="אפס שליטה" 
            color="#fca5a5" 
            fontSize={70}
            delay={20}
          />
        </div>

        <div style={{ marginTop: 50, opacity: interpolate(frame, [40, 55], [0, 1], { extrapolateLeft: 'clamp' }) }}>
          <KineticText 
            text="מאבדים כסף" 
            color="#fee2e2" 
            fontSize={60}
            delay={40}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
