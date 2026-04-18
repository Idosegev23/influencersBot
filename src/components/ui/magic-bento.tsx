'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { gsap } from 'gsap';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BentoCardData {
  title: string;
  description: string;
  label: string;
  color?: string;
  icon?: React.ReactNode;
}

export interface MagicBentoProps {
  cards: BentoCardData[];
  textAutoHide?: boolean;
  enableStars?: boolean;
  enableSpotlight?: boolean;
  enableBorderGlow?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
  particleCount?: number;
  enableTilt?: boolean;
  glowColor?: string;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PARTICLE_COUNT = 12;
const DEFAULT_SPOTLIGHT_RADIUS = 300;
const DEFAULT_GLOW_COLOR = '99, 102, 241'; // indigo-500
const MOBILE_BREAKPOINT = 768;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const createParticleElement = (x: number, y: number, color: string): HTMLDivElement => {
  const el = document.createElement('div');
  el.style.cssText = `
    position:absolute;width:4px;height:4px;border-radius:50%;
    background:rgba(${color},1);box-shadow:0 0 6px rgba(${color},0.6);
    pointer-events:none;z-index:100;left:${x}px;top:${y}px;
  `;
  return el;
};

const updateCardGlow = (card: HTMLElement, mx: number, my: number, glow: number, radius: number) => {
  const r = card.getBoundingClientRect();
  card.style.setProperty('--glow-x', `${((mx - r.left) / r.width) * 100}%`);
  card.style.setProperty('--glow-y', `${((my - r.top) / r.height) * 100}%`);
  card.style.setProperty('--glow-intensity', glow.toString());
  card.style.setProperty('--glow-radius', `${radius}px`);
};

/* ------------------------------------------------------------------ */
/*  ParticleCard                                                       */
/* ------------------------------------------------------------------ */

const ParticleCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  disableAnimations?: boolean;
  style?: React.CSSProperties;
  particleCount?: number;
  glowColor?: string;
  enableTilt?: boolean;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
}> = ({
  children, className = '', disableAnimations = false, style,
  particleCount = DEFAULT_PARTICLE_COUNT, glowColor = DEFAULT_GLOW_COLOR,
  enableTilt = true, clickEffect = false, enableMagnetism = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isHoveredRef = useRef(false);
  const memoizedParticles = useRef<HTMLDivElement[]>([]);
  const particlesInit = useRef(false);
  const magRef = useRef<gsap.core.Tween | null>(null);

  const initParticles = useCallback(() => {
    if (particlesInit.current || !cardRef.current) return;
    const { width, height } = cardRef.current.getBoundingClientRect();
    memoizedParticles.current = Array.from({ length: particleCount }, () =>
      createParticleElement(Math.random() * width, Math.random() * height, glowColor),
    );
    particlesInit.current = true;
  }, [particleCount, glowColor]);

  const clearParticles = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    magRef.current?.kill();
    particlesRef.current.forEach(p => {
      gsap.to(p, { scale: 0, opacity: 0, duration: 0.3, ease: 'back.in(1.7)', onComplete: () => p.parentNode?.removeChild(p) });
    });
    particlesRef.current = [];
  }, []);

  const animateParticles = useCallback(() => {
    if (!cardRef.current || !isHoveredRef.current) return;
    if (!particlesInit.current) initParticles();
    memoizedParticles.current.forEach((p, i) => {
      const tid = setTimeout(() => {
        if (!isHoveredRef.current || !cardRef.current) return;
        const clone = p.cloneNode(true) as HTMLDivElement;
        cardRef.current.appendChild(clone);
        particlesRef.current.push(clone);
        gsap.fromTo(clone, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
        gsap.to(clone, { x: (Math.random() - 0.5) * 100, y: (Math.random() - 0.5) * 100, rotation: Math.random() * 360, duration: 2 + Math.random() * 2, ease: 'none', repeat: -1, yoyo: true });
        gsap.to(clone, { opacity: 0.3, duration: 1.5, ease: 'power2.inOut', repeat: -1, yoyo: true });
      }, i * 100);
      timeoutsRef.current.push(tid);
    });
  }, [initParticles]);

  useEffect(() => {
    if (disableAnimations || !cardRef.current) return;
    const el = cardRef.current;
    const enter = () => { isHoveredRef.current = true; animateParticles(); if (enableTilt) gsap.to(el, { rotateX: 5, rotateY: 5, duration: 0.3, ease: 'power2.out', transformPerspective: 1000 }); };
    const leave = () => { isHoveredRef.current = false; clearParticles(); if (enableTilt) gsap.to(el, { rotateX: 0, rotateY: 0, duration: 0.3, ease: 'power2.out' }); if (enableMagnetism) gsap.to(el, { x: 0, y: 0, duration: 0.3, ease: 'power2.out' }); };
    const move = (e: MouseEvent) => {
      if (!enableTilt && !enableMagnetism) return;
      const r = el.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top; const cx = r.width / 2; const cy = r.height / 2;
      if (enableTilt) gsap.to(el, { rotateX: ((y - cy) / cy) * -10, rotateY: ((x - cx) / cx) * 10, duration: 0.1, ease: 'power2.out', transformPerspective: 1000 });
      if (enableMagnetism) { magRef.current = gsap.to(el, { x: (x - cx) * 0.05, y: (y - cy) * 0.05, duration: 0.3, ease: 'power2.out' }); }
    };
    const click = (e: MouseEvent) => {
      if (!clickEffect) return;
      const r = el.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top;
      const d = Math.max(Math.hypot(x, y), Math.hypot(x - r.width, y), Math.hypot(x, y - r.height), Math.hypot(x - r.width, y - r.height));
      const rip = document.createElement('div');
      rip.style.cssText = `position:absolute;width:${d * 2}px;height:${d * 2}px;border-radius:50%;background:radial-gradient(circle,rgba(${glowColor},0.4) 0%,rgba(${glowColor},0.2) 30%,transparent 70%);left:${x - d}px;top:${y - d}px;pointer-events:none;z-index:1000;`;
      el.appendChild(rip);
      gsap.fromTo(rip, { scale: 0, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => rip.remove() });
    };
    el.addEventListener('mouseenter', enter); el.addEventListener('mouseleave', leave); el.addEventListener('mousemove', move); el.addEventListener('click', click);
    return () => { isHoveredRef.current = false; el.removeEventListener('mouseenter', enter); el.removeEventListener('mouseleave', leave); el.removeEventListener('mousemove', move); el.removeEventListener('click', click); clearParticles(); };
  }, [animateParticles, clearParticles, disableAnimations, enableTilt, enableMagnetism, clickEffect, glowColor]);

  return (
    <div ref={cardRef} className={`${className} relative overflow-hidden`} style={{ ...style, position: 'relative' }}>
      {children}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  GlobalSpotlight                                                    */
/* ------------------------------------------------------------------ */

const GlobalSpotlight: React.FC<{
  gridRef: React.RefObject<HTMLDivElement | null>;
  disableAnimations?: boolean;
  enabled?: boolean;
  spotlightRadius?: number;
  glowColor?: string;
}> = ({ gridRef, disableAnimations = false, enabled = true, spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS, glowColor = DEFAULT_GLOW_COLOR }) => {
  const spotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (disableAnimations || !gridRef?.current || !enabled) return;
    const spot = document.createElement('div');
    spot.style.cssText = `position:fixed;width:800px;height:800px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(${glowColor},0.15) 0%,rgba(${glowColor},0.08) 15%,rgba(${glowColor},0.04) 25%,rgba(${glowColor},0.02) 40%,rgba(${glowColor},0.01) 65%,transparent 70%);z-index:200;opacity:0;transform:translate(-50%,-50%);mix-blend-mode:screen;`;
    document.body.appendChild(spot);
    spotRef.current = spot;
    const prox = spotlightRadius * 0.5; const fade = spotlightRadius * 0.75;

    const onMove = (e: MouseEvent) => {
      if (!spotRef.current || !gridRef.current) return;
      const section = gridRef.current.closest('.bento-section');
      const sr = section?.getBoundingClientRect();
      const inside = sr && e.clientX >= sr.left && e.clientX <= sr.right && e.clientY >= sr.top && e.clientY <= sr.bottom;
      const cards = gridRef.current.querySelectorAll('.mb-card');
      if (!inside) { gsap.to(spotRef.current, { opacity: 0, duration: 0.3 }); cards.forEach(c => (c as HTMLElement).style.setProperty('--glow-intensity', '0')); return; }
      let minD = Infinity;
      cards.forEach(c => {
        const ce = c as HTMLElement; const cr = ce.getBoundingClientRect();
        const d = Math.max(0, Math.hypot(e.clientX - (cr.left + cr.width / 2), e.clientY - (cr.top + cr.height / 2)) - Math.max(cr.width, cr.height) / 2);
        minD = Math.min(minD, d);
        const g = d <= prox ? 1 : d <= fade ? (fade - d) / (fade - prox) : 0;
        updateCardGlow(ce, e.clientX, e.clientY, g, spotlightRadius);
      });
      gsap.to(spotRef.current, { left: e.clientX, top: e.clientY, duration: 0.1 });
      const op = minD <= prox ? 0.8 : minD <= fade ? ((fade - minD) / (fade - prox)) * 0.8 : 0;
      gsap.to(spotRef.current, { opacity: op, duration: op > 0 ? 0.2 : 0.5 });
    };
    const onLeave = () => { gridRef.current?.querySelectorAll('.mb-card').forEach(c => (c as HTMLElement).style.setProperty('--glow-intensity', '0')); if (spotRef.current) gsap.to(spotRef.current, { opacity: 0, duration: 0.3 }); };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseleave', onLeave);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseleave', onLeave); spotRef.current?.remove(); };
  }, [gridRef, disableAnimations, enabled, spotlightRadius, glowColor]);

  return null;
};

