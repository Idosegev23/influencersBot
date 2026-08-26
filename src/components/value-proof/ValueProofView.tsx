'use client';

/**
 * The one rendering of the value-proof metrics. Admin tab, brand dashboard block
 * and the printable branded export all use it, so a number can never look
 * different depending on where you read it.
 *
 * The single non-negotiable rule lives in MetricCell: a metric whose
 * `measured` is false renders T.notMeasured plus the reason. It never renders 0 —
 * a zero reads as a result, and this whole surface exists to stop that.
 */

import type { ReactNode } from 'react';
import { getDashboardStrings } from '@/lib/i18n/dashboard';

export interface Metric<T = number> {
  value: T | null;
  n: number;
  measured: boolean;
  lowConfidence: boolean;
  basis: string;
}
export interface Comparison { withChat: number; without: number; deltaPct: number }

export interface ValueProofData {
  brand?: { name?: string; username?: string; logo?: string | null; primaryColor?: string | null };
  window: { since: string; until: string };
  revenue: {
    byTier: Record<'direct' | 'assisted' | 'influenced', Metric<number>>;
    orders: Record<'direct' | 'assisted' | 'influenced', Metric<number>>;
    total: Metric<number>;
  };
  conversion: Metric<number>;
  aov: Metric<Comparison>;
  carts: {
    recoveryRate: Metric<number>;
    recoveredValue: Metric<number>;
    bestieTouched: Metric<number>;
    platformBaseline: Metric<number>;
  };
  deflection: { rate: Metric<number>; value_ils: Metric<number> };
  responseTime: { firstResponse: Metric<number>; timeToClose: Metric<number> };
  escalation: {
    gaveUpRate: Metric<number>;
    anyHumanRate: Metric<number>;
    byReason: Metric<Array<{ reason: string; n: number }>>;
  };
  accuracy?: Metric<number>;
  setup?: { days: Metric<number>; staffHours: Metric<number> };
  clientUsage?: Metric<number>;
}

// Currency follows the account. A US trade association being shown its support
// saving in shekels is not a cosmetic problem. The stored value is a plain
// number; only the display symbol and grouping change.
export const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
export const money = (n: number, isEn?: boolean) =>
  isEn ? `$${Math.round(n).toLocaleString('en-US')}` : ils(n);
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
// These take the bundle rather than closing over one: they are module-level, and
// the same module renders both a Hebrew admin view and an English brand view.
const hours = (sec: number, T: any) => `${(sec / 3600).toFixed(1)} ${T.hours}`;
const ms = (v: number, T: any) => (v >= 1000 ? `${(v / 1000).toFixed(1)} ${T.seconds}` : `${Math.round(v)} ${T.ms}`);

const triggerLabels = (T: any): Record<string, string> => ({
  human_demand: T.reqHuman,
  sustained_anger: T.sustainedAnger,
  legal: T.legalThreat,
});

export function MetricCell({ m, render, T }: { m?: Metric<any>; render: (v: any) => string; T: any }) {
  if (!m || !m.measured) {
    return (
      <div>
        <div className="vp-unmeasured">{T.notMeasured}</div>
        {m?.basis ? <div className="vp-basis">{m.basis}</div> : null}
      </div>
    );
  }
  return (
    <div>
      <div className="vp-value">{render(m.value)}</div>
      {m.lowConfidence ? <div className="vp-lowconf">{T.smallSample}· n={m.n}</div> : null}
    </div>
  );
}

function Stat({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`vp-stat${wide ? ' vp-stat-wide' : ''}`}>
      <div className="vp-label">{label}</div>
      {children}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="vp-section">
      <h3 className="vp-h3">{title}</h3>
      {note ? <p className="vp-note">{note}</p> : null}
      <div className="vp-grid">{children}</div>
    </section>
  );
}

