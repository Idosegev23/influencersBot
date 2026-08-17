'use client';

/**
 * Content ↔ customer-service switch for the chat page's cold start.
 *
 * This replaced two side-by-side buttons that read as a pair of actions rather
 * than as a choice between two states — nothing showed which one you were in,
 * and only one of them did anything: the "chat with <name>" button fired an
 * analytics event and returned, so pressing it looked broken. A segmented
 * control makes the current mode visible and makes both sides real.
 */

import { motion } from 'framer-motion';
import { LifeBuoy, MessageCircle } from 'lucide-react';

export type ChatMode = 'content' | 'cs';

export interface ModeToggleProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  /** Label for the content side — usually "לשוחח עם <שם>". */
  contentLabel: string;
  csLabel: string;
  primaryColor: string;
  dir: 'rtl' | 'ltr';
  disabled?: boolean;
}

const OPTIONS: { id: ChatMode; Icon: typeof LifeBuoy }[] = [
  { id: 'content', Icon: MessageCircle },
  { id: 'cs', Icon: LifeBuoy },
];

/**
 * The shared label strings end in a decorative emoji ("שירות לקוחות 🛟"), which
 * was the only icon those flat buttons had. This control draws real icons, so
 * the emoji would double up. Stripped here rather than in the strings, which
 * other surfaces still render without icons.
 */
function stripTrailingEmoji(label: string): string {
  return label.replace(/[\s\p{Extended_Pictographic}️‍]+$/u, '').trim();
}

export function ModeToggle({
  mode, onChange, contentLabel, csLabel, primaryColor, dir, disabled,
}: ModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label={contentLabel + ' / ' + csLabel}
      dir={dir}
      className="relative flex w-full items-center gap-1 rounded-full p-1"
      style={{ background: '#f1f0f4', boxShadow: 'inset 0 1px 2px rgba(12,16,19,0.06)' }}
    >
      {OPTIONS.map(({ id, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(id)}
            className="relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5
                       text-[13.5px] font-semibold transition-colors duration-300
                       ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-60"
            style={{ color: active ? '#fff' : '#6b6b6b' }}
          >
            {/* One shared layoutId means the thumb travels between the two
                sides instead of cross-fading — the sliding motion is the whole
                point of using a switch here. */}
            {active && (
              <motion.span
                layoutId="chat-mode-thumb"
                transition={{ type: 'spring', damping: 30, stiffness: 380, mass: 0.7 }}
                className="absolute inset-0 rounded-full"
                style={{ background: primaryColor, boxShadow: `0 6px 18px -8px ${primaryColor}` }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{stripTrailingEmoji(id === 'cs' ? csLabel : contentLabel)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
