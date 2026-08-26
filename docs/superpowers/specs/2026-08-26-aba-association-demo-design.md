# American Bus Association — `association` archetype, Facebook source, WAF crawl transport, Content Insights

**Date:** 2026-08-26
**Status:** approved, building
**Account:** American Bus Association (ABA) — `buses.org`, IG `@americanbusassn`, FB `AmericanBusAssociation`
**Demo language:** English, natively — persona, chat, widget, dashboard, insights.

---

## 1. Why this is five sub-projects, not one

The request was "scan this demo, everything native English, maximum insight from the
content". Reconnaissance turned three assumptions into facts, and each one opened a
distinct piece of work:

| Finding | Consequence |
|---|---|
| No Facebook source exists in the pipeline at all | **P1** — new scan source |
| `buses.org` is behind a Cloudflare JS challenge; every path 403s | **P2** — new crawl transport |
| A trade association has no fitting archetype | **P0** — new archetype |
| The owner dashboard is traffic-driven, so a fresh demo shows an empty page | **P3** — scan-derived insights |
| `generate-chat-config.ts` still writes Hebrew and misdetects English accounts | **P4** — English correctness |

Build order: **P0 + P1 + P2 in parallel → run the scan → P3 on real data → P4**.
P3 is deliberately last: an insights generator written against imagined data is a
generator written against imagined data.

---

## 2. Evidence gathered before designing

All of the following was measured, not assumed.

**Facebook is reachable via a provider we already pay for.** ScrapeCreators exposes
`/v1/facebook/profile` and `/v1/facebook/profile/posts`; both return HTTP 200 for ABA
with real English content (`#ABA100`, Marketplace 2027, Capitol Hill advocacy, Prevost
awards), real `reactionCount` / `commentCount`, and a `cursor` for pagination. Three
posts per call, one credit per call, 20,988 credits remaining. `SCRAPECREATORS_API_KEY`
is already in the environment and already used for Instagram, TikTok and YouTube.
**No Apify actor, no new provider, no new environment variable.**

**Instagram is reachable.** `americanbusassn` is public (pk `373789573`), 12 items per
page with `next_max_id` pagination.

**`buses.org` is behind a Cloudflare managed challenge.** Every path — `/`,
`/membership`, `/sitemap_index.xml` — returns 403 with `server: cloudflare` and
`X-Frame-Options: SAMEORIGIN`. A full realistic browser header set does not help. A
datacenter-egress reader running a headless browser also receives 403 *"Just a
moment…"*, which establishes that this is **not** IP reputation on the local
connection: Vercel's egress and headless Playwright will both be blocked.

**Their robots.txt explicitly permits our use.** The `User-agent: *` group is
`Allow: /` with `Content-Signal: ai-train=no, search=no, ai-input=yes`. `ai-input` is
defined by the content-signals vocabulary as *"inputting content into one or more AI
models (e.g. retrieval augmented generation, grounding)"* — precisely what this system
does. The crawlers they name and disallow (ClaudeBot, CCBot, Google-Extended,
Bytespider, Amazonbot, Applebot-Extended) are training crawlers. **We do not train.**
The WAF challenge contradicts the site's own stated policy; it is a blunt instrument,
not an expression of intent about us.

**There is no alternate ABA property.** Checked and rejected: `abamarketplace.com`
(parked, redirects to a domain broker), `busesbringbusiness.com` and `bus.org` (parked
lander pages, 114 bytes), `abafoundation.org` (**a different organisation entirely** —
the Asian Business Association Foundation). `buses.org` is the only source.

**Apify's `website-content-crawler` passes the challenge with a real browser.** A
32-page crawl (`crawlerType: playwright:firefox`, Apify proxy) returned 0 empty pages,
~2,050 characters per page, and discovered the site structure by link-following without
ever reading the blocked sitemap:

```
/membership/  /membership/join/  /membership/renew/
  + 5 membership-tier detail pages (bus operator, tour operator,
    travel industry partner, motorcoach tour associate, allied associate)
/advocacy/  /issues/safety-security/  /issues/tourism/
/events  /events/bisc-south-in-new-orleans/
/foundation/  /about/  /about/councils/driving-force-council/
/news  /resources/  /contact  /membership/find-members/
```

With `htmlTransformer: "none"` each item carries 26KB of original HTML plus a
`metadata` object containing `canonicalUrl`, `title`, `description`, `languageCode`,
`openGraph` and `jsonLd` — everything the existing persistence row needs.

