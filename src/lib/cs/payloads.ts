// Structured CS screens (CS-engine spec 2026-08-12 §6): typed UI payloads derived from tool
// results inside the agent loop. Web surfaces render components from these; WhatsApp ignores
// them entirely (the model's prose IS the text projection). Additive — never load-bearing for
// the reply: a channel that doesn't recognize a payload still has the full answer in the text.
import type { CsToolResult } from './tools/types';

export type CsUiPayload =
  | { kind: 'order_status_card'; order: { orderNumber?: string; status?: string; placedAt?: string; total?: string; itemSummary?: string; trackingUrl?: string; shipmentText?: string } }
  | { kind: 'details_form'; need: 'phone_and_order' | 'phone' }
  | { kind: 'ticket_confirmation'; ticketId: string }
  | { kind: 'escalation_notice' };

/** Pure mapper: one tool result → at most one payload. The loop dedupes by kind (last wins). */
export function derivePayload(toolName: string, result: CsToolResult): CsUiPayload | null {
  const data: any = result?.data ?? {};

  if (toolName === 'lookup_order') {
    if (data.kind === 'found') {
      return {
        kind: 'order_status_card',
        order: {
          orderNumber: data.orderNumber ?? undefined,
          status: data.status ?? undefined,
          placedAt: data.placedAt ?? undefined,
          total: data.total ?? undefined,
          itemSummary: data.itemSummary ?? undefined,
          trackingUrl: data.trackingUrls?.[0] ?? undefined,
          shipmentText: data.shipment?.statusText ?? undefined,
        },
      };
    }
    if (data.kind === 'identity_required') return { kind: 'details_form', need: 'phone_and_order' };
    return null;
  }

  if (toolName === 'lookup_orders_by_phone') {
    if (data.kind === 'identity_required') return { kind: 'details_form', need: 'phone' };
    return null;
  }

  if ((toolName === 'open_or_attach_ticket' || toolName === 'bind_brand') && data.ticketId) {
    return { kind: 'ticket_confirmation', ticketId: String(data.ticketId) };
  }

  if (toolName === 'escalate_to_human' && result.escalated) {
    return { kind: 'escalation_notice' };
  }

  return null;
}
