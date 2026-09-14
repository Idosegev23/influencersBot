/**
 * Strips server-only data out of an Influencer before it crosses to a browser.
 *
 * `getInfluencerByUsername` selects `accounts.*` and hands back the whole
 * `accounts.config` as `_rawConfig`. That blob holds live credentials —
 * widget.managementToken (the /manage login), integrations.quickshop api_key /
 * webhook_secret / webhook_token, integrations.shopify.admin_api_token,
 * onboarding.token, shipping_webhook.hmac_secret — plus internal settings
 * (whatsapp_cs.test_numbers, escalation recipients). The old version removed
 * two keys and passed the rest, and /api/influencer/profile is public, so all
 * of it was readable by anyone who knew a username (verified live 2026-09-02).
 *
 * Two projections now:
 *   • anonymous  → an ALLOW-LIST of what the public chat page renders from.
 *                  Anything new in config stays private until added here.
 *   • the account's own session → the config, with every credential removed
 *                  (the widget editor seeds its form from it).
 *
 * security_config (password hash) is dropped from both.
 */

/** config keys whose values are credentials in their entirety */
const SECRET_CONFIG_KEYS = ['onboarding', 'shipping_webhook'] as const;

/** A string under a key named like this is a credential, wherever it sits. */
const CREDENTIAL_KEY_RE = /(token|secret|password|passwd|api_?key|apikey|hash|private_?key|credentials?)$/i;

function stripCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCredentials);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (CREDENTIAL_KEY_RE.test(k) && (typeof v === 'string' || (v && typeof v === 'object'))) continue;
    out[k] = stripCredentials(v);
  }
  return out;
}

function pick(obj: any, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/**
 * The public chat page (src/app/chat/[username]/page.tsx) and the banner
 * resolver (src/lib/widget/banner.ts) are the anonymous readers. Keep this in
 * step with them — and only ever add settings, never credentials.
 */
function publicConfig(raw: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const passThrough = [
    'username',
    'display_name',
    'support_categories',
    'support_redirect_to_tab',
    'influencer_registry',
    'platform_workspaces',
    'case_studies',
    'reels',
    'overrides',
    'greeting_message',
    'chat_subtitle',
    'theme',
    'archetype',
    'language',
  ] as const;
  for (const k of passThrough) if (raw[k] !== undefined) out[k] = raw[k];

  if (raw.cs_web) out.cs_web = pick(raw.cs_web, ['enabled']);
  if (raw.shipment_provider) out.shipment_provider = pick(raw.shipment_provider, ['enabled', 'delivery_eta_business_days']);
  if (raw.chat) out.chat = pick(raw.chat, ['banner']);
  if (raw.widget) out.widget = pick(raw.widget, ['banner', 'teaser', 'tooltip', 'primaryColor', 'coverImage']);

  return stripCredentials(out) as Record<string, unknown>;
}

function ownerConfig(raw: Record<string, any>): Record<string, unknown> {
  const safeConfig: Record<string, any> = { ...raw };
  for (const key of SECRET_CONFIG_KEYS) delete safeConfig[key];
  return stripCredentials(safeConfig) as Record<string, unknown>;
}

export function sanitizeInfluencerForClient<T extends Record<string, any>>(
  influencer: T | null,
  opts: { isOwner?: boolean } = {},
): T | null {
  if (!influencer) return null;

  const { security_config: _dropped, admin_password_hash: _hash, ...safe } = influencer as Record<string, any>;

  const rawConfig = influencer._rawConfig;
  if (rawConfig && typeof rawConfig === 'object') {
    safe._rawConfig = opts.isOwner ? ownerConfig(rawConfig) : publicConfig(rawConfig);
  }

  return safe as T;
}
