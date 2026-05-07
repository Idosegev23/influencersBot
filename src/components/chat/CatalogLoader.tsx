'use client';

/**
 * Editorial loading state for the catalog tab.
 *
 * A row of skincare-themed icons with a single moving highlight that travels
 * left → right (RTL: right → left visually). The highlight uses Bestie's
 * pink/blue gradient so it reads as on-brand instead of a generic spinner.
 *
 * Mobile-first: small footprint, generous tap-safe whitespace, no layout
 * shift when the catalog hydrates over it.
 */

import { useEffect, useState } from 'react';
import { Sparkles, Droplet, Leaf, FlaskConical, Heart, Sun } from 'lucide-react';

const ICONS = [Sparkles, Droplet, Leaf, FlaskConical, Heart, Sun];
const STEP_MS = 320;

export function CatalogLoader({ message = 'טוען את הקטלוג…' }: { message?: string }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => (i + 1) % ICONS.length);
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="dpc-loader" dir="rtl" role="status" aria-live="polite">
      <div className="dpc-loader__icons">
        {ICONS.map((Icon, i) => {
          const isActive = active === i;
          return (
            <span
              key={i}
              className={`dpc-loader__icon ${isActive ? 'dpc-loader__icon--active' : ''}`}
              aria-hidden
            >
              <Icon className="w-5 h-5" />
            </span>
          );
        })}
      </div>
      <div className="dpc-loader__text">{message}</div>
    </div>
  );
}

export default CatalogLoader;
