import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * GET /api/influencer/products/ingredients?username=X
 * Returns all unique ingredients that appear across the account's products,
 * counted by occurrence. Used by the catalog's smart-search autocomplete so a
 * follower can search "niacinamide" or "ניאצינמיד" and instantly filter to all
 * products that contain it.
 *
 * Public-readable: products are surface-level catalog data (already shown in
 * the chat tab). Followers don't authenticate, so we accept either an authed
 * influencer/agent session OR an account_id derived from username via the
 * lookup helpers used elsewhere in the public chat flow.
 */
export async function GET(request: NextRequest) {
  try {
    // Try authed path first (influencer/agent preview)
    const auth = await requireInfluencerAuth(request);
    let accountId: string | undefined = auth.authorized ? auth.accountId : undefined;

    // Public follower path — resolve account_id from username
    if (!accountId) {
      const { searchParams } = new URL(request.url);
      const username = searchParams.get('username')?.trim();
      if (!username) {
        return NextResponse.json({ error: 'username required' }, { status: 400 });
      }
      const { data: account } = await supabase
        .from('accounts')
        .select('id')
        .eq('config->>username', username)
        .maybeSingle();
      if (!account?.id) {
        return NextResponse.json({ ingredients: [], total: 0 });
      }
      accountId = account.id;
    }

    const { data, error } = await supabase
      .from('widget_products')
      .select('ingredients, key_ingredients, ai_profile')
      .eq('account_id', accountId)
      .not('slug', 'is', null);

    if (error) {
      return NextResponse.json({ error: 'failed' }, { status: 500 });
    }

    // Build a frequency map. Track separately: full INCI vs key ingredients with notes.
    // Note: we treat the leading Hebrew/English token as the canonical name.
    const counts = new Map<string, { count: number; sample_note?: string }>();
    for (const row of data || []) {
      const all = new Set<string>();
      for (const i of row.ingredients || []) {
        if (typeof i === 'string') all.add(i.trim());
      }
      for (const i of row.key_ingredients || []) {
        if (typeof i === 'string') all.add(i.trim());
      }
      const detailed: { name: string; note: string | null }[] =
        (row.ai_profile as { key_ingredients_detailed?: { name: string; note: string | null }[] })
          ?.key_ingredients_detailed || [];
      for (const ing of all) {
        const cleaned = ing.replace(/^[✔✓\s\-•]+/, '').replace(/[:\s]+$/, '').trim();
        if (!cleaned || cleaned.length > 80) continue;
        // Reject obvious non-ingredients: pure digits, list markers,
        // section headers ("שמנים טבעיים איכותיים:"), or sentences.
        if (/^\d+$/.test(cleaned)) continue;
        if (cleaned.length < 3) continue;
        if (/[.,]\s.*[א-ת]/.test(cleaned)) continue;
        // 4+ Hebrew tokens = a sentence/header, not an ingredient
        if (/[א-ת]{2,}\s+[א-ת]{2,}\s+[א-ת]{2,}\s+[א-ת]{2,}/.test(cleaned)) continue;
        const cur = counts.get(cleaned) || { count: 0 };
        cur.count += 1;
        // Attach a sample note from the detailed list, if available
        if (!cur.sample_note) {
          const match = detailed.find(
            (d) => d.name && (d.name === cleaned || cleaned.startsWith(d.name) || d.name.startsWith(cleaned))
          );
          if (match?.note) cur.sample_note = match.note;
        }
        counts.set(cleaned, cur);
      }
    }

    const ingredients = [...counts.entries()]
      .map(([name, { count, sample_note }]) => ({ name, count, sample_note }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ ingredients, total: ingredients.length });
  } catch (error) {
    console.error('[products/ingredients] error:', error);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
