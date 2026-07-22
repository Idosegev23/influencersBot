import { describe, it, expect, beforeEach } from 'vitest';
import { registerConnector, getConnector } from '@/lib/orders/connectors/registry';
import type { OrderConnector } from '@/lib/orders/connectors/types';

const fakeQuickShop: OrderConnector = {
  platform: 'quickshop',
  installMode: 'manual_token',
  supportsDirectLookup: false,
  async pull() { return null; },
};

describe('order connector registry', () => {
  beforeEach(() => { registerConnector(fakeQuickShop); });

  it('returns a registered connector by platform', () => {
    expect(getConnector('quickshop')).toBe(fakeQuickShop);
    expect(getConnector('quickshop').supportsDirectLookup).toBe(false);
  });

  it('throws on an unregistered platform', () => {
    expect(() => getConnector('woocommerce')).toThrowError(/woocommerce/);
  });
});