export default function ValueProofView({
  data,
  audience,
  language,
}: {
  data: ValueProofData;
  audience: 'admin' | 'brand';
  /** Account language. Defaults to Hebrew so the admin and report callers, which
   *  are internal and Hebrew-facing, render exactly as before. */
  language?: 'he' | 'en';
}) {
  const T = getDashboardStrings(language === 'en' ? 'en' : 'he').valueProof;
  const d = data;
  return (
    <div className="vp-root" dir="rtl">
      <Section
        title={T.revenueFromChats}
        note={T.attributionNote}
      >
        <Stat label={T.totalAttributed}><MetricCell T={T} m={d.revenue.total} render={(v) => money(v, language === 'en')} /></Stat>
        <Stat label={T.fromBotLink}><MetricCell T={T} m={d.revenue.byTier.direct} render={(v) => money(v, language === 'en')} /></Stat>
        <Stat label={T.talkedThenBought}><MetricCell T={T} m={d.revenue.byTier.assisted} render={(v) => money(v, language === 'en')} /></Stat>
        <Stat label={T.matchedByContact}><MetricCell T={T} m={d.revenue.byTier.influenced} render={(v) => money(v, language === 'en')} /></Stat>
        <Stat label={T.ordersFromLink}><MetricCell T={T} m={d.revenue.orders.direct} render={String} /></Stat>
        <Stat label={T.ordersTalked}><MetricCell T={T} m={d.revenue.orders.assisted} render={String} /></Stat>
        <Stat label={T.ordersContact}><MetricCell T={T} m={d.revenue.orders.influenced} render={String} /></Stat>
        <Stat label={T.chatConversionRate}><MetricCell T={T} m={d.conversion} render={pct} /></Stat>
      </Section>

      <Section
        title={T.basketAndCarts}
        note="{T.basketNote}"
      >
        <Stat label={T.basketWithVsWithout} wide>
          <MetricCell T={T} m={d.aov} render={(v: Comparison) => `${ils(v.withChat)} {T.versus} ${ils(v.without)} · ${v.deltaPct > 0 ? '+' : ''}${v.deltaPct.toFixed(1)}%`} />
        </Stat>
        <Stat label={T.cartRecovery}><MetricCell T={T} m={d.carts.recoveryRate} render={pct} /></Stat>
        <Stat label={T.recoveredCartValue}><MetricCell T={T} m={d.carts.recoveredValue} render={(v) => money(v, language === 'en')} /></Stat>
        <Stat label={T.ofThoseBestieTouched}><MetricCell T={T} m={d.carts.bestieTouched} render={String} /></Stat>
        <Stat label={T.platformRecovery}><MetricCell T={T} m={d.carts.platformBaseline} render={String} /></Stat>
      </Section>

      <Section
        title={T.service}
        note={T.deflectionNote}
      >
        <Stat label={T.closedWithoutHuman}><MetricCell T={T} m={d.deflection.rate} render={pct} /></Stat>
        <Stat label={T.estimatedSaving}><MetricCell T={T} m={d.deflection.value_ils} render={(v) => money(v, language === 'en')} /></Stat>
        <Stat label={T.firstResponseTime}><MetricCell T={T} m={d.responseTime.firstResponse} render={(v) => ms(v, T)} /></Stat>
        <Stat label={T.medianResolution}><MetricCell T={T} m={d.responseTime.timeToClose} render={(v) => hours(v, T)} /></Stat>
        <Stat label={T.escalatedToHuman}><MetricCell T={T} m={d.escalation.gaveUpRate} render={pct} /></Stat>
        <Stat label={T.humanTouched}><MetricCell T={T} m={d.escalation.anyHumanRate} render={pct} /></Stat>
        <Stat label={T.escalationReasons} wide>
          <MetricCell
            T={T}
            m={d.escalation.byReason}
            render={(v: Array<{ reason: string; n: number }>) =>
              v.map((r) => `${triggerLabels(T)[r.reason] || r.reason}: ${r.n}`).join(' · ')}
          />
        </Stat>
      </Section>

      {audience === 'admin' && (
        <Section title={T.productMetrics} note={T.productMetricsNote}>
          <Stat label={T.answerAccuracy}><MetricCell T={T} m={d.accuracy} render={String} /></Stat>
          <Stat label={T.setupTime}><MetricCell T={T} m={d.setup?.days} render={(v) => `${v} ${T.days}`} /></Stat>
          <Stat label={T.setupPersonHours}><MetricCell T={T} m={d.setup?.staffHours} render={String} /></Stat>
          <Stat label={T.customerLogins}><MetricCell T={T} m={d.clientUsage} render={String} /></Stat>
        </Section>
      )}
    </div>
  );
}
