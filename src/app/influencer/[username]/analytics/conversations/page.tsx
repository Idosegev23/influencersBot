'use client';

/**
 * Conversation analysis — the weekly retro report as a live page.
 *
 * Section order follows the order the brand asks the questions, not the order
 * they were easy to build: how much can I trust this → the headline numbers →
 * what should I do → what did they talk about → complaints → products →
 * channels → keywords → the raw list.
 */

import { useState, useEffect, use, useCallback } from 'react';
import Link from 'next/link';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { getDashboardStrings } from '@/lib/i18n/dashboard';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Loader2, ArrowUpRight, ArrowDownRight, Download, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';

type DateRange = '7d' | '14d' | '30d' | '90d';
const DAYS: Record<DateRange, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };

const GLASS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--dash-glass-border)',
};

const BAR_COLORS = ['#883fe2', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

interface Report {
  coverage: {
    total: number; classified: number; classifiedPct: number;
    complaints: number; complaintsWithProduct: number; complaintsWithProductPct: number;
  };
  kpis: {
    total: number; complaints: number; resolvedByBot: number; escalated: number; negative: number;
    previous: { total: number; complaints: number; resolvedByBot: number; escalated: number; negative: number };
  };
  inquiryTypes: Array<{ type: string; label: string; count: number; previousCount: number; delta: number }>;
  topics: Array<{ label: string; count: number; previousCount: number; delta: number; isNew: boolean }>;
  complaints: {
    byKind: Array<{ kind: string; label: string; count: number }>;
    byProduct: Array<{ productId: string; productName: string; count: number }>;
    kindByCategory: Array<{ kind: string; category: string; count: number }>;
  };
  products: {
    byMentions: Array<{ productId: string; productName: string; mentions: number; complaints: number; complaintRate: number }>;
    byComplaintRate: Array<{ productId: string; productName: string; mentions: number; complaints: number; complaintRate: number; belowSampleFloor: boolean }>;
  };
  series: {
    byMentions: Array<{ line: string; mentions: number; complaints: number; complaintRate: number }>;
    byComplaintRate: Array<{ line: string; mentions: number; complaints: number; complaintRate: number; belowSampleFloor: boolean }>;
    attributedPct: number;
  };
  channels: Array<{ channel: string; count: number; connected: boolean }>;
  keywords: Array<{ keyword: string; count: number }>;
}

interface Insight {
  id: string;
  title: string;
  content: string;
  occurrence_count: number;
  /** Evidence strings from the generator — always present, never empty. */
  examples: unknown[];
}

interface SessionRow {
  session_id: string;
  started_at: string;
  channel: string;
  inquiry_type: string | null;
  topic_label: string | null;
  is_complaint: boolean;
  summary: string | null;
}

interface Filters {
  channel: string | null;
  inquiryType: string | null;
  complaintsOnly: boolean;
  topic: string | null;
  productId: string | null;
  keyword: string | null;
}

const EMPTY_FILTERS: Filters = {
  channel: null, inquiryType: null, complaintsOnly: false,
  topic: null, productId: null, keyword: null,
};

function filterQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.channel) p.set('channel', f.channel);
  if (f.inquiryType) p.set('inquiry_type', f.inquiryType);
  if (f.complaintsOnly) p.set('complaints', '1');
  if (f.topic) p.set('topic', f.topic);
  if (f.productId) p.set('product_id', f.productId);
  if (f.keyword) p.set('keyword', f.keyword);
  return p.toString();
}

