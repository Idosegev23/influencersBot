'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw, FlaskConical, Trash2, Play, X } from 'lucide-react';

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

const categoryPills: Record<string, string> = {
  routing: 'pill pill-blue',
  escalation: 'pill pill-amber',
  security: 'pill pill-red',
  cost: 'pill pill-green',
  personalization: 'pill pill-purple',
};

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
        headers: { 'Content-Type': 'application/json', 'x-admin-key': 'dev-admin' },
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
        headers: { 'Content-Type': 'application/json', 'x-admin-key': 'dev-admin' },
        body: JSON.stringify({
          action: 'test', rule,
          message: testMessage, intent: testIntent,
          confidence: testConfidence, entities: {}, mode: 'creator',
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

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-[#9334EB] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/admin/dashboard" className="btn-ghost text-sm flex items-center gap-2">
                <ArrowRight className="w-4 h-4" /> חזרה
              </Link>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: '#ede9f8' }}>Rule Engine</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>ניהול חוקים דינמיים</p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchRules} className="btn-ghost flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4" /> רענן
            </button>
            <Link href="/admin/experiments" className="btn-primary flex items-center gap-2 text-sm px-4 py-2">
              <FlaskConical className="w-4 h-4" /> ניסויים
            </Link>
          </div>
        </div>

        {error && (
          <div className="pill pill-red px-4 py-3 text-sm mb-6 flex items-center justify-between w-full">
            {error}
            <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rules List */}
          <div className="admin-card p-6">
            <h2 className="text-lg font-semibold mb-4" style={{ color: '#ede9f8' }}>חוקים ({rules.length})</h2>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {rules.map(rule => (
                <div
                  key={rule.id}
                  onClick={() => setSelectedRule(rule)}
                  className="p-4 rounded-xl cursor-pointer transition-all"
                  style={selectedRule?.id === rule.id
                    ? { background: 'rgba(147, 52, 235, 0.08)', border: '1px solid rgba(147, 52, 235, 0.25)' }
                    : { background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }
                  }
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={categoryPills[rule.category] || 'pill pill-neutral'}>
                          {rule.category}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>P{rule.priority}</span>
                        {rule.source === 'db' && (
                          <span className="text-xs" style={{ color: '#9334EB' }}>DB</span>
                        )}
                      </div>
                      <h3 className="font-medium mt-1" style={{ color: '#ede9f8' }}>{rule.name}</h3>
                      {rule.description && (
                        <p className="text-sm mt-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>{rule.description}</p>
                      )}
                    </div>
                    {/* Toggle */}
                    <label className="relative inline-flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => toggleRule(rule.id, !rule.enabled)}
                        className="sr-only peer"
                      />
                      <div
                        className="w-11 h-6 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                        style={{ background: rule.enabled ? '#0891B3' : 'rgba(255, 255, 255, 0.1)' }}
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex gap-2 text-xs" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>
                    <span>{rule.conditions.length} conditions</span>
                    <span>·</span>
                    <span>{rule.actions.length} actions</span>
                    <span>·</span>
                    <span>{rule.mode}</span>
                  </div>
                </div>
              ))}

              {rules.length === 0 && (
                <div className="text-center py-8" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>
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
                <div className="admin-card p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-lg font-semibold" style={{ color: '#ede9f8' }}>{selectedRule.name}</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => testRule(selectedRule)}
                        className="btn-teal px-3 py-1.5 text-sm flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5" /> בדוק
                      </button>
                      <button
                        onClick={() => deleteRule(selectedRule.id)}
                        className="px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 transition-all"
                        style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#DC2627', border: '1px solid rgba(239, 68, 68, 0.12)' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> מחק
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium mb-2" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Conditions</h3>
                      <div className="rounded-xl p-3 text-sm font-mono overflow-x-auto" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        {selectedRule.conditions.map((c, i) => (
                          <div key={i} style={{ color: '#0891B3' }}>
                            {c.field} <span style={{ color: '#EA580B' }}>{c.operator}</span> {JSON.stringify(c.value)}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium mb-2" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Actions</h3>
                      <div className="rounded-xl p-3 text-sm font-mono overflow-x-auto" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        {selectedRule.actions.map((a, i) => (
                          <div key={i} style={{ color: '#9334EB' }}>
                            {a.type}: {a.target} = {JSON.stringify(a.value)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Test Panel */}
                <div className="admin-card p-6">
                  <h3 className="font-semibold mb-4" style={{ color: '#ede9f8' }}>בדיקת חוק</h3>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>הודעה</label>
                      <input
                        type="text"
                        value={testMessage}
                        onChange={e => setTestMessage(e.target.value)}
                        className="admin-input w-full !rounded-xl text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Intent</label>
                      <select
                        value={testIntent}
                        onChange={e => setTestIntent(e.target.value)}
                        className="admin-input w-full !rounded-xl text-sm"
                      >
                        <option value="coupon">coupon</option>
                        <option value="support">support</option>
                        <option value="general">general</option>
                        <option value="recommendation">recommendation</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>Confidence</label>
                      <input
                        type="number"
                        step="0.05" min="0" max="1"
                        value={testConfidence}
                        onChange={e => setTestConfidence(parseFloat(e.target.value))}
                        className="admin-input w-full !rounded-xl text-sm"
                      />
                    </div>
                  </div>

                  <button onClick={() => testRule(selectedRule)} className="btn-primary w-full py-2.5 font-medium">
                    הרץ בדיקה
                  </button>

                  {testResult && (
                    <div
                      className="mt-4 p-4 rounded-xl"
                      style={testResult.matched
                        ? { background: 'rgba(8, 145, 179, 0.06)', border: '1px solid rgba(8, 145, 179, 0.2)' }
                        : { background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)' }
                      }
                    >
                      <div className="font-medium mb-2" style={{ color: testResult.matched ? '#0891B3' : '#DC2627' }}>
                        {testResult.matched ? 'החוק התאים!' : 'החוק לא התאים'}
                      </div>
                      <div className="text-sm space-y-1">
                        {testResult.matchedConditions.map((c, i) => (
                          <div key={i} style={{ color: c.result ? '#0891B3' : '#DC2627' }}>
                            {c.result ? '✓' : '✗'} {c.field}: {JSON.stringify(c.actual)} {c.result ? '=' : '≠'} {JSON.stringify(c.expected)}
                          </div>
                        ))}
                      </div>
                      {testResult.matched && testResult.wouldApply.length > 0 && (
                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <div className="text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>פעולות שיופעלו:</div>
                          {testResult.wouldApply.map((a, i) => (
                            <div key={i} className="text-sm" style={{ color: '#9334EB' }}>
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
              <div className="admin-card p-6 text-center" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>
                <p className="text-4xl mb-4">👈</p>
                <p>בחר חוק מהרשימה לצפייה ובדיקה</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
