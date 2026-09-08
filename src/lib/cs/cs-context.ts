import { supabase as supabaseAdmin } from '@/lib/supabase';
import { buildPersonalityFromDB } from '@/lib/chatbot/personality-wrapper';
import { searchContentByQuery, formatMetadataForAI } from '@/lib/chatbot/hybrid-retrieval';
import { isWarm, type CsSessionRow } from '@/lib/cs/cs-session';
import { listCsEnabledBrands, MAX_INLINE } from '@/lib/cs/brand-resolver';
import { identityPhone, type CsIdentity } from '@/lib/cs/identity';
import { hasContactRoute as contactRoute } from '@/lib/support/contact';

// The brain always appends <<SUGGESTIONS>>…; a WhatsApp channel MUST strip it before sending.
export function stripSuggestions(text: string): string {
  return (text || '').replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
}

// Spec §5: web/IG PARSE the same marker into quick-reply chips where WhatsApp strips it.
export function parseSuggestions(text: string): string[] {
  const m = /<<SUGGESTIONS>>([\s\S]*?)<<\/SUGGESTIONS>>/.exec(text || '');
  if (!m) return [];
  return m[1].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4);
}

export interface CsRecentTurn { role: 'user' | 'assistant'; text: string; }

export interface CsContextDigest {
  knownName: string | null;
  boundBrand: string | null; // brand display name, or null when unbound
  warm: boolean;             // last activity < 45 min
  // Conversation mode as CONTEXT, not a route (CS-engine spec §3): the opening-screen choice.
  // 'cs' is the default; 'content' is only ever passed by the M2+ channel adapters.
  mode: 'cs' | 'content';
  language: 'he' | 'en';
  openThreads: Array<{ ticketId: string; brand: string; topic: string }>;
  // Lightweight pre-bind memory (Task C6 follow-up): the last few exchanges, persisted on
  // whatsapp_cs_sessions.context.recentTurns by cs-agent.ts. chat_messages history only exists
  // AFTER bind_brand, so pre-bind onboarding turns (greeting → "which brand?" → disambiguation)
  // would otherwise have zero cross-turn memory. Harmless to include post-bind too.
  recentTurns: CsRecentTurn[];
  // The bound brand's customer-service policy (free text on config.whatsapp_cs.policy) — the brain
  // must follow it. This is the v1 "policy engine": a per-brand rulebook injected into the prompt.
  // A future brand-management screen will populate it (upload a file or type it); null when unset.
  policy: string | null;
  // Does this channel already carry a way to call the shopper back? True on WhatsApp (the sender's
  // number) and once a web shopper has given a phone; false for an anonymous widget / chat visitor,
  // where a hand-off without asking first reaches nobody.
  hasContactRoute: boolean;
}

export async function buildContextDigest(
  session: CsSessionRow,
  openThreads: Array<{ ticketId: string; brand: string; topic: string }>,
  mode: 'cs' | 'content' = 'cs',
  language: 'he' | 'en' = 'he',
  identity?: CsIdentity,
  // The caller has usually just read this exact row (cs-agent's loadAccountMeta). Passing it in
  // leaves this function with no DB work at all; omitting it keeps the original self-contained
  // behaviour for every other caller.
  presetConfig?: any | null,
): Promise<CsContextDigest> {
  let boundBrand: string | null = null;
  let policy: string | null = null;
  if (session.active_account_id) {
    const cfg = presetConfig ?? await (async () => {
      const { data } = await supabaseAdmin.from('accounts').select('config').eq('id', session.active_account_id).single();
      return (data as any)?.config || {};
    })();
    boundBrand = cfg.display_name || cfg.username || null;
    const p = cfg.whatsapp_cs?.policy;
    policy = typeof p === 'string' && p.trim() ? p : null;
  }
  const recentTurns = Array.isArray((session.context as any)?.recentTurns) ? (session.context as any).recentTurns : [];
  // Absent identity → assume a contact route exists, so an unknown caller can never make the prompt
  // start demanding phone numbers on WhatsApp.
  const hasContactRoute = identity
    ? contactRoute({ phone: identityPhone(identity), email: (session.context as any)?.contactEmail })
    : true;
  return { knownName: session.customer_name, boundBrand, warm: isWarm(session), mode, language, openThreads, recentTurns, policy, hasContactRoute };
}

