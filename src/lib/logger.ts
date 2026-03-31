/**
 * Simple production-aware logger.
 * In production, only warn/error are printed. Debug/info are silenced.
 */

const isProd = process.env.NODE_ENV === 'production';

export const logger = {
  debug: isProd ? (() => {}) : console.log.bind(console),
  info: isProd ? (() => {}) : console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
