# Widget Demo Link on Demo-Scan Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a demo-account scan pipeline completes, the team WhatsApp notification carries TWO URL buttons — chat demo (`/chat/<slug>`) and widget demo (`/demo/<accountId>`) — via a new `demo_ready_v2` template with automatic fallback to `demo_ready_v1` until Meta approves v2.

**Architecture:** Extend the generic `runTemplate` runner in `src/lib/whatsapp-notify.ts` to support multiple URL buttons, teach `sendDemoReady` to send `demo_ready_v2` (falling back to v1 on any send failure), and pass `accountId` through from `notifyScanComplete`. A one-off script submits the v2 template to Meta.

**Tech Stack:** Next.js 16 / TypeScript, WhatsApp Cloud API (Graph v21.0), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-12-widget-demo-link-on-scan-design.md`

## Global Constraints

- `account_ready_v1` (real/full scans) is UNCHANGED.
- No new DB entities; the widget already works per-account.
- All sends are fire-and-forget: never throw out of `whatsapp-notify.ts`.
- WhatsApp template params must pass `sanitizeParam` (Meta error 132018 guard) — already handled inside `runTemplate`.
- Commit straight to `main` and push (user's standing preference); stage only the files each task touches.
- `strict: false` + build errors ignored ⇒ ALWAYS run `npm run type-check` before committing.
- Env flags: master `WHATSAPP_NOTIFY_ENABLED=true`; per-template flag name stays `DEMO_READY` for both v1 and v2 (one switch governs the demo notification, whichever template version fires).

---

### Task 1: Multi-button `runTemplate` + `sendDemoReady` v2-with-fallback

**Files:**
- Modify: `src/lib/whatsapp-notify.ts` (runTemplate ~line 118, sendDemoReady ~line 474)
- Test: `tests/unit/whatsapp-notify-demo-ready.test.ts` (create)

**Interfaces:**
- Consumes: `sendTemplate` from `@/lib/whatsapp-cloud/client` (mocked in tests).
- Produces: `sendDemoReady(p: { to: string; brandName: string; accountUsername: string; accountId?: string }): Promise<WhatsAppSendResult>` — Task 2 calls it with `accountId`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/whatsapp-notify-demo-ready.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the WA client before importing the module under test.
const sendTemplateMock = vi.fn();
vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendTemplate: (...args: any[]) => sendTemplateMock(...args),
  toWaId: (s: string) => s,
}));
// persistOutbound uses supabase — stub it out entirely.
vi.mock('@/lib/supabase', () => ({
  createClient: () => { throw new Error('no supabase in unit test'); },
}));

async function loadModule() {
  vi.resetModules();
  process.env.WHATSAPP_NOTIFY_ENABLED = 'true';
  delete process.env.WHATSAPP_TEMPLATE_DEMO_READY;
  return import('@/lib/whatsapp-notify');
}

beforeEach(() => sendTemplateMock.mockReset());

describe('sendDemoReady with accountId (demo_ready_v2)', () => {
  it('sends demo_ready_v2 with two URL button components (index 0 = slug, index 1 = accountId)', async () => {
    sendTemplateMock.mockResolvedValue({ success: true });
    const { sendDemoReady } = await loadModule();

    const res = await sendDemoReady({
      to: '972500000000',
      brandName: 'מאוחדת',
      accountUsername: 'meuhedet',
      accountId: '4214549f-813b-406b-8b71-6550268235bb',
    });

    expect(res.success).toBe(true);
    expect(sendTemplateMock).toHaveBeenCalledTimes(1);
    const call = sendTemplateMock.mock.calls[0][0];
    expect(call.templateName).toBe('demo_ready_v2');
    const buttons = call.components.filter((c: any) => c.type === 'button');
    expect(buttons).toEqual([
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'meuhedet' }] },
      { type: 'button', sub_type: 'url', index: 1, parameters: [{ type: 'text', text: '4214549f-813b-406b-8b71-6550268235bb' }] },
    ]);
  });

  it('falls back to demo_ready_v1 (chat button only) when the v2 send fails', async () => {
    sendTemplateMock
      .mockResolvedValueOnce({ success: false, error: { code: 132001, message: 'template not found' } })
      .mockResolvedValueOnce({ success: true });
    const { sendDemoReady } = await loadModule();

    const res = await sendDemoReady({
      to: '972500000000',
      brandName: 'מאוחדת',
      accountUsername: 'meuhedet',
      accountId: '4214549f-813b-406b-8b71-6550268235bb',
    });

    expect(res.success).toBe(true);
    expect(sendTemplateMock).toHaveBeenCalledTimes(2);
    expect(sendTemplateMock.mock.calls[0][0].templateName).toBe('demo_ready_v2');
    const fb = sendTemplateMock.mock.calls[1][0];
    expect(fb.templateName).toBe('demo_ready_v1');
    const fbButtons = fb.components.filter((c: any) => c.type === 'button');
    expect(fbButtons).toEqual([
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'meuhedet' }] },
    ]);
  });

  it('without accountId sends demo_ready_v1 exactly as before (backward compat)', async () => {
    sendTemplateMock.mockResolvedValue({ success: true });
    const { sendDemoReady } = await loadModule();

    await sendDemoReady({ to: '972500000000', brandName: 'נייק', accountUsername: 'nike_il' });

    expect(sendTemplateMock).toHaveBeenCalledTimes(1);
    expect(sendTemplateMock.mock.calls[0][0].templateName).toBe('demo_ready_v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/whatsapp-notify-demo-ready.test.ts`
