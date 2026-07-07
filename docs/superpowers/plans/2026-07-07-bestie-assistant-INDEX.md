# Bestie Assistant v1 — Implementation Plans (index)

8 per-phase TDD plans authored by workflow wf_e78c42b3 + a lead-architect consistency review.
P4 was re-authored by hand (its workflow agent emitted a placeholder body); all metadata is the agent's.

## Build order

1. P0 — Foundations & tenancy: tables (agencies, assistant_actions, assistant_turns, talent_rate_cards, exclusivity, integration_credentials), agency_id/role/vat_rate/currency columns, RLS + current_agency_id(), and the pure helpers idempotency.ts / authz.ts / ledger.ts / provisioning.ts. This is migration 061 and the sole owner of the core ledger tables. MOVE pending_actions creation here too (spec §8.2 groups it with assistant core; P3/P7 already assume it lives in the core migration).
2. P1 — Tool registry & read tools: registry.ts (ToolDefinition contract + Registry + projection) is CANONICAL here; read tools status/list_pending/sales_summary/whats_new. No migration. Depends on P0 tables for tool execute().
3. P2 — Planner→Executor core: planner/resolver/gate/context/executor/orchestrator/confirm(binding). Must IMPORT P1 registry and P0 ledger — must NOT re-author registry.ts, ledger.ts, businessKey, tools/status.ts, or re-add assistant_turns.wa_message_id. Depends on P0 (tables) + P1 (registry).
4. P3 — Write tools, tiered confirmation & voice: build_quote(canonical)/send_contract/request_invoice/resend_link/mark_paid/cancel + echo-token confirm API + voice batch. Depends on P0 (schema), P1 (registry), P2 (executor/gate/resolver/planner). ALSO must implement exclusivity data-capture inside send_contract (currently unowned, spec DO-NOT-CUT §8.3/§15).
5. P4 — Trust boundary & injection isolation: trust.ts/spotlight.ts/db-sanitize.ts/sender-rate-limit.ts/upload-guard.ts. Renumber its migration off 061 (collides with P0). Add the explicit wiring task: filterToolsForTrust into P2 planner projection + assertExecutableInTier into P2 executor dispatch (integration seam is currently unowned). Depends on P0 + P1; wiring waits on P2/P3.
6. P5 — Memory (short+long): assistant_memory/assistant_facts/entity_alias + memory writer/alias/supersede + correct_memory/forget tools + reconcile cron + dashboard panel. Depends on P0 (tenancy/RLS), P1/P2 (registry + assistant_turns FK). Reuse P2 hebrew-match.ts instead of new alias-match edit-distance.
7. P6 — Proactivity & anti-nag: assistant_events/proactive_messages/assistant_nag_policy + gate/digest/shadow. Depends on P0 (tenancy/provisioning), P2 (ledger/executor Lane-A hook), P5 (assistant_facts for dismissal-learning — NOT P4 as its dep text says). Edits P2 executor + the WhatsApp webhook (integration seams).
8. P7 — Telemetry, testing harnesses & launch gate: cost telemetry, spend cap, planner-fallback, reaper cron, eval suites, KPIs/launch gate. Depends on all prior phases. Fix its import attributions before wiring (see interface_mismatches).

## Phases

### P0 — Foundations & tenancy
- Plan: `docs/superpowers/plans/2026-07-07-bestie-assistant-P0.md` (46810 bytes)
- Depends on: 
  - ⚠️ users.role already holds the 4-tier RBAC value 'agent' (matchAgent checks role==='agent'); the owner|employee distinction is therefore stored in a NEW column users.agency_role, NOT by repurposing users.role. Downstream phases MUST read owner-ness via authorizeOwnership()/caller.agency_role, never by mutating users.role. Confirm this deviation from the literal shared-contract name.
  - ⚠️ Re-enabling RLS on the pre-existing SHARED tables partnerships/invoices/crm_inbound_messages (migration 052 deliberately avoided them) can break any influencer-facing anon/authenticated read path. Policies here permit service_role (always bypasses) + same-agency authenticated users; MUST be applied+verified on a Supabase preview branch and the influencer/widget read paths regression-tested before merge to main.
  - ⚠️ Spec §8.1 lists agency_id but no agencies table; I introduce public.agencies as the grouping anchor (owner_user_id) so owner↔employees resolve. Confirm.
  - ⚠️ integration_credentials stores token columns in P0 for shape; encryption-at-rest via Supabase Vault/KMS wrapper (§8.3) is wired in the integrations phase (P5) — P0 leaves tokens null and RLS-locked. Confirm acceptable.
  - ⚠️ Foreign-client VAT default (§8.6, 0% zero-rated exported services vs 18% domestic) needs an Israeli accountant sign-off; P0 only adds the vat_rate column + keeps computeTotals per-line, default 0.18.
  - ⚠️ Deal-ownership-on-reassignment (§9 open decision) is NOT resolved in P0; partnerships.agency_id backfills to the pricing agent's agency.

