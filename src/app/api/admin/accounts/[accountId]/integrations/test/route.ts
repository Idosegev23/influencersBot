/**
 * POST /api/admin/accounts/[id]/integrations/test
 *   body: { platform: 'quickshop' | 'shopify' }
 *   → does ONE lightweight, read-only live call with the STORED credentials and
 *     reports whether the store answers. Admin-only. Never returns the token.
 *
 * QuickShop: GET /api/v1/orders?limit=1  (X-API-Key)          — 200 ⇒ key works
 * Shopify:   GET /admin/api/<ver>/shop.json (X-Shopify-Access-Token) — 200 ⇒ token+domain work
 *
 * Save first, then test: it reads the persisted config, so the masked token in the
 * form never has to travel back to the server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

const SHOPIFY_API_VERSION = '2024-01';
const TIMEOUT_MS = 8000;

async function withTimeout(p: Promise<Response>): Promise<Response> {
  return Promise.race([
    p,
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
  ]);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const platform = String(body?.platform || '');

  const supabase = await createClient();
  const { data: account, error } = await supabase.from('accounts').select('config').eq('id', accountId).single();
  if (error || !account) return NextResponse.json({ error: 'account not found' }, { status: 404 });

  const cfg = ((account.config as any)?.integrations?.[platform] || {}) as Record<string, any>;

  try {
    if (platform === 'quickshop') {
      const apiKey = cfg.api_key;
      if (!apiKey) return NextResponse.json({ ok: false, message: 'לא נשמר מפתח API — שמרו קודם.' });
      const res = await withTimeout(fetch('https://my-quickshop.com/api/v1/orders?limit=1', {
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      }));
      if (res.ok) {
        const j = await res.json().catch(() => null) as any;
        const total = j?.meta?.pagination?.total;
        return NextResponse.json({ ok: true, message: `החנות מחוברת ✓${typeof total === 'number' ? ` — ${total.toLocaleString('he-IL')} הזמנות` : ''}` });
      }
      return NextResponse.json({ ok: false, message: `החנות דחתה את המפתח (HTTP ${res.status}).` });
    }

    if (platform === 'shopify') {
      const domain = cfg.shop_domain;
      const token = cfg.admin_api_token;
      if (!domain || !token) return NextResponse.json({ ok: false, message: 'חסר דומיין חנות או Admin token — שמרו קודם.' });
      const res = await withTimeout(fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      }));
      if (res.ok) {
        const j = await res.json().catch(() => null) as any;
        const name = j?.shop?.name;
        return NextResponse.json({ ok: true, message: `מחובר ל-${name || 'החנות'} ✓` });
      }
      if (res.status === 401 || res.status === 403) return NextResponse.json({ ok: false, message: 'Admin token נדחה (401/403) — בדקו הרשאות orders/read.' });
      if (res.status === 404) return NextResponse.json({ ok: false, message: 'דומיין החנות לא נמצא (404) — בדקו את xxx.myshopify.com.' });
      return NextResponse.json({ ok: false, message: `שגיאת חיבור (HTTP ${res.status}).` });
    }

    return NextResponse.json({ ok: false, message: 'בדיקת חיבור נתמכת ל-QuickShop ו-Shopify בלבד.' });
  } catch (e) {
    return NextResponse.json({ ok: false, message: `החנות לא הגיבה (${(e as Error).message}).` });
  }
}
