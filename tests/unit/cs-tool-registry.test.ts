import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/whatsapp-cloud/client', () => ({ toWaId: (s: string) => s.replace(/\D/g, '').replace(/^0/, '972') }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }), in: () => ({}) }) }) }) } }));

import { buildCsToolset } from '@/lib/cs/tools/registry';

const names = (r: { defs: any[] }) => r.defs.map((d) => d.function.name).sort();
const QUICKSHOP = { integrations: { quickshop: { api_key: 'k' } } };

describe('buildCsToolset (archetype-aware registry, spec §4)', () => {
  it('WHATSAPP-PARITY ANCHOR: pre-bind whatsapp = exactly today’s 10 tools', () => {
    expect(names(buildCsToolset({ channel: 'whatsapp', account: null }))).toEqual([
      'bind_brand', 'escalate_to_human', 'list_open_threads', 'lookup_order', 'lookup_orders_by_phone',
      'open_or_attach_ticket', 'remember_name', 'resolve_brand', 'search_products', 'show_products',
    ]);
  });

  it('bound brand with an orders provider on whatsapp = the same full 10 (post-bind parity)', () => {
    expect(names(buildCsToolset({ channel: 'whatsapp', account: { archetype: 'brand', config: QUICKSHOP } }))).toHaveLength(10);
  });

  it('missing archetype defaults to brand (today’s CS accounts predate config.archetype)', () => {
    expect(names(buildCsToolset({ channel: 'whatsapp', account: { config: QUICKSHOP } }))).toHaveLength(10);
  });

  it('brand WITHOUT an orders provider loses ONLY the two order tools', () => {
    const n = names(buildCsToolset({ channel: 'whatsapp', account: { archetype: 'brand', config: {} } }));
    expect(n).not.toContain('lookup_order');
    expect(n).not.toContain('lookup_orders_by_phone');
    expect(n).toContain('search_products');
    expect(n).toHaveLength(8);
  });

  it('a shopify admin token also counts as an orders provider', () => {
    const n = names(buildCsToolset({ channel: 'whatsapp', account: { archetype: 'brand', config: { integrations: { shopify: { admin_api_token: 't' } } } } }));
    expect(n).toContain('lookup_order');
  });

  it('resolve/bind_brand are whatsapp-only: a widget brand account gets neither', () => {
    const n = names(buildCsToolset({ channel: 'widget', account: { archetype: 'brand', config: QUICKSHOP } }));
    expect(n).not.toContain('resolve_brand');
    expect(n).not.toContain('bind_brand');
    expect(n).toContain('lookup_order');
    expect(n).toContain('search_products');
  });

  it('government_ministry = escalation + name only; service_provider = tickets + escalation, no orders/products', () => {
    expect(names(buildCsToolset({ channel: 'widget', account: { archetype: 'government_ministry', config: {} } })))
      .toEqual(['escalate_to_human', 'remember_name']);
    expect(names(buildCsToolset({ channel: 'widget', account: { archetype: 'service_provider', config: QUICKSHOP } })))
      .toEqual(['escalate_to_human', 'list_open_threads', 'open_or_attach_ticket', 'remember_name']);
  });

  it('tools and defs stay in lockstep (the loop dispatches only what the model was offered)', () => {
    const r = buildCsToolset({ channel: 'web_chat', account: { archetype: 'service_provider', config: {} } });
    expect(r.tools.map((t) => t.def.function.name).sort()).toEqual(names(r));
  });
});
