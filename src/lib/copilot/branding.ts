/** Association/partner branding: the only keys that ever leave the API, with their value rules. */

export function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value.trim()).protocol === 'https:' ? value.trim() : null;
  } catch {
    return null;
  }
}

function shortString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null;
}

export const BRANDING_COLOR_KEYS = ['primary', 'primaryText', 'background', 'surface', 'text'] as const;
export const BRANDING_KEYS = [...BRANDING_COLOR_KEYS, 'font', 'logo', 'favicon', 'header_links', 'footer_text'] as const;
export const MAX_HEADER_LINKS = 8;

/** Only these keys ever leave the API; everything else stored in branding is dropped. */
export function sanitizeBranding(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const b = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ['primary', 'primaryText', 'background', 'surface', 'text', 'font']) {
    const v = shortString(b[k], 40);
    if (v !== null) out[k] = v;
  }
  for (const k of ['logo', 'favicon']) {
    const v = httpsUrl(b[k]);
    if (v !== null) out[k] = v;
  }
  if (Array.isArray(b.header_links)) {
    const links: { label: string; url: string }[] = [];
    for (const l of b.header_links) {
      if (links.length >= 8) break;
      const label = shortString((l as any)?.label, 40);
      const url = httpsUrl((l as any)?.url);
      if (label !== null && url !== null) links.push({ label, url });
    }
    out.header_links = links;
  }
  const footer = shortString(b.footer_text, 300);
  if (footer !== null) out.footer_text = footer;
  return out;
}


const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FONT_RE = /^[A-Za-z0-9][A-Za-z0-9 \-]{0,39}$/;

/**
 * Strict check for a branding write (console settings). The read whitelist above
 * silently drops what it does not like; a write refuses it instead, naming the
 * field, so staff never save a value that then quietly disappears. Colours must
 * be hex (they end up in CSS) and the font a plain family name.
 */
export function validateBranding(raw: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; field: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, field: 'branding' };
  const b = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    if (!(BRANDING_KEYS as readonly string[]).includes(k)) return { ok: false, field: `branding.${k}` };
    if (v === null || v === '') continue; // cleared
    if ((BRANDING_COLOR_KEYS as readonly string[]).includes(k)) {
      if (typeof v !== 'string' || !COLOR_RE.test(v.trim())) return { ok: false, field: `branding.${k}` };
      out[k] = v.trim();
    } else if (k === 'font') {
      if (typeof v !== 'string' || !FONT_RE.test(v.trim())) return { ok: false, field: 'branding.font' };
      out[k] = v.trim();
    } else if (k === 'logo' || k === 'favicon') {
      const u = httpsUrl(v);
      if (!u || u.length > 500) return { ok: false, field: `branding.${k}` };
      out[k] = u;
    } else if (k === 'footer_text') {
      if (typeof v !== 'string' || v.length > 300) return { ok: false, field: 'branding.footer_text' };
      out[k] = v;
    } else if (k === 'header_links') {
      if (!Array.isArray(v) || v.length > MAX_HEADER_LINKS) return { ok: false, field: 'branding.header_links' };
      const links: { label: string; url: string }[] = [];
      for (const l of v) {
        const label = typeof (l as any)?.label === 'string' ? (l as any).label.trim() : '';
        const url = httpsUrl((l as any)?.url);
        if (!label || label.length > 40 || !url || url.length > 500) return { ok: false, field: 'branding.header_links' };
        links.push({ label, url });
      }
      out[k] = links;
    }
  }
  return { ok: true, value: out };
}
