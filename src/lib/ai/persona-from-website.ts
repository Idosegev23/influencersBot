import { createClient } from '@/lib/supabase/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Build a `chatbot_persona` row from scraped website content only (no Instagram).
 *
 * Lifts the gpt-5.4 `/v1/responses` persona-generation + upsert shape from
 * `scripts/build-gov-ministry-persona.mjs`, generalised for any website archetype
 * (brand / service / local business). Reads `instagram_bio_websites` for the
 * account, derives a structured persona JSON, and upserts `chatbot_persona`
 * (`name` is NOT NULL). Returns `true` on success, `false` on any failure so the
 * pipeline can advance without hard-failing the whole scan.
 */
export async function buildPersonaFromWebsite(accountId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: account } = await supabase
    .from('accounts')
    .select('config, language')
    .eq('id', accountId)
    .single();

  const cfg = (account?.config as any) || {};
  const displayName = cfg.display_name || cfg.username || accountId;
  const language = cfg.language || account?.language || 'he';

  const { data: pages } = await supabase
    .from('instagram_bio_websites')
    .select('url, page_title, page_description, page_content')
    .eq('account_id', accountId)
    .order('scraped_at', { ascending: false })
    .limit(60);

  if (!pages || pages.length === 0) {
    console.error(`[persona-from-website] No scraped pages for ${accountId}`);
    return false;
  }

  // Content digest — title + first 350 chars of content per page (mirrors the gov script)
  const digest = pages
    .slice(0, 50)
    .map((p: any, i: number) => {
      const body = (p.page_content || '').replace(/\s+/g, ' ').trim().slice(0, 350);
      return `[${i + 1}] ${p.page_title || '(no title)'}\nURL: ${p.url}\n${body}`;
    })
    .join('\n\n');

  const prompt = `אתה אדריכל פרסונה של עוזר שירות/מכירות חכם לאתר "${displayName}". על בסיס תוכן האתר הרשמי, הפק פרסונה מובנית בפורמט JSON תקני בלבד (ללא טקסט נוסף, ללא markdown).

הפרסונה משמשת לבוט צ'אט שמשרת לקוחות ומבקרים באתר. דרישות:
- טון ידידותי, מקצועי ומדויק — תואם למותג.
- בלי הבטחות שווא ובלי המצאת מוצרים/מחירים/הטבות שלא מופיעים בתוכן.
- אמוג'י מצומצם ובדגשים בלבד.
- ניטרלי מגדרית ("פנה/י", "את/ה").

תוכן האתר (דגימה של ${pages.length} דפים):
${digest.slice(0, 14000)}

החזר JSON בפורמט הזה בדיוק (כל הטקסט בשפה "${language}"):

{
  "name": "${displayName}",
  "bio": "1-2 משפטים: מה האתר/העסק מציע ולמי",
  "description": "פסקה של 3-5 משפטים: תחומי פעילות, קהל יעד, סוגי מוצרים/שירותים, ערוצי קשר",
  "tone": "תיאור קצר של הטון",
  "language": "${language}",
  "response_style": "תיאור קצר של אופן המענה — מבנה תשובה, אורך, רמת פירוט",
  "emoji_usage": "minimal",
  "greeting_message": "ברכת פתיחה של משפט-שניים שמסבירה במה הבוט יכול לעזור",
  "topics": ["נושא 1", "נושא 2", "..."],
  "interests": ["תחום 1", "..."],
  "common_phrases": ["ניסוח שגרתי 1", "..."],
  "directives": ["הנחיה 1", "..."],
  "faq": [
    { "question": "שאלה שכיחה", "answer": "תשובה ממוקדת על בסיס התוכן" }
  ],
  "voice_rules": {
    "firstPerson": "ניטרלי",
    "addressUser": "פנה/י, את/ה",
    "formality": "ידידותי-מקצועי",
    "forbidden": ["הבטחת תוצאות", "המצאת מחירים", "המצאת מוצרים שלא בתוכן"]
  },
  "knowledge_map": {
    "core_topics": ["..."],
    "key_services": ["שירות/מוצר 1", "..."],
    "key_publications": ["..."]
  },
  "boundaries": {
    "off_topic_response": "תגובה לשאלה מחוץ לתחום",
    "out_of_scope_examples": ["..."]
  },
  "response_policy": {
    "max_response_length": "2-4 פסקאות קצרות",
    "structure": "תשובה ישירה → פירוט בנקודות",
    "fallback_when_unknown": "אין לי מידע ודאי על זה — מומלץ לפנות אלינו ישירות."
  }
}

חשוב:
- כל שדה חייב להיות מבוסס על התוכן שראית. אל תמציא מוצרים/מחירים/תאריכים.
- החזר JSON תקני בלבד. אל תעטוף ב-\`\`\`json.`;

  if (!OPENAI_API_KEY) {
    console.error('[persona-from-website] Missing OPENAI_API_KEY');
    return false;
  }

  // Call gpt-5.4 via /v1/responses (same pattern as gemini-persona-builder + gov script)
  let text: string | null = null;
  try {
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.4',
        input: prompt,
        reasoning: { effort: 'medium' },
        text: { format: { type: 'text' } },
      }),
      signal: AbortSignal.timeout(300000),
    });
    if (!resp.ok) {
      console.error('[persona-from-website] gpt-5.4 error', resp.status, (await resp.text()).slice(0, 300));
      return false;
    }
    const result = await resp.json();
    const rawOutput = result.output;
    if (typeof rawOutput === 'string') {
      text = rawOutput;
    } else if (Array.isArray(rawOutput)) {
      const msg = rawOutput.find((x: any) => x.type === 'message');
      const t = msg?.content?.find((c: any) => c.type === 'output_text' || c.text);
      text = t?.text ?? null;
    } else if (rawOutput && typeof rawOutput === 'object') {
      text = rawOutput.text || rawOutput.content || null;
    }
  } catch (err: any) {
    console.error('[persona-from-website] gpt-5.4 call failed', err?.message);
    return false;
  }

  if (!text) {
    console.error('[persona-from-website] No text in gpt-5.4 response');
    return false;
  }

  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let persona: any;
  try {
    persona = JSON.parse(jsonText);
  } catch {
    console.error('[persona-from-website] Failed to parse persona JSON. First 300 chars:', jsonText.slice(0, 300));
    return false;
  }

  const personaRow = {
    account_id: accountId,
    name: persona.name || displayName, // NOT NULL
    tone: persona.tone || 'ידידותי-מקצועי',
    language: persona.language || language,
    bio: persona.bio || null,
    description: persona.description || null,
    interests: Array.isArray(persona.interests) ? persona.interests : null,
    topics: Array.isArray(persona.topics) ? persona.topics : null,
    response_style: persona.response_style || null,
    emoji_usage: persona.emoji_usage || 'minimal',
    greeting_message: persona.greeting_message || null,
    faq: persona.faq || null,
    directives: Array.isArray(persona.directives) ? persona.directives : null,
    voice_rules: persona.voice_rules || null,
    knowledge_map: persona.knowledge_map || null,
    boundaries: persona.boundaries || null,
    response_policy: persona.response_policy || null,
    common_phrases: Array.isArray(persona.common_phrases) ? persona.common_phrases : null,
    // preprocessing_data-compatible content so downstream chat paths that read it don't choke
    preprocessing_data: { source: 'website', pages_analyzed: pages.length, raw: persona },
    metadata: {
      source: 'persona-from-website',
      model: 'gpt-5.4',
      pages_analyzed: pages.length,
      built_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };

  const { error: writeErr } = await supabase
    .from('chatbot_persona')
    .upsert(personaRow, { onConflict: 'account_id' });

  if (writeErr) {
    console.error('[persona-from-website] persona save error', writeErr.message);
    return false;
  }

  console.log(`[persona-from-website] persona built for ${accountId} (${pages.length} pages)`);
  return true;
}