export default function ConversationAnalyticsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { lang } = useDashboardLang(username);
  const t = getDashboardStrings(lang).conversationAnalytics;
  const isEn = lang === 'en';

  const [range, setRange] = useState<DateRange>('30d');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [report, setReport] = useState<Report | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const base = `/api/influencer/${encodeURIComponent(username)}/analytics/conversations`;
  const query = `days=${DAYS[range]}${filterQuery(filters) ? `&${filterQuery(filters)}` : ''}`;

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}?${query}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed');
      setReport(json.report);
      setInsights(json.insights || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }, [base, query]);

  const loadRows = useCallback(async () => {
    try {
      const res = await fetch(`${base}/sessions?${query}&page=${page}&page_size=${pageSize}`);
      const json = await res.json();
      if (res.ok) { setRows(json.rows || []); setTotal(json.total || 0); }
    } catch { /* the table is secondary — the report above still stands */ }
  }, [base, query, page]);

  useEffect(() => { loadReport(); }, [loadReport]);
  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { setPage(1); }, [range, filters]);

  const setFilter = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const exportUrl = (withMessages: boolean) =>
    `${base}/export?${query}${withMessages ? '&include_messages=1' : ''}`;

  const onExportWithMessages = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!window.confirm(t.exportWithMessagesWarning)) e.preventDefault();
  };

  const channelLabel = (c: string) =>
    c === 'web' ? t.channelWeb : c === 'whatsapp' ? t.channelWhatsapp : c === 'instagram' ? t.channelInstagram : c;

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} className="min-h-screen p-4 md:p-8" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <div className="max-w-7xl mx-auto space-y-6">

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href={`/influencer/${username}/analytics`} className="text-sm hover:underline" style={{ color: 'var(--color-primary)' }}>
              ← {t.backToAnalytics}
            </Link>
            <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--dash-text)' }}>{t.pageTitle}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(DAYS) as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  range === r ? 'bg-[var(--color-primary)] text-white' : 'border'
                }`}
              >
                {DAYS[r]}
              </button>
            ))}
            <a href={exportUrl(false)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm" style={GLASS}>
              <Download className="w-4 h-4" /> {t.exportAggregates}
            </a>
            <a href={exportUrl(true)} onClick={onExportWithMessages} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-amber-500" style={{ ...GLASS, borderColor: 'rgba(245,158,11,0.4)' }}>
              <AlertTriangle className="w-4 h-4" /> {t.exportWithMessages}
            </a>
          </div>
        </header>

        {loading && (
          <div className="flex items-center justify-center py-20" style={{ color: 'var(--dash-text-3)' }}>
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> {t.loading}
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">{error}</div>
        )}

        {report && !loading && (
          <>
            {/* 1. Coverage — the honesty line. Without it a partial sample reads as complete. */}
            <div className="rounded-xl px-4 py-3" style={GLASS}>
              <p className="text-sm" style={{ color: 'var(--dash-text)' }}>
                {t.coverage
                  .replace('{total}', formatNumber(report.coverage.total))
                  .replace('{classified}', String(report.coverage.classifiedPct))
                  .replace('{product}', String(report.coverage.complaintsWithProductPct))}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>{t.coverageHint}</p>
            </div>

            {/* 2. KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label={t.kpiTotal} value={report.kpis.total} prev={report.kpis.previous.total} hint={t.vsPrevious} />
              <Kpi label={t.kpiComplaints} value={report.kpis.complaints} prev={report.kpis.previous.complaints} hint={t.vsPrevious} invert />
              <Kpi label={t.kpiResolved} value={report.kpis.resolvedByBot} prev={report.kpis.previous.resolvedByBot} hint={t.vsPrevious} />
              <Kpi label={t.kpiEscalated} value={report.kpis.escalated} prev={report.kpis.previous.escalated} hint={t.vsPrevious} invert />
              <Kpi label={t.kpiNegative} value={report.kpis.negative} prev={report.kpis.previous.negative} hint={t.vsPrevious} invert />
            </div>

            {/* 3. Insights — placed high because acting on them is the point.
                 Every card carries the number behind it; the generator drops
                 anything without evidence before it ever reaches here. */}
            <Section title={t.sectionInsights}>
              {insights.length === 0 ? <Empty text={t.insightsEmpty} /> : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {insights.map((ins) => (
                    <div key={ins.id} className="rounded-xl p-4 flex flex-col" style={GLASS}>
                      <p className="font-semibold" style={{ color: 'var(--dash-text)' }}>{ins.title}</p>
                      <p className="text-sm mt-1 flex-1" style={{ color: 'var(--dash-text-2)' }}>{ins.content}</p>
                      {Array.isArray(ins.examples) && ins.examples.length > 0 && (
                        <ul className="mt-2 text-xs list-disc list-inside space-y-0.5" style={{ color: 'var(--dash-text-3)' }}>
                          {ins.examples.slice(0, 3).map((ex: unknown, i: number) => (
                            <li key={i}>{typeof ex === 'string' ? ex : JSON.stringify(ex)}</li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-3 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                        {t.insightShowSessions.replace('{n}', String(ins.occurrence_count))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* 4. What they talked about */}
            <Section title={t.sectionWhatTheyTalkedAbout}>
              <div className="grid md:grid-cols-2 gap-6">
                <Panel title={t.sectionInquiryTypes}>
                  {report.inquiryTypes.length === 0 ? <Empty text={t.empty} /> : (
                    <ResponsiveContainer width="100%" height={Math.max(200, report.inquiryTypes.length * 34)}>
                      <BarChart data={report.inquiryTypes} layout="vertical" margin={{ left: 8, right: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {report.inquiryTypes.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {report.inquiryTypes.map((it) => (
                      <Chip
                        key={it.type}
                        active={filters.inquiryType === it.type}
                        onClick={() => setFilter({ inquiryType: filters.inquiryType === it.type ? null : it.type })}
                      >
                        {it.label} · {it.count}{' '}
                        <Delta d={it.delta} />
                      </Chip>
                    ))}
                  </div>
                </Panel>

                <Panel title={t.sectionTopics}>
                  {report.topics.length === 0 ? <Empty text={t.empty} /> : (
                    <ul className="divide-y divide-[var(--dash-glass-border)]/40">
                      {report.topics.slice(0, 15).map((tp) => (
                        <li key={tp.label} className="py-2 flex items-center justify-between gap-3">
                          <button
                            className={`text-sm text-right hover:underline ${filters.topic === tp.label ? 'font-semibold' : ''}`}
                            onClick={() => setFilter({ topic: filters.topic === tp.label ? null : tp.label })}
                          >
                            {tp.label}
                            {tp.isNew && (
                              <span className="ms-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                {t.topicNew}
                              </span>
                            )}
                          </button>
                          <span className="text-sm whitespace-nowrap" style={{ color: 'var(--dash-text-2)' }}>
                            {tp.count} <Delta d={tp.delta} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </Section>

            {/* 5. Complaints zoom-in */}
            <Section title={t.sectionComplaints}>
              <div className="grid md:grid-cols-3 gap-6">
                <Panel title={t.complaintsByKind}>
                  <SimpleTable
                    headers={[t.colInquiryType, t.colCount]}
                    rows={report.complaints.byKind.map((c) => [c.label, formatNumber(c.count)])}
                    emptyText={t.empty}
                  />
                </Panel>
                <Panel title={t.complaintsByProduct}>
                  <SimpleTable
                    headers={[t.colProduct, t.colComplaints]}
                    rows={report.complaints.byProduct.map((c) => [c.productName, formatNumber(c.count)])}
                    emptyText={t.empty}
                  />
                </Panel>
                <Panel title={t.complaintsByCategory}>
                  <SimpleTable
                    headers={[t.colInquiryType, t.colCategory, t.colCount]}
                    rows={report.complaints.kindByCategory.map((c) => [c.kind, c.category, formatNumber(c.count)])}
                    emptyText={t.empty}
                  />
                </Panel>
              </div>
            </Section>

            {/* 6a. Series — where most real attribution lands, so it comes
                 before individual products. */}
            <Section title={t.sectionSeries}>
              <p className="text-xs mb-3" style={{ color: 'var(--dash-text-3)' }}>{t.seriesHint}</p>
              <div className="grid md:grid-cols-2 gap-6">
                <Panel title={t.seriesByRate}>
                  <SimpleTable
                    headers={[t.colSeries, t.colMentions, t.colComplaints, t.colComplaintRate]}
                    rows={report.series.byComplaintRate.slice(0, 15).map((sx) => [
                      sx.belowSampleFloor ? `${sx.line} (${t.lowSample})` : sx.line,
                      formatNumber(sx.mentions), formatNumber(sx.complaints), `${sx.complaintRate}%`,
                    ])}
                    emptyText={t.empty}
                  />
                </Panel>
                <Panel title={t.seriesByMentions}>
                  <SimpleTable
                    headers={[t.colSeries, t.colMentions, t.colComplaints]}
                    rows={report.series.byMentions.slice(0, 15).map((sx) => [
                      sx.line, formatNumber(sx.mentions), formatNumber(sx.complaints),
                    ])}
                    emptyText={t.empty}
                  />
                </Panel>
              </div>
            </Section>

            {/* 6b. Products — rate first, deliberately */}
            <Section title={t.sectionProducts}>
              <p className="text-xs mb-3" style={{ color: 'var(--dash-text-3)' }}>{t.productsRateHint}</p>
              <div className="grid md:grid-cols-2 gap-6">
                <Panel title={t.productsByRate}>
                  <SimpleTable
                    headers={[t.colProduct, t.colMentions, t.colComplaints, t.colComplaintRate]}
                    rows={report.products.byComplaintRate.slice(0, 15).map((p) => [
                      p.belowSampleFloor ? `${p.productName} (${t.lowSample})` : p.productName,
                      formatNumber(p.mentions), formatNumber(p.complaints), `${p.complaintRate}%`,
                    ])}
                    emptyText={t.empty}
                  />
                </Panel>
                <Panel title={t.productsByMentions}>
                  <SimpleTable
                    headers={[t.colProduct, t.colMentions, t.colComplaints]}
                    rows={report.products.byMentions.slice(0, 15).map((p) => [
                      p.productName, formatNumber(p.mentions), formatNumber(p.complaints),
                    ])}
                    emptyText={t.empty}
                  />
                </Panel>
              </div>
            </Section>

            {/* 7. Channels — "not connected" is not the same fact as zero */}
            <Section title={t.sectionChannels}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {report.channels.map((c) => (
                  <button
                    key={c.channel}
                    disabled={!c.connected}
                    onClick={() => setFilter({ channel: filters.channel === c.channel ? null : c.channel })}
                    className="text-start rounded-xl p-4"
                    style={{
                      ...GLASS,
                      opacity: c.connected ? 1 : 0.6,
                      cursor: c.connected ? 'pointer' : 'default',
                      borderColor: filters.channel === c.channel ? 'var(--color-primary)' : undefined,
                    }}
                  >
                    <p className="text-sm" style={{ color: 'var(--dash-text-3)' }}>{channelLabel(c.channel)}</p>
                    <p className={`mt-1 font-bold ${c.connected ? 'text-2xl' : 'text-sm opacity-60'}`}>
                      {c.connected ? formatNumber(c.count) : t.channelNotConnected}
                    </p>
                  </button>
                ))}
              </div>
            </Section>

            {/* 8. Keywords */}
            <Section title={t.sectionKeywords}>
              {report.keywords.length === 0 ? <Empty text={t.empty} /> : (
                <div className="flex flex-wrap gap-1.5">
                  {report.keywords.map((k) => (
                    <Chip
                      key={k.keyword}
                      active={filters.keyword === k.keyword}
                      onClick={() => setFilter({ keyword: filters.keyword === k.keyword ? null : k.keyword })}
                    >
                      {k.keyword} · {k.count}
                    </Chip>
                  ))}
                </div>
              )}
            </Section>

            {/* 9. The raw list */}
            <Section
              title={`${t.sectionTable} (${formatNumber(total)})`}
              action={
                <div className="flex items-center gap-2">
                  <Chip
                    active={filters.complaintsOnly}
                    onClick={() => setFilter({ complaintsOnly: !filters.complaintsOnly })}
                  >
                    {t.filterComplaintsOnly}
                  </Chip>
                  {hasFilters && (
                    <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs hover:underline" style={{ color: 'var(--color-primary)' }}>
                      {t.filterClear}
                    </button>
                  )}
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--dash-text-3)' }} className="border-b border-[var(--dash-glass-border)]">
                      <th className="text-start py-2 px-2 font-medium">{t.colDate}</th>
                      <th className="text-start py-2 px-2 font-medium">{t.colChannel}</th>
                      <th className="text-start py-2 px-2 font-medium">{t.colInquiryType}</th>
                      <th className="text-start py-2 px-2 font-medium">{t.colTopic}</th>
                      <th className="text-start py-2 px-2 font-medium">{t.colComplaint}</th>
                      <th className="text-start py-2 px-2 font-medium">{t.colSummary}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center" style={{ color: 'var(--dash-text-3)' }}>{t.empty}</td></tr>
                    )}
                    {rows.map((r) => (
                      <tr key={r.session_id} className="border-b border-[var(--dash-glass-border)]/40">
                        <td className="py-2 px-2 whitespace-nowrap" style={{ color: 'var(--dash-text-2)' }}>
                          {new Date(r.started_at).toLocaleDateString(isEn ? 'en-GB' : 'he-IL')}
                        </td>
                        <td className="py-2 px-2" style={{ color: 'var(--dash-text-2)' }}>{channelLabel(r.channel)}</td>
                        <td className="py-2 px-2" style={{ color: 'var(--dash-text)' }}>{r.inquiry_type || '—'}</td>
                        <td className="py-2 px-2" style={{ color: 'var(--dash-text)' }}>{r.topic_label || '—'}</td>
                        <td className="py-2 px-2">{r.is_complaint ? t.yes : t.no}</td>
                        <td className="py-2 px-2 max-w-md truncate" style={{ color: 'var(--dash-text-2)' }}>{r.summary || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {total > pageSize && (
                <div className="flex items-center justify-between mt-4">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 text-sm disabled:opacity-40" style={{ color: 'var(--dash-text-2)' }}
                  >
                    <ChevronRight className="w-4 h-4" /> {t.prev}
                  </button>
                  <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{page} / {Math.ceil(total / pageSize)}</span>
                  <button
                    disabled={page >= Math.ceil(total / pageSize)}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-1 text-sm disabled:opacity-40" style={{ color: 'var(--dash-text-2)' }}
                  >
                    {t.next} <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Small building blocks ───────────────────────────────────────────

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-4 md:p-6" style={GLASS}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--dash-text)' }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--dash-text-3)' }}>{title}</h3>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm" style={{ color: 'var(--dash-text-3)' }}>{text}</p>;
}

function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs border ${
        active ? 'bg-[var(--color-primary)] text-white border-transparent' : 'border-[var(--dash-glass-border)]'
      }`}
    >
      {children}
    </button>
  );
}

