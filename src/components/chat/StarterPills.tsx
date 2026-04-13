'use client';

import { motion } from 'framer-motion';

interface StarterPillsProps {
  items: string[];
  onSelect: (item: string) => void;
  disabled?: boolean;
  /** Extra pill at the end (e.g. "גלו עוד") */
  extraPill?: {
    label: string;
    onClick: () => void;
  };
}

/** Strip emojis from text */
function stripEmojis(text: string): string {
  // eslint-disable-next-line no-misleading-character-class
  return text
    .replace(/[\u2600-\u27BF\uFE00-\uFE0F\u200D\u20E3]/g, '')
    .replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, '')
    .trim();
}

export function StarterPills({ items, onSelect, disabled, extraPill }: StarterPillsProps) {
  if (items.length === 0 && !extraPill) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="starter-pills-grid"
    >
      {items.map((item, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 + i * 0.05, duration: 0.3 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => !disabled && onSelect(item)}
          className="starter-pill"
          disabled={disabled}
        >
          {stripEmojis(item)}
        </motion.button>
      ))}
      {extraPill && (
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 + items.length * 0.05, duration: 0.3 }}
          whileTap={{ scale: 0.96 }}
          onClick={extraPill.onClick}
          className="starter-pill"
          disabled={disabled}
        >
          {extraPill.label}
        </motion.button>
      )}
    </motion.div>
  );
}
