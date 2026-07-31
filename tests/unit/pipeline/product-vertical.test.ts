import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- extractAllProducts capture -------------------------------------------------
const extractCalls: any[] = [];
vi.mock('@/lib/recommendations/extract-products', () => ({
  extractAllProducts: vi.fn(async (accountId: string, opts: any) => {
    extractCalls.push({ accountId, opts });
  }),
}));
vi.mock('@/lib/recommendations/enrich-products', () => ({ enrichAllProducts: vi.fn() }));

// ---- supabase stub for finalize -------------------------------------------------
let storedConfig: Record<string, any> = {};
let updatedConfig: Record<string, any> | null = null;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { config: storedConfig } }) }),
      }),
      update: (row: any) => ({
        eq: async () => {
          updatedConfig = row.config;
          return {};
        },
      }),
    }),
  })),
}));
vi.mock('@/lib/scraping/image-analyzer', () => ({ extractImageData: vi.fn(async () => null) }));

// `websiteUrl` is passed positionally — note it must be able to be an explicit falsy value,
// so it is not given a default (a default would swallow the no-website case).
const ctx = (options: Record<string, unknown>, websiteUrl: string | null = 'https://s.com') =>
  ({
    jobId: 'j',
    accountId: 'a',
    username: 'u',
    step: 'x',
    batch: 0,
    state: { websiteUrl, options },
  }) as any;

beforeEach(() => {
  extractCalls.length = 0;
  storedConfig = {};
  updatedConfig = null;
});

describe('productExtractStep passes the vertical to the extractor', () => {
  it('forwards the vertical chosen on the add-account form', async () => {
    const { productExtractStep } = await import('@/lib/pipeline/steps/product-extract');
    await productExtractStep(ctx({ productVertical: 'fashion' }));
    expect(extractCalls[0].opts.vertical).toBe('fashion');
  });

  it('leaves the vertical undefined when none was picked, so the extractor reads the config', async () => {
    const { productExtractStep } = await import('@/lib/pipeline/steps/product-extract');
    await productExtractStep(ctx({}));
    expect(extractCalls[0].opts.vertical).toBeUndefined();
  });

  it('still skips entirely for accounts with no website', async () => {
    const { productExtractStep } = await import('@/lib/pipeline/steps/product-extract');
    await productExtractStep(ctx({ productVertical: 'fashion' }, null));
    expect(extractCalls).toHaveLength(0);
  });
});

describe('finalizeStep persists the catalog vertical', () => {
  it('writes the explicitly chosen vertical to config.product_vertical', async () => {
    const { finalizeStep } = await import('@/lib/pipeline/steps/finalize');
    await finalizeStep(ctx({ productVertical: 'fashion', archetype: 'brand' }));
    expect(updatedConfig?.product_vertical).toBe('fashion');
  });

  it('derives a default from the archetype when the form left it blank', async () => {
    const { finalizeStep } = await import('@/lib/pipeline/steps/finalize');
    await finalizeStep(ctx({ archetype: 'service_provider' }));
    expect(updatedConfig?.product_vertical).toBe('services');
  });

  it('an explicit re-scan choice overrides a previously stored vertical', async () => {
    storedConfig = { product_vertical: 'general', archetype: 'brand' };
    const { finalizeStep } = await import('@/lib/pipeline/steps/finalize');
    await finalizeStep(ctx({ productVertical: 'food' }));
    expect(updatedConfig?.product_vertical).toBe('food');
  });

  it('preserves the stored vertical when a re-scan does not specify one', async () => {
    storedConfig = { product_vertical: 'fashion', archetype: 'brand' };
    const { finalizeStep } = await import('@/lib/pipeline/steps/finalize');
    await finalizeStep(ctx({}));
    expect(updatedConfig?.product_vertical).toBe('fashion');
  });
});
