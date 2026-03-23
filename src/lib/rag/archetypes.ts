/**
 * Account Archetype System
 *
 * Different account types need different content priorities in RAG retrieval.
 * Each archetype defines:
 * - typeWeights: similarity bonus/penalty per entity_type (applied during heuristic scoring)
 * - typeCaps: max chunks per entity_type in results (replaces hardcoded 8)
 * - docCap: max chunks per document in results (replaces hardcoded 4)
 * - recencyMultiplier: multiplier for recency bonus (default 1.0)
 * - contentBudgets: max chunks per entity_type at ingestion time
 */

import type { EntityType } from './types';

// ============================================
// Types
// ============================================

export type AccountArchetype =
  | 'influencer'
  | 'brand'
  | 'service_provider'
  | 'media_news'
  | 'local_business'
  | 'tech_creator'
  | 'default';

export interface ArchetypeConfig {
  typeWeights: Partial<Record<EntityType, number>>;
  typeCaps: Partial<Record<EntityType, number>>;
  docCap: number;
  recencyMultiplier?: number;
  contentBudgets?: Partial<Record<EntityType, number>>;
}

// ============================================
// Archetype Definitions
// ============================================

export const ARCHETYPE_CONFIGS: Record<AccountArchetype, ArchetypeConfig> = {
  /**
   * Influencer / content creator (e.g. danielamit)
   * Coupons and partnerships are high-value; website content (recipes, blog) is background noise.
   */
  influencer: {
    typeWeights: {
      coupon: +0.15,
      partnership: +0.12,
      post: +0.05,
      transcription: +0.03,
      highlight: 0,
      knowledge_base: +0.05,
      document: 0,
      website: -0.08,
    },
    typeCaps: {
      coupon: 8,
      partnership: 6,
      post: 6,
      transcription: 4,
      highlight: 3,
      knowledge_base: 4,
      document: 3,
      website: 3,
    },
    docCap: 3,
  },

  /**
   * Brand / e-commerce (e.g. Moroccanoil, Clinique, Tambour)
   * Website IS the main content (product pages). Posts support brand awareness.
   */
  brand: {
    typeWeights: {
      website: +0.10,
      post: +0.05,
      coupon: +0.08,
      partnership: +0.03,
      transcription: 0,
      highlight: 0,
      knowledge_base: +0.05,
      document: +0.03,
    },
    typeCaps: {
      website: 8,
      post: 6,
      coupon: 6,
      partnership: 4,
      transcription: 3,
      highlight: 3,
      knowledge_base: 4,
      document: 3,
    },
    docCap: 4,
  },

  /**
   * Service provider / B2B (e.g. LDRS GROUP)
   * Services, case studies, and knowledge base are high-value. No coupons typically.
   */
  service_provider: {
    typeWeights: {
      website: +0.10,
      knowledge_base: +0.10,
      document: +0.05,
      post: +0.03,
      transcription: +0.03,
      partnership: -0.05,
      coupon: -0.05,
      highlight: 0,
    },
    typeCaps: {
      website: 8,
      knowledge_base: 6,
      document: 4,
      post: 4,
      transcription: 3,
      partnership: 3,
      coupon: 2,
      highlight: 3,
    },
    docCap: 4,
  },

  /**
   * Media / news / entertainment (e.g. Israel Bidur, Guy Pines, Eran Swissa)
   * Latest posts and transcriptions are most important. Recency is critical.
   * No coupons, no product partnerships.
   */
  media_news: {
    typeWeights: {
      post: +0.10,
      transcription: +0.08,
      highlight: +0.03,
      website: 0,
      knowledge_base: +0.03,
      coupon: -0.10,
      partnership: -0.05,
      document: 0,
    },
    typeCaps: {
      post: 10,
      transcription: 12,
      highlight: 4,
      website: 0,
      knowledge_base: 3,
      coupon: 0,
      partnership: 0,
      document: 2,
    },
    docCap: 3,
    recencyMultiplier: 3.0,
  },

  /**
   * Local business (e.g. Sorotzkin deli)
   * Website (menu, hours, location) and knowledge base are main content.
   */
  local_business: {
    typeWeights: {
      website: +0.12,
      knowledge_base: +0.10,
      post: +0.05,
      transcription: +0.03,
      coupon: +0.05,
      partnership: -0.05,
      highlight: 0,
      document: 0,
    },
    typeCaps: {
      website: 8,
      knowledge_base: 6,
      post: 4,
      transcription: 3,
      coupon: 4,
      partnership: 2,
      highlight: 3,
      document: 2,
    },
    docCap: 4,
  },

  /**
   * Tech / career creator (e.g. Lina Flat)
   * Posts (tips, tutorials) and transcriptions are primary content.
   */
  tech_creator: {
    typeWeights: {
      post: +0.08,
      transcription: +0.05,
      knowledge_base: +0.05,
      website: +0.03,
      highlight: 0,
      coupon: -0.08,
      partnership: -0.03,
      document: 0,
    },
    typeCaps: {
      post: 6,
      transcription: 5,
      website: 4,
      knowledge_base: 4,
      highlight: 3,
      coupon: 2,
      partnership: 3,
      document: 3,
    },
    docCap: 4,
  },

  /**
   * Default — no adjustments. Backward compatible with current behavior.
   */
  default: {
    typeWeights: {},
    typeCaps: {},
    docCap: 4,
  },
};

// ============================================
// Helper
// ============================================

export function getArchetypeConfig(archetype?: string | null): ArchetypeConfig {
  if (archetype && archetype in ARCHETYPE_CONFIGS) {
    return ARCHETYPE_CONFIGS[archetype as AccountArchetype];
  }
  return ARCHETYPE_CONFIGS.default;
}
