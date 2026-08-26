/**
 * The minimal CS set injected into a customer's WABA at connect time (spec D9).
 * Our internal templates are NOT copied — those are Bestie's own business templates and
 * mean nothing to a customer's customers.
 *
 * Everything here is UTILITY and deliberately dry. Meta reclassifies promotional-sounding
 * copy to MARKETING, which makes the customer pay per message and requires opt-in. The unit
 * test enforces that: no offers, no adjectives, no invitations to browse.
 */

export interface TemplateBody {
  text: string;
  example: { body_text: string[][] };
}

export interface CsTemplateDef {
  name: string;
  category: 'UTILITY';
  he: TemplateBody;
  en: TemplateBody;
}

export const CS_TEMPLATES: CsTemplateDef[] = [
  {
    name: 'cs_followup',
    category: 'UTILITY',
    he: { text: 'שלום {{1}}, יש עדכון בפנייה ששלחת אל {{2}}.\n\nאפשר להשיב להודעה הזו כדי להמשיך את השיחה מהנקודה שבה עצרנו.',
          example: { body_text: [['דנה', 'המותג']] } },
    en: { text: 'Hello {{1}}, there is an update on the request you sent to {{2}}.\n\nYou can reply to this message to continue the conversation where it left off.',
          example: { body_text: [['Dana', 'the business']] } },
  },
  {
    name: 'cs_order_update',
    category: 'UTILITY',
    // Three variables, not four, and enough surrounding text: Meta rejects a body whose
    // variables dominate its length (error_subcode 2388293). The brand name was dropped —
    // the number the message arrives from already identifies it.
    he: { text: 'שלום {{1}}, יש עדכון בנוגע להזמנה שלך.\n\nמספר ההזמנה: {{2}}\nהסטטוס העדכני: {{3}}\n\nאפשר להשיב להודעה הזו ונשמח לעזור בכל שאלה.',
          example: { body_text: [['דנה', '10432', 'נשלחה']] } },
    en: { text: 'Hello {{1}}, there is an update regarding your order.\n\nOrder number: {{2}}\nCurrent status: {{3}}\n\nYou can reply to this message and we will be glad to help.',
          example: { body_text: [['Dana', '10432', 'shipped']] } },
  },
  {
    name: 'cs_human_reply',
    category: 'UTILITY',
    he: { text: 'שלום {{1}}, נציג מטעם {{2}} השיב לפנייה שלך.\n\nהתשובה ממתינה לך כאן, ואפשר להמשיך את השיחה בהודעה חוזרת.',
          example: { body_text: [['דנה', 'המותג']] } },
    en: { text: 'Hello {{1}}, a representative from {{2}} has replied to your request.\n\nThe reply is waiting here, and you can continue the conversation by replying to this message.',
          example: { body_text: [['Dana', 'the business']] } },
  },
];

export function templateBody(t: CsTemplateDef, language: 'he' | 'en'): TemplateBody {
  return language === 'en' ? t.en : t.he;
}

/** Meta's language code for an account language. */
export function metaLanguageCode(language: string | null | undefined): 'he' | 'en_US' {
  return language === 'en' ? 'en_US' : 'he';
}

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}`;

/**
 * Create the three templates on the customer's WABA. Best effort by design: a channel with
 * no approved templates still answers inside the 24h service window, so a rejection here
 * must not abort the connection.
 *
 * Returns true only when all three were accepted for review.
 */
export async function createCsTemplates(token: string, wabaId: string, accountId: string): Promise<boolean> {
  const { supabase } = await import('@/lib/supabase');
  const { data: acct } = await supabase.from('accounts').select('language').eq('id', accountId).maybeSingle();
  const lang: 'he' | 'en' = (acct as any)?.language === 'en' ? 'en' : 'he';
  const languageCode = metaLanguageCode((acct as any)?.language);

  const results = await Promise.all(CS_TEMPLATES.map(async (t) => {
    const body = templateBody(t, lang);
    const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: t.name,
        language: languageCode,
        category: t.category,
        components: [{ type: 'BODY', text: body.text, example: body.example }],
      }),
    });
    if (!res.ok) {
      console.warn('[cs-templates] create failed', t.name, res.status, await res.text().catch(() => ''));
    }
    return res.ok;
  }));
  return results.every(Boolean);
}
