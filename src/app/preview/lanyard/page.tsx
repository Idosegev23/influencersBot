'use client';

import dynamic from 'next/dynamic';

// Lanyard uses three.js / rapier (WebGL + WASM) — ssr:false avoids server crash
const Lanyard = dynamic(() => import('@/components/chat/Lanyard'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0c1013',
        color: '#5FD4F5',
        fontFamily: 'Heebo, system-ui, sans-serif',
        fontSize: 14,
        letterSpacing: '0.15em',
      }}
    >
      טוען Lanyard...
    </div>
  ),
});

export default function LanyardPreviewPage() {
  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        background:
          'radial-gradient(circle at 30% 20%, #1f1933 0%, #0c1013 60%)',
        overflow: 'hidden',
      }}
    >
      <Lanyard position={[0, 0, 20]} gravity={[0, -40, 0]} transparent />

      {/* On-screen note */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.55)',
          fontFamily: 'Heebo, system-ui, sans-serif',
          fontSize: 13,
          letterSpacing: '0.05em',
          pointerEvents: 'none',
        }}
      >
        Lanyard preview · גרור את הכרטיס כדי לבדוק את הפיזיקה
      </div>
    </div>
  );
}