/** `invert` marks a metric where up is bad (complaints, escalations). */
function Kpi({ label, value, prev, hint, invert }: {
  label: string; value: number; prev: number; hint: string; invert?: boolean;
}) {
  const delta = value - prev;
  const up = delta > 0;
  const good = invert ? !up : up;
  return (
    <div className="rounded-xl p-4" style={GLASS}>
      <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: 'var(--dash-text)' }}>{formatNumber(value)}</p>
      {delta !== 0 && (
        <p className={`text-xs mt-1 inline-flex items-center gap-0.5 ${good ? 'text-emerald-600' : 'text-red-600'}`} title={hint}>
          {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(delta)}
        </p>
      )}
    </div>
  );
}

function Delta({ d }: { d: number }) {
  if (!d) return null;
  return (
    <span className={d > 0 ? 'text-emerald-600' : 'text-red-600'}>
      {d > 0 ? '▲' : '▼'}{Math.abs(d)}
    </span>
  );
}

function SimpleTable({ headers, rows, emptyText }: {
  headers: string[]; rows: Array<Array<string | number>>; emptyText: string;
}) {
  if (rows.length === 0) return <Empty text={emptyText} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--dash-text-3)' }} className="border-b border-[var(--dash-glass-border)]">
            {headers.map((h) => <th key={h} className="text-start py-2 px-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--dash-glass-border)]/40">
              {r.map((c, j) => <td key={j} className="py-2 px-2" style={{ color: 'var(--dash-text)' }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
