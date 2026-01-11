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
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">🧪 A/B Testing</h1>
            <p className="text-gray-400 mt-1">ניהול ניסויים ווריאנטים</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition"
            >
              ➕ ניסוי חדש
            </button>
            <a
              href="/admin/rules"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              🎯 חוקים
            </a>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
            <button onClick={() => setError(null)} className="float-left">✕</button>
          </div>
        )}

        {/* Create Form Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-semibold mb-4">יצירת ניסוי חדש</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">מפתח (key)</label>
                  <input
                    type="text"
                    value={newExperiment.key}
                    onChange={e => setNewExperiment({...newExperiment, key: e.target.value})}
                    placeholder="quick_actions_count"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1">שם</label>
                  <input
                    type="text"
                    value={newExperiment.name}
                    onChange={e => setNewExperiment({...newExperiment, name: e.target.value})}
                    placeholder="Quick Actions Count Test"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1">תיאור</label>
                  <textarea
                    value={newExperiment.description}
                    onChange={e => setNewExperiment({...newExperiment, description: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 h-20"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1">אחוז משתמשים ({newExperiment.allocation}%)</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newExperiment.allocation}
                    onChange={e => setNewExperiment({...newExperiment, allocation: parseInt(e.target.value)})}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">מצב יעד</label>
                  <select
                    value={newExperiment.targetMode}
                    onChange={e => setNewExperiment({...newExperiment, targetMode: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                  >
                    <option value="both">שניהם</option>
                    <option value="creator">Creator</option>
                    <option value="brand">Brand</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">וריאנטים</label>
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
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
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
                        className="w-20 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                        placeholder="משקל"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setNewExperiment({
                      ...newExperiment,
                      variants: [...newExperiment.variants, { name: `Variant ${String.fromCharCode(65 + newExperiment.variants.length - 1)}`, weight: 50, uiOverrides: {} }],
                    })}
                    className="text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    + הוסף וריאנט
                  </button>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={createExperiment}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition"
                >
                  צור ניסוי
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Experiments List */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">ניסויים ({experiments.length})</h2>
            
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {experiments.map(exp => (
                <div
                  key={exp.id}
                  onClick={() => setSelectedExperiment(exp)}
                  className={`p-4 rounded-lg cursor-pointer transition border ${
                    selectedExperiment?.id === exp.id
                      ? 'bg-gray-700 border-indigo-500'
                      : 'bg-gray-750 border-transparent hover:bg-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${exp.enabled ? 'bg-green-600' : 'bg-gray-600'}`}>
                          {exp.enabled ? 'פעיל' : 'מושבת'}
                        </span>
                        <span className="text-xs text-gray-500">{exp.allocation}%</span>
                      </div>
                      <h3 className="font-medium mt-1">{exp.name}</h3>
                      <p className="text-sm text-gray-400">{exp.key}</p>
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
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                  <div className="mt-2 flex gap-2 text-xs text-gray-500">
                    <span>{exp.variants.length} variants</span>
                    <span>•</span>
                    <span>{exp.targetMode}</span>
                  </div>
                </div>
              ))}
              
              {experiments.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  אין ניסויים עדיין
                </div>
              )}
            </div>
          </div>

          {/* Results Panel */}
          <div className="space-y-6">
            {selectedExperiment ? (
              <>
                <div className="bg-gray-800 rounded-xl p-6">
                  <h2 className="text-xl font-semibold mb-4">{selectedExperiment.name}</h2>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-900 rounded-lg p-3">
                      <div className="text-sm text-gray-400">Key</div>
                      <div className="font-mono text-sm">{selectedExperiment.key}</div>
                    </div>
                    <div className="bg-gray-900 rounded-lg p-3">
                      <div className="text-sm text-gray-400">Allocation</div>
                      <div className="text-2xl font-bold">{selectedExperiment.allocation}%</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm text-gray-400">Variants</div>
                    {selectedExperiment.variants.map((v, i) => (
                      <div key={i} className="flex justify-between items-center bg-gray-900 rounded px-3 py-2">
                        <span>{v.name}</span>
                        <span className="text-sm text-gray-400">weight: {v.weight}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Results */}
                <div className="bg-gray-800 rounded-xl p-6">
                  <h3 className="font-semibold mb-4">📊 תוצאות</h3>
                  
                  {results ? (
                    <div className="space-y-4">
                      <div className="bg-gray-900 rounded-lg p-4">
                        <div className="text-sm text-gray-400">Total Exposures</div>
                        <div className="text-3xl font-bold">{results.totalExposures.toLocaleString()}</div>
                      </div>

                      {results.variants.map((v, i) => (
                        <div key={i} className="bg-gray-900 rounded-lg p-4">
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-medium">{v.variantName}</span>
                            <span className="text-sm text-gray-400">{v.exposures} exposures</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-400">Coupon copied:</span>
                              <span className="text-green-400">{(v.conversionRates.coupon_copied * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Link clicked:</span>
                              <span className="text-blue-400">{(v.conversionRates.link_clicked * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Support created:</span>
                              <span className="text-yellow-400">{(v.conversionRates.support_created * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Satisfied:</span>
                              <span className="text-purple-400">{(v.conversionRates.satisfied * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {results.variants.length === 0 && (
                        <div className="text-center text-gray-500 py-4">
                          אין נתונים עדיין
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-4">
                      טוען נתונים...
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-gray-800 rounded-xl p-6 text-center text-gray-500">
                <div className="text-4xl mb-4">👈</div>
                <p>בחר ניסוי מהרשימה לצפייה בתוצאות</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