/**
 * The system prompt. When unbound → a generic Bestie-CS persona that steers toward brand selection.
 * When bound → the brand's persona + freshly retrieved RAG grounding. The digest is injected so the
 * brain produces the §6 re-entry behaviours FROM CONTEXT (no scripted menu, no FSM).
 */
export async function buildCsSystemPrompt(input: {
  accountId: string | null;
  userMessage: string;
  digest: CsContextDigest;
  // Same row cs-agent already holds — see buildContextDigest's presetConfig. Without it this was
  // the THIRD read of one accounts.config row in a single turn.
  config?: any | null;
  // Set for a turn whose answer comes from the orders provider rather than from brand content.
  // Grounding still comes from the persona and the policy block; only the content retrieval is
  // dropped. Absent/false keeps the original behaviour for every other turn and every other caller.
  skipRag?: boolean;
}): Promise<string> {
  const { accountId, userMessage, digest } = input;
  // The account's config is read ONCE and reused: the orders/products guidance below and the
  // toolset must be cut by the same facts, or the prompt describes a flow that has no tool.
  let boundConfig: any = input.config ?? null;
  if (accountId && !boundConfig) {
    try {
      const { data } = await supabaseAdmin.from('accounts').select('config').eq('id', accountId).single();
      boundConfig = (data as any)?.config || {};
    } catch { /* config optional — every use below treats null as "no capability" */ }
  }
  const { hasOrdersProvider } = await import('@/lib/cs/tools/registry');
  const canCheckOrders = Boolean(boundConfig) && hasOrdersProvider(boundConfig);

  const lines: string[] = [];
  lines.push('את/ה Bestie — שירות הלקוחות של המותגים בוואטסאפ. דבר/י בעברית, בגובה העיניים, קצר וברור, בקול המותג.');
  // Pre-bind the brand is unknown, so the order rules stay general. Once bound they must match the
  // toolset buildCsToolset() actually handed over.
  if (!accountId || canCheckOrders) {
    lines.push('כללי ליבה: אל תמציא/י פרטי הזמנה או מדיניות — השתמש/י בכלים (tools). אל תחשוף/י פרטי הזמנה לפני אימות טלפון (הכלי lookup_order עושה זאת). אם אינך יכול/ה לעזור או שהלקוח/ה מבקש/ת אדם — הפעל/י escalate_to_human.');
  } else {
    // LA BEAUTÉ, 2026-09-07: with no orders provider the model still asked 6/6 for "the phone the
    // order was placed with" — collecting verification for a lookup it cannot run, which ends in
    // silence exactly like the hand-off that filed nothing.
    lines.push('כללי ליבה: אל תמציא/י פרטי הזמנה או מדיניות — השתמש/י בכלים (tools). אם אינך יכול/ה לעזור או שהלקוח/ה מבקש/ת אדם — הפעל/י escalate_to_human.');
    lines.push('חשוב — למותג הזה אין חיבור למערכת ההזמנות, ולכן לא ניתן לבדוק הזמנות, סטטוס משלוח או פרטי הזמנה בשיחה הזו. אם הלקוח/ה שואל/ת על הזמנה: אל תבקש/י מספר הזמנה ואל תבקש/י טלפון לאימות — זה לא יוביל לשום מקום. אמר/י בכנות ובקצרה שאין לך גישה לפרטי ההזמנה, והפעל/י מיד escalate_to_human כדי שנציג/ה אנושי/ת יבדקו ויחזרו.');
  }
  lines.push('כשמסלימים לאדם (escalate_to_human): מיד באותו תור כתב/י הודעת סיום קצרה, חמה ואמפתית — הכר/י בבעיה, התנצל/י אם זו תלונה/נזק, והבטח/י שנציג/ה אנושי/ת יחזרו בהקדם. לעולם אל תשאיר/י את הלקוח/ה בשתיקה אחרי הסלמה.');
  if (!digest.hasContactRoute) {
    // Without this the hand-off is a promise nobody can keep: the ticket reaches the brand with no
    // phone on it, and the shopper waits for a call that cannot be made.
    lines.push('חשוב — בערוץ הזה אין לנו שום דרך ליצור קשר עם הלקוח/ה. לפני שמסלימים לאדם: בקש/י במשפט אחד ופשוט טלפון או מייל לחזרה ("לאיזה מספר או מייל שנחזור אלייך?"), ומרגע שקיבלת הפעל/י remember_contact (אפשר טלפון, מייל, או שניהם) ורק אז escalate_to_human. אם הלקוח/ה מסרב/ת או מתעלמ/ת מהבקשה — הפעל/י escalate_to_human עם contact_refused: true, ואמר/י במפורש שאפשר לחזור לכאן לעדכון. אל תבטיח/י שנציג/ה יחזרו אם אין לך שום פרט קשר.');
  }
  lines.push('טון לפי מצב: בתלונה, מוצר פגום, נזק במשלוח או כעס — הורד/י את הטון העליז ואת האימוג׳ים המחייכים, הגב/י ברצינות, אמפתיה והתנצלות אמיתית. אימוג׳י עליז (🙂✨) מתאים רק לשיחה נעימה, לא לתלונה.');
  lines.push('על ברכה פשוטה ("היי") — פתח/י בחום ושאל/י איך אפשר לעזור (או המשך/י בפרוזה נושא פתוח קודם). אל תוביל/י ברכה בהצעה "להעביר לנציג" — הצע/י אדם רק כשבאמת נתקעת או כשהלקוח/ה מבקש/ת.');
  lines.push('תמונות: כשהלקוח/ה שולח/ת תמונה — את/ה רואה אותה ממש. התבונן/י בה, תאר/י בקצרה מה את/ה רואה (מוצר, נזק, תווית, טקסט), אשר/י מול המדיניות (למשל אם המוצר אכן נראה פגום/פתוח), ופעל/י בהתאם. אם התמונה לא ברורה או לא רלוונטית — בקש/י בעדינות תמונה טובה יותר.');
  lines.push('שיחה חופשית בלבד: אין כפתורים ואין רשימות בחירה (WhatsApp interactive) — כל תגובה היא טקסט רגיל. כל בחירה (מותג, המשך פנייה) נעשית בשיחה טבעית: את/ה שואל/ת, הלקוח/ה עונ/ה בטקסט חופשי, ואת/ה מבין/ה, מאשר/ת בפרוזה וממשיכ/ה.');

  if (digest.mode === 'content') lines.push('שים/י לב: הלקוח/ה בחר/ה לשוחח על התוכן — זו שיחת תוכן, לא פניית שירות. אם באמצע השיחה עולה בעיה או בקשת שירות, אפשר לטפל בה בטבעיות.');
  if (digest.language === 'en') lines.push("Reply in English — this brand's audience is English-speaking. Keep the same warm, concise tone.");

  if (digest.knownName) lines.push(`שם הלקוח/ה: ${digest.knownName}. פנה/י אליו/ה בשם, ואל תשאל/י שוב לשם.`);
  else lines.push('שם הלקוח/ה עדיין לא ידוע — פתח/י בברכה קצרה וחמה ושאל/י בטבעיות איך קוראים ללקוח/ה (אפשר באותה נשימה עם שאלת המותג, למשל: "היי! אני בסטי 🙂 איך קוראים לך? ולאיזה מותג / עסק את/ה צריך/ה עזרה?"). ברגע שקיבלת שם — קרא/י ל-remember_name פעם אחת כדי לזכור אותו, ומאותו רגע פנה/י אליו/ה בשם.');

  if (digest.boundBrand) {
    lines.push(`מותג פעיל: ${digest.boundBrand} — כל הכלים מכוונים אליו.`);
    if (digest.policy) {
      lines.push(
        `\n--- מדיניות שירות הלקוחות של ${digest.boundBrand} (חובה לפעול לפיה) ---\n${digest.policy.slice(0, 3000)}\n` +
        'כללי המדיניות מנחים אותך ישירות וגוברים על הרגלים כלליים — אך לעולם אינם עוקפים אימות טלפון (lookup_order) או האיסור לכתוב לחנות (read-only). אם מקרה אינו מכוסה במדיניות — הפעל/י שיקול דעת או הסלמה לאדם.'
      );
    }
  } else {
    lines.push(
      'טרם נבחר מותג — שאל/י בשיחה טבעית לאיזה מותג/עסק הלקוח/ה צריך/ה עזרה (למשל: "לאיזה מותג / עם איזה עסק אתה צריך עזרה?"). ' +
      'קרא/י ל-resolve_brand עם התשובה החופשית שקיבלת (זה מה שמאפשר להתמודד עם אלפי מותגים בלי תפריט). ' +
      'כשיש התאמה טובה אחת — אשר/י אותה בפרוזה (למשל: "מדובר ב-Argania (argania-oil.co.il)?") וקרא/י ל-bind_brand רק אחרי שהלקוח/ה מאשר/ת בטקסט חופשי ("כן"/"נכון"/וכו׳). ' +
      'כשיש כמה מועמדים קרובים — שאל/י שאלת הבהרה בפרוזה (למשל: "יש לי כמה — התכוונת ל-X או ל-Y?"). לעולם אל תציג/י תפריט, כפתורים או רשימה — רק משפטים.'
    );
    // Brain-led brand matching: hand the LLM the CS-enabled roster directly so it can match
    // "ארגן"→Argania, "פאשה"→Studio Pasha, typos, Hebrew/English straight from context — resolve_brand
    // is then mainly needed once the roster is too large to inline (large-scale narrowing).
    // The accountId is part of the line, not decoration: this roster is what the brain binds FROM,
    // and bind_brand takes a uuid. Printing only `name — domain` while instructing "then call
    // bind_brand" left the uuid reachable solely through resolve_brand — which this list makes look
    // optional — so the brain bound with "ARGANIA GROUP", accounts.id rejected it as malformed, and
    // 103 shared-number conversations never bound at all (פנינה, דנה כחלון; 2026-07-22 → 2026-09-03).
    try {
      const brands = await listCsEnabledBrands();
      if (brands.length) {
        lines.push('\n--- מותגים זמינים שאת/ה משרת/ת (בחר/י את זה שהלקוח/ה מתכוון/ת אליו, אשר/י בפרוזה, ואז קרא/י ל-bind_brand; אם הרשימה גדולה מדי / הלקוח/ה מזכיר/ה משהו שלא כאן — הישענ/י על resolve_brand) ---');
        lines.push('כל שורה: שם — אתר — accountId. ל-bind_brand מעבירים את ה-accountId בדיוק כפי שהוא כתוב כאן, לעולם לא את השם או את כתובת האתר.');
        // The roster is MATCHING MATERIAL, not a catalogue. Measured on the live model: asked
        // "איזה מותגים יש לכם?" it recited every client by name — one brand's shopper being handed
        // the list of everyone else we serve, and (once a QA account existed) told about that too.
        // The confirm/disambiguate flows below stay allowed; only enumerating is forbidden.
        lines.push(
          'הרשימה הזו היא לשימושך הפנימי בלבד — כדי לזהות למי הלקוח/ה מתכוון/ת. לעולם אל תקריא/י אותה ואל תמנה/י מותגים שהלקוח/ה לא הזכיר/ה, ' +
          'גם לא כשנשאלת ישירות ("איזה מותגים יש לכם?" / "עם מי אתם עובדים?") — אלה פרטים של לקוחותינו ולא מידע שאנחנו חולקים. ' +
          'במקרה כזה ענה/י בקצרה שתשמח/י לעזור, ובקש/י את שם המותג או כתובת האתר שממנו הזמינו. ' +
          'מותר ואף רצוי לאשר בפרוזה מותג יחיד שהלקוח/ה עצמו/ה הזכיר/ה, או לשאול בין 2-3 מועמדים קרובים כשמה שנאמר מתאים לכמה מהם.'
        );
        for (const b of brands.slice(0, MAX_INLINE)) {
          lines.push(`${b.displayName} — ${b.domain || b.username || '—'} — accountId: ${b.accountId}`);
        }
      }
    } catch { /* brand roster optional — resolve_brand tool still covers this if the fetch fails */ }
  }

  // Pre-bind onboarding turns have no chat_messages history (it only exists after bind_brand) —
  // this short, clearly-labeled block is the only cross-turn memory available in that window
  // (name attempt, brand mentioned, candidates shown). Harmless to keep post-bind too.
  if (digest.recentTurns && digest.recentTurns.length) {
    lines.push('\n--- השיחה עד כה (זיכרון קצר, לפני קישור מותג) ---');
    for (const t of digest.recentTurns) lines.push(`${t.role === 'user' ? 'לקוח/ה' : 'את/ה'}: ${t.text}`);
  }

  if (digest.warm) lines.push('שיחה חמה (פחות מ-45 דק׳) — המשך/י ברצף בלי לחזור על שאלות פתיחה.');
  if (digest.openThreads.length === 1) {
    const t = digest.openThreads[0];
    lines.push(`פנייה פתוחה אחת: ${t.brand} · ${t.topic}. שאל/י בפרוזה אם ממשיכים אותה או שזה משהו חדש (למשל: "יש לך פנייה פתוחה אצל ${t.brand} בנושא ${t.topic} — נמשיך בה או שזה משהו אחר?") — בלי כפתורים, רק טקסט.`);
  } else if (digest.openThreads.length >= 2) {
    const list = digest.openThreads.map((t) => `${t.brand} (${t.topic})`).join(', ');
    lines.push(`יש ${digest.openThreads.length} פניות פתוחות: ${list}. שאל/י בפרוזה איזו מהן להמשיך, או שזו פנייה חדשה לגמרי — בלי רשימה או תפריט, רק בשיחה טבעית.`);
  }

  if (accountId) {
    try {
      const persona = await buildPersonalityFromDB(accountId);
      const slim = { signatureStyle: persona.signatureStyle, commonPhrases: persona.commonPhrases, emojiUsage: persona.emojiUsage, boundaries: persona.boundaries };
      lines.push(`\n--- קול המותג ---\n${JSON.stringify(slim).slice(0, 1500)}`);
    } catch { /* persona optional */ }
    if (!input.skipRag) {
      try {
        const hits = await searchContentByQuery(accountId, userMessage);
        const rag = formatMetadataForAI(hits).slice(0, 4000);
        if (rag.trim()) lines.push(`\n--- ידע רלוונטי מהמותג (RAG) ---\n${rag}`);
      } catch { /* RAG optional */ }
    }
    // Product cards are per-brand opt-in, and so is the guidance: a brand with cards switched off
    // must not get a prompt telling Bestie to reach for tools that will only refuse.
    try {
      if (boundConfig?.whatsapp_cs?.products_enabled === true) {   // reuses the single config read above
        lines.push(
          '\n--- כרטיסי מוצר ---\n' +
          'כשהלקוח/ה מתעניין/ת במוצר, שואל/ת מה מתאים לו/ה, או מבקש/ת לראות מה יש — קרא/י ל-search_products עם מה שהוא/היא תיאר/ה במילים שלו/ה. ' +
          'אחר כך כתב/י המלצה קצרה בפרוזה ובאותו תור קרא/י ל-show_products עם ה-refs של המוצרים שבאמת הזכרת (עד 3). ' +
          'הלקוח/ה יקבל/ת כרטיס לכל מוצר — תמונה, שם, מחיר וכפתור שמוביל ישירות לעמוד המוצר. ' +
          'לעולם אל תכתב/י כתובת אתר או לינק בטקסט — הכרטיס נושא את הלינק, וכתיבת לינק ידנית תיצור כפילות. ' +
          'הזכר/י בפרוזה בדיוק את המוצרים ששלחת ככרטיסים, כדי שהטקסט והכרטיסים יסתדרו. ' +
          'אל תציע/י מוצרים בתוך תלונה, דיווח על מוצר פגום, נזק במשלוח, בקשת החזר או כל רגע של תסכול — שם התפקיד שלך הוא לפתור, לא למכור.'
        );
      }
    } catch { /* product-card guidance optional — the tools enforce the gate themselves */ }
  }
  return lines.join('\n');
}
