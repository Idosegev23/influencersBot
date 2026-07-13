# Instagram Control Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans / subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Owner-facing `/influencer/[username]/instagram` (Conversation Management Dashboard for Meta) + render real post thumbnails on the main dashboard.

**Architecture:** New nav tab gated on `instagramConnected`. The page reuses `dm-settings` (bot on/off + connection) and three new owner endpoints (`/api/influencer/dm/{conversations,send,flag}`) that read `chat_sessions`/`chat_messages` and send via `sendInstagramDM`. Pure helpers isolated + tested. All new copy in a new i18n `instagram` section.

**Tech Stack:** Next.js 16 App Router, React client components, TypeScript, Supabase, Instagram Graph (`graph.instagram.com/v22.0`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-instagram-control-page-design.md`

## Global Constraints
- **Owner endpoints are `requireInfluencerAuth`, which reads `?username=` from the QUERY STRING** (`extractUsername`). Every client call to `/api/influencer/dm/*` MUST include `?username=<username>` or it 400s (the language-toggle bug).
- **No send outside the 24-hour window.** The send endpoint hard-refuses (422) when the last inbound message is >24h old — Meta compliance, defense-in-depth with the disabled UI.
- **No per-conversation pause / governance.** Only the account-wide `dm_bot_enabled` toggle.
- **i18n:** new strings go in `src/lib/i18n/dashboard/instagram.ts` (he canonical + en mirror); the en-mirrors-he unit test must stay green. LDRS renders `en`.
- **Thread id format:** `dm_ig_graph_<recipientId>_<accountId>`.
- Commit per task; push at end.

---

## File Structure
- Create `src/lib/instagram-graph/dm-threads.ts` — pure: `parseRecipientFromThreadId`, `within24h`, `summarizeThreads`.
- Create `src/app/api/influencer/dm/conversations/route.ts`, `.../send/route.ts`, `.../flag/route.ts`.
- Create `src/lib/i18n/dashboard/instagram.ts`; modify `.../dashboard/index.ts` + `.../dashboard/nav.ts`.
- Modify `src/app/api/influencer/nav-features/route.ts`, `src/components/NavigationMenu.tsx`.
- Create `src/app/influencer/[username]/instagram/page.tsx`.
- Modify `src/app/influencer/[username]/dashboard/page.tsx` (thumbnail render).
- Test `tests/unit/dm-threads.test.ts`.

---

### Task 1: Pure DM-thread helpers + tests

**Files:** Create `src/lib/instagram-graph/dm-threads.ts`; Test `tests/unit/dm-threads.test.ts`.

**Produces:**
- `parseRecipientFromThreadId(threadId: string): string | null` — `dm_ig_graph_<recipientId>_<accountId>` → recipientId.
- `within24h(lastInboundAtISO: string | null, nowMs: number): boolean`.
- `summarizeThreads(threads: {messages:{role:string; by?:string}[]; flagged:boolean}[]): {conversations:number; botReplies:number; humanReplies:number; flagged:number}`.

```ts
export function parseRecipientFromThreadId(threadId: string): string | null {
  // dm_ig_graph_<recipientId>_<accountId>  — accountId is a uuid (has dashes),
  // recipientId is the numeric IGSID between the prefix and the last _<uuid>.
  const m = /^dm_ig_graph_(.+)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(threadId);
  return m ? m[1] : null;
}

export function within24h(lastInboundAtISO: string | null, nowMs: number): boolean {
  if (!lastInboundAtISO) return false;
  const t = Date.parse(lastInboundAtISO);
  if (Number.isNaN(t)) return false;
  return nowMs - t < 24 * 60 * 60 * 1000;
}

export function summarizeThreads(
  threads: { messages: { role: string; by?: string }[]; flagged: boolean }[],
): { conversations: number; botReplies: number; humanReplies: number; flagged: number } {
  let botReplies = 0, humanReplies = 0, flagged = 0;
  for (const th of threads) {
    if (th.flagged) flagged++;
    for (const m of th.messages) {
      if (m.role === 'assistant') (m.by === 'human' ? humanReplies++ : botReplies++);
    }
  }
  return { conversations: threads.length, botReplies, humanReplies, flagged };
}
```

Test covers: valid/invalid thread ids; 24h boundary (just under / just over / null / bad); summarize with mixed bot/human/flagged.

- [ ] Write test → run (fails, unresolved module) → implement → run (passes) → commit.

---

### Task 2: `GET /api/influencer/dm/conversations`

**Files:** Create `src/app/api/influencer/dm/conversations/route.ts`.
**Consumes:** `requireInfluencerAuth`, `parseRecipientFromThreadId`, `within24h`, `summarizeThreads`, `resolveSenderIdentity` (`@/lib/instagram-graph/dm-guards`), `getIgConnectionForAccount`.
**Produces:** `{ threads: Thread[], analytics }` where `Thread = { sessionId, threadId, recipientId, recipientHandle, lastMessage, lastMessageAt, lastInboundAt, within24h, flagged, messages: {role,content,createdAt,by}[] }`.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { resolveSenderIdentity } from '@/lib/instagram-graph/dm-guards';
import { parseRecipientFromThreadId, within24h, summarizeThreads } from '@/lib/instagram-graph/dm-threads';

export async function GET(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;
  const accountId = auth.accountId;

  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id, thread_id, meta_state, message_count, last_response_id')
    .eq('account_id', accountId)
    .like('thread_id', 'dm_ig_graph_%')
    .order('updated_at', { ascending: false })
    .limit(50);

  const conn = await getIgConnectionForAccount(accountId);
  const now = Date.now();

  const threads = await Promise.all((sessions || []).map(async (s: any) => {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('role, content, created_at, metadata')
      .eq('session_id', s.id)
      .order('created_at', { ascending: true })
      .limit(50);
    const messages = (msgs || []).map((m: any) => ({
      role: m.role, content: m.content, createdAt: m.created_at, by: m.metadata?.by || (m.role === 'assistant' ? 'bot' : undefined),
    }));
    const lastInbound = [...messages].reverse().find((m) => m.role === 'user');
    const last = messages[messages.length - 1];
    const recipientId = parseRecipientFromThreadId(s.thread_id);
    let recipientHandle: string | null = null;
    if (recipientId && conn) {
      const id = await resolveSenderIdentity(recipientId, conn.accessToken).catch(() => null);
      recipientHandle = id?.username || id?.name || null;
    }
    return {
      sessionId: s.id, threadId: s.thread_id, recipientId,
      recipientHandle, lastMessage: last?.content || '', lastMessageAt: last?.createdAt || null,
      lastInboundAt: lastInbound?.createdAt || null,
      within24h: within24h(lastInbound?.createdAt || null, now),
      flagged: s.meta_state === 'flagged', messages,
    };
  }));

  return NextResponse.json({ threads, analytics: summarizeThreads(threads) });
}
```

- [ ] Write route → verify with `curl "http://localhost:3000/api/influencer/dm/conversations?username=ldrs_group" -H "Cookie: influencer_session_ldrs_group=authenticated"` returns `threads` (or defer to Task 9 live run) → commit.

---

### Task 3: `POST /api/influencer/dm/send` (24h-enforced + persist)

**Files:** Create `src/app/api/influencer/dm/send/route.ts`.
**Consumes:** `requireInfluencerAuth`, `getIgConnectionForAccount`, `sendInstagramDM`, `parseRecipientFromThreadId`, `within24h`.
**Produces:** `POST { accountId, threadId, text }` → `{ ok, response }` | `422 {error:'outside_24h_window'}`.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { sendInstagramDM } from '@/lib/instagram-graph/client';
import { parseRecipientFromThreadId, within24h } from '@/lib/instagram-graph/dm-threads';

export async function POST(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;
  const { threadId, text } = await req.json().catch(() => ({}));
  if (!threadId || !text?.trim()) return NextResponse.json({ error: 'Missing threadId or text' }, { status: 400 });

  const { data: session } = await supabase
    .from('chat_sessions').select('id, message_count').eq('thread_id', threadId).eq('account_id', auth.accountId).maybeSingle();
  if (!session) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const { data: lastInbound } = await supabase
    .from('chat_messages').select('created_at').eq('session_id', session.id).eq('role', 'user')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!within24h(lastInbound?.created_at || null, Date.now()))
    return NextResponse.json({ error: 'outside_24h_window' }, { status: 422 });

  const recipientId = parseRecipientFromThreadId(threadId);
  const conn = await getIgConnectionForAccount(auth.accountId);
  if (!recipientId || !conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  try {
    const result = await sendInstagramDM(recipientId, text, conn.igId, conn.accessToken);
    await supabase.from('chat_messages').insert({
      session_id: session.id, role: 'assistant', content: text,
      metadata: { by: 'human' }, ...(result?.message_id ? { meta_mid: result.message_id } : {}),
    });
    await supabase.from('chat_sessions').update({ message_count: (session.message_count || 0) + 1 }).eq('id', session.id);
    return NextResponse.json({ ok: true, response: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, response: { error: { message: e?.message || 'send failed' } } });
  }
}
```

- [ ] Write route → verify (curl within window, expect ok:true; note 422 outside window) → commit.

---

### Task 4: `POST /api/influencer/dm/flag`

**Files:** Create `src/app/api/influencer/dm/flag/route.ts`. Sets `chat_sessions.meta_state='flagged'|null` for a session owned by the account.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;
  const { sessionId, flagged } = await req.json().catch(() => ({}));
  if (!sessionId || typeof flagged !== 'boolean') return NextResponse.json({ error: 'Missing sessionId or flagged' }, { status: 400 });
  const { error } = await supabase.from('chat_sessions')
    .update({ meta_state: flagged ? 'flagged' : null }).eq('id', sessionId).eq('account_id', auth.accountId);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, flagged });
}
```

- [ ] Write route → commit.

---

### Task 5: nav-features flag + NavigationMenu tab + nav i18n

**Files:** Modify `src/app/api/influencer/nav-features/route.ts`, `src/components/NavigationMenu.tsx`, `src/lib/i18n/dashboard/nav.ts`.

- nav-features: after the products count, add:
```ts
    const { data: igConn } = await supabase.from('ig_graph_connections')
      .select('id').eq('account_id', auth.accountId).eq('is_active', true).limit(1).maybeSingle();
```
and add `instagramConnected: !!igConn` to the JSON response.

- `nav.ts`: add `instagram: 'אינסטגרם'` (he) / `instagram: 'Instagram'` (en) to the `nav` section.

- `NavigationMenu.tsx`: import `Instagram` from `lucide-react`; add `'instagram'` to the `NavKey` union; add `{ key: 'instagram', icon: Instagram, requiresInstagram: true }` to `BASE_NAV_ITEMS` (after `settings` or near `conversations`); extend the item type with `requiresInstagram?: boolean`; add `instagramConnected: boolean` to the `features` state + the fetch mapping (`instagramConnected: !!data.instagramConnected`); default to `false` while loading; in the filter add `if (item.requiresInstagram && !instagramConnected) return false;` where `const instagramConnected = features ? features.instagramConnected : false;`.

- [ ] Apply → type-check clean → the tab appears only when connected → commit.

---

### Task 6: i18n `instagram` section

**Files:** Create `src/lib/i18n/dashboard/instagram.ts`; modify `src/lib/i18n/dashboard/index.ts`.

`instagram.ts` exports `export const instagram = { he: {...}, en: {...} } as const;` with keys for: pageTitle, pageSubtitle, connectedAs, botSectionTitle, botOn, botOff, botToggleHint, inboxTitle, threadsEmpty, selectThread, you, bot, replyPlaceholder, sendReply, sending, outside24h, within24hHint, flag, unflag, flagged, analyticsTitle, statConversations, statBotReplies, statHumanReplies, statFlagged, sendError. `he` canonical, `en` mirror.

`index.ts`: `import { instagram } from './instagram';` and add `instagram: instagram.he` / `instagram: instagram.en` to the two `STRINGS` blocks.

- [ ] Apply → `npx vitest run tests/unit/dashboard-i18n.test.ts` (en-mirrors-he green) → commit.

---

### Task 7: The Instagram page

**Files:** Create `src/app/influencer/[username]/instagram/page.tsx` (`'use client'`).

Mirrors `chatbot-settings/page.tsx`: `useParams().username`; `useDashboardLang`; `const t = getDashboardStrings(lang).instagram`; get `accountId` via `GET /api/influencer/profile?username=`; load `dm-settings` (bot toggle + connection) and `GET /api/influencer/dm/conversations?username=`. Renders: connection card + on/off toggle (PATCH `dm-settings` `{accountId, dm_bot_enabled}`); thread list + selected-thread messages; reply box (disabled unless `thread.within24h`, POST `/api/influencer/dm/send?username=`); flag button (POST `/api/influencer/dm/flag?username=`); analytics tiles. Wrap in `dir={dashboardDir(lang)}`. All calls to `/api/influencer/dm/*` include `?username=${username}`.

- [ ] Build page → type-check clean → commit. (Full live UI verify in Task 9.)

---

### Task 8: Dashboard media-list thumbnail fix

**Files:** Modify `src/app/influencer/[username]/dashboard/page.tsx` (Recent posts render ≈ lines 634-662).

Replace the generic type-icon block with the real thumbnail when present:
```tsx
{post.thumbnail
  ? // eslint-disable-next-line @next/next/no-img-element
    <img src={post.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
  : <div className="w-10 h-10 rounded-lg flex items-center justify-center …"><TypeIcon …/></div>}
```
Keep the existing icon as the fallback. `post.thumbnail` already comes from `dashboard-stats`.

- [ ] Apply → type-check clean → commit.

---

### Task 9: Full verification + review workflow + push

- [ ] `npx vitest run tests/unit/dm-threads.test.ts tests/unit/dashboard-i18n.test.ts` → green.
- [ ] `npm run type-check` → no new errors in the touched files.
- [ ] Live dry-run on LDRS: Instagram tab shows; bot toggle flips; inbox lists real DM threads; a reply sends within the window and appears as `human`; flag toggles; dashboard Recent posts show real thumbnails.
- [ ] Run an adversarial review workflow (token-leak / auth / 24h-enforcement / data-shape dimensions) over the new endpoints + page; apply confirmed fixes.
- [ ] `git push origin main`.

---

## Self-Review
- **Spec coverage:** nav gating (T5), connection+toggle (T7 reuse dm-settings), inbox read (T2), manual reply 24h-enforced (T3), flag (T4), analytics (T1 summarize + T7), i18n (T6), dashboard media list (T8). ✓
- **Placeholders:** none — full code for helpers/endpoints; page + nav described against exact existing patterns (executed inline with file reads). ✓
- **Type consistency:** `parseRecipientFromThreadId`/`within24h`/`summarizeThreads` (T1) used identically in T2/T3; `Thread` shape from T2 consumed by T7; `?username=` required on every `/api/influencer/dm/*` call (T2/T3/T4/T7). ✓