Expected: FAIL — first test sends `demo_ready_v1` instead of `demo_ready_v2` (accountId is not yet a parameter).

- [ ] **Step 3: Implement**

In `src/lib/whatsapp-notify.ts`:

3a. Extend `runTemplate` args with `urlButtonParams?: string[]` and replace the single-button block:

```typescript
async function runTemplate(args: {
  templateName: string;
  flagName: string;
  to: string;
  headerParams?: string[];
  bodyParams?: string[];
  urlButtonParam?: string;    // single URL button with `{{1}}` in URL
  urlButtonParams?: string[]; // multiple URL buttons — element i → button index i
}): Promise<WhatsAppSendResult> {
```

and where the button component is pushed:

```typescript
  const urlParams =
    args.urlButtonParams ?? (args.urlButtonParam != null ? [args.urlButtonParam] : []);
  urlParams.forEach((text, index) => {
    components.push({
      type: 'button',
      sub_type: 'url',
      index,
      parameters: [{ type: 'text', text }],
    });
  });
```

(Delete the old `if (args.urlButtonParam != null) { ... }` block — the new code covers it.)

3b. Replace `sendDemoReady` (keep the doc-comment style of neighbors):

```typescript
// =====================================================================
// 7) demo_ready_v2 / demo_ready_v1 — demo scan finished (team notification)
//    v2: body {{1}} = brand, url button 0 {{1}} = username slug (/chat/),
//        url button 1 {{1}} = accountId (/demo/ widget demo page)
//    v1 (fallback while v2 is PENDING, or when accountId is unknown):
//        single chat button only.
//    Trigger: pipeline completion (notifyScanComplete)
// =====================================================================
export async function sendDemoReady(p: {
  to: string;
  brandName: string;
  accountUsername: string;
  accountId?: string;
}): Promise<WhatsAppSendResult> {
  if (p.accountId) {
    const v2 = await runTemplate({
      templateName: 'demo_ready_v2',
      flagName: 'DEMO_READY',
      to: p.to,
      bodyParams: [p.brandName],
      urlButtonParams: [p.accountUsername, p.accountId],
    });
    if (v2.success) return v2;
    // v2 PENDING/rejected/missing — fall back to the approved v1 (chat link only).
  }
  return runTemplate({
    templateName: 'demo_ready_v1',
    flagName: 'DEMO_READY',
    to: p.to,
    bodyParams: [p.brandName],
    urlButtonParam: p.accountUsername,
  });
}
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx vitest run tests/unit/whatsapp-notify-demo-ready.test.ts` → Expected: 3 PASS
Run: `npm run type-check` → Expected: no NEW errors in `src/lib/whatsapp-notify.ts` (pre-existing errors elsewhere are known).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp-notify.ts tests/unit/whatsapp-notify-demo-ready.test.ts
git commit -m "feat(notify): demo_ready_v2 with chat + widget-demo buttons, v1 fallback"
```

---

### Task 2: Pipeline passes `accountId` into the demo notification

**Files:**
- Modify: `src/lib/pipeline/notify.ts` (pickTeamSend ~line 11, team-send call ~line 45)

**Interfaces:**
- Consumes: `sendDemoReady` with optional `accountId` (Task 1).
- Produces: no new exports; `notifyScanComplete` behavior change only.

- [ ] **Step 1: Widen `pickTeamSend` and pass accountId**

In `src/lib/pipeline/notify.ts`, change `pickTeamSend`'s return type to accept the optional `accountId` (a function taking fewer props is assignable to one taking more):

```typescript
/** Pick the team template wrapper by demo/real. Demo sends also carry accountId → widget-demo button. */
export function pickTeamSend(isDemo: boolean): (p: { to: string; brandName: string; accountUsername: string; accountId?: string }) => Promise<WhatsAppSendResult> {
  return isDemo ? sendDemoReady : sendAccountReady;
}
```

And in `notifyScanComplete`, at the team-notification call (`// 1) Team notification.`), add the accountId:

