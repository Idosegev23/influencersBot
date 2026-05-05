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
  shipmentNumber?: string;  // P1 — Focus ship_no (7 digits, from email)
  reference?: string;       // P2 — order_number (Shopify), the customer-side id
  customerCode?: number;    // master_customer_id at Focus, e.g. 10038 for LA BEAUTÉ.
                            // REQUIRED to scope P2 lookups by reference. Without
                            // it Focus does global ship_no lookup with no scope.
  expectedMasterCustomerId?: number; // legacy belt-and-suspenders: drop
                                     // responses with a different master.
                                     // Now redundant when customerCode is set
                                     // (Focus does the scoping itself), but
                                     // safe to keep.
}): Promise<FocusCustomerStatusView> {
  const { host, shipmentNumber, reference, customerCode, expectedMasterCustomerId } = args;

  if (!host) throw new Error('Focus host not configured');
  if (!shipmentNumber && !reference) throw new Error('Either shipmentNumber or reference is required');

  // Focus's `ship_status_xml` accepts a 4-slot ARGUMENTS string:
  //   slot 1: -N<ship_no>      (or empty)
  //   slot 2: -A<reference>    (the customer's order_number)
  //   slot 3: -A               (legacy / unused)
  //   slot 4: -N<customer_code>   (master_customer_id — REQUIRED for P2)
  //
  // Two valid shapes Focus supports:
  //   • P1 only:   `-N<shipNo>,-A`                — ship_no global lookup
  //   • P2 scoped: `-N,-A<ref>,-A,-N<customer>`   — order# scoped to one
  //                                                 customer master
  // The scoped form is what Tzvika at Focus confirmed (2026-05-05) — it
  // returns the actual ship_no for that customer's order, with no risk
  // of a cross-brand collision.
  let argsStr: string;
  if (reference && customerCode != null) {
    // Scoped P2 — preferred for any reference lookup
    argsStr = `-N,-A${encodeURIComponent(reference.trim())},-A,-N${encodeURIComponent(String(customerCode))}`;
  } else if (shipmentNumber && reference) {
    argsStr = `-N${encodeURIComponent(shipmentNumber.trim())},-A${encodeURIComponent(reference.trim())}`;
  } else if (shipmentNumber) {
    argsStr = `-N${encodeURIComponent(shipmentNumber.trim())},-A`;
  } else {
    // Legacy unscoped P2 — kept for older callers; Focus parses it but
    // returns a global ship_no fallback so callers should pass
    // customerCode whenever possible.
    argsStr = `-A${encodeURIComponent(reference!.trim())}`;
  }
  const url = `https://${host}/RunCom.Server/Request.aspx?APPNAME=run&PRGNAME=ship_status_xml&ARGUMENTS=${argsStr}`;

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
  const responseMasterCustomerId = safeStr(data.master_customer_id);

  let found = shgiya_yn !== 'y' && ship_no !== '0' && ship_no !== null;

  // Safety scope check: if the caller passed an expected
  // master_customer_id and Focus returned a record belonging to a
  // different customer, treat the result as "not found" — Focus's
  // ship_status_xml endpoint does global ship_no lookup with no
  // built-in customer scoping.
  if (
    found &&
    expectedMasterCustomerId !== undefined &&
    responseMasterCustomerId &&
    Number(responseMasterCustomerId) !== Number(expectedMasterCustomerId)
  ) {
    console.warn(
      `[focus-client] Dropping cross-customer match: expected master=${expectedMasterCustomerId}, got master=${responseMasterCustomerId} for ship_no=${ship_no}`,
    );
    found = false;
  }

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
