/**
 * Personality Wrapper - Layer 1
 * מעטפת האישיות - הופכת תשובה גנרית לתשובה בסגנון המשפיענית
 */

// ============================================
// Type Definitions
// ============================================

export interface PersonalityConfig {
  // Narrative Perspective
  narrativePerspective: 'sidekick-professional' | 'sidekick-personal' | 'direct';
  // "היא אומרת...", "אנחנו ממליצות..." vs "אני ממליצה..."
  
  // Sass & Spice
  sassLevel: number; // 0-10, where 0=very formal, 10=very sassy
  
  // Life Context
  lifeContextInjection: boolean; // האם להזריק "עוגני מציאות" מסטוריז
  currentLocation?: string; // "היא עכשיו בפריז"
  currentActivity?: string; // "היא בדיוק מצלמת"
  
  // Storytelling
  storytellingMode: 'anecdotal' | 'concise' | 'balanced';
  // anecdotal = סיפורי ומפורט, concise = קצר ותכליתי
  
  // Slang Map
  slangMap: Record<string, string>; // { "amazing": "מדהים", "love": "אוהבת" }
  
  // Emoji Strategy
  emojiUsage: 'none' | 'minimal' | 'moderate' | 'heavy';
  emojiTypes: string[]; // Preferred emojis: ["✨", "💕", "🔥"]
  
  // Message Structure
  messageStructure: 'whatsapp' | 'formal' | 'chat';
  // whatsapp = short paragraphs with line breaks
  // formal = longer structured response
  // chat = conversational back-and-forth
  
  // Linguistic DNA
  commonPhrases: string[]; // "בדיוק כמו שהיא תמיד אומרת..."
  signatureStyle: string; // "זה הסוד שלה..."
}

export interface ResponseWrapperInput {
  rawResponse: string; // התשובה הגנרית מה-AI
  archetype?: string; // איזה ארכיטיפ השתמש (skincare, fashion, etc.)
  context?: {
    userName?: string;
    conversationHistory?: string[];
    recentPosts?: any[];
  };
}

export interface WrappedResponse {
  text: string;
  metadata: {
    usedPerspective: string;
    sassLevel: number;
    emojiCount: number;
    lifeContextInjected: boolean;
  };
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_PERSONALITY: PersonalityConfig = {
  narrativePerspective: 'sidekick-professional',
  sassLevel: 5,
  lifeContextInjection: false, // ⚡ Disabled to avoid fluff
  storytellingMode: 'concise', // ⚡ Changed to concise
  slangMap: {
    'amazing': 'מדהים',
    'love': 'אוהבת',
    'recommend': 'ממליצה',
    'favorite': 'האהובה',
    'always': 'תמיד',
  },
  emojiUsage: 'minimal', // ⚡ Changed to minimal
  emojiTypes: ['✨', '💕', '🌟', '👌', '💪', '🔥'],
  messageStructure: 'whatsapp',
  commonPhrases: [
    'בדיוק כמו שהיא תמיד אומרת',
    'זה הסוד שלה',
    'היא מקפידה על זה',
    'זה משהו שהיא תמיד עושה',
  ],
  signatureStyle: 'היא אוהבת',
};

// ============================================
// Personality Wrapper Class
// ============================================

export class PersonalityWrapper {
  constructor(private config: PersonalityConfig) {}

