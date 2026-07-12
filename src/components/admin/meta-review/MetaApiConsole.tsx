'use client';

import { useEffect, useState } from 'react';
import ApiCallCard from './ApiCallCard';

interface Props { accountId: string; }

interface ConnInfo {
  ig_username?: string;
  ig_name?: string;
  ig_followers_count?: number;
  is_active?: boolean;
}
interface MediaItem { id: string; caption?: string; media_type?: string; }
interface Thread { id: string; recipientId: string; recipientName: string; lastMessage: string; }

export default function MetaApiConsole({ accountId }: Props) {
  const [conn, setConn] = useState<ConnInfo | null | undefined>(undefined);
  const [recentMedia, setRecentMedia] = useState<MediaItem[]>([]);
  const [selectedMedia, setSelectedMedia] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [convosLoaded, setConvosLoaded] = useState(false);
  const [selectedThread, setSelectedThread] = useState('');
  const [manualRecipientId, setManualRecipientId] = useState('');
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    fetch(`/api/admin/ig-connection?accountId=${accountId}`)
      .then((r) => r.json())
      .then((d) => setConn(d.connection ?? null))
      .catch(() => setConn(null));
  }, [accountId]);

  const reconnectUrl =
    `/api/auth/instagram/connect?accountId=${accountId}` +
    `&returnTo=${encodeURIComponent(`/admin/influencers/${accountId}#meta-api-console`)}`;

  const selectedThreadObj = threads.find((t) => t.id === selectedThread);
  const effectiveRecipientId = (selectedThreadObj?.recipientId || manualRecipientId).trim();

  return (
    <div id="meta-api-console" dir="ltr" lang="en" style={{ direction: 'ltr' }} className="mt-10">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Meta API Console</h2>
        <p className="text-sm text-gray-600 mt-1">
          Live Instagram Graph API calls for App Review. Each block below performs a real API request
          and shows the request URL, the raw JSON response, and the success state.
        </p>
      </div>

      {/* Block 0 — Connection & OAuth */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 mb-5">
        <h3 className="text-lg font-semibold text-gray-900">Connection &amp; permissions</h3>
        <p className="mt-2 text-sm text-gray-600">
          Reconnect to run the Instagram login flow and review the permissions granted to this app.
          This is the login + consent step recorded at the start of the screencast.
        </p>
        <div className="mt-3 text-sm">
          {conn === undefined && <span className="text-gray-400">Checking connection…</span>}
          {conn === null && <span className="text-amber-700">No active Instagram connection.</span>}
          {conn && (
            <span className="text-gray-800">
              Connected as <strong>@{conn.ig_username}</strong>
              {typeof conn.ig_followers_count === 'number' && <> · {conn.ig_followers_count} followers</>}
            </span>
          )}
        </div>
        <a
          href={reconnectUrl}
          className="inline-block mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700"
        >
          Reconnect &amp; review permissions
        </a>
      </section>

      {/* Block 1 — Basic */}
      <ApiCallCard
        title="Profile & recent media"
        permission="instagram_business_basic"
        description="Retrieves the connected account's public profile (username, name, follower count, media count) and its most recent media."
        actionLabel="Fetch profile & recent media"
        onRun={async () => {
          const res = await fetch(`/api/admin/meta-review/profile?accountId=${accountId}`);
          const json = await res.json();
          const media = (json.response?.media?.data || []) as any[];
          setRecentMedia(media.map((m) => ({ id: m.id, caption: m.caption, media_type: m.media_type })));
          if (media[0] && !selectedMedia) setSelectedMedia(media[0].id);
          return { requests: json.requests || [], response: json.response, ok: !!json.ok };
        }}
      >
        {(r) => {
          const p = (r.response as any)?.profile || {};
          return (
            <div className="flex items-center gap-3">
              {p.profile_picture_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.profile_picture_url} alt="" className="w-14 h-14 rounded-full object-cover" />
              )}
              <div>
                <div className="font-semibold text-gray-900">
                  {p.name} <span className="text-gray-500">@{p.username}</span>
                </div>
                <div className="text-sm text-gray-600">
                  {p.followers_count} followers · {p.media_count} posts
                </div>
              </div>
            </div>
          );
        }}
      </ApiCallCard>

      {/* Block 2 — Insights */}
      <ApiCallCard
        title="Account insights"
        permission="instagram_business_manage_insights"
        description="Retrieves account-level analytics (reach, accounts engaged, total interactions) and follower demographics."
        actionLabel="Fetch account insights"
        emptyWhen={(r) => !(((r.response as any)?.account?.data || []).length)}
        onRun={async () => {
          const res = await fetch(`/api/admin/meta-review/insights?accountId=${accountId}`);
          const json = await res.json();
          return { requests: json.requests || [], response: json.response, ok: !!json.ok };
        }}
      >
        {(r) => {
          const rows = ((r.response as any)?.account?.data || []) as any[];
          if (!rows.length) return <div className="text-sm text-gray-500">No metric values returned.</div>;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {rows.map((m: any) => (
                <div key={m.name} className="rounded-lg border border-gray-200 p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900">{m.total_value?.value ?? '—'}</div>
                  <div className="text-xs text-gray-500">{m.name}</div>
                </div>
              ))}
            </div>
          );
        }}
      </ApiCallCard>

      {/* Block 3 — Messages (read + send) */}
      <ApiCallCard
        title="Direct messages — conversations"
        permission="instagram_business_manage_messages"
        description="Retrieves recent Instagram Direct conversations. Use the panel below to send a reply."
        actionLabel="Load conversations"
        onRun={async () => {
          const res = await fetch(`/api/admin/meta-review/conversations?accountId=${accountId}`);
          const json = await res.json();
          // Exclude the business under ANY of its known ids; drop threads with no real counterpart.
          const bizIds = new Set<string>(
            (json.businessIgIds && json.businessIgIds.length ? json.businessIgIds : [json.businessIgId]).filter(Boolean),
          );
          const data = (json.response?.data || []) as any[];
          const built: Thread[] = data
            .map((c) => {
              const other = (c.participants?.data || []).find((p: any) => p.id && !bizIds.has(p.id));
              if (!other) return null;
              return {
                id: c.id,
                recipientId: other.id,
                recipientName: other.username || other.id,
                lastMessage: c.messages?.data?.[0]?.message || '',
              };
            })
            .filter(Boolean) as Thread[];
          setThreads(built);
          setConvosLoaded(true);
          return { requests: json.requests || [], response: json.response, ok: !!json.ok };
        }}
      />

      {/* Reply panel — always available so the publish demo can be recorded even
          when the 24h window has no conversations (fall back to a manual IGSID). */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">Reply via Direct Message</label>
        {convosLoaded && threads.length === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-3">
            No conversations in the 24-hour messaging window. Send a DM to the account and reload,
            or paste a recipient IGSID below to send the reply.
          </p>
        )}
        {threads.length > 0 && (
          <select
            value={selectedThread}
            onChange={(e) => setSelectedThread(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          >
            <option value="">Select a conversation…</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                @{t.recipientName} — {t.lastMessage.slice(0, 40)}
              </option>
            ))}
          </select>
        )}
        <input
          value={manualRecipientId}
          onChange={(e) => setManualRecipientId(e.target.value)}
          placeholder="Recipient IGSID (auto-filled from a selected conversation, or paste one)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 font-mono"
        />
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Type a reply to send via Instagram Direct…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          rows={2}
        />
        <ApiCallCard
          title="Send reply"
          permission="instagram_business_manage_messages"
          description="Sends the reply to the recipient via the Instagram Send API and shows the message id returned on success."
          actionLabel="Send reply"
          disabled={!effectiveRecipientId || !replyText.trim()}
          disabledReason="Select a conversation (or paste a recipient IGSID) and type a reply first."
          onRun={async () => {
            const res = await fetch('/api/admin/meta-review/send-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId, recipientId: effectiveRecipientId, text: replyText }),
            });
            const json = await res.json();
            return { requests: json.requests || [], response: json.response, ok: !!json.ok };
          }}
        />
      </div>

      {/* Block 4 — Comments (read-only) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">Media to read comments from</label>
        {recentMedia.length === 0 ? (
          <p className="text-xs text-amber-700">Run “Fetch profile &amp; recent media” first to populate this list.</p>
        ) : (
          <select
            value={selectedMedia}
            onChange={(e) => setSelectedMedia(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {recentMedia.map((m) => (
              <option key={m.id} value={m.id}>
                {m.media_type} — {(m.caption || m.id).slice(0, 50)}
              </option>
            ))}
          </select>
        )}
      </div>

      <ApiCallCard
        title="Comments on media (read-only)"
        permission="instagram_business_manage_comments"
        description="Retrieves the comments on the selected media. Read-only — this console does not reply to, hide, or delete comments."
        actionLabel="Load comments"
        disabled={!selectedMedia}
        disabledReason="Select a media item above first."
        emptyWhen={(r) => !(((r.response as any)?.data || []).length)}
        onRun={async () => {
          const res = await fetch(
            `/api/admin/meta-review/comments?accountId=${accountId}&mediaId=${encodeURIComponent(selectedMedia)}`,
          );
          const json = await res.json();
          return { requests: json.requests || [], response: json.response, ok: !!json.ok };
        }}
      >
        {(r) => {
          const items = ((r.response as any)?.data || []) as any[];
          if (!items.length) return <div className="text-sm text-gray-500">No comments on this media.</div>;
          return (
            <ul className="space-y-2">
              {items.map((c: any) => (
                <li key={c.id} className="text-sm">
                  <span className="font-semibold">@{c.username}</span> {c.text}{' '}
                  <span className="text-gray-400">· {c.like_count} likes</span>
                </li>
              ))}
            </ul>
          );
        }}
      </ApiCallCard>
    </div>
  );
}
