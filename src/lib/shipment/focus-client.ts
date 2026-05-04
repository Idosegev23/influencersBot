/**
 * Focus Delivery (focusdelivery.co.il) — shipment status PULL client.
 *
 * The PULL endpoint:
 *   https://<host>/RunCom.Server/Request.aspx
 *     ?APPNAME=run
 *     &PRGNAME=ship_status_xml
 *     &ARGUMENTS=-N<P1>,-A<P2>
 *
 * P1 = numeric shipment number (Focus-side ship_no)
 * P2 = brand prefix + reference number (use empty if querying by P1)
 *
 * Response is XML. We parse → filter → return a customer-safe summary.
 *
 * IMPORTANT: This module deliberately strips ALL internal / driver /
 * billing fields before returning to the caller. Even the route that
 * uses this client should not echo the raw response. Only the
 * { customerView } object is safe to expose.
 */

import { XMLParser } from 'fast-xml-parser';

const TIMEOUT_MS = 8000;

export interface FocusCustomerStatusView {
  found: boolean;
  shipmentNumber: string | null;
  // Friendly Hebrew status string (we map common Focus stages to nicer
  // copy; otherwise we passthrough the Hebrew description from Focus)
  statusText: string;
  isDelivered: boolean;
  isCanceled: boolean;
  isReturned: boolean;
  // Last activity (date+time strings as Focus returns them, dd/mm/yyyy + HH:mm:ss)
  lastUpdate: { date: string | null; time: string | null };
  // Friendly destination — typically a branch name; never numeric codes
  destinationBranch: string | null;
  shipmentDirection: string | null; // "מסירה" / "איסוף" / etc.
  // Optional: ordered list of stage transitions (status_desc only,
  // no codes). Useful for a "timeline" view.
  history: Array<{ desc: string; date: string | null; time: string | null }>;
  // If Focus returned an explicit error/message ("משלוח לא נמצא")
  errorMessage: string | null;
  // Source provider hint
  provider: 'focus';
}

const FRIENDLY_STAGE_OVERRIDES: Record<string, string> = {
  'חדש': 'הוזן במערכת',
  'שובץ להעמסה': 'שובץ להעמסה — בדרך לסניף הפצה',
  'נמסר': 'נמסר ללקוח 🎉',
  'בסניף': 'הגיע לסניף ההפצה',
  'בדרך': 'בדרך אליכם',
  'הוחזר': 'הוחזר לסניף — צרו קשר עם שירות הלקוחות',
  'בוטל': 'המשלוח בוטל',
};

function friendlyStage(raw: string | undefined | null): string {
  if (!raw) return 'אין מידע על סטטוס';
  return FRIENDLY_STAGE_OVERRIDES[raw.trim()] || raw.trim();
}

function safeStr(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Magic-XML placeholders look like "<!$MG_xxx>" — treat as null
  if (s.startsWith('<!$MG_')) return null;
  return s;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  trimValues: true,
});

/**
 * Look up shipment status by P1 (numeric ship_no) or P2 (brand+ref).
 * Returns a customer-safe summary; never throws on a not-found result —
 * `found: false` carries that signal.
 */
export async function getFocusShipmentStatus(args: {
  host: string;       // e.g. 'focusdelivery.co.il'
  shipmentNumber?: string;  // P1
  reference?: string;       // P2
}): Promise<FocusCustomerStatusView> {
  const { host, shipmentNumber, reference } = args;

  if (!host) throw new Error('Focus host not configured');
  if (!shipmentNumber && !reference) throw new Error('Either shipmentNumber or reference is required');

  const p1 = shipmentNumber ? encodeURIComponent(shipmentNumber.trim()) : '';
  const p2 = reference ? encodeURIComponent(reference.trim()) : '';
  const url = `https://${host}/RunCom.Server/Request.aspx?APPNAME=run&PRGNAME=ship_status_xml&ARGUMENTS=-N${p1},-A${p2}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let xmlText = '';
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Focus returned ${res.status}`);
    }
    xmlText = await res.text();
  } finally {
    clearTimeout(t);
  }

  const parsed = xmlParser.parse(xmlText);
  const root = parsed?.root;
  const data = root?.mydata || {};

  const errorMessage = safeStr(data.message);
  const ship_no = safeStr(data.ship_no);
  const shgiya_yn = safeStr(data.shgiya_yn);
  const found = shgiya_yn !== 'y' && ship_no !== '0' && ship_no !== null;

  if (!found) {
    return {
      found: false,
      shipmentNumber: null,
      statusText: errorMessage || 'משלוח לא נמצא',
      isDelivered: false,
      isCanceled: false,
      isReturned: false,
      lastUpdate: { date: null, time: null },
      destinationBranch: null,
      shipmentDirection: null,
      history: [],
      errorMessage,
      provider: 'focus',
    };
  }

  const stages = asArray(data.status).map((s: any) => ({
    desc: safeStr(s?.status_desc) || '',
    date: safeStr(s?.status_date),
    time: safeStr(s?.status_time),
  })).filter((s: any) => s.desc);

  const currentDesc = safeStr(data.current_stage_desc) || (stages[stages.length - 1]?.desc ?? null);

  const isDelivered = safeStr(data.ship_delivered_yn) === 'y';
  const isReturned = safeStr(data.ship_delivered_back_yn) === 'y';
  const isCanceled = safeStr(data.ship_canceled_yn) === 'y';

  const last_scan_date = safeStr(data.last_scan_date);
  const last_scan_time = safeStr(data.last_scan_time);
  const lastStage = stages[stages.length - 1];

  return {
    found: true,
    shipmentNumber: ship_no,
    statusText: friendlyStage(currentDesc),
    isDelivered,
    isCanceled,
    isReturned,
    lastUpdate: {
      date: last_scan_date && last_scan_date !== '00/00/0000' ? last_scan_date : (lastStage?.date ?? null),
      time: last_scan_time && last_scan_time !== '00:00:00' ? last_scan_time : (lastStage?.time ?? null),
    },
    destinationBranch: safeStr(data.destination_branch_name),
    shipmentDirection: safeStr(data.shipment_direction),
    history: stages,
    errorMessage: null,
    provider: 'focus',
  };
}