  /**
   * Wrap a raw AI response with personality
   */
  wrap(input: ResponseWrapperInput): WrappedResponse {
    let text = input.rawResponse;

    // 1. Apply narrative perspective
    text = this.applyNarrativePerspective(text);

    // 2. Add life context if enabled
    const lifeContextInjected = this.config.lifeContextInjection && this.maybeInjectLifeContext(text);
    if (lifeContextInjected) {
      text = lifeContextInjected;
    }

    // 3. Apply slang map
    text = this.applySlangMap(text);

    // 4. Add emojis based on strategy
    const emojiCount = this.addEmojis(text);
    text = emojiCount.text;

    // 5. Format message structure
    text = this.formatMessageStructure(text);

    // 6. Maybe add signature phrase - DISABLED to avoid incomplete sentences
    // if (Math.random() < 0.3 && this.config.commonPhrases.length > 0) {
    //   const phrase = this.config.commonPhrases[Math.floor(Math.random() * this.config.commonPhrases.length)];
    //   text = this.insertSignaturePhrase(text, phrase);
    // }

    return {
      text,
      metadata: {
        usedPerspective: this.config.narrativePerspective,
        sassLevel: this.config.sassLevel,
        emojiCount: emojiCount.count,
        lifeContextInjected: !!lifeContextInjected,
      },
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private applyNarrativePerspective(text: string): string {
    switch (this.config.narrativePerspective) {
      case 'sidekick-professional':
        // Convert first person to third person plural
        // "אני ממליצה" -> "אנחנו ממליצות" or "היא ממליצה"
        text = text.replace(/\bאני\b/g, (match, offset) => {
          // Use "היא" for facts, "אנחנו" for recommendations
          return text.substring(offset, offset + 20).includes('ממליצ') ? 'אנחנו' : 'היא';
        });
        text = text.replace(/\bשלי\b/g, 'שלה');
        text = text.replace(/\bלי\b/g, 'לה');
        break;
        
      case 'sidekick-personal':
        // Use "אנחנו" throughout
        text = text.replace(/\bאני\b/g, 'אנחנו');
        text = text.replace(/\bממליצה\b/g, 'ממליצות');
        text = text.replace(/\bאומרת\b/g, 'אומרות');
        break;
        
      case 'direct':
        // Keep first person as is
        break;
    }

    return text;
  }

  private maybeInjectLifeContext(text: string): string | false {
    if (!this.config.currentLocation && !this.config.currentActivity) {
      return false;
    }

    // Inject life context at the beginning (10% chance) or in the middle (20% chance)
    const shouldInject = Math.random() < 0.3;
    if (!shouldInject) return false;

    let contextPhrase = '';
    
    if (this.config.currentLocation) {
      contextPhrase = `דרך אגב, היא כרגע ב${this.config.currentLocation} `;
    } else if (this.config.currentActivity) {
      contextPhrase = `היא בדיוק ${this.config.currentActivity} אבל `;
    }

    if (!contextPhrase) return false;

    // Insert at beginning or after first sentence
    if (Math.random() < 0.5) {
      return contextPhrase + text;
    } else {
      const firstSentence = text.split(/[.!?]/, 2);
      if (firstSentence.length > 1) {
        return firstSentence[0] + '. ' + contextPhrase + text.substring(firstSentence[0].length + 1);
      }
      return contextPhrase + text;
    }
  }

  private applySlangMap(text: string): string {
    let result = text;

    for (const [standard, slang] of Object.entries(this.config.slangMap)) {
      const regex = new RegExp(`\\b${standard}\\b`, 'gi');
      result = result.replace(regex, slang);
    }

    return result;
  }

  private addEmojis(text: string): { text: string; count: number } {
    if (this.config.emojiUsage === 'none') {
      return { text, count: 0 };
    }

    const sentences = text.split(/([.!?])/);
    let emojiCount = 0;

    const densityMap = {
      minimal: 0.1,  // 10% of sentences
      moderate: 0.3, // 30% of sentences
      heavy: 0.6,    // 60% of sentences
    };

    const density = densityMap[this.config.emojiUsage] || 0.3;
    const emojis = this.config.emojiTypes;

    if (emojis.length === 0) {
      return { text, count: 0 };
    }

    for (let i = 0; i < sentences.length; i += 2) {
      if (Math.random() < density) {
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        sentences[i] = sentences[i].trim() + ' ' + emoji;
        emojiCount++;
      }
    }

    return {
      text: sentences.join(''),
      count: emojiCount,
    };
  }

  private formatMessageStructure(text: string): string {
    switch (this.config.messageStructure) {
      case 'whatsapp':
        // Short paragraphs with line breaks
        return text
          .split(/\n/)
          .map(para => para.trim())
          .filter(Boolean)
          .join('\n\n');
        
      case 'formal':
        // Keep as is, ensure proper spacing
        return text.trim();
        
      case 'chat':
        // Conversational with shorter sentences
        return text
          .replace(/\. /g, '.\n')
          .split('\n')
          .filter(Boolean)
          .join('\n');
        
      default:
        return text;
    }
  }

  private insertSignaturePhrase(text: string, phrase: string): string {
    // Insert signature phrase somewhere natural (after first sentence or at the end)
    const sentences = text.split(/[.!?]/);
    
    if (sentences.length > 2 && Math.random() < 0.7) {
      // Insert after first sentence
      return sentences[0] + '. ' + phrase + ' - ' + text.substring(sentences[0].length + 1);
    } else {
      // Add at the end
      return text + '\n\n' + phrase + '.';
    }
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(updates: Partial<PersonalityConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): PersonalityConfig {
    return { ...this.config };
  }
}

// ============================================
// Personality Builder (from DB)
// ============================================

/**
 * Build personality config from database persona
 */
export async function buildPersonalityFromDB(accountId: string): Promise<PersonalityConfig> {
  const supabase = await createClient();

  const { data: persona, error } = await supabase
    .from('chatbot_persona')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (error || !persona) {
    console.warn(`[PersonalityWrapper] No persona found for account ${accountId}, using defaults`);
    return DEFAULT_PERSONALITY;
  }

  // Map DB persona to personality config
  const config: PersonalityConfig = {
    narrativePerspective: persona.narrative_perspective || 'sidekick-professional',
    sassLevel: persona.sass_level || 5,
    lifeContextInjection: persona.life_context_injection !== false,
    currentLocation: persona.current_location,
    currentActivity: persona.current_activity,
    storytellingMode: persona.storytelling_mode || 'balanced',
    slangMap: persona.slang_map || DEFAULT_PERSONALITY.slangMap,
    emojiUsage: persona.emoji_usage || 'moderate',
    emojiTypes: persona.emoji_types || DEFAULT_PERSONALITY.emojiTypes,
    messageStructure: persona.message_structure || 'whatsapp',
    commonPhrases: persona.common_phrases || DEFAULT_PERSONALITY.commonPhrases,
    signatureStyle: persona.signature_style || '',
  };

  return config;
}

// ============================================
// Migration: Add columns to chatbot_persona
// ============================================
// Note: These fields should be added to the chatbot_persona table:
//
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS narrative_perspective TEXT DEFAULT 'sidekick-professional';
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS sass_level INTEGER DEFAULT 5 CHECK (sass_level >= 0 AND sass_level <= 10);
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS life_context_injection BOOLEAN DEFAULT true;
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS current_location TEXT;
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS current_activity TEXT;
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS storytelling_mode TEXT DEFAULT 'balanced';
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS slang_map JSONB DEFAULT '{}'::jsonb;
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS emoji_types TEXT[] DEFAULT ARRAY['✨', '💕', '🌟']::TEXT[];
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS message_structure TEXT DEFAULT 'whatsapp';
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS common_phrases TEXT[] DEFAULT ARRAY[]::TEXT[];
// ALTER TABLE chatbot_persona ADD COLUMN IF NOT EXISTS signature_style TEXT;

// ============================================
// Convenience Functions
// ============================================

/**
 * Wrap a response with personality
 */
export async function wrapResponseWithPersonality(
  accountId: string,
  rawResponse: string,
  archetype?: string,
  context?: any
): Promise<string> {
  const config = await buildPersonalityFromDB(accountId);
  const wrapper = new PersonalityWrapper(config);
  
  const wrapped = wrapper.wrap({
    rawResponse,
    archetype,
    context,
  });

  return wrapped.text;
}

/**
 * Create personality wrapper from account
 */
export async function createPersonalityWrapper(accountId: string): Promise<PersonalityWrapper> {
  const config = await buildPersonalityFromDB(accountId);
  return new PersonalityWrapper(config);
}

/**
 * Import for createClient
 */
import { createClient } from '@/lib/supabase/server';
