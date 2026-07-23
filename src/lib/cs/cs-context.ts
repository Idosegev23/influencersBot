import { supabase as supabaseAdmin } from '@/lib/supabase';
import { buildPersonalityFromDB } from '@/lib/chatbot/personality-wrapper';
import { searchContentByQuery, formatMetadataForAI } from '@/lib/chatbot/hybrid-retrieval';
import { isWarm, type CsSessionRow } from '@/lib/cs/cs-session';
import { listCsEnabledBrands, MAX_INLINE } from '@/lib/cs/brand-resolver';

// The brain always appends <<SUGGESTIONS>>…; a WhatsApp channel MUST strip it before sending.
export function stripSuggestions(text: string): string {
  return (text || '').replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
}

export interface CsRecentTurn { role: 'user' | 'assistant'; text: string; }

export interface CsContextDigest {
  knownName: string | null;
  boundBrand: string | null; // brand display name, or null when unbound
  warm: boolean;             // last activity < 45 min
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
}

export async function buildContextDigest(
  session: CsSessionRow,
  openThreads: Array<{ ticketId: string; brand: string; topic: string }>,
): Promise<CsContextDigest> {
  let boundBrand: string | null = null;
  let policy: string | null = null;
  if (session.active_account_id) {
    const { data } = await supabaseAdmin.from('accounts').select('config').eq('id', session.active_account_id).single();
    const cfg = (data as any)?.config || {};
    boundBrand = cfg.display_name || cfg.username || null;
    const p = cfg.whatsapp_cs?.policy;
    policy = typeof p === 'string' && p.trim() ? p : null;
  }
  const recentTurns = Array.isArray((session.context as any)?.recentTurns) ? (session.context as any).recentTurns : [];
  return { knownName: session.customer_name, boundBrand, warm: isWarm(session), openThreads, recentTurns, policy };
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
}): Promise<string> {
  const { accountId, userMessage, digest } = input;
  const lines: string[] = [];
  lines.push('את/ה Bestie — שירות הלקוחות של המותגים בוואטסאפ. דבר/י בעברית, בגובה העיניים, קצר וברור, בקול המותג.');
  lines.push('כללי ליבה: אל תמציא/י פרטי הזמנה או מדיניות — השתמש/י בכלים (tools). אל תחשוף/י פרטי הזמנה לפני אימות טלפון (הכלי lookup_order עושה זאת). אם אינך יכול/ה לעזור או שהלקוח/ה מבקש/ת אדם — הפעל/י escalate_to_human.');
  lines.push('כשמסלימים לאדם (escalate_to_human): מיד באותו תור כתב/י הודעת סיום קצרה, חמה ואמפתית — הכר/י בבעיה, התנצל/י אם זו תלונה/נזק, והבטח/י שנציג/ה אנושי/ת יחזרו בהקדם. לעולם אל תשאיר/י את הלקוח/ה בשתיקה אחרי הסלמה.');
  lines.push('טון לפי מצב: בתלונה, מוצר פגום, נזק במשלוח או כעס — הורד/י את הטון העליז ואת האימוג׳ים המחייכים, הגב/י ברצינות, אמפתיה והתנצלות אמיתית. אימוג׳י עליז (🙂✨) מתאים רק לשיחה נעימה, לא לתלונה.');
  lines.push('על ברכה פשוטה ("היי") — פתח/י בחום ושאל/י איך אפשר לעזור (או המשך/י בפרוזה נושא פתוח קודם). אל תוביל/י ברכה בהצעה "להעביר לנציג" — הצע/י אדם רק כשבאמת נתקעת או כשהלקוח/ה מבקש/ת.');
  lines.push('תמונות: כשהלקוח/ה שולח/ת תמונה — את/ה רואה אותה ממש. התבונן/י בה, תאר/י בקצרה מה את/ה רואה (מוצר, נזק, תווית, טקסט), אשר/י מול המדיניות (למשל אם המוצר אכן נראה פגום/פתוח), ופעל/י בהתאם. אם התמונה לא ברורה או לא רלוונטית — בקש/י בעדינות תמונה טובה יותר.');
  lines.push('שיחה חופשית בלבד: אין כפתורים ואין רשימות בחירה (WhatsApp interactive) — כל תגובה היא טקסט רגיל. כל בחירה (מותג, המשך פנייה) נעשית בשיחה טבעית: את/ה שואל/ת, הלקוח/ה עונ/ה בטקסט חופשי, ואת/ה מבין/ה, מאשר/ת בפרוזה וממשיכ/ה.');

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
    try {
      const brands = await listCsEnabledBrands();
      if (brands.length) {
        lines.push('\n--- מותגים זמינים שאת/ה משרת/ת (בחר/י את זה שהלקוח/ה מתכוון/ת אליו, אשר/י בפרוזה, ואז קרא/י ל-bind_brand; אם הרשימה גדולה מדי / הלקוח/ה מזכיר/ה משהו שלא כאן — הישענ/י על resolve_brand) ---');
        for (const b of brands.slice(0, MAX_INLINE)) {
          lines.push(`${b.displayName} — ${b.domain || b.username || '—'}`);
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
    try {
      const hits = await searchContentByQuery(accountId, userMessage);
      const rag = formatMetadataForAI(hits).slice(0, 4000);
      if (rag.trim()) lines.push(`\n--- ידע רלוונטי מהמותג (RAG) ---\n${rag}`);
    } catch { /* RAG optional */ }
  }
  return lines.join('\n');
}
