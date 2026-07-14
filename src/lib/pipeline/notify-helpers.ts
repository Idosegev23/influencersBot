import { toWaId } from '@/lib/whatsapp-cloud/client';

const DEFAULT_RECIPIENTS = ['972523000584', '972547667775', '972545980677'];

/** Parse SCAN_NOTIFY_RECIPIENTS (comma list) → normalized wa ids, with defaults. */
export function parseRecipients(raw: string | undefined | null): string[] {
  const list = (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
  return (list.length ? list : DEFAULT_RECIPIENTS).map((p) => toWaId(p));
}

/** Brand label for the notification body. */
export function resolveBrandName(config: any, jobUsername: string): string {
  return config?.display_name || config?.username || jobUsername || 'החשבון';
}
