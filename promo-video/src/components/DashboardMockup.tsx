import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const DashboardMockup: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const entrance = spring({
    frame,
    fps,
    config: { damping: 100, stiffness: 100 }
  });

  // 3D Float Effect
  const rotateX = Math.sin(frame * 0.03) * 3;
  const rotateY = Math.cos(frame * 0.02) * 4;
  const translateZ = interpolate(entrance, [0, 1], [-100, 0]);

  // Chart animations
  const bar1Height = interpolate(frame, [15, 45], [0, 60], { extrapolateRight: 'clamp' });
  const bar2Height = interpolate(frame, [25, 55], [0, 80], { extrapolateRight: 'clamp' });
  const bar3Height = interpolate(frame, [35, 65], [0, 45], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      perspective: 1500,
      transformStyle: 'preserve-3d',
    }}>
      <div style={{
        width: 1000,
        height: 600,
        background: 'rgba(17, 24, 39, 0.8)',
        backdropFilter: 'blur(40px)',
        border: '2px solid rgba(99, 102, 241, 0.3)',
        borderRadius: 32,
        transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(${translateZ}px)`,
        boxShadow: '0 50px 150px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        padding: 40,
        display: 'grid',
        gridTemplateColumns: '200px 1fr',
        gap: 30,
        opacity: interpolate(entrance, [0, 1], [0, 1])
      }}>
        {/* Sidebar - Navigation */}
        <div style={{ 
          background: 'rgba(99, 102, 241, 0.1)', 
          borderRadius: 20,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 15
        }}>
          {[60, 50, 50, 50, 50].map((height, i) => (
            <div 
              key={i}
              style={{ 
                height, 
                background: i === 0 ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255,255,255,0.05)', 
                borderRadius: 12,
                opacity: interpolate(frame, [i * 5, i * 5 + 10], [0, 1], { extrapolateLeft: 'clamp' })
              }} 
            />
          ))}
        </div>
        
        {/* Main Content Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 25 }}>
          
          {/* Header */}
          <div style={{ 
            height: 80, 
            background: 'rgba(255,255,255,0.05)', 
            borderRadius: 20,
            opacity: interpolate(frame, [5, 15], [0, 1], { extrapolateLeft: 'clamp' })
          }} />
          
          {/* Stats Cards Row */}
          <div style={{ display: 'flex', gap: 20, height: 120 }}>
            {[
              { color: '#3b82f6', delay: 10 },
              { color: '#10b981', delay: 15 },
              { color: '#f59e0b', delay: 20 },
              { color: '#8b5cf6', delay: 25 }
            ].map((card, i) => (
              <div 
                key={i}
                style={{ 
                  flex: 1, 
                  background: `linear-gradient(135deg, ${card.color}20, ${card.color}10)`,
                  border: `2px solid ${card.color}40`,
                  borderRadius: 16,
                  opacity: interpolate(frame, [card.delay, card.delay + 10], [0, 1], { extrapolateLeft: 'clamp' }),
                  transform: `translateY(${interpolate(frame, [card.delay, card.delay + 10], [20, 0], { extrapolateLeft: 'clamp' })}px)`
                }} 
              />
            ))}
          </div>

          {/* Charts Area */}
          <div style={{ display: 'flex', gap: 25, flex: 1 }}>
            
            {/* Bar Chart */}
            <div style={{ 
              flex: 1, 
              background: 'rgba(255,255,255,0.03)', 
              borderRadius: 20, 
              position: 'relative',
              padding: 30,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-around',
              gap: 20
            }}>
              {[bar1Height, bar2Height, bar3Height].map((height, i) => (
                <div 
                  key={i}
                  style={{
                    width: 80,
                    height: `${height}%`,
                    background: i === 1 
                      ? 'linear-gradient(180deg, #6366f1, #8b5cf6)' 
                      : 'linear-gradient(180deg, #4f46e5, #6366f1)',
                    borderRadius: '12px 12px 0 0',
                    boxShadow: '0 -5px 30px rgba(99, 102, 241, 0.5)'
                  }} 
                />
              ))}
            </div>
            
            {/* Line Chart Area */}
            <div style={{ 
              flex: 1, 
              background: 'rgba(255,255,255,0.03)', 
              borderRadius: 20,
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Animated Line */}
              <svg width="100%" height="100%" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <polyline
                  points={`
                    ${interpolate(frame, [15, 30], [0, 50], { extrapolateLeft: 'clamp' })},300
                    ${interpolate(frame, [20, 35], [0, 150], { extrapolateLeft: 'clamp' })},200
                    ${interpolate(frame, [25, 40], [0, 250], { extrapolateLeft: 'clamp' })},150
                    ${interpolate(frame, [30, 45], [0, 350], { extrapolateLeft: 'clamp' })},100
                  `}
                  fill="none"
                  stroke="url(#lineGradient)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
