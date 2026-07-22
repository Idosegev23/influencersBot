import { describe, it, expect } from 'vitest';
import { buildIntegrationPatch } from '@/app/api/admin/accounts/[accountId]/integrations/route';

describe('buildIntegrationPatch', () => {
  it('persists a Shopify token as admin_api_token (reconciles the mismatch)', () => {
    const next = buildIntegrationPatch('shopify', {}, { shop_domain: 'x.myshopify.com', api_token: 'shpat_ABC', enabled: true });
    expect(next.admin_api_token).toBe('shpat_ABC');
    expect(next.shop_domain).toBe('x.myshopify.com');
    expect(next.enabled).toBe(true);
  });

  it('does not overwrite a stored Shopify token when a masked value is sent', () => {
    const next = buildIntegrationPatch('shopify', { admin_api_token: 'shpat_OLD' }, { api_token: '••••ABC', enabled: true });
    expect(next.admin_api_token).toBe('shpat_OLD');
  });

  it('persists QuickShop api_key, webhook_secret and webhook_token', () => {
    const next = buildIntegrationPatch('quickshop', {}, { api_key: 'qs_live_X', webhook_secret: 'whs', webhook_token: 'tok', enabled: true });
    expect(next.api_key).toBe('qs_live_X');
    expect(next.webhook_secret).toBe('whs');
    expect(next.webhook_token).toBe('tok');
    expect(next.enabled).toBe(true);
  });

  it('leaves QuickShop secrets untouched when omitted', () => {
    const next = buildIntegrationPatch('quickshop', { api_key: 'qs_live_OLD', webhook_secret: 'oldwhs' }, { enabled: false });
    expect(next.api_key).toBe('qs_live_OLD');
    expect(next.webhook_secret).toBe('oldwhs');
    expect(next.enabled).toBe(false);
  });
});
