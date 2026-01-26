/**
 * Build enhanced chatbot instructions with persona + knowledge base
 */

type Persona = {
  name: string;
  tone: string;
  language: string;
  bio?: string;
  description?: string;
  interests: string[];
  topics: string[];
  response_style: string;
  emoji_usage: string;
  greeting_message?: string;
  directives?: string[];
  instagram_username?: string;
  instagram_followers?: number;
  instagram_engagement_rate?: number;
};

type KnowledgeEntry = {
  id: string;
  knowledge_type: string;
  title: string;
  content: string;
  keywords: string[];
  priority: number;
};

/**
 * Build instructions with persona and knowledge
 */
export function buildInstructionsWithPersona(
  influencer: any,
  persona: Persona | null,
  knowledge: KnowledgeEntry[]
): string {
  const parts: string[] = [];

  // === BASE IDENTITY ===
  if (persona) {
    parts.push(`אתה הצ'אטבוט של ${persona.name}.`);
    
    if (persona.bio) {
      parts.push(`\nאודות: ${persona.bio}`);
    }
    
    if (persona.description) {
      parts.push(`\n${persona.description}`);
    }

    if (persona.instagram_followers) {
      parts.push(`\nיש לך ${persona.instagram_followers.toLocaleString()} עוקבים באינסטגרם.`);
    }
  } else {
    // Fallback to basic influencer info
    parts.push(`אתה הצ'אטבוט של ${influencer.name || influencer.username}.`);
  }

  // === TONE & STYLE ===
  if (persona) {
    parts.push(`\n\n## סגנון תקשורת:`);
    parts.push(`- טון: ${getToneDescription(persona.tone)}`);
    parts.push(`- סגנון תגובה: ${getStyleDescription(persona.response_style)}`);
    parts.push(`- שימוש באימוג'ים: ${getEmojiDescription(persona.emoji_usage)}`);
    
    if (persona.interests && persona.interests.length > 0) {
      parts.push(`- תחומי עניין שלך: ${persona.interests.join(', ')}`);
    }
  }

  // === DIRECTIVES ===
  if (persona?.directives && persona.directives.length > 0) {
    parts.push(`\n\n## הנחיות חשובות:`);
    persona.directives.forEach(directive => {
      parts.push(`- ${directive}`);
    });
  }

  // === KNOWLEDGE BASE ===
  if (knowledge && knowledge.length > 0) {
    parts.push(`\n\n## מידע זמין שלך (השתמש בו כדי לענות לשאלות):`);
    
    // Group by type
    const groupedKnowledge = groupKnowledgeByType(knowledge);
    
    // Active partnerships
    if (groupedKnowledge.active_partnership) {
      parts.push(`\n### שיתופי פעולה פעילים:`);
      groupedKnowledge.active_partnership.forEach(k => {
        parts.push(`- ${k.title}: ${k.content}`);
      });
    }

    // Coupons
    if (groupedKnowledge.coupon) {
      parts.push(`\n### קופונים זמינים:`);
      groupedKnowledge.coupon.forEach(k => {
        parts.push(`- ${k.content}`);
      });
    }

    // Products
    if (groupedKnowledge.product) {
      parts.push(`\n### מוצרים:`);
      groupedKnowledge.product.forEach(k => {
        parts.push(`- ${k.content}`);
      });
    }

    // FAQ
    if (groupedKnowledge.faq) {
      parts.push(`\n### שאלות נפוצות:`);
      groupedKnowledge.faq.forEach(k => {
        parts.push(`- ${k.title}: ${k.content}`);
      });
    }

    // Custom
    if (groupedKnowledge.custom) {
      parts.push(`\n### מידע נוסף:`);
      groupedKnowledge.custom.forEach(k => {
        parts.push(`- ${k.title}: ${k.content}`);
      });
    }
  }

  // === BEHAVIOR GUIDELINES ===
  parts.push(`\n\n## הוראות התנהגות:`);
  parts.push(`- תמיד היה ידידותי ומועיל`);
  parts.push(`- אם שואלים על שיתוף פעולה או קופון, השתמש במידע מהבסיס ידע שלך`);
  parts.push(`- אם אין לך תשובה, אל תמציא - הפנה ליצירת קשר ישירות`);
  parts.push(`- שמור על אופי התקשורת שלך לאורך כל השיחה`);
  
  if (persona?.greeting_message) {
    parts.push(`- הודעת פתיחה שלך: "${persona.greeting_message}"`);
  }

  return parts.join('\n');
}

/**
 * Helper functions
 */

function getToneDescription(tone: string): string {
  const toneMap: Record<string, string> = {
    'friendly': 'ידידותי וחם',
    'professional': 'מקצועי ועסקי',
    'casual': 'קליל ובלתי פורמלי',
    'formal': 'פורמלי ורשמי',
    'enthusiastic': 'נלהב ואנרגטי',
  };
  return toneMap[tone] || 'ידידותי';
}

function getStyleDescription(style: string): string {
  const styleMap: Record<string, string> = {
    'helpful': 'מועיל ותומך',
    'entertaining': 'משעשע ומעניין',
    'informative': 'אינפורמטיבי וממצה',
    'concise': 'תמציתי וקצר',
  };
  return styleMap[style] || 'מועיל';
}

function getEmojiDescription(usage: string): string {
  const emojiMap: Record<string, string> = {
    'none': 'ללא אימוג\'ים',
    'minimal': 'מינימלי (רק לפעמים)',
    'moderate': 'מתון (1-2 באימוג\'י לתגובה)',
    'heavy': 'רב (כמה אימוג\'ים בכל תגובה)',
  };
  return emojiMap[usage] || 'מתון';
}

function groupKnowledgeByType(knowledge: KnowledgeEntry[]): Record<string, KnowledgeEntry[]> {
  const grouped: Record<string, KnowledgeEntry[]> = {};
  
  knowledge.forEach(entry => {
    if (!grouped[entry.knowledge_type]) {
      grouped[entry.knowledge_type] = [];
    }
    grouped[entry.knowledge_type].push(entry);
  });

  return grouped;
}
