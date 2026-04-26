'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Lanyard uses three.js / rapier (browser-only) — load client-side.
const Lanyard = dynamic(() => import('@/components/chat/Lanyard'), {
  ssr: false,
  loading: () => null,
});

/**
 * Generate a 1024×1024 canvas texture for the lanyard card:
 * - LDRS branding (dark navy bg + LEADERS / POWERED BY PEOPLE in cyan)
 * - Israeli Marketing Association logo (loaded from /lanyard/marketing-association.png)
 * - Conference label "כנס החדשנות 30.4"
 * Returns a data: URL for use as the card material's map.
 */
async function buildCardTextureUrl(): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background — deep navy with subtle gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  bgGrad.addColorStop(0, '#0a1330');
  bgGrad.addColorStop(0.6, '#0c1013');
  bgGrad.addColorStop(1, '#1a0a20');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Top accent — cyan glow
  const accent = ctx.createRadialGradient(512, 200, 50, 512, 200, 600);
  accent.addColorStop(0, 'rgba(95, 212, 245, 0.25)');
  accent.addColorStop(1, 'rgba(95, 212, 245, 0)');
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 1024, 1024);

  // LEADERS title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 168px "Heebo", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LEADERS', 512, 360);

  // Subtitle in cyan
  ctx.fillStyle = '#5FD4F5';
  ctx.font = '500 56px "Heebo", system-ui, sans-serif';
  ctx.letterSpacing = '8px';
  ctx.fillText('POWERED BY PEOPLE', 512, 440);

  // Decorative divider line
  ctx.strokeStyle = 'rgba(95, 212, 245, 0.4)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(312, 540);
  ctx.lineTo(712, 540);
  ctx.stroke();

  // Marketing Association logo — load + draw
  try {
    const img = new Image();
    img.src = '/lanyard/marketing-association.png';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo load failed'));
      // Safety timeout
      setTimeout(() => reject(new Error('logo load timeout')), 5000);
    });

    // White rounded card behind logo
    const cardW = 520;
    const cardH = 220;
    const cardX = (1024 - cardW) / 2;
    const cardY = 600;
    const radius = 24;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.lineTo(cardX + cardW - radius, cardY);
    ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius);
    ctx.lineTo(cardX + cardW, cardY + cardH - radius);
    ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - radius, cardY + cardH);
    ctx.lineTo(cardX + radius, cardY + cardH);
    ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - radius);
    ctx.lineTo(cardX, cardY + radius);
    ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
    ctx.closePath();
    ctx.fill();

    // Logo — fit inside card with padding
    const padding = 30;
    const innerW = cardW - padding * 2;
    const innerH = cardH - padding * 2;
    const aspect = img.width / img.height;
    let drawW = innerW;
    let drawH = innerW / aspect;
    if (drawH > innerH) {
      drawH = innerH;
      drawW = innerH * aspect;
    }
    const drawX = cardX + (cardW - drawW) / 2;
    const drawY = cardY + (cardH - drawH) / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  } catch {
    // If logo fails, at least show "איגוד השיווק הישראלי" as text
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 60px "Heebo", system-ui, sans-serif';
    ctx.fillText('איגוד השיווק הישראלי', 512, 720);
  }

  // Conference tagline at very bottom
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '500 36px "Heebo", system-ui, sans-serif';
  ctx.fillText('כנס החדשנות · 30.4.2026', 512, 920);

  return canvas.toDataURL('image/png');
}

/**
 * ConferenceBackdrop — renders the Lanyard component as a fixed,
 * pointer-events-none decorative layer behind the chat.
 *
 * Mounts only when ?source=conf is on /chat/ldrs_group.
 * z-index: 0 (chat content is above). pointer-events: none so it never
 * blocks chat interactions. The chat scroll area should reduce its
 * opacity slightly so the lanyard shows through.
 */
export function ConferenceBackdrop() {
  const [textureUrl, setTextureUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    buildCardTextureUrl().then((url) => {
      if (mounted) setTextureUrl(url);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!textureUrl) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0 }}
      aria-hidden
    >
      <Lanyard
        position={[0, 0, 22]}
        gravity={[0, -40, 0]}
        fov={20}
        transparent
        customCardTexture={textureUrl}
      />
    </div>
  );
}
