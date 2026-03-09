/**
 * compact-knowledge-context.ts
 *
 * Trims, deduplicates, and caps the knowledge context that gets injected
 * into the LLM system prompt.  Goal: reduce tokens-in without losing
 * critical information (coupon codes, links, key facts).
 */

import type { KnowledgeBase } from '@/lib/chatbot/knowledge-retrieval';

// ============================================
// Config
// ============================================

export interface CompactOptions {
  /** Overall character budget for the entire context string */
  maxTotalChars: number;
  /** Max items per section */
  maxPosts: number;
  maxTranscriptions: number;
  maxHighlights: number;
  maxPartnerships: number;
  maxWebsites: number;
  /** Per-item character caps */
  maxPostChars: number;
  maxTranscriptionChars: number;
  maxHighlightChars: number;
  maxWebsiteChars: number;
}

const DEFAULTS: CompactOptions = {
  maxTotalChars: 30_000,
  maxPosts: 8,
  maxTranscriptions: 8,
  maxHighlights: 6,
  maxPartnerships: 15,
  maxWebsites: 10,
  maxPostChars: 1500,
  maxTranscriptionChars: 1500,
  maxHighlightChars: 600,
  maxWebsiteChars: 2000,
};

// ============================================
// Result type
// ============================================

export interface CompactResult {
  context: string;
  stats: {
    inputChars: number;
    outputChars: number;
    reductionPct: number;
    deduplicatedItems: number;
    sections: Record<string, number>;
  };
}

// ============================================
// Helpers
// ============================================

/** Truncate text to maxLen, appending "..." if trimmed */
function truncate(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text || '';
  return text.substring(0, maxLen - 3) + '...';
}

/**
 * Build a fingerprint for dedup: lowercase first N chars, stripped of whitespace.
 * Two items whose fingerprints match are considered duplicates.
 */
function fingerprint(text: string, len = 80): string {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, len);
}

// ============================================
// Main function
// ============================================

