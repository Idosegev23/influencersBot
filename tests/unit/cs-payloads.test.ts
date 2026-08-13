import { describe, it, expect } from 'vitest';
import { derivePayload } from '@/lib/cs/payloads';

describe('derivePayload (spec §6 — structured CS screens)', () => {
  it('lookup_order found → order_status_card with tracking + shipment projection', () => {
    const p = derivePayload('lookup_order', { ok: true, data: {
      kind: 'found', orderNumber: '1042', status: 'fulfilled', placedAt: '2026-07-01T00:00:00Z',
      total: '199.00', itemSummary: '2× Argan Oil', trackingUrls: ['https://t/1'],
      shipment: { statusText: 'נמסר' },
    } });
    expect(p).toEqual({ kind: 'order_status_card', order: {
      orderNumber: '1042', status: 'fulfilled', placedAt: '2026-07-01T00:00:00Z',
      total: '199.00', itemSummary: '2× Argan Oil', trackingUrl: 'https://t/1', shipmentText: 'נמסר',
    } });
  });

  it('lookup_order identity_required → details_form(phone_and_order); by_phone → details_form(phone)', () => {
    expect(derivePayload('lookup_order', { ok: true, data: { kind: 'identity_required' } }))
      .toEqual({ kind: 'details_form', need: 'phone_and_order' });
    expect(derivePayload('lookup_orders_by_phone', { ok: true, data: { kind: 'identity_required' } }))
      .toEqual({ kind: 'details_form', need: 'phone' });
  });

  it('ticket-creating tools → ticket_confirmation; escalation → escalation_notice', () => {
    expect(derivePayload('open_or_attach_ticket', { ok: true, data: { ticketId: 't-9' } }))
      .toEqual({ kind: 'ticket_confirmation', ticketId: 't-9' });
    expect(derivePayload('bind_brand', { ok: true, data: { brand: 'X', ticketId: 't-3' } }))
      .toEqual({ kind: 'ticket_confirmation', ticketId: 't-3' });
    expect(derivePayload('escalate_to_human', { ok: true, escalated: true, data: { handed_off: true } }))
      .toEqual({ kind: 'escalation_notice' });
  });

  it('null cases: not_found/unverified/escalate lookups, disabled escalation, unrelated tools', () => {
    expect(derivePayload('lookup_order', { ok: true, data: { kind: 'not_found' } })).toBeNull();
    expect(derivePayload('lookup_order', { ok: true, data: { kind: 'unverified' } })).toBeNull();
    expect(derivePayload('lookup_order', { ok: true, data: { kind: 'escalate' } })).toBeNull();
    expect(derivePayload('escalate_to_human', { ok: true, data: { handed_off: false } })).toBeNull();
    expect(derivePayload('bind_brand', { ok: true, data: { brand: 'X', ticketId: null } })).toBeNull();
    expect(derivePayload('search_products', { ok: true, data: { products: [] } })).toBeNull();
    expect(derivePayload('remember_name', { ok: true, learnedName: 'דנה', data: {} })).toBeNull();
  });
});
