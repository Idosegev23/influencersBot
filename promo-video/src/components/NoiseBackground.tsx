import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { noise3D } from '@remotion/noise';

interface NoiseBackgroundProps {
  color: string;
  intensity?: number;
  speed?: number;
}

export const NoiseBackground: React.FC<NoiseBackgroundProps> = ({ 
  color, 
  intensity = 0.15,
  speed = 0.005 
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  
  const noiseMap = useMemo(() => {
    const cols = 30;
    const rows = 20;
    return new Array(cols).fill(0).map((_, i) => 
      new Array(rows).fill(0).map((__, j) => {
        const val = noise3D('grain', i / cols, j / rows, frame * speed);
        return val;
      })
    );
  }, [frame, speed]);

  return (
    <AbsoluteFill style={{ backgroundColor: color, overflow: 'hidden' }}>
      <svg width={width} height={height} style={{ opacity: intensity }}>
        {noiseMap.map((row, i) => 
          row.map((val, j) => (
            <rect
              key={`${i}-${j}`}
              x={i * (width / 30)}
              y={j * (height / 20)}
              width={width / 30}
              height={height / 20}
              fill={val > 0 ? '#fff' : '#000'}
              opacity={Math.abs(val)}
            />
          ))
        )}
      </svg>
      {/* Vignette */}
      <AbsoluteFill style={{
        background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.6) 100%)',
      }} />
    </AbsoluteFill>
  );
};