```typescript
    const send = pickTeamSend(isDemo);
    await Promise.allSettled(
      parseRecipients(process.env.SCAN_NOTIFY_RECIPIENTS).map((to) =>
        send({ to, brandName: brand, accountUsername: slug, accountId: job.account_id! }),
      ),
    );
```

(`job.account_id` is guaranteed non-null here — the function returns early on `if (!job.account_id) return;` above. `sendAccountReady` simply ignores the extra property.)

- [ ] **Step 2: Type-check + full unit suite**

Run: `npm run type-check` → Expected: no new errors in `src/lib/pipeline/notify.ts`.
Run: `npx vitest run tests/unit/scan-notify-helpers.test.ts tests/unit/whatsapp-notify-demo-ready.test.ts` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pipeline/notify.ts
git commit -m "feat(pipeline): send widget demo link (accountId) in demo scan-complete notify"
```

---

### Task 3: Template-creation script + manual send script update

**Files:**
- Create: `scripts/create-wa-template-demo-ready-v2.ts` (modeled on `scripts/create-scan-complete-templates.ts`)
- Modify: `scripts/send-wa-demo-ready.ts` (accept optional accountId, exercise the lib fallback path)

**Interfaces:**
- Consumes: Meta Graph API `POST /{WABA_ID}/message_templates`; env `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_GRAPH_VERSION` (default v21.0).
- Produces: `demo_ready_v2` template submitted (PENDING) in the WABA.

- [ ] **Step 1: Write the creation script**

Create `scripts/create-wa-template-demo-ready-v2.ts`:

```typescript
/**
 * Create the demo_ready_v2 WhatsApp template — demo scan finished, TWO buttons:
 *   button 0: "פתח דמו צ'אט"    → https://bestie.ldrsgroup.com/chat/{{1}}  ({{1}} = username slug)
 *   button 1: "דמו הווידג'ט"    → https://bestie.ldrsgroup.com/demo/{{1}}  ({{1}} = accountId)
 * Body {{1}} = brand name (same as v1).
 *
 * Category MARKETING — Meta auto-classified demo_ready_v1 as MARKETING for the
 * same copy ("אפשר לשלוח ללקוח"), so v2 must match or the submit gets recategorized.
 *
 * Submits as PENDING; sendDemoReady falls back to demo_ready_v1 until approval,
 * so this can run before/after the code deploy in any order.
 *
 * Run: npx tsx scripts/create-wa-template-demo-ready-v2.ts
 * Idempotent: "already exists" from Meta is treated as success-skip.
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local', override: true });

const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const GRAPH = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

if (!WABA_ID || !TOKEN) {
  console.error('Missing WHATSAPP_BUSINESS_ACCOUNT_ID or WHATSAPP_ACCESS_TOKEN');
  process.exit(1);
}

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://bestie.ldrsgroup.com').replace(/\/$/, '');

const payload = {
  name: 'demo_ready_v2',
  language: 'he',
  category: 'MARKETING',
  components: [
    {
      type: 'BODY',
      text: 'הדמו של {{1}} מוכן! 🎉 הסריקה הושלמה — צ׳אט ווידג׳ט מחכים לכם.',
      example: { body_text: [['קרולינה למקה']] },
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'פתח דמו צ׳אט',
          url: `${BASE}/chat/{{1}}`,
          example: ['carolina_lemke'],
        },
        {
          type: 'URL',
          text: 'דמו הווידג׳ט',
          url: `${BASE}/demo/{{1}}`,
          example: ['4214549f-813b-406b-8b71-6550268235bb'],
        },
      ],
    },
  ],
};

async function main() {
  const url = `https://graph.facebook.com/${GRAPH}/${WABA_ID}/message_templates`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(payload),
  });
  const json: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = json?.error?.code;
    const msg = json?.error?.message || res.statusText;
    const detail =
      json?.error?.error_user_msg ||
      json?.error?.error_user_title ||
      json?.error?.error_data?.details ||
      JSON.stringify(json?.error || json).slice(0, 300);
    if (code === 100 && (/already exists/i.test(msg) || /יש תוכן/i.test(detail) || /already has content/i.test(detail))) {
      console.log('· demo_ready_v2: already exists, skipped');
      return;
    }
    console.error(`✗ demo_ready_v2: ${msg}\n    ↳ ${detail}`);
    process.exit(2);
  }
  console.log(`✓ demo_ready_v2: submitted (id=${json.id || '?'} status=${json.status || 'PENDING'})`);
}

main().catch((err) => { console.error('✗ threw:', err); process.exit(3); });
```

- [ ] **Step 2: Update the manual send script**

Rewrite `scripts/send-wa-demo-ready.ts` to go through the lib (so it exercises the exact v2→v1 fallback the pipeline uses):

```typescript
/**
 * One-off: send the demo-ready WhatsApp notification to a number.
 * Goes through sendDemoReady (lib) — with accountId it tries demo_ready_v2
 * (chat + widget-demo buttons) and falls back to demo_ready_v1 automatically.
 *
 * Requires WHATSAPP_NOTIFY_ENABLED=true in env (lib master flag).
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/send-wa-demo-ready.ts <to> <brandName> <username> [accountId]
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function main() {
  const [to, brandName, username, accountId] = process.argv.slice(2);
  if (!to || !brandName || !username) {
    console.error('Usage: send-wa-demo-ready.ts <to> <brandName> <username> [accountId]');
    process.exit(1);
  }
  const { sendDemoReady } = await import('../src/lib/whatsapp-notify');
  const res = await sendDemoReady({ to, brandName, accountUsername: username, accountId });
  console.log('RESULT:', JSON.stringify(res));
  if (!res.success) process.exit(1);
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
```

- [ ] **Step 3: Submit the template to Meta**

Run: `npx tsx scripts/create-wa-template-demo-ready-v2.ts`
Expected: `✓ demo_ready_v2: submitted (... status=PENDING)` (or `already exists, skipped` on re-run).
If env creds are missing locally, note it in the report — the script is ready to run wherever `.env.local` has the WABA creds.

- [ ] **Step 4: Commit**

```bash
git add scripts/create-wa-template-demo-ready-v2.ts scripts/send-wa-demo-ready.ts
git commit -m "feat(scripts): demo_ready_v2 template submit + manual demo-ready sender via lib"
```

---

### Task 4: Verify, push, live check

- [ ] **Step 1: Full unit suite + type-check**

Run: `npm run test` → Expected: no new failures (suite has known pre-existing state; compare against `main` before the change if unsure).
Run: `npm run type-check` → Expected: no new errors.

- [ ] **Step 2: Push to main**

```bash
git push origin main
```

(Auto-deploy from push is working — Meuhedet memory note.)

- [ ] **Step 3: Live verification (post-deploy, post-approval)**

1. Check template status: Meta Business Manager → WhatsApp templates → `demo_ready_v2` (PENDING → APPROVED, usually hours for this WABA).
2. While PENDING: `npx tsx --tsconfig tsconfig.json scripts/send-wa-demo-ready.ts <your-number> "בדיקה" meuhedet 4214549f-813b-406b-8b71-6550268235bb` → message arrives via v1 fallback (chat button only), RESULT success:true.
3. After APPROVED: same command → message arrives with TWO buttons; tapping "דמו הווידג'ט" opens `https://bestie.ldrsgroup.com/demo/4214549f-813b-406b-8b71-6550268235bb` with the widget bubble live.
4. Optional end-to-end: run a small demo quote-scan from `/admin` and confirm the completion WhatsApp carries both buttons.
