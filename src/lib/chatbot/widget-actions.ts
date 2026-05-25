/**
 * Widget Actions — concierge envelope.
 *
 * The widget is not a chat-only surface. When the visitor signals an intent
 * the widget can ACT on (open a support ticket, capture a lead, book a demo,
 * apply a coupon), the model emits an <<ACTION>> envelope in the same shape
 * as <<INTENT>>. The handler strips it, parses it, and ships it to the
 * client as an `action` NDJSON event. The client renders an inline
 * confirmation card; one click runs the flow (prefilled with the bot's
 * inference).
 *
 * This pattern is intentionally narrow: actions must be DETERMINISTIC and
 * SCOPED. The model proposes; the visitor confirms; the widget executes.
 * The model never calls APIs directly — keeps blast radius zero.
 *
 * Bestie blast radius: zero. Imported only from `widget-chat-handler.ts`.
 */

export type WidgetActionType = 'open_support' | 'capture_lead' | 'book_demo' | 'apply_coupon' | 'track_order' | 'navigate';

export interface WidgetAction {
  type: WidgetActionType;
  /**
   * Visitor-facing label rendered on the inline confirmation card. The model
   * writes this in the right language; if missing, the client falls back to
   * the locale's generic prompt ("Want to open a support request?").
   */
  label?: string;
  /**
   * Prefill payload. Shape is action-type-specific. Unknown keys are kept
   * as-is so the client can decide what to bind to which field.
   */
  prefill?: Record<string, any>;
}

export interface WidgetModulesFlags {
  support: boolean;
  leads: boolean;
  bookings: boolean;
  // Order tracking is implicit — derived from whether the account has a
  // Shopify integration configured. The bot is told it can use track_order
  // ONLY when this is true; otherwise it must use open_support for order Qs.
  orderTracking?: boolean;
}

const ACTION_RE = /<<ACTION>>([\s\S]*?)<<\/ACTION>>/;

/**
 * Strip the <<ACTION>>...<</ACTION>> envelope from the response. Returns the
 * cleaned text plus the parsed action (null if absent or malformed).
 *
 * Runs AFTER stripSuggestions/stripIntent so all three envelopes can coexist
 * in a single response in any order.
 */
export function stripAction(text: string): { cleanText: string; action: WidgetAction | null } {
  if (!text) return { cleanText: text || '', action: null };
  const match = text.match(ACTION_RE);
  if (!match) return { cleanText: text, action: null };

  let action: WidgetAction | null = null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed && typeof parsed.type === 'string') {
      const t = parsed.type as WidgetActionType;
      const allowed: WidgetActionType[] = ['open_support', 'capture_lead', 'book_demo', 'apply_coupon', 'track_order', 'navigate'];
      if (allowed.includes(t)) {
        action = {
          type: t,
          label: typeof parsed.label === 'string' ? parsed.label.slice(0, 200) : undefined,
          prefill: parsed.prefill && typeof parsed.prefill === 'object' ? parsed.prefill : undefined,
        };
      }
    }
  } catch {
    /* malformed — drop silently */
  }

  const cleanText = text.replace(ACTION_RE, '').replace(/\n\s*\n\s*$/, '').trim();
  return { cleanText, action };
}

/**
 * Build the prompt block that tells the model WHICH actions are available
 * for THIS account (per the modules toggles) and the exact envelope shape.
 *
 * Returns null when no actions are enabled — the prompt stays clean and the
 * model never emits the envelope.
 */
