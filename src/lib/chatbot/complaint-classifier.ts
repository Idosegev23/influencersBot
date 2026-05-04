/**
 * Dedicated complaint classifier — narrow binary classification using
 * Gemini Flash. Used by accounts that have `support_redirect_to_tab=true`
 * and need rock-solid recall on Hebrew complaints (where the main
 * understanding-engine LLM occasionally misclassifies real complaints
 * as "general").
 *
 * Latency: ~300-500ms with Gemini Flash. Worth it for the user experience
 * guarantee — a misclassified complaint = a frustrated customer talking
 * to a chatbot instead of being handed off to the structured form.
 */

import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3-flash-preview';
const TIMEOUT_MS = 4000;

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (_client) return _client;
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

const SYSTEM_PROMPT = `You are a binary classifier. Your only job: decide whether the user's message describes a problem the customer wants resolved.

Output JSON: { "isComplaint": true/false, "confidence": 0.0-1.0, "reason": "one short sentence in Hebrew" }

A message is a complaint when the user is describing ANY of:
- A damaged / broken / dented / cracked / leaking / missing-item / wrong-item / arrived-late delivery
- A product that doesn't work, doesn't perform as expected, smells bad, irritates skin, etc.
- A coupon / discount code that doesn't apply or is expired
- A billing issue: double-charged, refund needed, wants to cancel
- ANY post-problem question like "מה אני עושה?", "למי לפנות?", "איך אני מקבלת החזר?"

A message is NOT a complaint when it's:
- A pre-purchase question ("איזה שמפו מתאים לשיער יבש?")
- A general inquiry about ingredients, usage, brand history
- A coupon request ("יש קוד הנחה?")
- A compliment or general chat

Subtle signals matter — slang, soft phrasing, indirect questions about a problem still count. Hebrew slang for "broken" includes: שבור, סדוק, פגום, מקולקל, מעוך, רוסק, נמעך, נשפך, דלף, סתום. Slang for "didn't arrive": לא הגיע, נעלם, איפה, לא קיבלתי. The user might also describe symptoms ("השיער שלי נשרף", "זה צרב לי", "יש לי כוויה").

Default to TRUE on borderline cases — false negatives (missed complaint) are far more costly than false positives.`;

export interface ComplaintClassification {
  isComplaint: boolean;
  confidence: number;
  reason: string;
  source: 'gemini' | 'fallback';
}

export async function classifyComplaint(message: string): Promise<ComplaintClassification> {
  const ai = getClient();

  try {
    const result = await Promise.race([
      ai.models.generateContent({
        model: MODEL,
        contents: [
          { role: 'user', parts: [{ text: `User message:\n"${message}"\n\nRespond with JSON only.` }] },
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              isComplaint: { type: 'boolean' },
              confidence: { type: 'number' },
              reason: { type: 'string' },
            },
            required: ['isComplaint', 'confidence', 'reason'],
          },
          temperature: 0,
          maxOutputTokens: 200,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('classifyComplaint timeout')), TIMEOUT_MS),
      ),
    ]);

    const text = (result as any).text || '';
    const parsed = JSON.parse(text);
    return {
      isComplaint: !!parsed.isComplaint,
      confidence: Number(parsed.confidence) || 0,
      reason: String(parsed.reason || '').slice(0, 200),
      source: 'gemini',
    };
  } catch (err: any) {
    console.warn('[complaint-classifier] fallback to keyword scan:', err?.message || err);
    // Lightweight regex fallback so the user experience doesn't drop on
    // an outage. Conservative — leans TRUE on any of the obvious signals.
    const lower = message.toLowerCase();
    const STRONG: RegExp[] = [
      /שבור|נשבר|סדוק|סדק|פגום|מקולקל|מעוך|רוסק|נמעך|דלף|דלפה|ניזוק|נזק/,
      /לא הגיע|לא קיבלתי|איפה ההזמנה|איפה החבילה|לא נמסר|איחור|איחר|נעלם/,
      /לא מה שהזמנתי|מוצר שגוי|קיבלתי משהו אחר|מוצר אחר/,
      /הקוד לא עובד|הקופון לא עובד|קופון לא תקף|בעיה בקופון|הקופון פג/,
      /חיוב כפול|חויבתי פעמיים|לא קיבלתי החזר|החזר כספי|לבטל הזמנה|בעיה בתשלום/,
      /תלונה|מתלוננת|לא עובד|לא פועל|תקלה|נשרף|נכוויתי|כוויה|צרב|גרם נזק/,
      /אני רוצה (החזר|החלפה|לבטל)/,
    ];
    const hit = STRONG.some((re) => re.test(lower));
    return {
      isComplaint: hit,
      confidence: hit ? 0.6 : 0.0,
      reason: hit ? 'keyword fallback matched complaint pattern' : 'no signal in fallback',
      source: 'fallback',
    };
  }
}
