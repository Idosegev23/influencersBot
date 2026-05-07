'use client';

/**
 * Editorial loading state for the catalog tab.
 *
 * A row of system skincare icons (from /public/icons/categories) with a single
 * traveling highlight. The highlight uses Bestie's pink → blue gradient so it
 * reads on-brand instead of as a generic spinner. Same masking pattern as
 * NavTabs — the SVG is the mask, fill comes from CSS background.
 */

import { useEffect, useState } from 'react';

const ICONS = [
  'cream',
  'sunscreen',
  'shampoo',
  'lipstick',
  'mascara',
  'blush',
];
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
        {ICONS.map((name, i) => {
          const isActive = active === i;
          const url = `/icons/categories/${name}.svg`;
          return (
            <span
              key={name}
              className={`dpc-loader__icon ${isActive ? 'dpc-loader__icon--active' : ''}`}
              aria-hidden
            >
              <span
                className="dpc-loader__icon-img"
                style={{
                  WebkitMaskImage: `url(${url})`,
                  maskImage: `url(${url})`,
                }}
              />
            </span>
          );
        })}
      </div>
      <div className="dpc-loader__text">{message}</div>
    </div>
  );
}

export default CatalogLoader;
