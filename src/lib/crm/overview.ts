/**
 * Pure classification + math for the agent overview (month-close) tables.
 * Dependency-free so it is unit-testable and reusable on client + server.
 */
export type ProjectType = 'single_month' | 'multi_month';
export type StatusBucket = 'signed' | 'open' | 'cancelled' | 'moved';

const CADENCE_RE = /(חודשי|חודשית|רבעון|רבעוני|שנתי|שנתית|monthly|quarterly|annual)/i;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface DealLike {
  status?: string | null;
  project_type?: string | null;
  moved_to_month?: string | null;
}
export interface LineItemLike {
  notes?: string | null;
  deliverable_type?: string | null;
}

/** single- vs multi-month — explicit override, else cadence heuristic on the line items. */
export function classifyProjectType(deal: DealLike, lineItems: LineItemLike[]): ProjectType {
  if (deal?.project_type === 'multi_month' || deal?.project_type === 'single_month') return deal.project_type;
  const hasCadence = (lineItems || []).some((li) => CADENCE_RE.test(`${li?.notes || ''} ${li?.deliverable_type || ''}`));
  return hasCadence ? 'multi_month' : 'single_month';
}

/** which overview bucket a deal falls into. */
export function statusBucket(deal: DealLike): StatusBucket {
  if (deal?.status === 'cancelled') return 'cancelled';
  if (deal?.moved_to_month) return 'moved';
  if (deal?.status === 'active' || deal?.status === 'completed') return 'signed';
  return 'open';
}

/** sales commission = pct% of the amount. */
export function commissionOf(amount?: number | null, pct?: number | null): number {
  const a = Number(amount) || 0;
  const p = Number(pct) || 0;
  return round2((a * p) / 100);
}
