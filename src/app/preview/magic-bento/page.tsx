'use client';

import dynamic from 'next/dynamic';

// gsap is browser-only — render client-side
const MagicBento = dynamic(() => import('@/components/chat/MagicBento'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#06030c',
        color: 'rgba(255,255,255,0.55)',
        fontFamily: 'Heebo, system-ui, sans-serif',
        fontSize: 14,
        letterSpacing: '0.15em',
      }}
    >
      טוען MagicBento...
    </div>
  ),
});

export default function MagicBentoPreviewPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse at 50% 0%, #1a0530 0%, #06030c 70%)',
        padding: '40px 0 80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <header
        style={{
          maxWidth: 720,
          padding: '0 24px',
          marginBottom: 32,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'Heebo, system-ui, sans-serif',
            fontSize: 11,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'rgba(132, 0, 255, 0.85)',
            marginBottom: 12,
          }}
        >
          MagicBento Preview
        </div>
        <h1
          style={{
            fontFamily: 'Heebo, system-ui, sans-serif',
            fontSize: 32,
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          הזיזו את הסמן מעל הכרטיסים
        </h1>
        <p
          style={{
            fontFamily: 'Heebo, system-ui, sans-serif',
            fontSize: 14,
            color: 'rgba(255,255,255,0.55)',
            marginTop: 12,
            lineHeight: 1.6,
          }}
        >
          spotlight + border-glow + particles + tilt + magnetism + click ripple — הקוד המקורי מ-React Bits
        </p>
      </header>

      <MagicBento
        textAutoHide={true}
        enableStars={true}
        enableSpotlight={true}
        enableBorderGlow={true}
        enableTilt={true}
        enableMagnetism={true}
        clickEffect={true}
        spotlightRadius={300}
        particleCount={12}
        glowColor="132, 0, 255"
      />
    </div>
  );
}
