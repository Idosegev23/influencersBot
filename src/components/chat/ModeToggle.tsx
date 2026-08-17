'use client';

/**
 * Content ↔ customer-service switch for the chat page.
 *
 * This replaced two side-by-side buttons that read as a pair of actions rather
 * than a choice between two states — nothing showed which one you were in, and
 * only one of them did anything.
 *
 * Each side carries a second line saying what that mode is for. The labels
 * alone ("שירות לקוחות" / "לשוחח עם דניאל") name the modes without explaining
 * them, which is why the original pair was unclear: a visitor cannot pick
 * between two brains they have not been told apart.
 */

import { motion } from 'framer-motion';
import { LifeBuoy, MessageCircle } from 'lucide-react';

export type ChatMode = 'content' | 'cs';

export interface ModeToggleProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  /** Primary label for the content side — usually "לשוחח עם <שם>". */
  contentLabel: string;
  csLabel: string;
  /** Second line: what each mode is actually for. */
  contentHint: string;
  csHint: string;
  primaryColor: string;
  dir: 'rtl' | 'ltr';
  disabled?: boolean;
}

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
  mode, onChange, contentLabel, csLabel, contentHint, csHint, primaryColor, dir, disabled,
}: ModeToggleProps) {
  const options = [
    { id: 'content' as const, Icon: MessageCircle, label: contentLabel, hint: contentHint },
    { id: 'cs' as const, Icon: LifeBuoy, label: csLabel, hint: csHint },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={stripTrailingEmoji(contentLabel) + ' / ' + stripTrailingEmoji(csLabel)}
      dir={dir}
      className="relative flex w-full items-stretch gap-1 rounded-[18px] p-[5px]"
      style={{
        background: '#f3f2f6',
        boxShadow: 'inset 0 1px 2px rgba(12,16,19,0.07)',
      }}
    >
      {options.map(({ id, Icon, label, hint }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(id)}
            className="relative flex flex-1 items-center justify-center gap-2 rounded-[14px] px-3 py-2
                       transition-[color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
                       disabled:opacity-60"
            style={{ color: active ? '#fff' : '#55555f', minWidth: 0 }}
          >
            {/* One shared layoutId means the thumb travels between the sides
                instead of cross-fading — the sliding motion is the whole point
                of using a switch rather than two buttons. */}
            {active && (
              <motion.span
                layoutId="chat-mode-thumb"
                transition={{ type: 'spring', damping: 32, stiffness: 400, mass: 0.7 }}
                className="absolute inset-0 rounded-[14px]"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, color-mix(in srgb, ${primaryColor} 72%, #000))`,
                  boxShadow: `0 8px 20px -10px ${primaryColor}, inset 0 1px 0 rgba(255,255,255,0.22)`,
                }}
              />
            )}
            <span
              className="relative z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full
                         transition-colors duration-300"
              style={{ background: active ? 'rgba(255,255,255,0.20)' : 'rgba(12,16,19,0.05)' }}
            >
              <Icon className="h-[15px] w-[15px]" />
            </span>
            <span className="relative z-10 flex min-w-0 flex-col items-start text-start">
              <span className="w-full truncate text-[13px] font-semibold leading-tight">
                {stripTrailingEmoji(label)}
              </span>
              <span
                className="w-full truncate text-[10.5px] leading-tight"
                style={{ color: active ? 'rgba(255,255,255,0.76)' : '#93939d' }}
              >
                {hint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
