import { supabase as supabaseAdmin } from '@/lib/supabase';
import { buildPersonalityFromDB } from '@/lib/chatbot/personality-wrapper';
import { searchContentByQuery, formatMetadataForAI } from '@/lib/chatbot/hybrid-retrieval';
import { isWarm, type CsSessionRow } from '@/lib/cs/cs-session';

// The brain always appends <<SUGGESTIONS>>…; a WhatsApp channel MUST strip it before sending.
export function stripSuggestions(text: string): string {
  return (text || '').replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
}

export interface CsContextDigest {
  knownName: string | null;
  boundBrand: string | null; // brand display name, or null when unbound
  warm: boolean;             // last activity < 45 min
  openThreads: Array<{ ticketId: string; brand: string; topic: string }>;
}

export async function buildContextDigest(
  session: CsSessionRow,
  openThreads: Array<{ ticketId: string; brand: string; topic: string }>,
): Promise<CsContextDigest> {
  let boundBrand: string | null = null;
  if (session.active_account_id) {
    const { data } = await supabaseAdmin.from('accounts').select('config').eq('id', session.active_account_id).single();
    const cfg = (data as any)?.config || {};
    boundBrand = cfg.display_name || cfg.username || null;
  }
  return { knownName: session.customer_name, boundBrand, warm: isWarm(session), openThreads };
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

  if (digest.knownName) lines.push(`שם הלקוח/ה: ${digest.knownName}. אל תשאל/י שוב לשם.`);
  else lines.push('שם הלקוח/ה עדיין לא ידוע — אפשר לשאול פעם אחת, בטבעיות.');

  if (digest.boundBrand) lines.push(`מותג פעיל: ${digest.boundBrand} — כל הכלים מכוונים אליו.`);
  else lines.push('טרם נבחר מותג — שאל/י לאיזה מותג לפנות, קרא/י ל-resolve_brand, ובאישור הלקוח/ה ל-bind_brand.');

  if (digest.warm) lines.push('שיחה חמה (פחות מ-45 דק׳) — המשך/י ברצף בלי לחזור על שאלות פתיחה.');
  if (digest.openThreads.length === 1) {
    const t = digest.openThreads[0];
    lines.push(`פנייה פתוחה אחת: ${t.brand} · ${t.topic}. הצע/י בעדינות להמשיך אותה (show_buttons: "כן, ממשיכים" / "משהו אחר").`);
  } else if (digest.openThreads.length >= 2) {
    lines.push(`יש ${digest.openThreads.length} פניות פתוחות — הצג/י אותן עם show_list כדי לבחור (כולל שורת "➕ פנייה חדשה").`);
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