### P1 — Tool registry, contract & read tools
- Plan: `docs/superpowers/plans/2026-07-07-bestie-assistant-P1.md` (59266 bytes)
- Depends on: none — P1 is foundational. Read tools scope by the existing partnerships.agent_id/invoices.agent_id columns, so the agency_id/RLS org phase is NOT a prerequisite. The org phase later widens owner reads to union across agency employees and re-enables RLS; P1 introduces no migration (first assistant migration 061 lands in a later phase).
  - ⚠️ Owner cross-team reads: P1 scopes every read to ctx.agent.id only. When agency_id + owner role land (org phase), status/list_pending/sales_summary/whats_new must union across agency employees for role==='owner'. Left as a documented TODO branch returning own-scope for now.
  - ⚠️ whats_new reads recent transitions directly from signature_requests.signed_at / invoices.paid_at / crm_inbound_messages.created_at in P1. When the assistant_events outbox + DB triggers ship (proactivity phase), whats_new should switch its source to assistant_events; the tool contract/params/result stay identical.
  - ⚠️ Read-result pagination caps: P1 hard-limits to 50 rows/query. Confirm whether large agencies need a cursor before the context-builder phase consumes these.
  - ⚠️ Feature-flag gating is folded into ctx.agent.capabilities (enabled feature keys are appended to the capability list, so requiredCapability can name a feature). Confirm this over adding a separate featureFlag field to keep ToolDefinition exactly as the shared contract specifies.

### P2 — Three-pass Planner→Executor core
- Plan: `docs/superpowers/plans/2026-07-07-bestie-assistant-P2.md` (54232 bytes)
- Depends on: P1 — Data model + assistant_actions/assistant_turns core tables + agency_id/users.role columns + RLS scaffolding must land first (executor ledger + orchestrator turn-log write into these tables at runtime)
  - ⚠️ Migration numbering: P2 uses 062_pending_actions.sql assuming P1 takes 061_assistant_core.sql. If P1 does NOT create assistant_actions/assistant_turns (or numbers differently), reconcile before applying — executor.ledger + orchestrator turn-log write into those tables at runtime (unit tests stay green via injected fakes).
  - ⚠️ registry.ts ownership: this plan CREATES src/lib/assistant/registry.ts (ToolDefinition contract + dispatch) in P2 because registry dispatch is the core of the Planner→Executor loop. If P1 also authors registry.ts, treat P2's as canonical and merge P1's tool registrations into tools/index.ts.
  - ⚠️ Two-tier trust boundary (spec §6.1, data-only ingestion → Inbox draft): P2 classifies provenance and routes voice/forwarded content, but the full data-only extraction mode + Inbox-draft table are assumed to be a separate phase. Confirm which phase owns the ingestion-mode tool-filtering so forwarded-brief turns are physically denied write tools.
  - ⚠️ Planner inputs schema is fixed to 5 keys (line_items/amount/text/due_at/target_status) to satisfy OpenAI strict json_schema (no open-ended objects). Confirm this covers every v1 crm.* tool's inputs, or extend the fixed schema when new tools land.
  - ⚠️ Confirmation UX: plan ships both the WhatsApp interactive-button payload (confirm:<id>) and the typed echo-token fallback. The actual button-template component wiring (sendTemplate/interactive message) is a WhatsApp-platform phase concern; P2 only parses the inbound button_reply id.
  - ⚠️ assertAgentOwns currently checks managed_account_ids membership; once agency_id + owner-union context (spec §9) lands in P1, extend ownsEntities to caller.is_owner OR caller.id===deal.agent_id across the agency.

