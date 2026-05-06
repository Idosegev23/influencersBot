/**
 * Excel export of an account's support tickets.
 *
 * GET /api/influencer/[username]/support-tickets/export
 *   ?status=new[,in_progress,...]   (optional, comma-separated)
 *   ?from=YYYY-MM-DD                 (optional, lower bound on created_at)
 *   ?to=YYYY-MM-DD                   (optional, upper bound on created_at)
 *   ?q=text                          (optional, free-text — same matcher as list endpoint)
 *
 * Auth: brand-admin on this account OR platform admin.
 *
 * Returns: an .xlsx attachment with columns matching the CRM table.
 * No internal-only columns are included unless we explicitly want them
 * — internal_notes IS included since the export is for the brand team
 * and this is their own data.
 */

import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_STATUSES = new Set([
  'new',
  'in_progress',
  'awaiting_customer',
  'shipped',
  'resolved',
  'closed',
  'cancelled',
]);

const STATUS_LABEL: Record<string, string> = {
  new: 'חדש',
  in_progress: 'בטיפול',
  awaiting_customer: 'ממתין ללקוחה',
  shipped: 'יצא למשלוח',
  resolved: 'טופל',
  closed: 'סגור',
  cancelled: 'בוטל',
};

function ilDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string }> },
) {
  const { username } = await ctx.params;
  const isInfluencer = await checkInfluencerAuth(username);
  const isAdmin = (await requireAdminAuth()) === null;
  if (!isInfluencer && !isAdmin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) {
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const fromIso = url.searchParams.get('from');
  const toIso = url.searchParams.get('to');
  const q = (url.searchParams.get('q') || '').trim();

  // Pull all matching tickets (chunked — Supabase JS caps at 1000).
  type TicketRow = {
    id: string;
    customer_name: string;
    customer_phone: string | null;
    message: string;
    brand: string | null;
    order_number: string | null;
    status: string;
    created_at: string;
    updated_at: string | null;
    resolved_at: string | null;
    ref_source: string | null;
    internal_notes: string | null;
    assigned_to: string | null;
    last_customer_notified_at: string | null;
    tracking_number: string | null;
    resolution_summary: string | null;
  };
  async function pullAll(): Promise<TicketRow[]> {
    const PAGE = 1000;
    const out: TicketRow[] = [];
    let from = 0;
    for (let i = 0; i < 200; i++) {
      let q1 = supabase
        .from('support_requests')
        .select(
          `id, customer_name, customer_phone, message, brand, order_number, status,
           created_at, updated_at, resolved_at, ref_source, internal_notes,
           assigned_to, last_customer_notified_at, tracking_number, resolution_summary`,
        )
        .eq('account_id', influencer.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (statusParam && statusParam !== 'all') {
        const list = statusParam
          .split(',')
          .map((s) => s.trim())
          .filter((s) => VALID_STATUSES.has(s));
        if (list.length > 0) q1 = q1.in('status', list);
      }
      if (fromIso) q1 = q1.gte('created_at', fromIso);
      if (toIso) q1 = q1.lte('created_at', toIso);
      if (q.length > 0) {
        const safe = q.replace(/^#+/, '').replace(/[,()]/g, ' ').slice(0, 80);
        if (safe.length > 0) {
          q1 = q1.or(
            `customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%,order_number.ilike.%${safe}%,message.ilike.%${safe}%`,
          );
        }
      }
      const { data, error } = await q1;
      if (error) {
        console.error('[support export] chunk error:', error);
        break;
      }
      const rows = (data || []) as TicketRow[];
      out.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }

  const tickets = await pullAll();

  // Resolve ref_source slugs to display names from the registry, so the
  // brand team sees "דניאל עמית" instead of "danielamit".
  const cfg = (influencer as any)?._rawConfig || {};
  const registry = (cfg.influencer_registry || []) as Array<{
    slug: string;
    display_name?: string;
    coupon_code?: string;
  }>;
  const refLookup = new Map<string, string>();
  for (const it of registry) {
    if (it.slug) refLookup.set(it.slug.toLowerCase(), it.display_name || it.slug);
    if (it.coupon_code) refLookup.set(it.coupon_code.toLowerCase(), it.display_name || it.slug);
  }
  const friendlyRef = (ref: string | null) =>
    ref ? refLookup.get(ref.toLowerCase()) || ref : '';

  // Build the workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BestieAI';
  wb.created = new Date();

  const ws = wb.addWorksheet('פניות תמיכה', {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: true }],
  });

  ws.columns = [
    { header: 'נפתחה', key: 'created_at', width: 18 },
    { header: 'סטטוס', key: 'status', width: 16 },
    { header: 'שם הלקוחה', key: 'customer_name', width: 22 },
    { header: 'טלפון', key: 'customer_phone', width: 16 },
    { header: 'מספר הזמנה', key: 'order_number', width: 14 },
    { header: 'מותג', key: 'brand', width: 14 },
    { header: 'הגיעה דרך (משפיענית)', key: 'ref_source', width: 20 },
    { header: 'מספר משלוח Focus', key: 'tracking_number', width: 16 },
    { header: 'תוכן הפנייה', key: 'message', width: 40 },
    { header: 'הערות פנימיות', key: 'internal_notes', width: 30 },
    { header: 'סיכום טיפול', key: 'resolution_summary', width: 30 },
    { header: 'מטפל/ת', key: 'assigned_to', width: 14 },
    { header: 'עדכון אחרון ללקוחה', key: 'last_customer_notified_at', width: 18 },
    { header: 'עודכנה', key: 'updated_at', width: 18 },
    { header: 'נסגרה', key: 'resolved_at', width: 18 },
    { header: 'מזהה פנייה', key: 'id', width: 12 },
  ];

  for (const t of tickets) {
    ws.addRow({
      created_at: ilDate(t.created_at),
      status: STATUS_LABEL[t.status] || t.status,
      customer_name: t.customer_name || '',
      customer_phone: t.customer_phone || '',
      order_number: (t.order_number || '').replace(/^#+/, ''),
      brand: t.brand || '',
      ref_source: friendlyRef(t.ref_source),
      tracking_number: t.tracking_number || '',
      message: t.message || '',
      internal_notes: t.internal_notes || '',
      resolution_summary: t.resolution_summary || '',
      assigned_to: t.assigned_to || '',
      last_customer_notified_at: ilDate(t.last_customer_notified_at),
      updated_at: ilDate(t.updated_at),
      resolved_at: ilDate(t.resolved_at),
      id: t.id.slice(0, 8),
    });
  }

  // Header styling
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF883FE2' },
  };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 24;

  // Word-wrap the long-text columns
  ws.getColumn('message').alignment = { wrapText: true, vertical: 'top' };
  ws.getColumn('internal_notes').alignment = { wrapText: true, vertical: 'top' };
  ws.getColumn('resolution_summary').alignment = { wrapText: true, vertical: 'top' };

  const buffer = await wb.xlsx.writeBuffer();
  const today = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }).replace(/\./g, '-');
  const safeBrandName = (influencer.display_name || username).replace(/[^A-Za-zא-ת0-9_-]+/g, '_');
  const filename = `support-${safeBrandName}-${today}.xlsx`;

  return new Response(buffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
