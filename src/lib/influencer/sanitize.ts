/**
 * Strips server-only secrets out of an Influencer before it crosses to a browser.
 *
 * `getInfluencerByUsername` selects `accounts.*`, so it carries three things that
 * must never leave the server:
 *
 *   • security_config.admin_password_hash — the dashboard login hash
 *   • config.onboarding.token            — this token IS the auth for /onboard/[token]
 *   • config.shipping_webhook.hmac_secret — signs inbound shipment webhooks
 *
 * Anything reaching a client component must go through here first. The public
 * chat page renders for anonymous visitors, so treat every caller as untrusted.
 */

/** config keys whose values are credentials, not settings */
const SECRET_CONFIG_KEYS = ['onboarding', 'shipping_webhook'] as const;

export function sanitizeInfluencerForClient<T extends Record<string, any>>(
  influencer: T | null,
): T | null {
  if (!influencer) return null;

  const { security_config: _dropped, ...safe } = influencer as Record<string, any>;

  // _rawConfig is the raw accounts.config blob; the client only legitimately reads
  // support_categories, support_redirect_to_tab, shipment_provider and
  // influencer_registry out of it. Drop the credential-bearing keys and keep the rest.
  const rawConfig = influencer._rawConfig;
  if (rawConfig && typeof rawConfig === 'object') {
    const safeConfig: Record<string, any> = { ...rawConfig };
    for (const key of SECRET_CONFIG_KEYS) delete safeConfig[key];
    safe._rawConfig = safeConfig;
  }

  return safe as T;
}
