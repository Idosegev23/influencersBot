/** Attribution tiers, in resolution order. First tier that matches wins. */
export type Tier = 'direct' | 'assisted' | 'influenced' | 'none';

/** Which key produced the match — reported so a number can be defended. */
export type MatchKey = 'utm' | 'anon_id' | 'phone' | 'email' | null;

/**
 * Every metric is wrapped in this envelope. `measured: false` means there is no
 * data source for it — it renders as "not measured" and NEVER as 0.
 * `basis` is a short human string naming what the value was computed from.
 */
export interface Metric<T = number> {
  value: T | null;
  n: number;
  measured: boolean;
  lowConfidence: boolean;
  basis: string;
}

/** One Bestie touch: a conversation event carrying at least one identity key. */
export interface TouchRecord {
  touchAt: number;            // epoch ms
  surface: 'chat' | 'widget' | 'support' | 'lead' | 'whatsapp_cs';
  anonId: string | null;
  phone: string | null;       // already normalized
  email: string | null;       // already normalized
}

export interface AttributableOrder {
  id: string;
  occurredAt: number;         // epoch ms — placed_at
  amount: number;
  utmSource: string | null;
  anonId: string | null;      // from the thank-you beacon, else null
  phone: string | null;       // already normalized
  email: string | null;       // already normalized
}

export interface AttributableCart {
  id: string;
  occurredAt: number;         // epoch ms — abandoned_at
  amount: number;
  email: string | null;       // already normalized
}

export interface Attribution {
  tier: Tier;
  matchKey: MatchKey;
  touchAt: number | null;
  lagSec: number | null;
}

export const LOW_CONFIDENCE_N = 30;
export const ASSISTED_WINDOW_MS = 24 * 60 * 60 * 1000;
export const INFLUENCED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