### P3 — Write tools, tiered confirmation & voice
- Plan: `docs/superpowers/plans/2026-07-07-bestie-assistant-P3.md` (59272 bytes)
- Depends on: P1 — schema migrations (assistant_actions/assistant_turns/pending_actions + agency_id/role/vat_rate columns), registry.ts ToolDefinition contract + registry, executor.ts (preconditions+idempotency+ledger), gate.ts (tiers + assertAgentOwns), resolver.ts, context.ts, read-tool catalog, P2 — planner.ts (LLM strict-json planner emitting Action[] with refs+inputs, no money math), memory (entity_alias/assistant_facts feeding planner only)
  - ⚠️ Exact migration number: P3 assumes 064; renumber if P2 consumed 062–064. P3's ALTERs target pending_actions created by P1's 061.
  - ⚠️ Whether P1 installed `zod` (paramsSchema is Zod per §2.2). Task 3 installs it guarded (npm i zod) if absent.
  - ⚠️ Exact ExecutorCtx/ToolDefinition ctx field names from P1 (assumed {agent:{id,managed_account_ids,full_name,is_owner,agency_id},turnId,batchId}); adjust tool ground()/execute() signatures to P1's final shape.
  - ⚠️ Whether build_quote's canonical builder should now replace the private buildQuoteFromBrief in wa-conversation.ts (P3 makes the tool the single source; webhook rewire to the assistant pipeline is P5).
  - ⚠️ Plan-echo batch: modeled as ONE pending_action (kind='batch', summary=composePlanEcho) holding N child actions; confirm executes all, partial-selection ('רק השלישית') re-plans — confirmed acceptable vs N concurrent pending rows.
  - ⚠️ Echo-token uniqueness scope: minted per pending_action from a random 100–999 seed (global-ish); collision probability low but not zero — acceptable for v1 or move to per-agent sequence.

### P4 — Trust boundary & prompt-injection isolation
- Plan: `docs/superpowers/plans/2026-07-07-bestie-assistant-P4.md` (31552 bytes)
- Depends on: P0 — schema/migration tooling baseline (migrations continue from 061; invoices table already exists), P1 — registry.ts ToolDefinition contract with sideEffect field (filterToolsForTrust plugs into the planner projection; assertExecutableInTier into executor dispatch). P4 helpers are structurally decoupled and independently unit-testable, so P4 can be BUILT and TESTED before P1 lands; only the planner/executor WIRING waits on P1/P2/P3.
  - ⚠️ Per-sender rate-limit numeric caps (DEFAULT_SENDER_LIMITS: 30 quotes/hr, 60 actions/hr, 1800 transcription-sec/day, 20 templates/day) are engineering guesses — confirm against real agent throughput + Gemini/Meta cost budgets before launch.
  - ⚠️ assistant_rate_counters uses a read-modify-write upsert (last-writer-wins) — acceptable for v1 single-webhook-worker; if the webhook is ever fanned out, promote to an atomic SQL increment RPC.
  - ⚠️ upload_token_expires_at backfill horizon is 30 days from migration time; confirm the desired live-link validity window with product.
  - ⚠️ Whether the ingestion→trust-tier signal should also gate the FUTURE gmail/calendar/wa_owned send tools (addressesExternalParty) is asserted in tests here but enforced structurally only once those tools ship (P-later).

### P5 — Memory (short + long)
- Plan: `docs/superpowers/plans/2026-07-07-bestie-assistant-P5.md` (76421 bytes)
- Depends on: P1 (identity/tenancy): must land agency_id on users, users.role, and re-enable RLS before this phase's RLS+agency_id columns are meaningful, P2 (Planner/Executor core): must land the ToolDefinition contract + registry (registerTool/registry.get) and the assistant_turns table (source_turn_id FK) before Tasks 10-12,15, P2/P3 (context builder + turn orchestrator): the attachMemoryToContext + post-Executor writeMemory wiring in Task 15 edits files those phases own — sequence Task 15 after they exist, Migration number 065 is provisional: renumber to the next free NNN after P1-P4's migrations at integration to avoid a filename collision (repo already has duplicate 053-059 numbers)
  - ⚠️ Which phase formally creates assistant_turns? This plan assumes P2 owns it and P5 only adds the source_turn_id FK; if P2 defers it, Task 1 must degrade the FK to a plain uuid column until it lands.
  - ⚠️ reinforcements/decay for provenance='inferred' facts (spec §4.4 'need N reinforcements before acted on') — this plan ships the reinforcements column + confidence but not the decay scheduler; confirm whether inferred-fact promotion logic is in P5 scope or folded into P4 proactivity (the 'learn from dismissals' unification).
  - ⚠️ The dashboard panel route path assumes the existing /manage/[token] auth surface + a resolveAgentByManageToken helper; confirm the P1/P2 agent auth entrypoint name so the GET/PATCH/DELETE wire correctly.
  - ⚠️ reconcileFacts currently only diffs deal open/closed state; confirm the full set of CRM-owned predicates memory is allowed to track-and-reconcile (e.g. talent roster membership) so the nightly cron snapshot covers them.
  - ⚠️ entity_alias write path: this phase reads/resolves aliases and forgets them, but alias CREATION (agent says 'קרא לה תותית') — is that a promoteFacts kind:'alias' -> entity_alias insert in writeMemory, or a dedicated add_alias tool? Plan routes kind:'alias' facts through promoteFacts; confirm they should also materialize an entity_alias row, not just an assistant_facts row.

