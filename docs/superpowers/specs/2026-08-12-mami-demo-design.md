# Mami Meeting Demo — "בסטי דואגת שכולם עושים את העבודה"

**Date:** 2026-08-12 (meeting is 2026-08-13)
**Status:** Approved design, build today.
**Related:** `memory/project_mami_advocacy_cs.md` (the real product idea — NOT built here).

## What this is

A **scripted, self-contained interactive HTML demo** for tomorrow's meeting with Mami
(מאמי — consumption club / coupon aggregator). It shows the two scenarios Mami asked for:

1. **Bestie as integrator** — customer ↔ Bestie ↔ supplier, full loop, zero human work.
2. **Bestie goes to war** — supplier stalls / gives a sub-par answer → Bestie insists per
   Mami's rules, escalates to Mami CS with a full story summary, then nags the CS rep
   until the case is actually closed.

**What this is NOT:** no AI, no backend, no real WhatsApp. Every message is pre-scripted.
It is a sales demo. The real system gets its own brainstorm/spec later
(see project_mami_advocacy_cs).

## Deliverable

- One self-contained HTML file: `docs/demos/mami-demo.html` (Hebrew, RTL, inline CSS/JS,
  no external requests — works offline in the meeting).
- Also published as a private Artifact (cloud backup / shareable link).

## The stage

Three WhatsApp-authentic phone mockups side by side (RTL order):

| Phone | Conversation |
|---|---|
| לקוחה — שירה | Shira (Mami club member) ↔ "מאמי · Bestie" |
| ספק | External supplier business ↔ Bestie |
| שירות לקוחות מאמי | Human CS rep ↔ Bestie (internal channel) |

Chrome around the phones:

- **Scenario switcher**: תסריט 1 / תסריט 2.
- **Simulated clock chip** that fast-forwards between beats ("+3 שעות") so SLA breaches
  are felt without waiting.
- **Case status chip**: פתוחה → ממתינה לספק → תזכורת → אסקלציה → נסגרה.
- **"כללי מאמי" card** (always visible): supplier must respond within 4h; answer bar =
  full solution for the customer; escalate after 2 reminders; churn-intent → immediate
  escalation. Shows Mami this is a rules engine they configure, not magic.
- **Narration strip** (bottom): one line per beat explaining what Bestie is doing and why
  ("עברו 4 שעות בלי מענה — לפי כללי מאמי, תזכורת שנייה בטון מחמיר").

**Controls:** הבא / הקודם advance one beat; autoplay toggle (~4s per beat); restart.
On each beat the receiving phone lights up, the others dim, the new message animates in
(typing indicator → bubble).

## Escalation treatment (three layers — "הכל, אסקלציה איכותית")

1. **SLA escalation** — the scenario-2 spine: supplier misses the 4h bar → reminder 1 →
   reminder 2 (harsher tone) → sub-par offer judged against Mami's bar → escalate.
2. **Designed escalation card** — the escalation arrives in the CS phone as a distinct
   ticket-like card, not a chat bubble: case #, customer + voucher details, timeline of
   the whole exchange, what the supplier offered, which Mami rule it fails, and what the
   rep must do. This is the "summary of the story" Mami asked for.
3. **Customer-side escalation** — mid-scenario-2 Shira writes "זהו, אני עוזבת את
   המועדון!". Bestie detects churn intent → bumps priority immediately (doesn't wait for
   timers), reassures Shira, and flags it on the escalation card.

## Scenario scripts

### תסריט 1 — האינטגרטור (happy path, ~12 beats)

Shira bought a couples-spa voucher (₪249) via Mami. The spa refuses to book her
("אין תוקף במערכת"). She messages Bestie on Mami's WhatsApp. Bestie pulls up the voucher
(order details in-chat), messages the supplier with a tidy case (voucher #, purchase
date, Mami terms). Supplier replies within the hour with a fix (voucher re-activated +
alternative slot). Bestie relays to Shira, confirms she's happy, closes the case.
CS phone shows only a quiet log line: "נפתר אוטומטית — ללא מעורבות נציג".
**Message: zero human work when the supplier cooperates.**

### תסריט 2 — בסטי יוצאת למלחמה (~18 beats)

A restaurant refuses to honor Shira's voucher ("פג תוקף" — but per Mami it's valid).
Bestie contacts the supplier, quoting Mami's agreement terms. Supplier deflects
("שתפנה למאמי"). Clock jumps; 4h SLA breached → reminder 1. Clock jumps → reminder 2,
harsher, citing consequences per the Mami agreement. Meanwhile Shira vents churn intent →
customer-side escalation bump. Supplier finally offers a partial fix (50% honor). Bestie
judges it against Mami's bar → **fails** → escalation card lands in the CS phone with the
full story summary. Then the third act: the rep is slow, Bestie nags — "הפנייה פתוחה
כבר 24 שעות, הלקוחה ממתינה" — until the rep resolves (full honor + goodwill dessert).
Bestie closes the loop with Shira and marks the case closed.
**Message: Bestie enforces the rules on everyone — suppliers AND reps.**

## Implementation shape

Single HTML file, no build step:

- `SCENARIOS` — a JS array of beat objects:
  `{phone, from, text, type (bubble|system|escalation-card|log), clockJump?, status?, narration?, highlight?}`.
- A tiny player: renders beats 0..N, handles next/prev (prev = re-render up to N-1),
  autoplay via setInterval, scenario switch resets state.
- WhatsApp look: authentic bubble shapes/colors/ticks, RTL, Hebrew fonts (system stack).
- Escalation card = special beat type with its own styled component.
- No external assets; everything inline.

## Testing / verification

Open in browser; click through **all beats of both scenarios** end to end; verify RTL,
prev/next/restart/autoplay, scenario switch, clock and status chips update correctly,
escalation card renders. Present from a laptop — desktop layout only (graceful enough
if projected, no mobile requirement).
