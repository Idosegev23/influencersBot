import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Heebo';

const { fontFamily } = loadFont();

interface KineticTextProps {
  text: string;
  delay?: number;
  color?: string;
  fontSize?: number;
  weight?: number;
  align?: 'center' | 'left' | 'right';
}

export const KineticText: React.FC<KineticTextProps> = ({ 
  text, 
  delay = 0, 
  color = '#fff',
  fontSize = 100,
  weight = 900,
  align = 'center'
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 100, stiffness: 200, mass: 0.5 }
  });

  const y = interpolate(entrance, [0, 1], [80, 0]);
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const scale = interpolate(entrance, [0, 1], [0.9, 1]);

  return (
    <h1 style={{
      fontFamily,
      fontWeight: weight,
      fontSize,
      color,
      textAlign: align,
      transform: `translateY(${y}px) scale(${scale})`,
      opacity,
      margin: 0,
      textShadow: '0 20px 60px rgba(0,0,0,0.8)',
      lineHeight: 1.2,
      direction: 'rtl'
    }}>
      {text}
    </h1>
  );
};
