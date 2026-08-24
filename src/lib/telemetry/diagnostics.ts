/**
 * Diagnostics payload sanitizer.
 *
 * This endpoint is unauthenticated by necessity (see the route), so the payload
 * is untrusted. Allow-list, never deny-list: we build the stored object from a
 * fixed set of known keys so nothing a caller invents — chat text, cookies, form
 * values — can reach our database.
 */

const DIAGNOSTIC_TYPES = new Set([
  'client_error', 'config_load_failed', 'csp_blocked',
  // Inline-surface mount diagnostics (public/widget.js) — "mount failure is
  // never silent" is a spec requirement; these four must stay allow-listed.
  'inline_mount_missing', 'inline_render_failed', 'inline_selector_invalid', 'inline_setup_failed',
]);
const MAX_MESSAGE = 500;
const MAX_STACK_FRAMES = 3;

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v ? v.slice(0, max) : null;
}

export function sanitizeDiagnostic(
  raw: unknown,
): { type: string; payload: Record<string, unknown> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const type = typeof r.type === 'string' ? r.type : '';
  if (!DIAGNOSTIC_TYPES.has(type)) return null;

  const message = str(r.message, MAX_MESSAGE);
  if (!message) return null;

  const stack = typeof r.stack === 'string'
    ? r.stack.split('\n').slice(0, MAX_STACK_FRAMES).join('\n').slice(0, 1000)
    : null;

  return {
    type,
    payload: {
      message,
      stack,
      filename: str(r.filename, 300),
      line: typeof r.line === 'number' && Number.isFinite(r.line) ? r.line : null,
      widgetVersion: str(r.widgetVersion, 20),
      ua: str(r.ua, 300),
    },
  };
}
