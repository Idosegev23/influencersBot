/**
 * Turn whatever Make posts into a lead we can act on.
 *
 * Field names vary with how the Make scenario was wired, so each value is read
 * from a small set of aliases rather than one hard-coded key — a renamed field
 * on their side should degrade to a missing value, not to a crash.
 *
 * Two things are deliberately defensive. Attribution IDs come back as empty
 * strings on Meta test leads and are normalised to null, so nothing downstream
 * mistakes "" for a real campaign. And Meta's test-lead placeholders
 * ("<test lead: dummy data for …>") are treated as absent, so a test never
 * results in someone being greeted by a placeholder.
 */
import { normalizeIsraeliPhone } from './phone';

export interface MappedLead {
  leadgenId: string | null;
  formId: string | null;
  adId: string | null;
  adsetId: string | null;
  campaignId: string | null;
  fullName: string | null;
  firstName: string | null;
  email: string | null;
  phoneRaw: string | null;
  waId: string | null;
  deliverable: boolean;
}

const TEST_PLACEHOLDER = '<test lead';

function pick(payload: Record<string, any>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function realNameOrNull(fullName: string | null): string | null {
  if (!fullName || fullName.startsWith(TEST_PLACEHOLDER)) return null;
  return fullName;
}

export function mapMetaLead(payload: Record<string, any>): MappedLead {
  const rawName = pick(payload, 'full_name', 'fullName', 'name', 'שם_מלא');
  const fullName = realNameOrNull(rawName);
  const phoneRaw = pick(payload, 'phone_number', 'phoneNumber', 'phone', 'מספר_טלפון');
  const waId = normalizeIsraeliPhone(phoneRaw);

  return {
    leadgenId: pick(payload, 'leadgen_id', 'leadgenId', 'id'),
    formId: pick(payload, 'form_id', 'formId'),
    adId: pick(payload, 'ad_id', 'adId'),
    adsetId: pick(payload, 'adset_id', 'adsetId'),
    campaignId: pick(payload, 'campaign_id', 'campaignId'),
    fullName,
    firstName: fullName ? fullName.trim().split(/\s+/)[0] || null : null,
    email: pick(payload, 'email', 'email_address'),
    phoneRaw,
    waId,
    deliverable: Boolean(waId),
  };
}