### P6 — Proactivity engine & anti-nag
- Plan: `docs/superpowers/plans/2026-07-07-bestie-assistant-P6.md` (64937 bytes)
- Depends on: P1 — org & identity: agency_id on users/accounts/partnerships, users.role('owner'|'employee'), phone→agent provisioning (nag_policy row seeded at onboarding with opt-in/consent), P2 — registry/planner/resolver/gate/executor + assistant_actions ledger + assistant_turns (Lane-A hook fires from executor; proactive send logs to assistant_actions), P4 — memory: assistant_facts table (dismissal-learning stored as inferred preference; unified store per §4.4 not a parallel one)
  - ⚠️ Migration numbers 069/070/071 assume P1–P5 consumed 061–068. If any earlier phase claims these, rebase P6's three migrations to the next free numbers (they are self-contained: nag_policy has no cross-deps; events/proactive_messages depend only on existing signature_requests/invoices/contracts + assistant_actions/assistant_facts from P2/P4).
  - ⚠️ Shabbat window is a conservative FIXED Fri-16:00→Sat-20:30 (deterministic for scheduler invariants). Confirm whether v1 should instead call a zmanim source (the `shabbat-times` skill) for real candle-lighting/havdalah, or keep the fixed window until post-launch.
  - ⚠️ Severity-floor vs Shabbat conflict: current gate DEFERS even critical time-critical alerts (expiring sign link) out of the Shabbat/quiet zone to honor the hard '0 sends in Shabbat' KPI. Confirm this is the desired trade-off, or allow a narrow critical-only exception.
  - ⚠️ `interruptionsToday` counts sent event_notify+reminder from proactive_messages for the LOCAL Jerusalem day — confirm the day boundary (local midnight vs digest-to-digest window) matches the anti-nag SLO definition.
  - ⚠️ Lane-A `midNegotiation` (active-typing / do-not-interrupt) signal source is assumed available from P2's turn state; confirm the exact field the Executor passes so the hook wiring is concrete.
  - ⚠️ Dismissal-learning stores inferred facts in assistant_facts (P4). Confirm P4 exposes an upsert honoring provenance='inferred' + one-active-row-per-(agent,predicate,subject) so the count supersedes cleanly rather than appends.

### P7 — Telemetry, testing harnesses & launch gate
- Plan: `docs/superpowers/plans/2026-07-07-bestie-assistant-P7.md` (78126 bytes)
- Depends on: P1 (assistant core tables + migration 061: assistant_turns, assistant_actions, pending_actions, assistant_events, proactive_messages, assistant_nag_policy), P2 (context builder: filterOwnedRows, serializeContextIndex), P3 (planner strict-json + PlannerOutput schema + voice engine), P4 (gate matchEchoToken, executor businessKey + idempotency + UNIQUE index), P5 (proactivity scheduler: quiet hours, Shabbat, daily cap, dedup), P6 (two-tier data-only trust boundary for the adversarial-injection e2e)
  - ⚠️ Exact export names/signatures from earlier phases must be confirmed: P4 matchEchoToken(text, expectedToken) and businessKey(input); P5 isQuietHour/isShabbat/withinDailyCap; P2 filterOwnedRows/serializeContextIndex. If any differ, adjust the imports in Tasks 12/13/14/15 (declared as consumes — these are the integration seams).
  - ⚠️ Migration number 068 assumes P1–P6 consume 061–067. If phases consume more/fewer numbers, renumber P7's migration to the next free slot (it only adds columns + a table, so it is order-independent among the assistant migrations).
  - ⚠️ The turn orchestrator file path (Task 17) is assumed to be src/lib/assistant/turn.ts. Confirm the actual §1.1 pipeline entry point from P3/P4 and wire the three hooks (spend-cap at entry, planner-fallback around plan(), telemetry at the Executor chokepoint) there.
  - ⚠️ MODEL_PRICING USD/1M-token values are placeholders keyed to gpt-5 family; confirm live pricing for gpt-5.4/gpt-5.2/gpt-5-nano and update the map (the mechanism is unaffected).
  - ⚠️ AGENT_DAILY_CAP_USD default ($2/agent/day) and REAPER thresholds (30s stuck / 300s dead) are proposed defaults — confirm against cost telemetry once it accrues.
  - ⚠️ enqueueDeferred (queue-and-defer store) — decide whether deferred substantive turns re-drive via the reaper/worker or a dedicated queue; spec §11 only mandates it be a durable, non-silent row.