export function buildActionsBlock(modules: WidgetModulesFlags, language: 'he' | 'en'): string | null {
  const available: string[] = [];
  if (modules.support) available.push('open_support');
  if (modules.leads) available.push('capture_lead');
  if (modules.bookings) available.push('book_demo');
  if (modules.orderTracking) available.push('track_order');
  if (!available.length) return null;

  const isEn = language === 'en';

  // Per-action guidance — only emit guidance for the actions actually enabled
  // so the model isn't tempted to propose flows the widget can't carry out.
  const lines: string[] = [];
  if (modules.support) {
    lines.push(isEn
      ? `• open_support — propose when visitor mentions a complaint, return, refund, damaged item, order issue, or anything you cannot resolve in chat. Prefill: { name?, email?, phone?, orderNumber?, category: "order"|"product"|"return"|"shipping"|"other", message: "1-2 sentence summary of the issue in their words" }.`
      : `• open_support — הציע/י כשמדובר בתלונה, החזרה, החזר כספי, מוצר פגום, בעיה בהזמנה, או כל דבר שאי אפשר לפתור בצ'אט. Prefill: { name?, email?, phone?, orderNumber?, category: "order"|"product"|"return"|"shipping"|"other", message: "סיכום 1-2 משפטים של הבעיה במילים שלהם" }.`);
  }
  if (modules.leads) {
    lines.push(isEn
      ? `• capture_lead — propose when visitor shows high intent (asks pricing, asks to "be contacted", "send me info"). Prefill: { name?, email?, phone?, interest? }.`
      : `• capture_lead — הציע/י כשהלקוח/ה מראה כוונת רכישה גבוהה (שואל/ת מחירים, "תיצרו איתי קשר", "תשלחו לי פרטים"). Prefill: { name?, email?, phone?, interest? }.`);
  }
  if (modules.bookings) {
    lines.push(isEn
      ? `• book_demo — propose when visitor wants a demo, walkthrough, or consultation. Prefill: { name?, email?, company?, team_size? }.`
      : `• book_demo — הציע/י כשמבקש/ת דמו, סיור, או ייעוץ. Prefill: { name?, email?, company?, team_size? }.`);
  }
  if (modules.orderTracking) {
    lines.push(isEn
      ? `• track_order — propose when visitor asks "where is my order", "tracking", "when will it arrive", or mentions a specific order number. Prefill: { orderNumber?, email? } only if they actually told you these values. Don't propose for general FAQ about shipping policy — only when they want STATUS of their own order.`
      : `• track_order — הציע/י כשהלקוח/ה שואל/ת "איפה ההזמנה שלי", "מעקב", "מתי יגיע", או מזכיר/ה מספר הזמנה ספציפי. Prefill: { orderNumber?, email? } רק אם נמסרו ערכים אמיתיים. אל תציע/י לשאלות כלליות על מדיניות משלוח — רק כשרוצים סטטוס של ההזמנה שלהם.`);
  }
  // Navigate is ALWAYS available — it's a navigation hint, not a feature module.
  // The bot uses it when a specific page on this site would clearly answer the
  // question better than continuing the conversation (e.g. visitor asks "how
  // much does X cost" and there's a pricing page).
  lines.push(isEn
    ? `• navigate — propose when a specific page on this site would directly answer the visitor's question (pricing, contact, catalog, a specific product, docs). Prefill: { url: "https://full-url" OR "/relative-path", label?: "short context label" }. Use URLs from the KNOWN PAGES block below, the page context, or links the visitor mentioned; don't invent URLs. ALWAYS emit a navigate action when the visitor asks "where can I find X", "how do I get to Y", "show me Z", "take me to W" and X/Y/Z/W maps to a KNOWN PAGE — don't just describe the destination in text, propose the action so they can click through.`
    : `• navigate — הציע/י כשעמוד ספציפי באתר ייתן תשובה ישירה לשאלת המבקר/ת (מחירים, צור קשר, קטלוג, מוצר ספציפי, מסמכים). Prefill: { url: "https://full-url" או "/relative-path", label?: "תיאור קצר" }. השתמש/י ב-URLs מבלוק KNOWN PAGES למטה, מההקשר של העמוד, או מהודעת המבקר/ת; אל תמציא/י URL. **חובה** להוציא navigate action כשהמבקר/ת שואל/ת "איפה X", "איך מגיעים ל-Y", "תראה/י לי את Z", "קח/י אותי ל-W" וזה מתאים לעמוד ב-KNOWN PAGES — אל תתאר/י את היעד בטקסט בלבד, הציע/י action שאפשר ללחוץ.`);

  const header = isEn
    ? `🎯 CONCIERGE ACTIONS — you can propose ONE inline action per turn when appropriate.`
    : `🎯 פעולות קונסיירז' — את/ה יכול/ה להציע פעולה אחת בכל תור כשמתאים.`;

  const usage = isEn
    ? `Emit the envelope at the END of the response (after <<INTENT>>):
<<ACTION>>{"type":"...","label":"short visitor-facing prompt","prefill":{...}}<</ACTION>>
• label: ONE short sentence (max 14 words) in the visitor's language, framed as an offer ("Want me to open a ticket about the damaged bottle?"). Reference what they said.
• prefill: ONLY fields you have signal for. Don't invent name/email/phone.
🚫 Do NOT propose actions for casual chat, product browsing, FAQ answers, or anything you successfully answered.
🚫 Do NOT show the envelope in the visible reply — it's stripped before display.
🚫 Maximum ONE <<ACTION>> per response. If unsure, don't emit one.`
    : `שלח/י את העטיפה בסוף התשובה (אחרי <<INTENT>>):
<<ACTION>>{"type":"...","label":"משפט קצר ללקוח","prefill":{...}}<</ACTION>>
• label: משפט אחד קצר (עד 14 מילים) בשפת הלקוח, מנוסח כהצעה ("רוצה שאפתח פנייה על הבקבוק הפגום?"). תתייחס/י למה שאמר/ה.
• prefill: רק שדות שיש לך סיגנל אליהם. אל תמציא/י שם/מייל/טלפון.
🚫 אל תציע/י פעולות בשיחת חולין, גלישה במוצרים, או כשענית בהצלחה.
🚫 אל תראה/י את העטיפה בתשובה — היא נחתכת לפני שמציגים.
🚫 מקסימום <<ACTION>> אחד בתשובה. בספק — אל תשלח/י.`;

  return [header, ...lines, '', usage].join('\n');
}

