'use client';

/**
 * Ingredient list components — mobile-first, always-on display of editorial
 * data (function + safety rating) for each INCI item.
 *
 * Mirrors what Dekel's site exposes via hover, but inline-rendered so no
 * interaction is required on touch devices. The full ingredient list reads
 * as a browsable rundown rather than a wall of Latin names.
 */

import { createContext, useContext } from 'react';

export interface IngredientInfo {
  function?: string | null;
  rating?: string | null;
  count?: number;
}

const IngredientDictContext = createContext<Record<string, IngredientInfo>>({});

export function IngredientDictProvider({
  dictionary,
  children,
}: {
  dictionary: Record<string, IngredientInfo>;
  children: React.ReactNode;
}) {
  return (
    <IngredientDictContext.Provider value={dictionary}>{children}</IngredientDictContext.Provider>
  );
}

function useIngredientInfo(name: string | null | undefined): IngredientInfo | null {
  const dict = useContext(IngredientDictContext);
  if (!name) return null;
  if (dict[name]) return dict[name];
  const lower = name.toLowerCase();
  for (const key of Object.keys(dict)) {
    if (key.toLowerCase() === lower) return dict[key];
  }
  return null;
}

const RATING_STYLE: Record<string, { bg: string; fg: string }> = {
  מעולה: { bg: '#1f3d2e', fg: '#dcf2e3' },
  טוב: { bg: '#2c4a3a', fg: '#dcf2e3' },
  עובר: { bg: '#3b3528', fg: '#f5e7c7' },
  'טעון בדיקה': { bg: '#4a3325', fg: '#f5d7c0' },
  'לא מומלץ': { bg: '#4a2424', fg: '#f5cdcd' },
  'לא עובר': { bg: '#4a2424', fg: '#f5cdcd' },
};

function ratingChrome(rating?: string | null) {
  if (!rating) return null;
  return RATING_STYLE[rating] ?? { bg: '#2a2520', fg: '#f5efe5' };
}

/**
 * Always-visible row for one ingredient.
 *   • Name on the leading side (LTR for Latin INCI, RTL for Hebrew)
 *   • Function note (small, secondary)
 *   • Rating chip (color-coded, trailing edge)
 */
export function IngredientRow({ name }: { name: string }) {
  const info = useIngredientInfo(name);
  const rating = ratingChrome(info?.rating);
  const isLatin = /^[\x00-\x7F]/.test(name.trim());

  return (
    <li className="dpc-inci-row">
      <div className="dpc-inci-row__main">
        <span className="dpc-inci-row__name" dir={isLatin ? 'ltr' : 'rtl'}>
          {name}
        </span>
        {info?.function && <span className="dpc-inci-row__fn">{info.function}</span>}
      </div>
      {rating && info?.rating && (
        <span
          className="dpc-inci-row__rating"
          style={{ background: rating.bg, color: rating.fg }}
        >
          {info.rating}
        </span>
      )}
    </li>
  );
}

/**
 * Renders the full INCI list as a structured, scannable list of rows.
 * No interaction required — function + rating are always visible.
 */
export function InciList({ items }: { items: string[] }) {
  return (
    <ul className="dpc-inci" dir="rtl">
      {items.map((name, i) => (
        <IngredientRow key={`${name}-${i}`} name={name} />
      ))}
    </ul>
  );
}