## Dependency issues to reconcile before building
- SYSTEMIC OFF-BY-ONE: a P0 was inserted but intra-plan cross-references still use the pre-insertion numbering. P2/P5/P6 call the data-model dependency 'P1' when the tables (assistant_actions, assistant_turns, agency_id, RLS) are actually produced by P0. Build order must be derived from actual `produces`, not the stated phase labels, which are unreliable.
- Migration 061 is contradictorily owned: P0 creates the core tables (assistant_actions/assistant_turns) but does not state a number; P1 explicitly disclaims any migration and says '061 lands in a later phase'; P2 consumes '061' as P1's; P4 PRODUCES 061_assistant_trust.sql; P7 believes 061 contains assistant_turns+actions+pending_actions+events+proactive_messages+nag_policy. Assign P0's core migration = 061 and renumber P4's trust migration to a free slot.
- pending_actions creator vs consumers disagree: P2 creates it in 062; P3's ALTER (064) and P7's dependency both assume it was created in 'P1's 061'. Either move pending_actions into P0's core migration (recommended, matches spec §8.2) or fix P3/P7 to target 062.
- P6 lists its memory dependency as 'P4 — memory: assistant_facts', but memory (assistant_facts) is produced by P5; P4 is the trust boundary. P6's dismissal-learning write path points at the wrong phase.
- P7's dependency attributions are scrambled: it credits gate.matchEchoToken/executor.businessKey to P4 (actually P2/P3), the proactivity scheduler to P5 (actually P6), and the two-tier trust boundary to P6 (actually P4). The dependency SET (telemetry after everything) is sound but the labels will misdirect the integrator.
- P2's stated single dependency 'P1' omits its real dependency on P0 (it reads/writes assistant_actions/assistant_turns and agency_id/RLS at runtime, all from P0).
- P4 requires a wiring step into P2 (planner projection + executor dispatch) and P6 requires wiring into P2's executor (Lane-A hook) and the WhatsApp webhook, but no phase's task list claims ownership of editing those P2 files — the integration seams are unassigned.

