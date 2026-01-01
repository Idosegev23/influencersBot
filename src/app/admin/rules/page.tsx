'use client';

import { useState, useEffect, useCallback } from 'react';

interface Rule {
  id: string;
  name: string;
  description?: string;
  category: string;
  priority: number;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  actions: Array<{ type: string; target: string; value: unknown }>;
  mode: string;
  accountId?: string;
  enabled: boolean;
  version?: number;
  source?: string;
}

interface TestResult {
  matched: boolean;
  matchedConditions: Array<{
    field: string;
    expected: unknown;
    actual: unknown;
    result: boolean;
  }>;
  wouldApply: Array<{ type: string; target: string; value: unknown }>;
}

export default function RulesAdminPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testMessage, setTestMessage] = useState('יש קופון?');
  const [testIntent, setTestIntent] = useState('coupon');
  const [testConfidence, setTestConfidence] = useState(0.85);
  
  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/rules?includeGlobal=true', {
        headers: { 'x-admin-key': 'dev-admin' },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRules(data.rules || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      const res = await fetch('/api/admin/rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'dev-admin',
        },
        body: JSON.stringify({ action: 'toggle', id: ruleId, enabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle rule');
      fetchRules();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule');
    }
  };

  const testRule = async (rule: Rule) => {
    try {
      const res = await fetch('/api/admin/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'dev-admin',
        },
        body: JSON.stringify({
          action: 'test',
          rule,
          message: testMessage,
          intent: testIntent,
          confidence: testConfidence,
          entities: {},
          mode: 'creator',
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to test rule');
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    
    try {
      const res = await fetch(`/api/admin/rules?id=${ruleId}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': 'dev-admin' },
      });
      if (!res.ok) throw new Error('Failed to delete rule');
      fetchRules();
      setSelectedRule(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const categoryColors: Record<string, string> = {
    routing: 'bg-blue-100 text-blue-800',
    escalation: 'bg-yellow-100 text-yellow-800',
    security: 'bg-red-100 text-red-800',
    cost: 'bg-green-100 text-green-800',
    personalization: 'bg-purple-100 text-purple-800',
  };

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
            <h1 className="text-3xl font-bold">🎯 Rule Engine</h1>
            <p className="text-gray-400 mt-1">ניהול חוקים דינמיים</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchRules}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              🔄 רענן
            </button>
            <a
              href="/admin/experiments"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
            >
              🧪 ניסויים
            </a>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
            <button onClick={() => setError(null)} className="float-left">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rules List */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">חוקים ({rules.length})</h2>
            
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {rules.map(rule => (
                <div
                  key={rule.id}
                  onClick={() => setSelectedRule(rule)}
                  className={`p-4 rounded-lg cursor-pointer transition border ${
                    selectedRule?.id === rule.id
                      ? 'bg-gray-700 border-indigo-500'
                      : 'bg-gray-750 border-transparent hover:bg-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${categoryColors[rule.category] || 'bg-gray-600'}`}>
                          {rule.category}
                        </span>
                        <span className="text-xs text-gray-500">P{rule.priority}</span>
                        {rule.source === 'db' && (
                          <span className="text-xs text-indigo-400">DB</span>
                        )}
                      </div>
                      <h3 className="font-medium mt-1">{rule.name}</h3>
                      {rule.description && (
                        <p className="text-sm text-gray-400 mt-1">{rule.description}</p>
                      )}
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleRule(rule.id, !rule.enabled);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                  <div className="mt-2 flex gap-2 text-xs text-gray-500">
                    <span>{rule.conditions.length} conditions</span>
                    <span>•</span>
                    <span>{rule.actions.length} actions</span>
                    <span>•</span>
                    <span>{rule.mode}</span>
                  </div>
                </div>
              ))}
              
              {rules.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  אין חוקים עדיין
                </div>
              )}
            </div>
          </div>

          {/* Rule Details & Test */}
          <div className="space-y-6">
            {selectedRule ? (
              <>
                {/* Rule Details */}
                <div className="bg-gray-800 rounded-xl p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-semibold">{selectedRule.name}</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => testRule(selectedRule)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-sm"
                      >
                        🧪 בדוק
                      </button>
                      <button
                        onClick={() => deleteRule(selectedRule.id)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
                      >
                        🗑️ מחק
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-400 mb-2">Conditions</h3>
                      <div className="bg-gray-900 rounded p-3 text-sm font-mono overflow-x-auto">
                        {selectedRule.conditions.map((c, i) => (
                          <div key={i} className="text-green-400">
                            {c.field} <span className="text-yellow-400">{c.operator}</span> {JSON.stringify(c.value)}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-400 mb-2">Actions</h3>
                      <div className="bg-gray-900 rounded p-3 text-sm font-mono overflow-x-auto">
                        {selectedRule.actions.map((a, i) => (
                          <div key={i} className="text-blue-400">
                            {a.type}: {a.target} = {JSON.stringify(a.value)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Test Panel */}
                <div className="bg-gray-800 rounded-xl p-6">
                  <h3 className="font-semibold mb-4">🧪 בדיקת חוק</h3>
                  
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">הודעה</label>
                      <input
                        type="text"
                        value={testMessage}
                        onChange={e => setTestMessage(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Intent</label>
                      <select
                        value={testIntent}
                        onChange={e => setTestIntent(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                      >
                        <option value="coupon">coupon</option>
                        <option value="support">support</option>
                        <option value="general">general</option>
                        <option value="recommendation">recommendation</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Confidence</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={testConfidence}
                        onChange={e => setTestConfidence(parseFloat(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => testRule(selectedRule)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
                  >
                    הרץ בדיקה
                  </button>

                  {testResult && (
                    <div className={`mt-4 p-4 rounded-lg ${testResult.matched ? 'bg-green-900/30 border border-green-500' : 'bg-red-900/30 border border-red-500'}`}>
                      <div className="font-medium mb-2">
                        {testResult.matched ? '✅ החוק התאים!' : '❌ החוק לא התאים'}
                      </div>
                      <div className="text-sm space-y-1">
                        {testResult.matchedConditions.map((c, i) => (
                          <div key={i} className={c.result ? 'text-green-400' : 'text-red-400'}>
                            {c.result ? '✓' : '✗'} {c.field}: {JSON.stringify(c.actual)} {c.result ? '=' : '≠'} {JSON.stringify(c.expected)}
                          </div>
                        ))}
                      </div>
                      {testResult.matched && testResult.wouldApply.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <div className="text-sm text-gray-400 mb-1">פעולות שיופעלו:</div>
                          {testResult.wouldApply.map((a, i) => (
                            <div key={i} className="text-sm text-blue-400">
                              {a.type}: {a.target}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-gray-800 rounded-xl p-6 text-center text-gray-500">
                <div className="text-4xl mb-4">👈</div>
                <p>בחר חוק מהרשימה לצפייה ובדיקה</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

