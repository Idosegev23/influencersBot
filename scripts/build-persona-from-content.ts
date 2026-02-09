/**
 * Build Accurate Persona from Real Content
 * מנתח את כל התוכן של המשפיענית ויוצר Persona מדויקת
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

interface PersonaAnalysis {
  name: string;
  bio: string;
  description: string;
  expertise: string[]; // מה היא באמת מתמחה בו
  topics: string[]; // נושאים שהיא מדברת עליהם
  tone: string;
  response_style: string;
  personality_traits: string[];
  content_themes: string[];
  target_audience: string;
}

async function analyzeInfluencerContent(
  posts: any[],
  transcriptions: any[],
  partnerships: any[]
): Promise<PersonaAnalysis> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const prompt = `נתח את התוכן של המשפיענית והחזר Persona מדויקת.

## פוסטים (${posts.length}):
${posts.slice(0, 30).map((p, i) => `${i + 1}. [${p.type}] ${p.caption?.substring(0, 200) || 'ללא כיתוב'}...`).join('\n')}

## תמלולים מסרטונים (${transcriptions.length}):
${transcriptions.slice(0, 20).map((t, i) => `${i + 1}. ${t.transcription_text?.substring(0, 200) || 'ריק'}...`).join('\n')}

## שותפויות:
${partnerships.map(p => `- ${p.brand_name} (${p.category || 'לא צוין'})`).join('\n')}

---

**השתמש בתוכן האמיתי למעלה** ונתח:

1. **מה התחומים העיקריים שלה?** (ביוטי, תזונה, משפחה, אופנה, וכו')
2. **מה סגנון הדיבור שלה?** (רשמי, חברי, מוטיבציונלי)
3. **למי היא פונה?** (אמהות, בחורות צעירות, וכו')
4. **מה הנושאים הכי שכיחים?**
5. **מה האישיות שלה?** (אנרגטית, רגועה, מצחיקה)

החזר JSON בפורמט הזה:
\`\`\`json
{
  "name": "מירן בוזגלו",
  "bio": "תיאור קצר (1-2 משפטים) - מה היא עושה",
  "description": "תיאור מפורט יותר (3-4 משפטים)",
  "expertise": ["תחום 1", "תחום 2", "תחום 3"],
  "topics": ["נושא 1", "נושא 2", ...],
  "tone": "תיאור הטון (חברי/רשמי/מוטיבציונלי)",
  "response_style": "איך היא עונה",
  "personality_traits": ["תכונה 1", "תכונה 2", ...],
  "content_themes": ["נושא מרכזי 1", "נושא מרכזי 2", ...],
  "target_audience": "למי היא פונה"
}
\`\`\`

⚠️ **קריטי:** התבסס **רק** על התוכן שראית! אל תנחש!`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  
  // Extract JSON from response
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }
  
  // Try without code blocks
  const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  return JSON.parse(cleanedResponse);
}

// Export for use in other scripts
export { analyzeInfluencerContent, type PersonaAnalysis };
