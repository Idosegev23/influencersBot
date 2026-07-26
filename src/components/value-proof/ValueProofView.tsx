'use client';

/**
 * The one rendering of the value-proof metrics. Admin tab, brand dashboard block
 * and the printable branded export all use it, so a number can never look
 * different depending on where you read it.
 *
 * The single non-negotiable rule lives in MetricCell: a metric whose
 * `measured` is false renders "לא נמדד" plus the reason. It never renders 0 —
 * a zero reads as a result, and this whole surface exists to stop that.
 */

import type { ReactNode } from 'react';

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

export const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const hours = (sec: number) => `${(sec / 3600).toFixed(1)} שעות`;
const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} שניות` : `${Math.round(v)} מ״ש`);

const TRIGGER_LABELS: Record<string, string> = {
  human_demand: 'הלקוח ביקש נציג אנושי',
  sustained_anger: 'כעס מתמשך',
  legal: 'איום משפטי',
};

export function MetricCell({ m, render }: { m?: Metric<any>; render: (v: any) => string }) {
  if (!m || !m.measured) {
    return (
      <div>
        <div className="vp-unmeasured">לא נמדד</div>
        {m?.basis ? <div className="vp-basis">{m.basis}</div> : null}
      </div>
    );
  }
  return (
    <div>
      <div className="vp-value">{render(m.value)}</div>
      {m.lowConfidence ? <div className="vp-lowconf">מדגם קטן · n={m.n}</div> : null}
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

export default function ValueProofView({ data, audience }: { data: ValueProofData; audience: 'admin' | 'brand' }) {
  const d = data;
  return (
    <div className="vp-root" dir="rtl">
      <Section
        title="הכנסה שנוצרה בשיחות"
        note="שלוש שכבות ייחוס נפרדות. כל שכבה אומרת משהו אחר, ולכן הן לא נסכמות למספר אחד בלי הפילוח לידו."
      >
        <Stat label="סה״כ מיוחס"><MetricCell m={d.revenue.total} render={ils} /></Stat>
        <Stat label="מלינק של הבוט"><MetricCell m={d.revenue.byTier.direct} render={ils} /></Stat>
        <Stat label="דיבר ואז קנה"><MetricCell m={d.revenue.byTier.assisted} render={ils} /></Stat>
        <Stat label="זוהה בטלפון או מייל"><MetricCell m={d.revenue.byTier.influenced} render={ils} /></Stat>
        <Stat label="הזמנות — מלינק"><MetricCell m={d.revenue.orders.direct} render={String} /></Stat>
        <Stat label="הזמנות — דיבר ואז קנה"><MetricCell m={d.revenue.orders.assisted} render={String} /></Stat>
        <Stat label="הזמנות — טלפון/מייל"><MetricCell m={d.revenue.orders.influenced} render={String} /></Stat>
        <Stat label="שיעור המרת שיחה"><MetricCell m={d.conversion} render={pct} /></Stat>
      </Section>

      <Section
        title="סל ממוצע ועגלות"
        note="ההשוואה נעשית בתוך אותו חלון זמן ומול הזמנות אונליין בלבד — בלי מכירות קופה ובלי רשומות באפס שקלים, שאחרת הבסיס מוטה."
      >
        <Stat label="סל ממוצע: עם שיחה מול בלי" wide>
          <MetricCell m={d.aov} render={(v: Comparison) => `${ils(v.withChat)} מול ${ils(v.without)} · ${v.deltaPct > 0 ? '+' : ''}${v.deltaPct.toFixed(1)}%`} />
        </Stat>
        <Stat label="שחזור עגלות נטושות (7 ימים)"><MetricCell m={d.carts.recoveryRate} render={pct} /></Stat>
        <Stat label="שווי העגלות ששוחזרו"><MetricCell m={d.carts.recoveredValue} render={ils} /></Stat>
        <Stat label="מהן בנגיעת בסטי"><MetricCell m={d.carts.bestieTouched} render={String} /></Stat>
        <Stat label="שחזור של הפלטפורמה עצמה"><MetricCell m={d.carts.platformBaseline} render={String} /></Stat>
      </Section>

      <Section
        title="שירות"
        note="Deflection נמדד מתוך שיחות שהן באמת פניית שירות — לא מתוך כל השיחות. שיחת ייעוץ על מוצר לא הייתה מגיעה לנציג ממילא."
      >
        <Stat label="פניות שנסגרו בלי אדם"><MetricCell m={d.deflection.rate} render={pct} /></Stat>
        <Stat label="חיסכון משוער"><MetricCell m={d.deflection.value_ils} render={ils} /></Stat>
        <Stat label="זמן תגובה ראשון"><MetricCell m={d.responseTime.firstResponse} render={ms} /></Stat>
        <Stat label="זמן סגירת פנייה (חציון)"><MetricCell m={d.responseTime.timeToClose} render={hours} /></Stat>
        <Stat label="הבוט הפנה לאדם"><MetricCell m={d.escalation.gaveUpRate} render={pct} /></Stat>
        <Stat label="פניות שנגע בהן אדם"><MetricCell m={d.escalation.anyHumanRate} render={pct} /></Stat>
        <Stat label="על מה הבוט מפנה לאדם" wide>
          <MetricCell
            m={d.escalation.byReason}
            render={(v: Array<{ reason: string; n: number }>) =>
              v.map((r) => `${TRIGGER_LABELS[r.reason] || r.reason}: ${r.n}`).join(' · ')}
          />
        </Stat>
      </Section>

      {audience === 'admin' && (
        <Section title="מדדי מוצר (פנימי)" note="אלה מדדים שלנו על המוצר, לא מדדי ערך של המותג. הם לא מוצגים בדשבורד של הלקוח.">
          <Stat label="דיוק תשובות"><MetricCell m={d.accuracy} render={String} /></Stat>
          <Stat label="זמן הקמה"><MetricCell m={d.setup?.days} render={(v) => `${v} ימים`} /></Stat>
          <Stat label="שעות אדם בהקמה"><MetricCell m={d.setup?.staffHours} render={String} /></Stat>
          <Stat label="כניסות של הלקוח למערכת"><MetricCell m={d.clientUsage} render={String} /></Stat>
        </Section>
      )}
    </div>
  );
}
