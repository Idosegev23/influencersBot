'use client';

import { useState, type ReactNode } from 'react';
import type { RequestMeta } from '@/lib/meta-review/util';

export interface ApiCallResult {
  requests: RequestMeta[];
  response: unknown;
  ok: boolean;
}

interface ApiCallCardProps {
  title: string;
  permission: string;
  description: string;
  actionLabel: string;
  onRun: () => Promise<ApiCallResult>;
  disabled?: boolean;
  disabledReason?: string;
  /** ok:true but no rows — show a neutral "0 items" banner instead of green success. */
  emptyWhen?: (result: ApiCallResult) => boolean;
  children?: (result: ApiCallResult) => ReactNode;
}

export default function ApiCallCard({
  title, permission, description, actionLabel, onRun, disabled, disabledReason, emptyWhen, children,
}: ApiCallCardProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ApiCallResult | null>(null);
  const [showRaw, setShowRaw] = useState(true); // JSON visible by default — it proves the call is live

  async function run() {
    setStatus('loading');
    try {
      const r = await onRun();
      setResult(r);
      setStatus(r.ok ? 'success' : 'error');
    } catch (e: any) {
      setResult({ requests: [], response: { error: { message: e?.message || 'Request failed' } }, ok: false });
      setStatus('error');
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <span className="inline-block mt-1 text-[11px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
            {permission}
          </span>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">{description}</p>
        </div>
        <button
          onClick={run}
          disabled={disabled || status === 'loading'}
          title={disabled ? (disabledReason || 'Unavailable') : `Runs a live ${permission} call to the Instagram Graph API`}
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'loading' ? 'Calling API…' : actionLabel}
        </button>
      </div>

      {disabled && disabledReason && (
        <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{disabledReason}</p>
      )}

      {status !== 'idle' && result && (
        <div className="mt-4 space-y-3">
          {status === 'success' && (emptyWhen && emptyWhen(result) ? (
            <div className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ✓ Live API call succeeded, but returned 0 items — pick an item that has data.
            </div>
          ) : (
            <div className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ Live API call succeeded
            </div>
          ))}
          {status === 'error' && (
            <div className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              ✕ The API returned an error (shown in the response below)
            </div>
          )}

          {children && result.ok && <div>{children(result)}</div>}

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Request</div>
            <div className="p-3 space-y-1">
              {result.requests.map((r, i) => (
                <div key={i} className="font-mono text-xs text-gray-700 break-all">
                  <span className="font-bold">{r.method}</span> {r.url}
                  {r.note && <div className="text-gray-400">{r.note}</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="w-full text-left px-3 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide"
            >
              Response (raw JSON) {showRaw ? '▲' : '▼'}
            </button>
            {showRaw && (
              <pre className="p-3 text-xs text-gray-800 overflow-x-auto max-h-80">
                {JSON.stringify(result.response, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