export function compactKnowledgeContext(
  kb: KnowledgeBase,
  overrides?: Partial<CompactOptions>,
): CompactResult {
  const opts = { ...DEFAULTS, ...overrides };
  const seen = new Set<string>();
  let deduplicatedItems = 0;
  const sectionCounts: Record<string, number> = {};

  /** Returns true if this text was already seen (duplicate). Adds it otherwise. */
  function isDuplicate(text: string): boolean {
    const fp = fingerprint(text);
    if (!fp) return false;
    if (seen.has(fp)) {
      deduplicatedItems++;
      return true;
    }
    seen.add(fp);
    return false;
  }

  // --- Measure input size ---
  const inputChars = measureKB(kb);

  // --- Build sections (order matters: coupons first — they're critical) ---
  let context = '';

  // 1. Coupons (never truncated, never deduped — they're small and critical)
  if (kb.coupons?.length > 0) {
    const now = new Date();
    const activeCoupons = kb.coupons.filter(c => {
      if (c.end_date) {
        return new Date(c.end_date) >= now;
      }
      return true;
    });
    const expiredCount = kb.coupons.length - activeCoupons.length;

    let section = `\n💰 **קופונים זמינים (${activeCoupons.length}) - CRITICAL: שמות המותגים יכולים להיות באנגלית או בעברית:**\n`;
    activeCoupons.forEach((c, i) => {
      section += `${i + 1}. מותג: ${c.brand || c.code}`;
      if (c.discount && !c.discount.includes('לחץ על הקישור')) {
        section += ` | הנחה: ${c.discount}`;
      }
      if (c.code) section += ` | קוד: ${c.code}`;
      if (c.link) section += ` | LINK: ${c.link}`;
      if (c.end_date) section += ` | בתוקף עד: ${c.end_date}`;
      section += '\n';
    });
    if (expiredCount > 0) {
      section += `(${expiredCount} קופונים נוספים פגו תוקף ולא מוצגים)\n`;
    }
    section += `⚠️ חפש מותגים גם בעברית וגם באנגלית (ספרינג=Spring, ארגניה=Argania, ליבס=Leaves, רנואר=Renuar). אם יש LINK — הצג כ-[לחצי כאן](LINK).\n`;
    context += section;
    sectionCounts.coupons = activeCoupons.length;
  }

  // 2. Posts
  if (kb.posts?.length > 0) {
    const items = kb.posts.slice(0, opts.maxPosts);
    let count = 0;
    let section = `\n📸 **פוסטים (${kb.posts.length}):**\n`;
    for (const p of items) {
      const caption = p.caption || 'ללא כיתוב';
      if (isDuplicate(caption)) continue;
      let line = `${++count}. ${truncate(caption, opts.maxPostChars)}`;
      // Add engagement info if available
      const meta: string[] = [];
      if (p.post_url) meta.push(`URL: ${p.post_url}`);
      if (p.likes_count > 0) meta.push(`❤️ ${p.likes_count}`);
      if (p.comments_count && p.comments_count > 0) meta.push(`💬 ${p.comments_count}`);
      if (p.is_sponsored) meta.push('📢 ממומן');
      if (meta.length > 0) line += `\n   [${meta.join(' | ')}]`;
      section += line + '\n\n';
    }
    if (count > 0) context += section;
    sectionCounts.posts = count;
  }

  // 3. Transcriptions
  if (kb.transcriptions?.length > 0) {
    const items = kb.transcriptions.slice(0, opts.maxTranscriptions);
    let count = 0;
    let section = `\n🎥 **תמלולים (${kb.transcriptions.length}):**\n`;
    for (const t of items) {
      if (isDuplicate(t.text)) continue;
      let line = `${++count}. ${truncate(t.text, opts.maxTranscriptionChars)}`;
      // Include on-screen text (OCR) if available
      if (t.on_screen_text && Array.isArray(t.on_screen_text) && t.on_screen_text.length > 0) {
        const ocrText = t.on_screen_text.join(' | ');
        if (ocrText.trim()) {
          line += `\n   📝 טקסט על המסך: ${truncate(ocrText, 300)}`;
        }
      }
      section += line + '\n\n';
    }
    if (count > 0) context += section;
    sectionCounts.transcriptions = count;
  }

  // 4. Highlights
  if (kb.highlights?.length > 0) {
    const items = kb.highlights.slice(0, opts.maxHighlights);
    let count = 0;
    let section = `\n✨ **הילייטס (${kb.highlights.length}):**\n`;
    for (const h of items) {
      const text = h.content_text || '';
      if (text && isDuplicate(text)) continue;
      let line = `${++count}. "${h.title}"`;
      if (text.trim()) {
        line += ` — ${truncate(text, opts.maxHighlightChars)}`;
      }
      section += line + '\n';
    }
    if (count > 0) context += section;
    sectionCounts.highlights = count;
  }

  // 5. Partnerships — split into "with coupons" (critical!) and "without"
  if (kb.partnerships?.length > 0) {
    const withCoupons = kb.partnerships.filter(p => p.coupon_code);
    const withoutCoupons = kb.partnerships.filter(p => !p.coupon_code);

    if (withCoupons.length > 0) {
      let section = `\n🎟️ **קופונים מתוך שותפויות (${withCoupons.length}) - CRITICAL:**\n`;
      section += `⚠️ התאם שמות מותגים בגמישות: "fre"="FRÉ", "קליניק"="Clinique", "לוריאל"="L'Oréal", כתיב חלקי/עברית/אנגלית — הכל תואם!\n`;
      withCoupons.forEach((p, i) => {
        section += `${i + 1}. 🏷️ ${p.brand_name || (p as any).brandName} → קוד: "${p.coupon_code}"`;
        if (p.link) section += ` | LINK: ${p.link}`;
        const brief = (p as any).brief || p.description;
        if (brief) section += ` (${truncate(brief, 60)})`;
        section += '\n';
      });
      context += section;
    }

    if (withoutCoupons.length > 0) {
      let section = `\n🤝 **שותפויות נוספות (${withoutCoupons.length}):**\n`;
      withoutCoupons.forEach((p, i) => {
        section += `${i + 1}. ${p.brand_name || (p as any).brandName}`;
        if (p.link) section += ` | ${p.link}`;
        const brief = (p as any).brief || p.description;
        if (brief) section += ` - ${truncate(brief, 80)}`;
        section += '\n';
      });
      context += section;
    }

    sectionCounts.partnerships = kb.partnerships.length;
  }

  // 6. Insights
  if (kb.insights?.length > 0) {
    const items = kb.insights.slice(0, 3);
    let section = `\n💡 **תובנות (${kb.insights.length}):**\n`;
    items.forEach((ins, i) => {
      let line = `${i + 1}. ${truncate((ins as any).insight || ins.content, 150)}`;
      if (ins.occurrence_count > 1) line += ` (נשאל ${ins.occurrence_count} פעמים)`;
      const suggested = (ins as any).suggested_response;
      if (suggested) line += `\n   💬 תשובה מומלצת: ${truncate(suggested, 200)}`;
      section += line + '\n';
    });
    context += section;
    sectionCounts.insights = items.length;
  }

  // 7. Websites
  if (kb.websites?.length > 0) {
    const items = kb.websites.slice(0, opts.maxWebsites);
    let section = `\n🌐 **אתרים וקישורים (${kb.websites.length}):**\n`;
    items.forEach((w, i) => {
      section += `${i + 1}. ${w.title || w.url}`;
      if (w.url) section += ` | URL: ${w.url}`;
      section += '\n';
      if (w.content) section += `   ${truncate(w.content, opts.maxWebsiteChars)}\n`;
      const productImages = (w.image_urls || []).filter(
        (u: string) => !u.includes('butterfly-button') && !u.includes('favicon') && !u.includes('logo')
      );
      if (productImages.length) {
        section += `   🖼️ תמונות: ${productImages.slice(0, 2).join(' , ')}\n`;
      }
    });
    context += section;
    sectionCounts.websites = items.length;
  }

  // --- Hard cap on total size ---
  if (context.length > opts.maxTotalChars) {
    context = context.substring(0, opts.maxTotalChars - 20) + '\n...(נחתך)\n';
  }

  // Prepend header
  const header = context.trim()
    ? '📚 **בסיס הידע שלי (עכל את המידע והסבר בשפה שלך — אל תצטט ואל תקריא, אלא הסבר בטבעיות כאילו את/ה מדבר/ת מהידע שלך):**\n'
    : '📚 **בסיס ידע:** אין מידע זמין כרגע.';
  context = header + context;

  const outputChars = context.length;
  const reductionPct = inputChars > 0
    ? Math.round((1 - outputChars / inputChars) * 100)
    : 0;

  return {
    context,
    stats: {
      inputChars,
      outputChars,
      reductionPct,
      deduplicatedItems,
      sections: sectionCounts,
    },
  };
}

// ============================================
// Input size measurement (for stats)
// ============================================

function measureKB(kb: KnowledgeBase): number {
  let size = 0;
  kb.posts?.forEach(p => { size += (p.caption || '').length; });
  kb.transcriptions?.forEach(t => { size += (t.text || '').length; });
  kb.highlights?.forEach(h => { size += (h.content_text || '').length + (h.title || '').length; });
  kb.coupons?.forEach(c => { size += (c.brand || '').length + (c.code || '').length + (c.discount || '').length + (c.link || '').length; });
  kb.partnerships?.forEach(p => { size += (p.brand_name || '').length + (p.description || '').length; });
  kb.insights?.forEach(i => { size += (i.content || '').length; });
  kb.websites?.forEach(w => { size += (w.content || '').length + (w.title || '').length; });
  return size;
}