## Interface mismatches
- registry.ts API names diverge: P1 exports register/get/list + getRegistry() singleton; P2 exports register/getTool/listTools + createRegistry() factory; P3 imports register/get/**all()**; P5 imports **registerTool()**/get. No phase produces all() or registerTool(). Pick one canonical API (P1's) and fix P2/P3/P5 imports.
- Two different types both named `AssistantContext`: P1 registry.ts defines AssistantContext = tool-exec ctx {agent,db,now}; P2 context.ts defines AssistantContext = the context bundle from buildContext(). Same identifier, different meaning — will collide on import. Additionally the tool-exec ctx is called AssistantContext (P1) vs ToolExecuteCtx (P2) vs ExecutorCtx (P3): three names for one concept.
- Executor entry point: P2 exports executePlan(); P3 and P7 both import executeAction(). Name mismatch (and P3/P7 attribute it to P1/P4 respectively, actual owner P2).
- Planner entry point: P2 exports runPlanner(); P3 imports plan(message,context) (2-arg); P7 imports plan(message,context,memory) (3-arg). Function name and arity both inconsistent — reconcile the memory parameter.
- Resolver: P2 exports resolveRef/resolveActionRefs; P3 imports resolveRefs(action,ctx). Name mismatch.
- matchEchoToken location: produced in P3 confirm.ts, but P7 imports it from gate.ts (attributed P4). Fix the import path/owner.
- assertAgentOwns location: produced in P0 authz.ts (signature assertAgentOwns(caller,{accountId?,dealId?,briefId?})); P3 imports it from gate.ts attributed 'P1'. Wrong file and wrong phase.
- gate.ts owner: produced by P2 (gateAction); P3 attributes it to P1.
- Proactivity helpers: P6 exports isQuietHours (plural) / isShabbat(nowMs,p) / gateProactiveSend / proactiveDedupKey+eventDedupKey; P7 imports isQuietHour (singular) / isShabbat(at,tz) / withinDailyCap / dedupKey. Function names, signatures (nowMs vs at/tz), and the cap/dedup helpers all mismatch.
- context.ts: P7 imports filterOwnedRows(rows,caller) and serializeContextIndex(rows,caller), but P2 (owner of context.ts) produces only buildContext/renderContextDigest — those two functions are never produced anywhere.
- assistant_actions column set: P2's consumed column list and spec §8.2 diverge — spec requires employee_id, latency_ms, cost, superseded_by, confirmed_at; P2's list omits them and P0's terse `produces` doesn't enumerate columns. P7 explicitly needs latency_ms+cost on assistant_actions. Confirm P0's DDL includes the full §8.2 column set.
- businessKey signature: P0 idempotency.ts exports businessKey(input:BusinessKeyInput); P2 executor.ts also exports a businessKey(); P7 imports businessKey(input) from executor. Two definitions, one must be canonical (P0).

## Duplication to collapse
- registry.ts authored twice: P1 (full ToolDefinition contract + Registry class + dispatch + projectForPlanner) and P2 (ToolDefinition + createRegistry + projectForPlanner). P2 open_question already concedes this. P1 must be canonical; P2 imports and only registers tools via tools/index.ts.
- ledger.ts authored twice with different APIs: P0 (actionRowFromClaim/claimTurn/recordTurn/claimBusinessKey/recordExecution) and P2 (Ledger interface + claim business_key/writeResult/createPending/cancelPending). Collapse to P0's; P2 consumes.
- businessKey() defined twice: P0 idempotency.ts and P2 executor.ts.
- assistant_turns.wa_message_id UNIQUE added twice: P0 produces assistant_turns 'with UNIQUE(wa_message_id)'; P2 migration 062 'adds assistant_turns.wa_message_id unique dedup'. P2's ALTER will fail if P0 already added it — remove from P2.
- tools/status.ts created by both P1 (statusTool+formatDealLine+StatusResult) and P2 (reference tools/status.ts).
- tools/build_quote.ts created by both P2 (reference impl) and P3 (canonical buildQuoteTool). P3 says it is the single source — P2 must not ship a competing version.
- confirm.ts authored by both P2 (matchConfirmation/hasOpenDestructive) and P3 (computeParamsHash/mintEchoToken/matchEchoToken/createPendingAction/resolvePendingConfirmation...). Ensure P3 extends rather than overwrites P2's collision-rule functions.
- Hebrew normalization + edit-distance duplicated: P2 hebrew-match.ts (normalizeHe/levenshtein/similarity) vs P5 alias-match.ts (normalizeHebrew/phoneticKey/editDistance). Spec §3.2 wants one shared disambiguation util — P5 should reuse P2's.
- percentile() implemented in both P6 proactivity.ts and P7 kpi.ts.
- ToolExecuteCtx/ToolResult/ErrorCategory types defined in both P1 and P2 registry.ts.
- tools/index.ts is written by P1, P2, and P3 — must be incremental edits (append registrations), not three overwrites.

## Gaps (unowned work)
- assistant_reminders table (spec §8.2) is created by NO phase. Its UNIQUE partial index on (agent_id,entity_id,kind) WHERE status='pending' is the mechanism that collapses an auto follow-up + a manual reminder to prevent double-nag — a load-bearing anti-nag guarantee with no home.
- v1 tool-catalog tools with no producing phase (spec §2.3): add_note, set_reminder, snooze, follow_up, add_talent, add_client, add_contact, create_campaign, set_commission, reassign_talent. Read tools (P1) and the money tools (P3) + correct_memory/forget (P5) are covered, but these ten §2.3 tools are unimplemented. set_commission and reassign_talent are also explicit owner-only operations in §9.
- Exclusivity DATA capture at contract-sign time (§8.3, §15 'DO NOT CUT'): P0 creates the exclusivity TABLE but no phase writes to it during send_contract or signing. Data is unrecoverable if not captured at sign time — assign to P3's send_contract.
- Step-up auth for the crown jewels (§6.10, Appendix #12): gate owner cross-team financial views + set_commission + cancel/mark_paid behind a second factor (PIN / periodic re-auth). No phase implements it; phone number remains the sole auth boundary.
- talent_rate_cards has no consumer: P0 creates the versioned table (§4.3) but no phase reads it for the pricing-suggestion / grounding-validation path the spec calls out ('the grounding guardrail can validate').
- gender/address_style captured on users (P0, §8.1) but no phase's reply composition (P2 composeActionReply, P3 voice composers) consumes it for Hebrew verb/adjective agreement — captured data with no reader. Also spec asks for it on talent/client records, not just users.
- Owner cross-team union reads (§9): P1 read tools scope to ctx.agent.id only and defer owner-union to a 'documented TODO branch'. No later phase implements widening status/list_pending/sales_summary/whats_new to union across agency employees for role='owner'.
- filterOwnedRows/serializeContextIndex (multi-tenant context serialization, §12/§14 context-builder snapshot) are consumed by P7 but produced by no phase.
- Jewish-holiday relative snooze parsing ('אחרי סוכות','אחרי החג', §5.4) is not implemented in P6 (P6 covers Shabbat + fixed quiet hours only).
- Meta error-code routing (§7.4: 131047→template, 131026→mark unreachable+stop retries, 132000/132001/132012→alert ops never blind-retry) is only partially covered by P6's service-window gate; the full routing table has no owner.
- Delivery-confirmation gate (§7.4: never claim 'שלחתי ✓' on the synchronous 202 — wait for the delivered webhook): P6 consumes status webhooks but no phase wires 'delivered-before-claiming-sent' into reply composition.
- Retention & compliance (§8.5, Israeli Privacy Law): agency-level offboarding data export + deletion and per-table retention windows have no phase. P5's forget covers single-subject hard delete only, not agency-level export/deletion.

## Placeholder flags
- P4's entire plan body is a literal placeholder: plan_md_head = '_plan_md_placeholder_'. The trust-boundary phase has no task breakdown provided — cannot verify internal completeness or TDD structure; must be written before build.
- Migration numbers are pervasively provisional/TBD: P3 '064 assumed', P5 '065 provisional — renumber to next free NNN', P6 '069/070/071 assume P1–P5 consumed 061–068', P7 '068 assumes P1–P6 consume 061–067'. Combined with the 061 collision, every assistant migration number needs a single reconciled numbering pass before any apply.
- P1 open_question ships an explicit unfinished branch: owner cross-team reads 'Left as a documented TODO branch returning own-scope for now.'
- P7 placeholder constants: MODEL_PRICING USD/1M values are 'placeholders keyed to gpt-5 family'; AGENT_DAILY_CAP_USD ($2/day) and REAPER thresholds (30s/300s) are 'proposed defaults' pending telemetry.
- P4 DEFAULT_SENDER_LIMITS (30 quotes/hr, 60 actions/hr, 1800 transcription-sec/day, 20 templates/day) are 'engineering guesses — confirm before launch.'
- P6 Shabbat window is a 'conservative FIXED Fri-16:00→Sat-20:30' placeholder pending a zmanim source; also upload_token_expires_at backfill horizon is a placeholder '30 days'.
- P3 open_question leaves tool ctx signatures unresolved: 'adjust tool ground()/execute() signatures to P1's final shape' and 'assumed {agent:{...},turnId,batchId}' — ExecutorCtx/ToolDefinition ctx field names are TBD until P1/P2 finalize.
- Multiple phases guard the zod dependency conditionally ('install if absent') — P1, P2, P3 each independently 'add zod'; should be resolved once in P1.
- Several open decisions the spec itself defers into the plans without resolution: foreign-client VAT rate (P0 defaults 0.18 pending accountant sign-off), deal-ownership-on-reassignment (P0 'NOT resolved'), integration_credentials encryption-at-rest ('P0 leaves tokens null', deferred to P5-integrations phase which is not among the 8 phases).

## Full review
- `docs/superpowers/plans/2026-07-07-bestie-assistant-REVIEW.md` (raw JSON)