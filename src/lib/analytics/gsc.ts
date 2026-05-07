/**
 * Google Search Console fetch + upsert. Uses the existing service account
 * (GOOGLE_SERVICE_ACCOUNT_KEY) — the customer must add that account's
 * email as a verified user on their GSC property for this to work.
 *
 * One row per (account_id, date, query, page) into gsc_query_daily.
 * Top 1000 queries by clicks per day, fetched with a 3-day lookback to
 * pick up GSC's own delayed reporting (their data lands ~48h late).
 */

import { google } from 'googleapis';
import { supabase } from '@/lib/supabase';

const GSC_SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

function getGscAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: GSC_SCOPES,
  });
}

export interface GscFetchResult {
  accountId: string;
  fetched: number;
  status: 'ok' | 'no_url' | 'auth_failed' | 'permission_denied' | 'error';
  error?: string;
}

export async function fetchGscForAccount(opts: {
  accountId: string;
  siteUrl: string;
  daysBack?: number;
}): Promise<GscFetchResult> {
  const daysBack = opts.daysBack ?? 3;
  if (!opts.siteUrl) {
    return { accountId: opts.accountId, fetched: 0, status: 'no_url' };
  }

  let webmasters;
  try {
    const auth = getGscAuth();
    webmasters = google.webmasters({ version: 'v3', auth: await auth.getClient() as any });
  } catch (e: any) {
    return {
      accountId: opts.accountId,
      fetched: 0,
      status: 'auth_failed',
      error: e?.message || 'auth_failed',
    };
  }

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - daysBack);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 1);

  let rows: Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }> = [];

  try {
    const resp = await webmasters.searchanalytics.query({
      siteUrl: opts.siteUrl,
      requestBody: {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        dimensions: ['date', 'query', 'page'],
        rowLimit: 1000,
        dataState: 'final',
      },
    });
    rows = (resp.data.rows || []) as typeof rows;
  } catch (e: any) {
    const msg = e?.message || '';
    if (/permission|403/i.test(msg)) {
      return {
        accountId: opts.accountId,
        fetched: 0,
        status: 'permission_denied',
        error: msg,
      };
    }
    return { accountId: opts.accountId, fetched: 0, status: 'error', error: msg };
  }

  if (rows.length === 0) {
    return { accountId: opts.accountId, fetched: 0, status: 'ok' };
  }

  const upserts = rows
    .filter((r) => r.keys?.length === 3)
    .map((r) => ({
      account_id: opts.accountId,
      date: r.keys[0],
      query: r.keys[1].slice(0, 500),
      page: r.keys[2].slice(0, 500),
      clicks: Math.round(r.clicks || 0),
      impressions: Math.round(r.impressions || 0),
      ctr: r.ctr || 0,
      position: r.position || 0,
      fetched_at: new Date().toISOString(),
    }));

  // Bulk upsert in chunks of 200 to stay under PostgREST limits.
  const CHUNK = 200;
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const slice = upserts.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('gsc_query_daily')
      .upsert(slice, { onConflict: 'account_id,date,query,page' });
    if (error) {
      return {
        accountId: opts.accountId,
        fetched: i,
        status: 'error',
        error: error.message,
      };
    }
  }

  return { accountId: opts.accountId, fetched: upserts.length, status: 'ok' };
}
