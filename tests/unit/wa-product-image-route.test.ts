// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Production, 2026-09-14: `import sharp from 'sharp'` at module scope meant a sharp that could not
// load (libvips-cpp.so missing from the function bundle) crashed the MODULE — every request, even
// /api/wa/product-image/not-a-uuid, came back as an HTML 500 and nothing in our code ever ran.
// The route must survive that: a clean JSON error, and still serve JPEG whenever sharp does load.

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';
let IMAGE_URL: string | null = 'https://cdn.example.com/p.webp';
const from = vi.fn(() => {
  const q: any = {};
  q.select = () => q;
  q.eq = () => q;
  q.single = async () => ({ data: IMAGE_URL ? { image_url: IMAGE_URL } : null });
  return q;
});
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...a: any[]) => (from as any)(...a) } }));

const call = async (id: string) => {
  const { GET } = await import('@/app/api/wa/product-image/[productId]/route');
  return GET({} as any, { params: Promise.resolve({ productId: id }) });
};

describe('/api/wa/product-image', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    IMAGE_URL = 'https://cdn.example.com/p.webp';
  });
  afterEach(() => {
    vi.doUnmock('sharp');
    vi.unstubAllGlobals();
  });

  describe('when sharp cannot load (the production failure)', () => {
    beforeEach(() => {
      vi.doMock('sharp', () => {
        throw new Error('Could not load the "sharp" module using the linux-x64 runtime — ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3');
      });
    });

    it('answers with a JSON 503 instead of crashing, and is never cached', async () => {
      vi.stubGlobal('fetch', vi.fn());
      const res = await call(PRODUCT_ID);
      expect(res.status).toBe(503);
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
      expect(await res.json()).toEqual({ error: 'image transcoder unavailable' });
      expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('does not spend the upstream fetch on an image it cannot convert', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      await call(PRODUCT_ID);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('still validates the id first — a malformed id is a 400, not a 503', async () => {
      const res = await call('not-a-uuid');
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid product id' });
    });
  });

  describe('when sharp loads', () => {
    it('transcodes the stored webp to image/jpeg', async () => {
      const sharp = (await import('sharp')).default;
      const webp = await sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 200, g: 10, b: 10, alpha: 0.5 } } }).webp().toBuffer();
      vi.stubGlobal('fetch', vi.fn(async () => new Response(webp, { headers: { 'content-type': 'image/webp' } })));

      const res = await call(PRODUCT_ID);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
      const out = Buffer.from(await res.arrayBuffer());
      expect(out.length).toBeGreaterThan(0);
      expect(out[0]).toBe(0xff);          // JPEG SOI marker
      expect(out[1]).toBe(0xd8);
      expect((await sharp(out).metadata()).format).toBe('jpeg');
    });

    it('an unknown product is a 404', async () => {
      IMAGE_URL = null;
      vi.stubGlobal('fetch', vi.fn());
      const res = await call(PRODUCT_ID);
      expect(res.status).toBe(404);
    });
  });
});
