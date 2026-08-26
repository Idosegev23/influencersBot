'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Sparkles, TrendingUp, HelpCircle, PieChart, Clock } from 'lucide-react';

interface Evidence {
  kind: 'post' | 'page' | 'comment' | 'probe';
  platform?: string;
  url?: string;
  title?: string;
  excerpt?: string;
  metric?: string;
  value?: number;
  postedAt?: string;
}

interface Insight {
  insight_type: 'top_performers' | 'content_gaps' | 'topic_map' | 'cadence';
  title: string;
  summary: string;
  rank: number;
  metrics: Record<string, unknown>;
  evidence: Evidence[];
}

const TYPE_ICON = {
  top_performers: TrendingUp,
  content_gaps: HelpCircle,
  topic_map: PieChart,
  cadence: Clock,
} as const;

/** Display order: what works, then what's missing, then the map, then the rhythm. */
const TYPE_ORDER: Insight['insight_type'][] = ['top_performers', 'content_gaps', 'topic_map', 'cadence'];

export default function ContentInsightsSection({
  username,
  t,
  isEn,
}: {
  username: string;
  t: Record<string, string>;
  isEn: boolean;
}) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/influencer/${username}/content-insights`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setInsights(data.insights || []);
      } catch {
        /* the dashboard renders without this section rather than erroring */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Nothing to show and nothing loading: stay out of the way entirely rather than
  // occupying the top of the dashboard with an empty box.
  if (loading || insights.length === 0) return null;

  const typeLabel: Record<Insight['insight_type'], string> = {
    top_performers: t.insightTypeTopPerformers,
    content_gaps: t.insightTypeContentGaps,
    topic_map: t.insightTypeTopicMap,
    cadence: t.insightTypeCadence,
  };

  const ordered = [...insights].sort((a, b) => {
    const ti = TYPE_ORDER.indexOf(a.insight_type) - TYPE_ORDER.indexOf(b.insight_type);
    return ti !== 0 ? ti : a.rank - b.rank;
  });

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4" style={{ color: 'var(--dash-accent, #9334EB)' }} />
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>
            {t.contentInsights}
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>
            {t.contentInsightsSub}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ordered.map((insight, i) => {
          const Icon = TYPE_ICON[insight.insight_type] || Sparkles;
          const isOpen = expanded.has(i);
          return (
            <div
              key={i}
              className="rounded-xl p-4"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--dash-glass-border)',
              }}
            >
              <div className="flex items-start gap-2.5">
                <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--dash-text-3)' }} />
                <div className="min-w-0 flex-1">
                  <span
                    className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mb-1.5"
                    style={{ background: 'rgba(147,52,235,0.12)', color: 'var(--dash-accent, #9334EB)' }}
                  >
                    {typeLabel[insight.insight_type]}
                  </span>
                  <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--dash-text)' }}>
                    {insight.title}
                  </h3>
                  <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--dash-text-2)' }}>
                    {insight.summary}
                  </p>

                  {insight.evidence.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                        className="mt-2.5 flex items-center gap-1 text-[11px] font-medium"
                        style={{ color: 'var(--dash-text-3)' }}
                      >
                        <ChevronDown
                          className="w-3 h-3 transition-transform"
                          style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                        />
                        {isOpen ? t.insightsHideEvidence : t.insightsShowEvidence}
                        {' · '}
                        {insight.evidence.length}
                      </button>

                      {isOpen && (
                        <ul className="mt-2 space-y-1.5">
                          {insight.evidence.map((e, j) => (
                            <li
                              key={j}
                              className="text-[11px] rounded-lg px-2.5 py-2"
                              style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--dash-text-2)' }}
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="min-w-0 flex-1" dir={isEn ? 'ltr' : 'auto'}>
                                  {e.url ? (
                                    <a
                                      href={e.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="underline underline-offset-2"
                                    >
                                      {e.title || e.excerpt}
                                    </a>
                                  ) : (
                                    e.title || e.excerpt
                                  )}
                                </span>
                                {typeof e.value === 'number' && (
                                  <span className="shrink-0 font-semibold tabular-nums" style={{ color: 'var(--dash-text)' }}>
                                    {e.value}
                                  </span>
                                )}
                              </div>
                              {e.metric && (
                                <div className="text-[10px] mt-0.5" style={{ color: 'var(--dash-text-3)' }}>
                                  {e.metric}
                                  {e.title && e.excerpt ? ` · ${e.excerpt}` : ''}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