**The line this design does not cross.** Driving a real browser to load public pages
that the site's own robots.txt permits is not evasion; passing a JS challenge is what
real browsers do. This design does **not** include CAPTCHA-solving services, stealth
fingerprint-spoofing plugins, or residential-proxy rotation to defeat IP blocks. If
Apify's ordinary browser crawling stops working, the answer is to ask ABA to allowlist
us — not to escalate.

---

## 3. P0 — the `association` archetype

Modelled on `b2b_saas` (the most recent archetype, English-first, dedicated tab types
fed from `accounts.config`) rather than on `government_ministry` (Hebrew-centric, and
its website-only RAG rule would discard the Instagram and Facebook content that is half
of this account's value).

**Tabs:** `Chat · Discover · Membership · Events · Advocacy`

Advocacy is the load-bearing choice. Lobbying and regulatory representation are the core
of what a trade association sells its members, and no existing archetype has anywhere to
put it.

**RAG weighting** (`src/lib/rag/archetypes.ts`): website strongly positive — the
membership tiers, event listings and policy positions are all site content; posts and
transcriptions mildly positive; `coupon` and `partnership` negative, since an
association has neither.

**Voice** (`baseArchetype.ts`): institutional authority, first-person plural
("we represent", "our members"), cites its sources, never invents a policy position or a
membership price. An association that misquotes its own dues schedule is worse than one
that says "I don't have that — here's who to ask".

**Files:** `src/lib/rag/archetypes.ts`, `src/lib/chat-ui/generate-tab-config.ts`,
`src/lib/chatbot/archetypes/baseArchetype.ts`,
`src/app/influencer/[username]/manage/page.tsx`, `src/app/admin/add/page.tsx`,
plus `src/lib/catalog/verticals.ts` (`verticalForArchetype` → `services`).

---

## 4. P1 — the `facebook` scan source

A new `fb-scan` pipeline step placed immediately after `ig-scan`, mirroring
`tiktok-scan.ts` exactly: posts land in `instagram_posts` with `platform: 'facebook'`
and `shortcode: fb_<id>`, profile metadata is stashed in `config.facebook`. RAG does not
branch on `platform`, so Facebook posts fold into retrieval and persona with no further
wiring.

**One deliberate departure from the TikTok template:** the step also persists
`topComments`. Those comments are the only source of *real audience questions* this
account has, and P3's `content_gaps` insight is built directly on them. A scan that
throws them away would make the single most saleable insight impossible.

Pagination follows `cursor` until the requested post count is reached (3 posts per
call). Target 300 posts ≈ 100 credits.

**Files:** `src/lib/scraping/facebookScraper.ts` (new),
`src/lib/pipeline/steps/fb-scan.ts` (new), `src/lib/pipeline/types.ts`,
`src/lib/pipeline/steps/index.ts`, `src/app/admin/add/page.tsx`,
`src/app/api/pipeline/start`. `enrichSkips` gains `'facebook'`.

---

## 5. P2 — the Apify crawl transport

Not a one-off script for `buses.org`. A transport that any WAF-protected customer site
can use, which also retires the separate local Playwright scraper the three gov.il
ministry accounts depend on today.

**Detection.** `site-discover` probes the homepage. A 403, a 503, or a body carrying a
Cloudflare challenge marker sets `crawlTransport = 'apify'` in the pipeline state.
Anything else keeps the existing fetch path untouched.

**Execution.** `site-discover` starts an *asynchronous* Apify run and stores its
`runId`. `site-crawl` polls that run and drains its dataset in batches, advancing an
offset cursor and re-enqueuing until the run finishes and the dataset is exhausted. This
is the same batched, bounded-duration shape every other batched step already uses, and
it reuses the run/poll/dataset helpers that already exist in
`src/lib/scraping/apify-actors.ts` (lines 104–225). A synchronous run would exceed the
600-second step ceiling on any real site.

**One extraction path, not two.** `crawlPageBatch` is split so that HTML parsing and
persistence live in an exported `persistPageHtml(url, html, accountId, fallbacks?)`.
The fetch transport and the Apify transport both call it, so product detection,
structured data, image collection and page-type classification cannot drift apart
between protected and unprotected sites. Apify's `metadata.title`,
`metadata.description`, `metadata.jsonLd` and `metadata.openGraph` are passed as
fallbacks for the fields its HTML transform strips.

**Failing loudly.** `site-discover` currently swallows every website error and advances
with an empty frontier, so a fully blocked site produces a job that reports success with
zero pages — the exact failure mode that would have made this demo look finished while
containing no website content at all. When the transport is `apify` and the Apify run
itself fails, the step fails with a message naming the cause.

**Files:** `src/lib/pipeline/apify-crawl.ts` (new), `src/lib/pipeline/crawl.ts`
(refactor), `src/lib/pipeline/steps/site-discover.ts`,
`src/lib/pipeline/steps/site-crawl.ts`, `src/lib/pipeline/types.ts`.

---

## 6. P3 — Content Insights

**The problem.** The owner dashboard is built from leads, support tickets,
conversations, partnerships and promotions. A demo account has none of those on day one,
so the American client's first impression is an empty page. `conversation_insights` is
equally empty — it is written by the weekly conversation-analytics job, which needs
traffic that does not exist yet. Anything worth showing on day one must be derived from
the **scanned content**.

**Storage: a new `content_insights` table (migration 084).** Not
`accounts.config` — that is the field this codebase has repeatedly watched get wiped by
re-scan races (biopeptix, studiopasha, lenovo), and insights that silently vanish on the
next scan are worse than no insights. Not on-demand generation either: it would be slow,
costly per page load, and non-deterministic in front of a client.

**The four insight types**, all four requested:

| Type | Derived from |
|---|---|
| `top_performers` | Real cross-platform engagement ranking (IG + FB), each claim carrying the specific posts and their numbers |
| `content_gaps` | **Real comments** from IG and Facebook, matched against what the RAG corpus can actually answer |
| `topic_map` | The association's topic system with relative weight — Advocacy, Marketplace, safety, membership, group tourism |
| `cadence` | Posting frequency, day/hour, length, media use — measured against actual performance |

**The evidence rule.** Every row carries `evidence jsonb`: an array of
`{platform, post_id, url, metric, value}`. **An insight that cannot cite evidence is not
written.** This is what separates a dashboard the client can act on from AI prose they
cannot falsify — and `content_gaps` in particular is the whole Bestie sales argument
("your audience asks this and you have no answer"), which is worthless unless the
question is a real one somebody actually typed.

`content_gaps` is the one type that can legitimately come back empty, when the corpus
answers everything the comments ask. Empty is a real result and must render as such,
never as a fabricated gap.

**Generation** runs as an `insights-build` pipeline step after `persona-build`, so
insights exist the moment the scan finishes and are regenerated on every re-scan.

**Files:** `supabase/migrations/084_content_insights.sql`, `src/lib/insights/` (new),
`src/lib/pipeline/steps/insights-build.ts` (new),
`src/app/api/influencer/[username]/content-insights/route.ts` (new), dashboard section.

---

## 7. P4 — English correctness and the demo window

**The `'mom'` bug.** `TYPE_KEYWORDS.parenting` in
`src/lib/processing/generate-chat-config.ts` contains `'mom'`, matched as an unanchored
case-insensitive regex against the whole persona text. Every English *"**mom**ent"* and
*"**mom**entum"* scores a point for parenting. This is why Inter Miami CF came out
classified as a parenting account with a purple theme, and ABA's own content
(*"Big numbers start with small **mom**ents"*) would do it again. Keywords must match on
word boundaries, and English accounts must not be classified by a Hebrew keyword table.

**What is already fine.** `generate-tab-config.ts` is fully bilingual and
language-aware, and it runs *after* `generateAndSaveChatConfig`, overwriting
`greeting_message`, `chat_subtitle`, `header_label` and the tab set in English. The
Hebrew that survives a scan is narrower than the earlier English demos suggested:
`suggested_questions` and the `influencer_type`-derived theme. Both are fixed here so
this account does not need the manual post-scan SQL that Lenovo and Inter Miami still
need after every re-scan.

**The demo window.** `isDemo: true` gates the daily scan crons, which is what was asked
for ("no need for it to update every day"). It *also* writes `config.demo`, locking the
demo behind a "talk to LDRS" screen after 7 days — a time bomb under a critical American
client. `config.demo` is create-only and `extended_to` survives re-scan, so setting
`extended_to` to 45 days after the scan achieves the long window **with no code
change**.

---

## 8. Verification

- Unit tests for `facebookScraper` normalisation, `persistPageHtml` parity between the
  fetch and Apify transports, the archetype config, and the keyword-boundary fix
  (including an assertion that `"small moments"` no longer scores parenting).
- Every insight-generator test asserts **presence**, not merely absence — an empty
  result must never be able to pass a test that claims insights were produced. This
  codebase has shipped two real bugs behind vacuously-passing absence assertions.
- End-to-end: the scan is judged on real counts (pages, IG posts, FB posts, RAG chunks,
  insight rows), not on the job reporting success.
