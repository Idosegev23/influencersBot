/**
 * Coexistence sync payloads carry another business's WhatsApp contacts and chat history —
 * names, phone numbers, message text. Spec D6: ACK and discard. Discarding in processing was
 * not enough: the webhook persists the raw payload for audit BEFORE processing, so LA
 * BEAUTÉ's contact list landed in whatsapp_webhook_events on 2026-10-11.
 *
 * This returns the payload with every `history` / `smb_app_state_sync` value replaced by
 * counts only. Everything else passes through untouched.
 */
const SYNC_FIELDS = new Set(['history', 'smb_app_state_sync']);

function summarise(value: any) {
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(value ?? {})) {
    if (k !== 'metadata' && Array.isArray(v)) counts[k] = v.length;
  }
  return { metadata: value?.metadata ?? null, redacted: true, counts };
}

export function redactCoexistenceSync(payload: any): any {
  if (!payload || !Array.isArray(payload.entry)) return payload;
  let touched = false;
  const entry = payload.entry.map((e: any) => {
    if (!Array.isArray(e?.changes)) return e;
    const changes = e.changes.map((c: any) => {
      if (!SYNC_FIELDS.has(c?.field)) return c;
      touched = true;
      return { ...c, value: summarise(c.value) };
    });
    return { ...e, changes };
  });
  return touched ? { ...payload, entry } : payload;
}
