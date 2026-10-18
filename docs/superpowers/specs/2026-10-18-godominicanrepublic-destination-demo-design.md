# Go Dominican Republic: `destination` archetype, X scan source, English demo

**Date:** 2026-10-18
**Status:** built and shipped (`e2132c6d`), demo scanned afterwards
**Account:** Dominican Republic, `godomrep`, `https://www.godominicanrepublic.com/`
**Why:** a demo for NV (introduced by Samir). The audience is a tourism board, so the demo has to read as a travel guide, not a shop and not a trade association.
**Language:** English natively, LTR, on every surface.

## 1. Evidence gathered first

| Source | Reachable | Size |
|---|---|---|
| Website | plain HTTP 200, SSR, no WAF, `robots.txt` `Allow: /` | 10 child sitemaps, about 806 pages: things-to-do 328, places-to-stay 340, blogs 47, events 29, destinations 20, pages 18, press 12 |
| Instagram `godomrep` | yes, public | 260K followers |
| Facebook `godominicanrepublic` | yes | 452K followers |
| YouTube `@GoDominicanRepublic` | yes | 24K subscribers, 333 videos |
| TikTok `@godomrep` | yes | 95.7K followers, 113 videos |
| X `@GoDomRep` | yes | 58.7K followers |

## 2. Decisions

**A new archetype, not `association`.** `association` gives Membership / Events / Advocacy tabs, a prompt that talks about dues and legislation, and a topic list built for lobbying. A tourism board needs the opposite surface. Rule from [[feedback_new_account_type_pattern]]: a new kind of account is a first-class archetype.

`destination`:

- **Tabs:** Chat, Discover, Destinations, Things to Do, Stay. The order is the order a traveller decides: where, what, where to sleep.
- **Topics:** destinations, experiences, stay, dining, culture, events, plan. Fallback is `destinations`, inside the vocabulary.
- **RAG:** website +0.10, posts +0.08, transcriptions +0.05; coupon, partnership and product capped at 0 and pushed down. Recency 1.2.
- **Prompt:** warm and specific, first-person plural. It answers only from the knowledge base. It never invents a price, an opening time, a flight, an amenity or an entry rule. Entry, health and advisory questions get the knowledge-base answer plus "confirm before booking" and the official source. It cannot book. One link per reply, none when it says "I don't have that". It never ranks real businesses or runs down another destination.
- **Routing:** intent forced to `general` (the retail classifier would read "rum tasting" as food and "spa resort" as beauty). No coupon chips. Service DM menu. Catalog vertical `services`. The website is the knowledge base (2000-chunk budget, not 200).

**X as a scan source (`x-scan`).** ScrapeCreators `/v1/twitter/profile` and `/v1/twitter/user-tweets`. Verified limit: the provider returns the account's 100 *most popular* tweets, with no cursor and no timeline (the live sample spans 2015 to 2023). So X contributes best-performing messaging and the profile, never recent posts. Because it is a winners-only sample, `x` is excluded from timing and cross-platform engagement insights (`NO_ENGAGEMENT_DATA`), otherwise X would be crowned the best channel. Retweets are dropped; t.co links are stripped.

**TikTok covers.** The scraper stored no thumbnail, so TikTok tiles were bare. `video.cover.url_list` lists heic first, which Chrome and Firefox cannot render; the step now picks the jpeg variant, persists it to storage (the URLs are signed and expire), and keeps like and comment counts.

**Password.** The pipeline's `create-account` step sets the dashboard password `123456` when none exists, as for every other demo. Requested by Ido. See the risk below.

## 3. Risks and open items

- **`123456` stops working when `integration/gaps-2026-09-14` ships.** That branch (held) removes the shared default password and replaces it with one-time set-password links. The demo login will need a set-password link at that point.
- **The held integration branch has an archetype registry** (`src/lib/archetypes/registry.ts`) that `main` does not. When it merges, `destination` resolves to `UNKNOWN_BEHAVIOUR` (no content tabs, commerce DM menu) unless a registry entry is added. Port the branch points listed in this commit into one registry entry before merging.
- Five unit tests fail on a clean `origin/main` and are unrelated: `agent-tools`, `crm-wa-worker`, `cs-worker-route` (2), and `admin/scans-list` (stale step count, fixed here).
- Step-count tests are now derived from `SCAN_STEPS`; they had gone stale four times.

## 4. Results (2026-10-18)

Account `7911a144-88c2-4949-8d79-ca1fc210c707`, username `godomrep`, English, 45-day demo window to 2026-12-02. Chat: `/chat/godomrep`. Dashboard: `/influencer/godomrep/login`, password `123456`.

Scan (jobs `d324e3de` full, `9c66912e` YouTube/TikTok enrich): 805 site pages, 2,049 knowledge chunks (0 unlabelled), 540 posts (X 100, Facebook 300, Instagram 70, TikTok 40, YouTube 30), persona, 7 content insights.

Bot probe (8 live questions): grounded answers with real page URLs, no invented price, entry and safety questions caveated and pointed at the official page, discount question answered honestly.

Browser audit: 0 Hebrew and LTR on 5 chat tabs (desktop and mobile) and 21 dashboard pages, 0 broken images.

## 5. What the build found along the way (all fixed unless noted)

| Finding | Effect | Fix |
|---|---|---|
| ScrapeCreators YouTube endpoints reject `url`, the scraper sent it for any link and swallowed the 400 | every account given a YouTube link scanned 0 videos | extract handle / channel id (`70d6eb10`) |
| TikTok read only page one | 10 of 113 videos | follow `max_cursor`, cap 40 |
| Topic labelling is one DB write per chunk after the website ingest | ~1,450 chunks overran the 600s limit; QStash retries (3) ran out with 439 unlabelled; job stalled with no error | re-published via `/api/pipeline/retry`. **Not fixed**: batch the writes before the next large site |
| Browse cards ignored the crawled page's hero image, kept the site-name suffix and contact details, were right-aligned in English | placeholder emoji on all 622 pages | `9be729c0` |
| `formatRelativeTime` fell back to a Hebrew date for English | "9 באוק׳ 2026" on the dashboard | `9be729c0` |
| Discover titled an organisation by its first word | "Dominican's most viral videos" | `9be729c0` |
| Insights counted YouTube (no likes) as 0 and X (popular-only) as a timeline | "YouTube averages 0", "4,152 days of history" | `9be729c0` |
| `finalize` rewrites display name, greeting, theme and widget links on every run | re-running any step undoes manual config | re-apply after any re-run (SQL in the session log) |

## 6. Known limitation

`/demo/<accountId>` (the widget previewed on the customer's own site) does not render for godominicanrepublic.com. The site is a Next.js app that keeps its content hidden until its own scripts hydrate, and they fail under our origin; stripping the scripts leaves a blank page. The widget itself and the chat page work. The demo page chrome is also Hebrew for this English account. Share `/chat/godomrep`, not `/demo/...`.