/**
 * Build a compact page-context block injected into the system prompt.
 * Null when the visitor is on a page we couldn't extract anything useful from
 * (very rare — even a title is something).
 */
export interface PageContext {
  url?: string | null;
  path?: string | null;
  title?: string | null;
  h1?: string | null;
  lang?: string | null;
  product?: {
    name?: string | null;
    image?: string | null;
    price?: number | null;
    currency?: string | null;
    sku?: string | null;
    brand?: string | null;
    availability?: string | null;
    source?: string;
  } | null;
  article?: { title?: string | null; author?: string | null; section?: string | null } | null;
  breadcrumb?: string[] | null;
  cart?: {
    item_count?: number | null;
    total?: number | null;
    currency?: string | null;
    items?: Array<{ title: string; qty: number; price?: number | null }>;
    source?: string;
  } | null;
}

export function buildPageContextBlock(ctx: PageContext | null | undefined, language: 'he' | 'en'): string | null {
  if (!ctx) return null;
  const isEn = language === 'en';

  const bits: string[] = [];
  if (ctx.product?.name) {
    const priceTxt = ctx.product.price != null
      ? ` (${ctx.product.currency || ''}${ctx.product.price})`
      : '';
    bits.push(isEn
      ? `Visitor is on a product page: "${ctx.product.name}"${priceTxt}.`
      : `הלקוח/ה נמצא/ת בעמוד מוצר: "${ctx.product.name}"${priceTxt}.`);
    if (ctx.product.availability) {
      bits.push(isEn
        ? `Availability: ${ctx.product.availability}.`
        : `זמינות: ${ctx.product.availability}.`);
    }
  } else if (ctx.article?.title) {
    bits.push(isEn
      ? `Visitor is reading an article: "${ctx.article.title}".`
      : `הלקוח/ה קורא/ת מאמר: "${ctx.article.title}".`);
  } else if (ctx.h1) {
    bits.push(isEn
      ? `Visitor is on page titled: "${ctx.h1}".`
      : `הלקוח/ה בעמוד: "${ctx.h1}".`);
  } else if (ctx.title) {
    bits.push(isEn
      ? `Page title: "${ctx.title}".`
      : `כותרת העמוד: "${ctx.title}".`);
  }

  if (ctx.breadcrumb?.length) {
    bits.push(isEn
      ? `Section path: ${ctx.breadcrumb.join(' › ')}.`
      : `מיקום באתר: ${ctx.breadcrumb.join(' › ')}.`);
  }

  if (ctx.cart?.item_count != null && ctx.cart.item_count > 0) {
    bits.push(isEn
      ? `Cart has ${ctx.cart.item_count} item(s)${ctx.cart.total != null ? ` (total ${ctx.cart.currency || ''}${ctx.cart.total})` : ''}.`
      : `יש בעגלה ${ctx.cart.item_count} פריטים${ctx.cart.total != null ? ` (סה"כ ${ctx.cart.currency || ''}${ctx.cart.total})` : ''}.`);
    // Surface individual cart items when available — lets the bot reason
    // about pairings, missing companions, conflicting choices, etc.
    const items = (ctx.cart as any).items as Array<{ title: string; qty: number; price?: number }> | undefined;
    if (Array.isArray(items) && items.length) {
      const itemList = items.slice(0, 5).map((it) => `${it.title} ×${it.qty}`).join('; ');
      bits.push(isEn ? `Cart items: ${itemList}.` : `פריטים בעגלה: ${itemList}.`);
    }
  }

  if (!bits.length) return null;

  const header = isEn
    ? `📍 PAGE CONTEXT — what the visitor is looking at RIGHT NOW. Reference it naturally ("about this product...", "as you can see on this page..."). If you see CART items above, you may PROACTIVELY suggest companion products that complete the routine/set, or flag conflicting choices — but only when relevant; don't lecture.`
    : `📍 הקשר העמוד — מה הלקוח/ה רואה כרגע. תתייחס/י לזה באופן טבעי ("לגבי המוצר הזה...", "כמו שאת/ה רואה בעמוד..."). אם רואה/ת פריטים בעגלה למעלה, את/ה רשאי/ת להציע פרואקטיבית מוצרים משלימים לשגרה/לסט, או לסמן בחירות שמתנגשות — רק כשרלוונטי, לא להרצות.`;

  return `${header}\n${bits.join(' ')}`;
}

/**
 * Returning-visitor recognition block — added when we identify the visitor
 * as someone we've seen before (linked via anon_id to a prior chat_lead).
 * Lets the bot greet by name and pick up where they left off.
 */
export interface ReturningVisitor {
  firstName?: string | null;
  lastTopic?: string | null;
  visitCount?: number;
}

/**
 * Navigation links — curated list of important pages the bot should know about
 * so it can offer `navigate` actions confidently. Without this, the model is
 * instructed never to invent URLs, so it can't propose taking the visitor
 * anywhere except pages it sees in page context or the visitor's message.
 *
 * Each entry: { label: "Catalog", url: "/catalog" } or absolute URL.
 */
export interface NavigationLink {
  label: string;
  url: string;
  description?: string; // optional one-line hint when to suggest this page
}

export function buildNavigationLinksBlock(links: NavigationLink[] | null | undefined, language: 'he' | 'en'): string | null {
  if (!Array.isArray(links) || !links.length) return null;
  const isEn = language === 'en';
  const header = isEn
    ? `🔗 KNOWN PAGES ON THIS SITE — when a visitor's question maps to one of these, propose a navigate action with the matching URL:`
    : `🔗 עמודים ידועים באתר — כשהשאלה של המבקר/ת מתאימה לאחד מהם, הציע/י navigate action עם ה-URL המתאים:`;
  const list = links
    .filter((l) => l && typeof l.label === 'string' && typeof l.url === 'string')
    .slice(0, 20)
    .map((l) => `• ${l.label} → ${l.url}${l.description ? ` (${l.description})` : ''}`)
    .join('\n');
  return `${header}\n${list}`;
}

/**
 * Auto-derive navigation links from the account's scraped `documents`.
 * Most customers won't manually curate the list — but we already crawl their
 * site for RAG, so we have every URL + title for free. Pick top-level pages
 * (path depth ≤ 2) and filter out product-detail / dynamic-pattern pages
 * that wouldn't make useful navigation suggestions.
 *
 * Returns up to 15 links, deduped by URL path. Empty array when the account
 * has no website documents (e.g. IMAI scraped via different pipeline).
 */
export function deriveNavigationLinksFromDocs(
  docs: Array<{ title?: string | null; metadata?: any }>,
): NavigationLink[] {
  if (!Array.isArray(docs)) return [];

  type Candidate = NavigationLink & { _depth: number; _len: number };
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  for (const d of docs) {
    const url = d?.metadata?.url;
    if (!url || typeof url !== 'string') continue;

    let path: string;
    try {
      const u = new URL(url);
      path = u.pathname.replace(/\/$/, '') || '/';
    } catch { continue; }

    const segments = path.split('/').filter(Boolean);
    // Keep root + 1-2 segment paths only — anything deeper is usually a
    // product detail or article, not a navigation target.
    if (segments.length > 2) continue;
    // Skip obvious dynamic / detail patterns
    const last = segments[segments.length - 1] || '';
    if (/^\d+$/.test(last)) continue;                      // /products/12345
    if (/^[0-9a-f]{8,}$/i.test(last)) continue;            // hash slugs
    if (/^(product|p|item|sku|page)$/i.test(segments[0] || '')) continue; // /product/...
    if (/\.(jpg|png|pdf|webp|svg)$/i.test(last)) continue;  // file URLs
    // Skip percent-encoded Hebrew/Cyrillic slugs — those are product names
    // baked into the URL and don't make readable navigation targets.
    if (/%[0-9a-f]{2}/i.test(path)) continue;

    // Clean label — strip common "Page | Brand" / "Page - Brand" suffixes
    let label = (d.title || '').toString().trim();
    label = label.split(' | ')[0].split(' – ')[0].split(' — ')[0].split(' - ')[0].trim();
    if (!label || label.length < 2) label = last || 'Home';
    if (label.length > 50) label = label.slice(0, 50);

    const dedupKey = path;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    candidates.push({ label, url: path, _depth: segments.length, _len: path.length });
  }

  // Prefer shortest, shallowest paths — root → 1-segment → 2-segment.
  // Within the same depth, shorter path wins.
  candidates.sort((a, b) => a._depth - b._depth || a._len - b._len);

  return candidates.slice(0, 15).map(({ label, url }) => ({ label, url }));
}

export function buildReturningVisitorBlock(visitor: ReturningVisitor | null, language: 'he' | 'en'): string | null {
  if (!visitor || !visitor.firstName) return null;
  const isEn = language === 'en';
  const topic = visitor.lastTopic
    ? (isEn ? ` Last conversation was about "${visitor.lastTopic}".` : ` בשיחה הקודמת דיברנו על "${visitor.lastTopic}".`)
    : '';
  const header = isEn
    ? `👋 RETURNING VISITOR — this is ${visitor.firstName}, who's visited before.${topic} If they open with a greeting, address them by first name warmly ("Hi ${visitor.firstName}, good to see you again"). Don't be creepy about it — once is plenty.`
    : `👋 לקוח/ה חוזר/ת — זה/זו ${visitor.firstName}, שכבר ביקר/ה כאן.${topic} אם נפתח/ת בברכה, פנה/י בשמו/ה בחום ("היי ${visitor.firstName}, כיף לראות אותך שוב"). בלי להגזים — פעם אחת מספיק.`;
  return header;
}