/* ------------------------------------------------------------------ */
/*  MagicBento                                                         */
/* ------------------------------------------------------------------ */

const MagicBento: React.FC<MagicBentoProps> = ({
  cards,
  textAutoHide = true,
  enableStars = true,
  enableSpotlight = true,
  enableBorderGlow = true,
  disableAnimations = false,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  particleCount = DEFAULT_PARTICLE_COUNT,
  enableTilt = false,
  glowColor = DEFAULT_GLOW_COLOR,
  clickEffect = true,
  enableMagnetism = true,
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const noAnim = disableAnimations || isMobile;

  return (
    <>
      {enableSpotlight && <GlobalSpotlight gridRef={gridRef} disableAnimations={noAnim} enabled={enableSpotlight} spotlightRadius={spotlightRadius} glowColor={glowColor} />}
      <div className="mb-grid bento-section" ref={gridRef}>
        {cards.map((card, i) => {
          const cls = `mb-card${textAutoHide ? ' mb-card--text-autohide' : ''}${enableBorderGlow ? ' mb-card--border-glow' : ''}`;
          const st = { backgroundColor: card.color || '#1a1a2e', '--glow-color': glowColor } as React.CSSProperties;
          const content = (
            <>
              <div className="mb-card__header">
                {card.icon && <div className="mb-card__icon">{card.icon}</div>}
                <div className="mb-card__label">{card.label}</div>
              </div>
              <div className="mb-card__content">
                <h3 className="mb-card__title">{card.title}</h3>
                <p className="mb-card__desc">{card.description}</p>
              </div>
            </>
          );

          return enableStars ? (
            <ParticleCard key={i} className={cls} style={st} disableAnimations={noAnim} particleCount={particleCount} glowColor={glowColor} enableTilt={enableTilt} clickEffect={clickEffect} enableMagnetism={enableMagnetism}>
              {content}
            </ParticleCard>
          ) : (
            <div key={i} className={cls} style={st}>{content}</div>
          );
        })}
      </div>
    </>
  );
};

export default MagicBento;
