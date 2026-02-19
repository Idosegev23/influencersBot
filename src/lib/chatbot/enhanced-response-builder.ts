/**
 * Enhanced Response Builder - בניית תשובות מבוססות על המבנה החדש
 * משתמש ב-voice_rules, knowledge_map, boundaries, response_policy
 */

import type { GeminiPersonaOutput } from '../ai/gemini-persona-builder';

// ============================================
// Type Definitions
// ============================================

export interface EnhancedPersona {
  voice_rules?: GeminiPersonaOutput['voice'];
  knowledge_map?: GeminiPersonaOutput['knowledgeMap'];
  boundaries?: GeminiPersonaOutput['boundaries'];
  response_policy?: GeminiPersonaOutput['responsePolicy'];
  preprocessing_data?: any;
}

export interface ResponseStrategy {
  confidence: 'high' | 'medium' | 'low';
  shouldAnswer: boolean;
  approach: 'direct' | 'cautious' | 'refuse';
  reason: string;
  relevantTopics: string[];
}

// ============================================
// Build Context from Knowledge Map
// ============================================

export function buildContextFromKnowledgeMap(
  persona: EnhancedPersona,
  brandsContext: string = '',
  productsContext: string = ''
): string {
  if (!persona.knowledge_map || !persona.knowledge_map.coreTopics) {
    return brandsContext + '\n' + productsContext;
  }

  let context = '';

  // Add voice guidelines
  if (persona.voice_rules) {
    context += `## קול וסגנון תשובה:\n`;
    context += `טון: ${persona.voice_rules.tone}\n`;
    context += `מבנה: ${persona.voice_rules.responseStructure}\n`;
    context += `אורך: ${persona.voice_rules.avgLength}\n`;
    
    if (persona.voice_rules.recurringPhrases && persona.voice_rules.recurringPhrases.length > 0) {
      context += `ביטויים לשימוש: ${persona.voice_rules.recurringPhrases.slice(0, 5).join(', ')}\n`;
    }
    
    if (persona.voice_rules.avoidedWords && persona.voice_rules.avoidedWords.length > 0) {
      context += `מילים להימנע מהן: ${persona.voice_rules.avoidedWords.slice(0, 5).join(', ')}\n`;
    }
    
    context += '\n';
  }

  // Add knowledge map
  context += `## מפת הידע שלי (מבוסס על תוכן אמיתי):\n`;
  
  persona.knowledge_map.coreTopics.forEach(topic => {
    context += `\n### ${topic.name}\n`;
    
    if (topic.keyPoints && topic.keyPoints.length > 0) {
      context += `נקודות מפתח:\n`;
      topic.keyPoints.forEach(point => {
        context += `- ${point}\n`;
      });
    }
    
    if (topic.examples && topic.examples.length > 0) {
      context += `דוגמאות:\n`;
      topic.examples.slice(0, 2).forEach(example => {
        context += `- ${example}\n`;
      });
    }
  });

  // Add boundaries
  if (persona.boundaries) {
    context += `\n## גבולות הידע שלי:\n`;
    context += `נושאים שדיברתי עליהם: ${persona.boundaries.discussed.slice(0, 10).join(', ')}\n`;
    
    if (persona.boundaries.notDiscussed && persona.boundaries.notDiscussed.length > 0) {
      context += `נושאים נוספים: ${persona.boundaries.notDiscussed.slice(0, 5).join(', ')}\n`;
    }
  }

  // Add brands and products
  if (brandsContext) {
    context += '\n' + brandsContext;
  }
  
  if (productsContext) {
    context += '\n' + productsContext;
  }

  return context;
}

// ============================================
// Determine Response Strategy
// ============================================

export function determineResponseStrategy(
  message: string,
  persona: EnhancedPersona
): ResponseStrategy {
  if (!persona.boundaries || !persona.response_policy) {
    // Fallback if persona not fully built
    return {
      confidence: 'medium',
      shouldAnswer: true,
      approach: 'direct',
      reason: 'פרסונה לא מלאה, עונה בזהירות',
      relevantTopics: [],
    };
  }

  const messageLower = message.toLowerCase();

  // Find relevant topics from knowledge map
  const relevantTopics: string[] = [];
  if (persona.knowledge_map?.coreTopics) {
    persona.knowledge_map.coreTopics.forEach(topic => {
      const topicKeywords = [topic.name.toLowerCase(), ...(topic.subtopics || []).map(s => s.toLowerCase())];
      if (topicKeywords.some(kw => messageLower.includes(kw))) {
        relevantTopics.push(topic.name);
      }
    });
  }

  // Check if topic was discussed
  const isDiscussedTopic = persona.boundaries.discussed.some(topic =>
    messageLower.includes(topic.toLowerCase())
  );

  const isNotDiscussedTopic = persona.boundaries.notDiscussed?.some(topic =>
    messageLower.includes(topic.toLowerCase())
  );

  // Determine strategy based on response policy
  if (isNotDiscussedTopic) {
    return {
      confidence: 'low',
      shouldAnswer: false,
      approach: 'refuse',
      reason: 'נושא שלא נידון בתוכן',
      relevantTopics,
    };
  }

  if (isDiscussedTopic && relevantTopics.length > 0) {
    return {
      confidence: 'high',
      shouldAnswer: true,
      approach: 'direct',
      reason: 'נושא שנידון בהרחבה',
      relevantTopics,
    };
  }

  if (relevantTopics.length > 0) {
    return {
      confidence: 'medium',
      shouldAnswer: true,
      approach: 'cautious',
      reason: 'נושא קשור אבל לא מרכזי',
      relevantTopics,
    };
  }

  return {
    confidence: 'low',
    shouldAnswer: true,
    approach: 'cautious',
    reason: 'נושא לא ברור',
    relevantTopics,
  };
}

// ============================================
// Generate Response with Voice Rules
// ============================================

export function buildEnhancedInstructions(
  persona: EnhancedPersona,
  baseInstructions: string,
  strategy: ResponseStrategy
): string {
  let instructions = baseInstructions;

  // Add strategy-specific guidelines
  if (strategy.approach === 'refuse') {
    instructions += `\n\n💡 הנחיה: אם יש תוכן קשור בהקשר — שתף/י אותו. אם אין בכלל — אמור/י בקצרה ותזמין/י לשלוח DM.`;
  } else if (strategy.approach === 'cautious') {
    instructions += `\n\n💡 הנחיה: ענה בזהירות. אם את לא בטוחה במשהו, תגידי זאת במפורש.`;
  }

  // Add relevant topic context
  if (strategy.relevantTopics.length > 0) {
    instructions += `\n\n📌 נושאים רלוונטיים לשאלה: ${strategy.relevantTopics.join(', ')}`;
  }

  // Add confidence level
  instructions += `\n\n🎯 רמת ביטחון: ${strategy.confidence === 'high' ? 'גבוהה' : strategy.confidence === 'medium' ? 'בינונית' : 'נמוכה'}`;

  return instructions;
}
