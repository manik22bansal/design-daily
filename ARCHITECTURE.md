# Design Daily — Architecture

A personal daily digest of the best of the design world. Each morning a curator (an automated Claude session) researches the web, picks 5–7 genuinely worthy pieces across four lanes, and publishes them to a static site. Reader feedback (star / poop-with-reason) flows back into the curator's taste, so the feed sharpens over time.

- **Live site:** https://manik22bansal.github.io/design-daily/
- **Repo:** https://github.com/manik22bansal/design-daily (public)
- **Reader:** Manik Bansal — design lead at Cuemath (K-12 edtech, gamification/motivation systems, design systems, editorial type, kids' product, product thinking, design × AI).

---

## How it fits together

```
                    ┌─────────────────────────────────────────────┐
                    │  CURATOR  (scheduled local Claude session)    │
                    │  task: design-daily-curator  ·  ~7:30 AM IST  │
                    │                                               │
   reads ───────────┤  1. ingest votes (taste/votes/*)             │
   taste/profile.md  │  2. load taste + sources + last 14 editions  │
   sources.md        │  3. research the web across 4 lanes          │
   CLAUDE.md         │  4. curate 5–7 (never pad), write what+why   │
                    │  5. write editions/<date>.json + index.json  │
                    │  6. git commit + push                         │
                    │  7. Slack ping (reads .secrets/slack-webhook) │
                    └───────────────┬───────────────────────────────┘
                                    │ push
                                    ▼
                         ┌────────────────────┐
                         │  GitHub repo        │  ──► GitHub Pages (auto-deploy)
                         │  design-daily       │            │
                         └─────────┬──────────┘            ▼
                                   ▲              ┌──────────────────────┐
                      writes vote  │              │  Static site          │
                      JSON files   │              │  index.html + app.js  │
                                   │              │  fetches editions/*   │
                         ┌─────────┴──────────┐   │  renders, light/dark  │
                         │ Val.town function   │   └─────────┬────────────┘
                         │ designDailyVote     │             │ star / poop+reason
                         │ (GITHUB_TOKEN env)  │ ◄───────────┘  POST
                         └────────────────────┘
```

Two independent loops meet at the repo:
1. **Publish loop** — curator → repo → Pages → site (once a day).
2. **Feedback loop** — site → Val.town endpoint → repo → curator (read next morning).

The repo is the single source of truth and the message bus between them. No database, no server process to keep alive.

---

## Components

### 1. Static site — `index.html`, `assets/app.js`, `assets/style.css`
No framework, no build step. `app.js` fetches `editions/index.json` (array of dates, newest-first), loads the requested or latest edition, and renders items. Design language: minimal editorial — Newsreader serif, single oxblood accent, hairline rules, automatic light/dark via `prefers-color-scheme`, tuned for 390px.

Hardened for machine-generated data: every interpolated field is escaped (`esc()`), URLs are gated to `http(s)` (else `#`), missing fields fall back gracefully, the date index is re-sorted defensively, and an empty edition shows a quiet message instead of breaking.

Reader actions (all persisted in `localStorage`, so they are **per-device**):
- **Star** — bookmark. Full item is stored under the `stars` key so the Starred view (`?view=starred`) needs no fetch.
- **Poop** — downvote. Dims the item and offers a one-time optional reason input; the pooped pill stays highlighted.
- Archive — past editions browsable via `?date=YYYY-MM-DD`.

### 2. Editions data — `editions/*.json` + `editions/index.json`
One file per day. `index.json` is a newest-first array of dates. Item schema:

```json
{
  "id": "YYYY-MM-DD-N",
  "title": "…",
  "url": "https://… (specific piece, never a homepage)",
  "source": "…",
  "lane": "essay | inspiration | news | voices",
  "summary": "what it is, in plain jargon-free English",
  "why": "why it's shortlisted for Manik, concrete and specific",
  "paid": true,          // optional — renders a 'PAID' tag
  "image": "https://…"   // optional
}
```

`2026-06-10/11/12.json` are hand-written samples (they predate the `why` field and link to homepages — sample-only, not the standard).

### 3. Curator brain — `CLAUDE.md`, `sources.md`, `taste/`
The curator has no memory between runs; these files ARE its memory.
- **`CLAUDE.md`** — standing instructions: the daily run order, the quality bar (primary sources, no listicles/SEO/bait, specific URLs only, paid-allowed-if-excellent), lane balance, the what/why writing rules, and failure rules (publish nothing rather than pad; verify every URL resolves).
- **`sources.md`** — scored source list (1–5) grouped by domain: Essays & craft, Visual inspiration, Industry news, Voices, Product thinking, Design × AI, plus a Retired table. Sections are priority/quality anchors, NOT a hard boundary — the curator also searches the broader web and can add new finds (start at 3).
- **`taste/profile.md`** — prose taste (Leans toward / Allergic to / Presentation requirements). Ground truth; overrides `CLAUDE.md` on conflict; hand-editable.
- **`taste/changelog.md`** — append-only audit of every taste/source change.
- **`taste/paywall-watchlist.md`** — the "subscription radar" (see below).
- **`taste/votes/`** — inbox for reader feedback; `.gitkeep` keeps it present.

### 4. Scheduler — local task `design-daily-curator`
A Claude scheduled task (cron `30 7 * * *`, local IST, ~9-min jitter). Stored at `~/.claude/scheduled-tasks/design-daily-curator/SKILL.md`. Runs as a fresh local Claude session **only while the Claude app is open**; if closed when due, it runs once on next launch (no multi-day backfill). It uses the machine's `gh`/git auth to push and web search to research.

### 5. Vote endpoint — Val.town `designDailyVote`
A single HTTP function (code backed up at `.endpoint/designDailyVote.ts`). Receives `{editionDate, itemId, vote, source, lane, reason}`, validates (vote ∈ `less|star|unstar`, date/id shape), and writes a small JSON file into `taste/votes/` via the GitHub Contents API. CORS locked to the Pages origin. Auth via a fine-grained PAT stored as the Val.town env var `GITHUB_TOKEN` (Contents read/write on this repo only). UTF-8-safe base64 so emoji/smart-quotes in reasons survive.

### 6. Slack nudge
The curator's final step reads a webhook URL from `.secrets/slack-webhook` (gitignored) and `curl`s a one-line DM with the top headline + link. Never blocks publishing — if the file is absent or the post fails, it's skipped silently.

---

## The feedback loop in detail

Each morning, before curating, the curator processes `taste/votes/`:
- **star** → source score +0.75 (cap 5); **poop/less** → −0.5; **unstar** → revert.
- A **poop reason** (free text) is folded into `taste/profile.md` as guidance — this is the high-value signal, because it changes the *rules*, not just a number. (Example: a "why unclear" reason drove the what/why split; a "paywalled, can't read it" reason created the paid policy.)
- A source dropping below 2 is **retired**; recurring patterns (3+ signals same direction) get noted in the profile; every change is logged to the changelog; consumed vote files are deleted.

It distinguishes "I dislike this source" from "this was presented badly" by judgment, not automatically — the reason text is what makes that possible.

## The subscription radar (paywall policy)

Paywalled pieces are **allowed** when they clear the would-have-featured bar, shown with a visible `PAID` tag (no surprise clicks). Weak paid picks (e.g. a review where only a logo is free) stay out. Every featured/considered paid piece is appended to `taste/paywall-watchlist.md`. Over weeks, frequency-per-source reveals which paywalls are worth a subscription. When Manik subscribes to one, flip it to full-access (drop the PAID caveat) so the curator can use its whole archive.

---

## Secrets (never committed)

| Secret | Where it lives | Scope |
|---|---|---|
| GitHub fine-grained PAT | Val.town env var `GITHUB_TOKEN` | Contents read/write, `design-daily` repo only, 1-yr expiry |
| Slack webhook URL | `.secrets/slack-webhook` (gitignored) | Posts to one Slack DM/channel |

Both are revocable: regenerate the PAT at github.com/settings, update the Val.town env var; regenerate the webhook in the Slack app, overwrite the local file. Nothing else changes.

---

## Known limitations

- **Laptop-dependent.** The local scheduler only runs when the Claude app is open; it can't publish on a morning the Mac never wakes. Catch-up is a single run on next launch, not a per-day backfill. → see "Cloud runner" below.
- **Per-device state.** Stars and votes live in `localStorage`, so the Starred view and vote-disabled state don't sync across devices. Votes still reach the curator (via the endpoint) from any device, but the personal star collection is local to each browser.
- **Val.town free tier** requires the function's code to be public (it holds no secrets — the token is an env var).
- **Public Pages URL** (obscure, unlinked, but technically public).
- A stray `PostToolUse` lint hook references `.claude/scripts/design-lint.py` (absent) and errors on writes from some tools — harmless; writes succeed.

---

## Future enhancements (return-to list)

- **Cloud runner** — a scheduled GitHub Action (cron) that curates via the Claude API and commits, fully independent of the Mac. Closes the laptop-dependency gap. Needs an Anthropic API key as a repo secret and the curation logic as a callable script/prompt. This is the most-likely first upgrade once mornings start getting missed.
- **Cross-device stars** — have the endpoint also persist stars server-side (or in the repo) and the site read them back, so the Starred collection follows you across devices.
- **Auto subscription-radar nudge** — a weekly Slack line when a paywalled source crosses a threshold (e.g. 3 strong near-misses in 14 days).
- **Source suggestion path** — a low-friction way to add sources without editing the repo (today: tell Claude, or edit `sources.md`).
- **Weekend deep edition** — a richer weekly roundup alongside the daily.
- **Private hosting** — move off public Pages to an authed host (Cloudflare Access / Vercel) if privacy ever matters.
- **Thumbnails / search / lane filters** on the site as the archive grows.

---

## Build provenance

Built 2026-06-13 via the superpowers brainstorm → spec → plan → subagent-driven-execution flow. Spec and plan: `personal/workspace/design-daily/` in the Cuemath-Hive repo. Decisions captured there and in `taste/changelog.md`.
