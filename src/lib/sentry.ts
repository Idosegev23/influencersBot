// Sentry Error Tracking Configuration
// Note: Install @sentry/nextjs and run 'npx @sentry/wizard@latest -i nextjs' for full setup

interface ErrorContext {
  user?: {
    id?: string;
    username?: string;
    email?: string;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

/**
 * Capture an exception and send to error tracking service
 */
export function captureException(error: Error | unknown, context?: ErrorContext): void {
  // In development, just log to console
  if (process.env.NODE_ENV === 'development') {
    console.error('[Error Captured]', error, context);
    return;
  }

  // In production with Sentry configured
  if (typeof window !== 'undefined' && (window as unknown as { Sentry?: { captureException: (e: unknown, c: unknown) => void } }).Sentry) {
    const Sentry = (window as unknown as { Sentry: { captureException: (e: unknown, c: unknown) => void } }).Sentry;
    Sentry.captureException(error, {
      user: context?.user,
      tags: context?.tags,
      extra: context?.extra,
    });
  } else {
    // Fallback logging
    console.error('[Production Error]', error, context);
  }
}

/**
 * Capture a message (non-error event)
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${level.toUpperCase()}]`, message);
    return;
  }

  if (typeof window !== 'undefined' && (window as unknown as { Sentry?: { captureMessage: (m: string, l: string) => void } }).Sentry) {
    const Sentry = (window as unknown as { Sentry: { captureMessage: (m: string, l: string) => void } }).Sentry;
    Sentry.captureMessage(message, level);
  } else {
    console.log(`[${level.toUpperCase()}]`, message);
  }
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; username?: string; email?: string } | null): void {
  if (typeof window !== 'undefined' && (window as unknown as { Sentry?: { setUser: (u: unknown) => void } }).Sentry) {
    const Sentry = (window as unknown as { Sentry: { setUser: (u: unknown) => void } }).Sentry;
    Sentry.setUser(user);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Breadcrumb: ${category}]`, message, data);
    return;
  }

  if (typeof window !== 'undefined' && (window as unknown as { Sentry?: { addBreadcrumb: (b: unknown) => void } }).Sentry) {
    const Sentry = (window as unknown as { Sentry: { addBreadcrumb: (b: unknown) => void } }).Sentry;
    Sentry.addBreadcrumb({
      category,
      message,
      data,
      level: 'info',
    });
  }
}

/**
 * Start a performance transaction
 */
export function startTransaction(name: string, op: string): { finish: () => void } {
  if (typeof window !== 'undefined' && (window as unknown as { Sentry?: { startTransaction: (t: unknown) => { finish: () => void } } }).Sentry) {
    const Sentry = (window as unknown as { Sentry: { startTransaction: (t: unknown) => { finish: () => void } } }).Sentry;
    const transaction = Sentry.startTransaction({ name, op });
    return transaction;
  }

  return { finish: () => {} };
}


