# Per-account channel enablement

**Date:** 2026-09-09
**Status:** approved, not implemented

## Problem

Which channels an account may use is not written down anywhere usable. It is inferred
from four unrelated config flags, each owned by a different subsystem, and there is no
screen that answers "what is open for this brand?".

There *is* an `accounts.allowed_channels` column (migration 004). It is dead: one reader
that never gates anything, and four incompatible shapes across 82 rows.

| `allowed_channels` value | accounts |
|---|---|
| `["chat"]` (the migration default) | 53 |
| `{"web": true, "whatsapp": false}` (object, written by scan scripts) | 27 |
| `["chat","widget","whatsapp","instagram"]` | 1 (שקדיה) |
| `["chat","widget","instagram"]` | 1 (מוקה) |

It is also **wrong**: שקדיה claims `whatsapp` while `whatsapp_cs.enabled` is unset, and
מוקה claims `instagram` with no `ig_graph_connections` row. Nothing may be derived from
this column — only from the real gates.

## Current gates

| Channel | What actually opens it today |
|---|---|
| chat (`/chat/[username]`) | nothing — the page is served for every account |
| widget | nothing — `/api/widget/config` serves every account |
| whatsapp | `config.whatsapp_cs.enabled === true` |
| instagram DM | `config.dm_bot_enabled === true` (+ an `ig_graph_connections` row) |

`config.whatsapp_cs.enabled` does double duty: it opens the channel **and** defines the
shared number's brand roster, read by `fetchCsEnabledRows()` in `src/lib/cs/brand-resolver.ts`
and by the `bind_brand` gate at `src/lib/cs/tools/index.ts:180`.

**`cs_web.enabled` and `cs_ig.enabled` are not channel gates.** They select the CS brain as
the *mode* on a surface that is open regardless. They keep that meaning and must not be
merged into the checkboxes.

### Effective state today (active accounts with any signal)

| Account | chat | widget | whatsapp | instagram DM |
|---|---|---|---|---|
| ARGANIA GROUP | ✅ | ✅ | ✅ | — |
| 𝐋𝐀 𝐁𝐄𝐀𝐔𝐓𝐄 | ✅ | ✅ | ✅ | — |
| STUDIO PASHA | ✅ | ✅ | ✅ | — |
| בסטי-טסט | ✅ | ✅ | ✅ | — |
| LDRS GROUP | ✅ | ✅ | — | ✅ |
| ~20 others (TERMINAL X, טמבור, מאוחדת, Danielle Amit, …) | ✅ | ✅ | — | — |

`cs_ig.enabled` is unset on every account — LDRS DMs run the older DM handler, not the CS brain.

## Decisions

1. **Enforcement, not annotation.** The checkbox is the gate. Unticking a channel closes it.
2. **A closed channel does not exist.** No "sorry, this channel is off" copy: the widget does
   not boot, the chat page 404s, the brand is absent from the WhatsApp roster and unbindable,
   the IG webhook acks and discards.
3. **Four equal checkboxes**, with chat + widget ticked by default on a new account. They can
   be unticked — useful for freezing an expired demo.
4. **Nothing is written on deploy.** Active accounts are not touched. See below.

## Data model

```
accounts.config.channels = { chat: bool, widget: bool, whatsapp: bool, instagram: bool }
```

Absent on every account at rollout, and that is the normal state until someone edits it.

`accounts.allowed_channels` is abandoned: `src/engines/context-builder.ts:108` stops reading
it and the column is marked deprecated in a comment. The column is **not** dropped and its
rows are **not** rewritten — it holds no truth worth migrating and dropping it buys nothing.

## Resolver — the single chokepoint

`src/lib/channels/resolve.ts`

```ts
resolveChannels(account): { chat, widget, whatsapp, instagram }
isChannelOpen(account, channel): boolean
```

A pure function over `account.config`. No DB access, no I/O.

- `config.channels` present → it is the answer, in full.
- `config.channels` absent → derive from what is live now:
  `chat: true`, `widget: true`, `whatsapp: config.whatsapp_cs?.enabled === true`,
  `instagram: config.dm_bot_enabled === true`.

The derivation is a read-through default, not a migration. It reproduces today's behaviour
exactly, so the feature ships invisible.

**Once `config.channels` exists on an account it wins outright.** Editing
`whatsapp_cs.enabled` directly in the DB will no longer affect that account. This is the point
of a single source of truth, and it is a real change in how the old flags behave — it is why
the fallback exists only for accounts nobody has edited.

## Enforcement points

| Channel | Where the check goes | Closed behaviour |
|---|---|---|
| chat | `/chat/[username]` page loader | 404 |
| widget | `/api/widget/config` | 404 → the widget script never boots |
| whatsapp | `fetchCsEnabledRows()` + the `bind_brand` gate | brand absent from the roster, and unbindable even by uuid |
| instagram | `processInstagramGraphDM` (replaces the `dm_bot_enabled` check) | webhook 200s and discards |

The WhatsApp check must land in `fetchCsEnabledRows()` **and** in `bind_brand`. The roster
narrows what the brain is offered; `bind_brand` is the authority. A closed brand that is
merely hidden from the roster could still be bound by a hallucinated uuid.

## Writes

Only an admin click writes. The first save on an account persists the complete resolved set
(current state plus the edit), so the account moves from derived to explicit in one step and
no other account is affected.

## Admin UI

`ChannelsForm` on `/admin/influencers/[id]`, following `EscalationContactsForm` exactly:
client component, `GET`/`PUT /api/admin/accounts/[accountId]/channels`, `requireAdminAuth()`,
dirty tracking, idle/saving/saved/error status.

Four checkboxes. The form loads the **resolved** set, so an untouched account shows its real
current state ticked.

`src/app/api/admin/accounts/route.ts:191` stops writing the legacy `allowed_channels` object
on account creation and writes `config.channels` with chat + widget true instead.

## Testing

- **Resolver truth table** — explicit set wins; absent set derives correctly; both legacy
  `allowed_channels` shapes are ignored entirely (a `["chat","widget","whatsapp","instagram"]`
  row on an account with `whatsapp_cs.enabled` unset must still resolve whatsapp **false**).
- **Each enforcement point, both directions.** Every "closed when off" assertion ships with a
  "open when on" assertion against the same harness. An absence assertion alone passes
  vacuously when the harness never reaches the code at all — that has bitten this repo before.
- **No-op on rollout** — a test over the real shapes proving the derived set equals today's
  effective state for every account with any signal.

## Open decision

**LDRS + WhatsApp.** It is on Ido's list of what LDRS should have; `whatsapp_cs.enabled` is
unset today, so it resolves to **off** and stays off. Ido ticks it in the new screen when he
wants it, which is also the first real exercise of the write path.

## Non-goals

- Dropping or rewriting `accounts.allowed_channels`.
- Changing `cs_web.enabled` / `cs_ig.enabled` semantics, or merging them into the checkboxes.
- Instagram for ARGANIA / LA BEAUTÉ / STUDIO PASHA — wanted later, and the checkbox is how it
  will be turned on; nothing here enables it.
- Per-channel scheduling, quotas, or plan-based limits.
