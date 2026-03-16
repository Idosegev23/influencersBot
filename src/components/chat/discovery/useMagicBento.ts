'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/* Purple→Pink gradient palette */
const PURPLE = '139, 92, 246';   // #8b5cf6
const PINK   = '217, 70, 239';   // #d946ef
const ROSE   = '244, 114, 182';  // #f472b6
const COLORS = [PURPLE, PINK, ROSE];

const SPOT_R = 400;
const PARTICLES = 12;

export function useMagicBento(
  feedRef: React.RefObject<HTMLElement | null>,
  cardCount: number
) {
  const spotRef = useRef<HTMLDivElement | null>(null);

  /* spotlight element — lives for the component lifetime */
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'bt-spotlight';
    document.body.appendChild(el);
    spotRef.current = el;
    return () => { el.remove(); spotRef.current = null; };
  }, []);

  /* main effect — re-binds when cards change */
  useEffect(() => {
    const feed = feedRef.current;
    const spot = spotRef.current;
    if (!feed || !spot) return;
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;

    const cards = Array.from(feed.querySelectorAll<HTMLElement>('.bt-card'));
    if (!cards.length) return;

    const pMap = new Map<HTMLElement, HTMLDivElement[]>();
    const tids: ReturnType<typeof setTimeout>[] = [];
    const offs: (() => void)[] = [];

    /* ── Global spotlight + border-glow tracking ── */
    const onMove = (e: MouseEvent) => {
      const fr = feed.getBoundingClientRect();
      const inside =
        e.clientX >= fr.left - 40 && e.clientX <= fr.right + 40 &&
        e.clientY >= fr.top - 40 && e.clientY <= fr.bottom + 40;

      if (!inside) {
        gsap.to(spot, { opacity: 0, duration: 0.3 });
        cards.forEach(c => c.style.setProperty('--glow-intensity', '0'));
        return;
      }

      gsap.set(spot, { left: e.clientX, top: e.clientY });

      let minD = Infinity;
      const prox = SPOT_R * 0.5;
      const fade = SPOT_R * 0.75;

      cards.forEach(card => {
        const r = card.getBoundingClientRect();
        const d = Math.max(
          0,
          Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) -
            Math.max(r.width, r.height) / 2
        );
        minD = Math.min(minD, d);
        const g = d <= prox ? 1 : d <= fade ? (fade - d) / (fade - prox) : 0;
        card.style.setProperty('--glow-x', `${((e.clientX - r.left) / r.width) * 100}%`);
        card.style.setProperty('--glow-y', `${((e.clientY - r.top) / r.height) * 100}%`);
        card.style.setProperty('--glow-intensity', `${g}`);
      });

      const op = minD <= prox ? 0.6 : minD <= fade ? ((fade - minD) / (fade - prox)) * 0.6 : 0;
      gsap.to(spot, { opacity: op, duration: op > 0 ? 0.15 : 0.4 });
    };

    document.addEventListener('mousemove', onMove);
    offs.push(() => document.removeEventListener('mousemove', onMove));

    /* ── Per-card: particles (stars) + click ripple ── */
    cards.forEach(card => {
      const enter = () => {
        const { width, height } = card.getBoundingClientRect();
        const ps: HTMLDivElement[] = [];

        for (let i = 0; i < PARTICLES; i++) {
          const tid = setTimeout(() => {
            if (!card.isConnected) return;
            const c = COLORS[i % COLORS.length];
            const p = document.createElement('div');
            p.style.cssText = `position:absolute;width:3px;height:3px;border-radius:50%;background:rgba(${c},0.7);box-shadow:0 0 5px rgba(${c},0.4);pointer-events:none;z-index:50;left:${Math.random() * width}px;top:${Math.random() * height}px;`;
            card.appendChild(p);
            ps.push(p);

            gsap.fromTo(p,
              { scale: 0, opacity: 0 },
              { scale: 1, opacity: 0.5, duration: 0.3, ease: 'back.out(1.7)' }
            );
            gsap.to(p, {
              x: (Math.random() - 0.5) * 50,
              y: (Math.random() - 0.5) * 50,
              duration: 2 + Math.random() * 2,
              ease: 'none', repeat: -1, yoyo: true,
            });
            gsap.to(p, {
              opacity: 0.15, duration: 1.5,
              ease: 'power2.inOut', repeat: -1, yoyo: true,
            });
          }, i * 70);
          tids.push(tid);
        }
        pMap.set(card, ps);
      };

      const leave = () => {
        (pMap.get(card) || []).forEach(p =>
          gsap.to(p, { scale: 0, opacity: 0, duration: 0.2, onComplete: () => p.remove() })
        );
        pMap.delete(card);
      };

      const click = (e: MouseEvent) => {
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const m = Math.max(
          Math.hypot(x, y),
          Math.hypot(x - r.width, y),
          Math.hypot(x, y - r.height),
          Math.hypot(x - r.width, y - r.height)
        );
        const rip = document.createElement('div');
        rip.style.cssText = `position:absolute;width:${m * 2}px;height:${m * 2}px;border-radius:50%;background:radial-gradient(circle,rgba(${PURPLE},0.2) 0%,rgba(${PINK},0.12) 25%,rgba(${ROSE},0.05) 45%,transparent 70%);left:${x - m}px;top:${y - m}px;pointer-events:none;z-index:100;`;
        card.appendChild(rip);
        gsap.fromTo(rip,
          { scale: 0, opacity: 1 },
          { scale: 1, opacity: 0, duration: 0.7, ease: 'power2.out', onComplete: () => rip.remove() }
        );
      };

      card.addEventListener('mouseenter', enter);
      card.addEventListener('mouseleave', leave);
      card.addEventListener('click', click);
      offs.push(() => {
        card.removeEventListener('mouseenter', enter);
        card.removeEventListener('mouseleave', leave);
        card.removeEventListener('click', click);
      });
    });

    return () => {
      tids.forEach(clearTimeout);
      offs.forEach(fn => fn());
      pMap.forEach(ps => ps.forEach(p => p.remove()));
    };
  }, [feedRef, cardCount]);
}
