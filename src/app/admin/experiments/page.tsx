'use client';

import { useState, useEffect, useCallback } from 'react';

interface Variant {
  id: string;
  name: string;
  weight: number;
  uiOverrides: Record<string, unknown>;
  description?: string;
}

interface Experiment {
  id: string;
  key: string;
  name: string;
  description?: string;
  variants: Variant[];
  allocation: number;
  targetMode?: string;
  targetIntents?: string[];
  enabled: boolean;
  startAt?: string;
  endAt?: string;
  createdAt: string;
}

interface ExperimentResults {
  experimentKey: string;
  totalExposures: number;
  variants: Array<{
    variantId: string;
    variantName: string;
    exposures: number;
    conversions: {
      coupon_copied: number;
      link_clicked: number;
      support_created: number;
      satisfied: number;
      unsatisfied: number;
    };
    conversionRates: {
      coupon_copied: number;
      link_clicked: number;
      support_created: number;
      satisfied: number;
      unsatisfied: number;
    };
  }>;
}

export default function ExperimentsAdminPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
  const [newExperiment, setNewExperiment] = useState({
    key: '',
    name: '',
    description: '',
    allocation: 50,
    targetMode: 'both',
    variants: [
      { name: 'Control', weight: 50, uiOverrides: {} },
      { name: 'Variant A', weight: 50, uiOverrides: {} },
    ],
  });

  const fetchExperiments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/experiments', {
        headers: { 'x-admin-key': 'dev-admin' },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setExperiments(data.experiments || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load experiments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  const fetchResults = async (experimentKey: string) => {
    try {
      const res = await fetch(`/api/admin/experiments?action=results&experimentKey=${experimentKey}`, {
        headers: { 'x-admin-key': 'dev-admin' },
      });
      const data = await res.json();
      setResults(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
    }
  };

  const toggleExperiment = async (experimentId: string, enabled: boolean) => {
    try {
      const res = await fetch('/api/admin/experiments', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'dev-admin',
        },
        body: JSON.stringify({ id: experimentId, enabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle experiment');
      fetchExperiments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to toggle experiment');
    }
  };

  const createExperiment = async () => {
    try {
      const res = await fetch('/api/admin/experiments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'dev-admin',
        },
        body: JSON.stringify(newExperiment),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      fetchExperiments();
      setShowCreateForm(false);
      setNewExperiment({
        key: '',
        name: '',
        description: '',
        allocation: 50,
        targetMode: 'both',
        variants: [
          { name: 'Control', weight: 50, uiOverrides: {} },
          { name: 'Variant A', weight: 50, uiOverrides: {} },
        ],
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create experiment');
    }
  };

  useEffect(() => {
    if (selectedExperiment) {
      fetchResults(selectedExperiment.key);
    } else {
      setResults(null);
    }
  }, [selectedExperiment]);

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#9334EB] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#ede9f8' }}>A/B Testing</h1>
            <p className="mt-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>ניהול ניסויים ווריאנטים</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateForm(true)}
              className="btn-teal flex items-center gap-2 text-sm"
            >
              + ניסוי חדש
            </button>
            <a
              href="/admin/rules"
              className="btn-ghost flex items-center gap-2 text-sm"
            >
              חוקים
            </a>
          </div>
        </div>

        {error && (
          <div className="pill pill-red px-4 py-3 text-sm mb-6 w-full justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Create Form Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="admin-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-semibold mb-4" style={{ color: '#ede9f8' }}>יצירת ניסוי חדש</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>מפתח (key)</label>
                  <input
                    type="text"
                    value={newExperiment.key}
                    onChange={e => setNewExperiment({...newExperiment, key: e.target.value})}
                    placeholder="quick_actions_count"
                    className="admin-input !rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>שם</label>
                  <input
                    type="text"
                    value={newExperiment.name}
                    onChange={e => setNewExperiment({...newExperiment, name: e.target.value})}
                    placeholder="Quick Actions Count Test"
                    className="admin-input !rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>תיאור</label>
                  <textarea
                    value={newExperiment.description}
                    onChange={e => setNewExperiment({...newExperiment, description: e.target.value})}
                    className="admin-input !rounded-xl h-20"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>אחוז משתמשים ({newExperiment.allocation}%)</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newExperiment.allocation}
                    onChange={e => setNewExperiment({...newExperiment, allocation: parseInt(e.target.value)})}
                    className="w-full accent-[#9334EB]"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>מצב יעד</label>
                  <select
                    value={newExperiment.targetMode}
                    onChange={e => setNewExperiment({...newExperiment, targetMode: e.target.value})}
                    className="admin-input !rounded-xl"
                  >
                    <option value="both">שניהם</option>
                    <option value="creator">Creator</option>
                    <option value="brand">Brand</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-2" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>וריאנטים</label>
                  {newExperiment.variants.map((v, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={v.name}
                        onChange={e => {
                          const variants = [...newExperiment.variants];
                          variants[i].name = e.target.value;
                          setNewExperiment({...newExperiment, variants});
                        }}
                        className="admin-input flex-1 !rounded-xl text-sm"
                        placeholder="שם וריאנט"
                      />
                      <input
                        type="number"
                        value={v.weight}
                        onChange={e => {
                          const variants = [...newExperiment.variants];
                          variants[i].weight = parseInt(e.target.value);
                          setNewExperiment({...newExperiment, variants});
                        }}
                        className="admin-input w-20 !rounded-xl text-sm"
                        placeholder="משקל"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setNewExperiment({
                      ...newExperiment,
                      variants: [...newExperiment.variants, { name: `Variant ${String.fromCharCode(65 + newExperiment.variants.length - 1)}`, weight: 50, uiOverrides: {} }],
                    })}
                    className="text-sm transition-colors" style={{ color: '#9334EB' }}
                  >
                    + הוסף וריאנט
                  </button>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={createExperiment}
                  className="btn-teal flex-1 py-2.5 text-sm"
                >
                  צור ניסוי
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="btn-ghost px-4 py-2.5 text-sm"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Experiments List */}
          <div className="admin-card p-6">
            <h2 className="text-xl font-semibold mb-4" style={{ color: '#ede9f8' }}>ניסויים ({experiments.length})</h2>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {experiments.map(exp => (
                <div
                  key={exp.id}
                  onClick={() => setSelectedExperiment(exp)}
                  className="p-4 rounded-xl cursor-pointer transition-all"
                  style={selectedExperiment?.id === exp.id
                    ? { background: 'rgba(147, 52, 235, 0.08)', border: '1px solid rgba(147, 52, 235, 0.2)' }
                    : { background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }
                  }
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`pill text-[11px] py-0.5 px-2 ${exp.enabled ? 'pill-green' : 'pill-neutral'}`}>
                          {exp.enabled ? 'פעיל' : 'מושבת'}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>{exp.allocation}%</span>
                      </div>
                      <h3 className="font-medium mt-1" style={{ color: '#ede9f8' }}>{exp.name}</h3>
                      <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>{exp.key}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exp.enabled}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleExperiment(exp.id, !exp.enabled);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:rounded-full after:h-5 after:w-5 after:transition-all"
                        style={{
                          background: exp.enabled ? 'rgba(8, 145, 179, 0.3)' : 'rgba(255, 255, 255, 0.06)',
                        }}
                      >
                        <div className="absolute top-[2px] rounded-full h-5 w-5 transition-all"
                          style={{
                            left: exp.enabled ? '22px' : '2px',
                            background: exp.enabled ? '#0891B3' : 'rgba(237, 233, 248, 0.3)',
                          }}
                        />
                      </div>
                    </label>
                  </div>
                  <div className="mt-2 flex gap-2 text-xs" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>
                    <span>{exp.variants.length} variants</span>
                    <span>•</span>
                    <span>{exp.targetMode}</span>
                  </div>
                </div>
              ))}

              {experiments.length === 0 && (
                <div className="text-center py-8" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>
                  אין ניסויים עדיין
                </div>
              )}
            </div>
          </div>

          {/* Results Panel */}
          <div className="space-y-6">
            {selectedExperiment ? (
              <>
                <div className="admin-card p-6">
                  <h2 className="text-xl font-semibold mb-4" style={{ color: '#ede9f8' }}>{selectedExperiment.name}</h2>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="p-3 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <div className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Key</div>
                      <div className="font-mono text-sm" style={{ color: '#ede9f8' }}>{selectedExperiment.key}</div>
                    </div>
                    <div className="p-3 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <div className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Allocation</div>
                      <div className="text-2xl font-bold" style={{ color: '#ede9f8' }}>{selectedExperiment.allocation}%</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Variants</div>
                    {selectedExperiment.variants.map((v, i) => (
                      <div key={i} className="flex justify-between items-center px-3 py-2 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <span style={{ color: '#ede9f8' }}>{v.name}</span>
                        <span className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>weight: {v.weight}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Results */}
                <div className="admin-card p-6">
                  <h3 className="font-semibold mb-4" style={{ color: '#ede9f8' }}>תוצאות</h3>

                  {results ? (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <div className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Total Exposures</div>
                        <div className="text-3xl font-bold" style={{ color: '#ede9f8' }}>{results.totalExposures.toLocaleString()}</div>
                      </div>

                      {results.variants.map((v, i) => (
                        <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-medium" style={{ color: '#ede9f8' }}>{v.variantName}</span>
                            <span className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>{v.exposures} exposures</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex justify-between">
                              <span style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Coupon copied:</span>
                              <span style={{ color: '#0891B3' }}>{(v.conversionRates.coupon_copied * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Link clicked:</span>
                              <span style={{ color: '#9334EB' }}>{(v.conversionRates.link_clicked * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Support created:</span>
                              <span style={{ color: '#EA580B' }}>{(v.conversionRates.support_created * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Satisfied:</span>
                              <span style={{ color: '#DB2877' }}>{(v.conversionRates.satisfied * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {results.variants.length === 0 && (
                        <div className="text-center py-4" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>
                          אין נתונים עדיין
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>
                      טוען נתונים...
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="admin-card p-6 text-center" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>
                <p className="text-4xl mb-4">👈</p>
                <p>בחר ניסוי מהרשימה לצפייה בתוצאות</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
