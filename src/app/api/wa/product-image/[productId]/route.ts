/**
 * JPEG view of a product image, for WhatsApp.
 *
 * Product photos are stored as .webp, and WhatsApp rejects webp everywhere except sticker
 * messages — an `image` message and an interactive image header both accept only image/jpeg or
 * image/png, up to 5 MB. Meta fetches the header image from this URL when it delivers the card,
 * so the conversion has to live behind a public URL rather than in the send path.
 *
 * Takes a product UUID, never a URL: this is deliberately NOT a general-purpose proxy, so it
 * can't be pointed at internal hosts. The only reachable bytes are images we already published
 * for that product.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_WIDTH = 1024;   // well under WhatsApp's 5 MB at q80
const FETCH_TIMEOUT_MS = 8000;

// sharp is loaded LAZILY, inside the handler. It used to be a top-level `import sharp from 'sharp'`,
// and in production (2026-09-14) sharp could not dlopen libvips-cpp.so — which threw while the
// MODULE was being evaluated, so every request (even an invalid id) became a bare HTML 500 and no
// line of this file ever ran or logged. Loaded here, the same failure is one caught error with a
// JSON answer and a log line that names the cause. Only a successful load is cached; a failure is
// retried on the next request.
let sharpModule: Promise<any> | null = null;
function loadSharp(): Promise<any> {
  if (!sharpModule) {
    sharpModule = import('sharp')
      .then((m: any) => m.default ?? m)
      .catch((e) => { sharpModule = null; throw e; });
  }
  return sharpModule;
}

// Errors must never be cached: the success path is `immutable` for a year, and a CDN holding a
// transient 502/503 at this URL would pin a broken card image the same way.
function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  if (!UUID_RE.test(productId || '')) {
    return jsonError('invalid product id', 400);
  }

  // Before the DB read and the upstream fetch: without a transcoder neither can produce a card image.
  let sharp: any;
  try {
    sharp = await loadSharp();
  } catch (e: any) {
    console.error('[wa/product-image] sharp failed to load', e?.message);
    return jsonError('image transcoder unavailable', 503);
  }

  const { data } = await supabaseAdmin
    .from('widget_products')
    .select('image_url')
    .eq('id', productId)
    .single();
  const src = (data as any)?.image_url;
  if (!src || typeof src !== 'string' || !src.startsWith('https://')) {
    return jsonError('not found', 404);
  }

  let input: ArrayBuffer;
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    input = await res.arrayBuffer();
  } catch (e: any) {
    console.warn('[wa/product-image] fetch failed', productId, e?.message);
    return jsonError('upstream fetch failed', 502);
  }

  try {
    const out = await sharp(Buffer.from(input))
      .rotate()                                              // honor EXIF before we strip it
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })                    // transparency → white, JPEG has no alpha
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return new NextResponse(out as any, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(out.length),
        // Product images are content-addressed by product id and effectively immutable; a changed
        // photo lands on a new storage object, and the worst case is a stale card image.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e: any) {
    console.warn('[wa/product-image] transcode failed', productId, e?.message);
    return jsonError('transcode failed', 502);
  }
}
