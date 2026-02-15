/**
 * Archetypes Index
 * נקודת כניסה מרכזית לכל הארכיטיפים
 */

import { ArchetypeType } from './types';
import { BaseArchetype } from './baseArchetype';

// Import all archetypes
import { createSkincareArchetype } from './skincare';
import { createFashionArchetype } from './fashion';
import { createCookingArchetype } from './cooking';
import { createFitnessArchetype } from './fitness';
import { createParentingArchetype } from './parenting';
import { createCouponsArchetype } from './coupons';
import { createTechArchetype } from './tech';
import { createTravelArchetype } from './travel';
import { createMindsetArchetype } from './mindset';
import { createInteriorArchetype } from './interior';
import { createGeneralArchetype } from './general';

// ============================================
// Archetype Factory
// ============================================

export class ArchetypeFactory {
  private static archetypes: Map<ArchetypeType, BaseArchetype> = new Map();

  /**
   * Get archetype instance by type
   */
  static get(type: ArchetypeType): BaseArchetype {
    if (!this.archetypes.has(type)) {
      this.archetypes.set(type, this.create(type));
    }

    return this.archetypes.get(type)!;
  }

  /**
   * Create archetype instance
   */
  private static create(type: ArchetypeType): BaseArchetype {
    switch (type) {
      case 'skincare':
        return createSkincareArchetype();
      case 'fashion':
        return createFashionArchetype();
      case 'cooking':
        return createCookingArchetype();
      case 'fitness':
        return createFitnessArchetype();
      case 'parenting':
        return createParentingArchetype();
      case 'coupons':
        return createCouponsArchetype();
      case 'tech':
        return createTechArchetype();
      case 'travel':
        return createTravelArchetype();
      case 'mindset':
        return createMindsetArchetype();
      case 'interior':
        return createInteriorArchetype();
      case 'general':
      default:
        return createGeneralArchetype();
    }
  }

  /**
   * Get all archetype types
   */
  static getAllTypes(): ArchetypeType[] {
    return [
      'skincare',
      'fashion',
      'cooking',
      'fitness',
      'parenting',
      'coupons',
      'tech',
      'travel',
      'mindset',
      'interior',
      'general',
    ];
  }

  /**
   * Clear cache (useful for testing)
   */
  static clearCache(): void {
    this.archetypes.clear();
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Get archetype by type
 */
export function getArchetype(type: ArchetypeType): BaseArchetype {
  return ArchetypeFactory.get(type);
}

/**
 * Process message with specific archetype
 */
export async function processWithArchetype(
  type: ArchetypeType,
  userMessage: string,
  knowledgeBase: any,
  context: {
    conversationHistory?: any[];
    userName?: string;
    accountContext: {
      accountId: string;
      username: string;
      influencerName: string;
    };
    onToken?: (token: string) => void;
  }
) {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 [ARCHETYPE PROCESSING]');
  console.log('='.repeat(80));
  console.log(`📋 Type: ${type}`);
  console.log(`👤 Influencer: ${context.accountContext.influencerName}`);
  console.log(`💬 Message: ${userMessage.substring(0, 100)}...`);
  console.log(`⚡ Streaming: ${context.onToken ? 'YES' : 'NO'}`);
  console.log('\n📚 Knowledge Base Content:');
  console.log(`   Posts: ${knowledgeBase.posts?.length || 0}`);
  console.log(`   Highlights: ${knowledgeBase.highlights?.length || 0}`);
  console.log(`   Coupons: ${knowledgeBase.coupons?.length || 0}`);
  console.log(`   Partnerships: ${knowledgeBase.partnerships?.length || 0}`);
  console.log(`   Insights: ${knowledgeBase.insights?.length || 0}`);
  console.log(`   Websites: ${knowledgeBase.websites?.length || 0}`);
  
  // הדפס את הקופונים בפועל אם יש
  if (knowledgeBase.coupons?.length > 0) {
    console.log('\n💰 Available Coupons:');
    knowledgeBase.coupons.forEach((c: any, i: number) => {
      console.log(`   ${i + 1}. ${c.brand} - ${c.code} (${c.discount})`);
    });
  }
  
  // הדפס את הפוסטים בפועל אם יש
  if (knowledgeBase.posts?.length > 0) {
    console.log('\n📸 Relevant Posts:');
    knowledgeBase.posts.slice(0, 3).forEach((p: any, i: number) => {
      console.log(`   ${i + 1}. ${p.caption?.substring(0, 80)}...`);
    });
  }
  
  console.log('='.repeat(80) + '\n');
  
  const archetype = getArchetype(type);
  const result = await archetype.process({
    userMessage,
    knowledgeBase,
    conversationHistory: context.conversationHistory,
    userName: context.userName,
    accountContext: context.accountContext,
    onToken: context.onToken,
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ [ARCHETYPE RESULT]');
  console.log('='.repeat(80));
  console.log(`📝 Response Preview: ${result.response.substring(0, 150)}...`);
  console.log(`🛡️  Guardrails Triggered: ${result.triggeredGuardrails.length}`);
  if (result.triggeredGuardrails.length > 0) {
    result.triggeredGuardrails.forEach((g: any) => {
      console.log(`   - ${g.ruleId} (${g.severity}): ${g.message}`);
    });
  }
  console.log('='.repeat(80) + '\n');
  
  return result;
}

// ============================================
// Export all types
// ============================================

export * from './types';
export * from './baseArchetype';
export * from './intentRouter';
