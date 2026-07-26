import OpenAI from 'openai';
import { laneModel } from '@/lib/llm/config';

/**
 * A short Hebrew "executive summary" (סיכום מנהלים) of an escalated conversation, for the human who
 * takes it over: who the shopper is, what they want, what happened in the chat, and what's needed.
 * Runs on the cheap router lane (gpt-5.4-nano). Best-effort — returns null on any failure so a
 * missing summary never blocks the escalation itself (the reason + transcript still go out).
 */
export async function summarizeHandoff(input: {
  transcript: { role: string; content: string }[];
  reason: string;
  brandName?: string;
  customerName?: string | null;
  hasImage?: boolean;
}): Promise<string | null> {
  const convo = (input.transcript || [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => `${m.role === 'user' ? 'לקוח/ה' : 'בוט'}: ${m.content}`)
    .join('\n')
    .slice(0, 4000);
  if (!convo && !input.reason) return null;
  if (!process.env.OPENAI_API_KEY) return null; // no key (e.g. tests) → skip the call entirely
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      model: laneModel('router'),
      messages: [
        {
          role: 'system',
          content:
            'את/ה כותב/ת "סיכום מנהלים" קצר בעברית לנציג/ה אנושי/ת שמקבל/ת פנייה שהוסלמה מבוט שירות לקוחות. ' +
            'סכם/י ב-2 עד 4 משפטים ענייניים: מי הלקוח/ה, מה הבקשה/הבעיה, מה כבר נעשה או נאמר בשיחה, ומה נדרש מהנציג/ה כדי לסגור. ' +
            'בלי הקדמות, בלי כותרות, בלי אימוג׳י. אם צורפה תמונה — ציין/י זאת.',
        },
        {
          role: 'user',
          content:
            `מותג: ${input.brandName || '—'}\n` +
            `לקוח/ה: ${input.customerName || '—'}\n` +
            `סיבת ההסלמה: ${input.reason || '—'}\n` +
            `${input.hasImage ? 'הלקוח/ה צירף/ה תמונה.\n' : ''}` +
            `\nהשיחה:\n${convo || '(אין תמליל זמין)'}`,
        },
      ],
    });
    const text = res.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (e) {
    console.warn('[summarizeHandoff] failed', (e as Error).message);
    return null;
  }
}
