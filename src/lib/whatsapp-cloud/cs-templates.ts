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
    he: { text: 'שלום {{1}}, פנייתך אל {{2}} עודכנה. אפשר להמשיך מכאן.',
          example: { body_text: [['דנה', 'המותג']] } },
    en: { text: 'Hello {{1}}, your request to {{2}} has been updated. You can continue here.',
          example: { body_text: [['Dana', 'the business']] } },
  },
  {
    name: 'cs_order_update',
    category: 'UTILITY',
    he: { text: 'שלום {{1}}, הזמנה {{2}} אצל {{3}} עודכנה. הסטטוס הנוכחי: {{4}}.',
          example: { body_text: [['דנה', '10432', 'המותג', 'נשלחה']] } },
    en: { text: 'Hello {{1}}, order {{2}} at {{3}} has been updated. Current status: {{4}}.',
          example: { body_text: [['Dana', '10432', 'the business', 'shipped']] } },
  },
  {
    name: 'cs_human_reply',
    category: 'UTILITY',
    he: { text: 'שלום {{1}}, נציג מ{{2}} השיב לפנייתך.',
          example: { body_text: [['דנה', 'המותג']] } },
    en: { text: 'Hello {{1}}, a representative from {{2}} has replied to your request.',
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
