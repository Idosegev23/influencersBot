import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import type { AssociationTenant } from '@/lib/copilot/tenant';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, max-age=60' };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** `https?://host[:port]` origin of a URL string, or null. http is accepted only for local hosts; wildcards never. */
function originOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value.trim());
    if (u.hostname.includes('*') || u.host.includes('*')) return null;
    if (u.protocol === 'https:') return u.origin;
    if (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname)) return u.origin;
    return null;
  } catch {
    return null;
  }
}

function httpsUrl(value: unknown): string | null {
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

/** Only these keys ever leave the API; everything else stored in branding is dropped. */
function sanitizeBranding(raw: unknown): Record<string, unknown> {
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

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((q: unknown): q is string => typeof q === 'string').slice(0, 6) : [];
}

export async function GET(req: Request) {
  const t = await requireTenant(req, { association: false });
  if (t instanceof Response) return t;

  if (t.accountId) {
    const assoc = await loadAssociation(t as AssociationTenant);
    if (!assoc) return Response.json({ error: 'association_unavailable' }, { status: 404 });
    const config = assoc.config as Record<string, any>;
    const cp = (config.copilot ?? {}) as Record<string, any>;
    const origins = [originOf(config.website_url), ...(Array.isArray(cp.allowed_origins) ? cp.allowed_origins.map((o: unknown) => originOf(o)) : [])]
      .filter((o): o is string => o !== null);
    const name = config.display_name ?? config.username;
    return Response.json(
      {
        kind: 'association',
        name: typeof name === 'string' ? name : '',
        branding: sanitizeBranding(assoc.branding),
        openingQuestions: strings(cp.opening_questions ?? config.suggested_questions),
        allowedOrigins: Array.from(new Set(origins)),
      },
      { headers: HEADERS },
    );
  }

  const { data: partner } = await supabase.from('partners').select('id, name, branding').eq('id', t.partnerId).maybeSingle();
  if (!partner) return Response.json({ error: 'partner_unavailable' }, { status: 404 });
  return Response.json(
    {
      kind: 'partner',
      name: partner.name ?? '',
      branding: sanitizeBranding(partner.branding),
      openingQuestions: [],
      allowedOrigins: [],
    },
    { headers: HEADERS },
  );
}
