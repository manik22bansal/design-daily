# Design Daily

A daily, taste-evolving digest of the best of the design world. Curated each evening by a headless Claude agent for the next morning; published at https://manik22bansal.github.io/design-daily/. Installable as a phone web app (Add to Home Screen).

**Repo lives at `~/design-daily`** (not `~/Desktop` — macOS blocks background jobs from the Desktop; see `.curator/README.md`).

## Layout
- `index.html`, `assets/` — the static site (no build step) + app icons + `manifest.webmanifest`
- `editions/` — one JSON per day; `index.json` lists dates newest-first (editions before 2026-06-13 are hand-written samples)
- `CLAUDE.md` — the curator's standing instructions (the brain)
- `sources.md` — scored source list (the quality filter)
- `taste/` — `profile.md` (ground-truth taste), `changelog.md`, `paywall-watchlist.md` (subscription radar), `votes/` (reader feedback inbox)
- `.curator/` — the nightly runner (`run.sh`, `prompt.md`) + logs; see `.curator/README.md`
- `.endpoint/designDailyVote.ts` — backup of the Val.town vote function
- `.secrets/` — Slack webhook (gitignored)
- `ARCHITECTURE.md` — full system overview, data flows, limitations, future work

## How it runs
A macOS launchd job runs the curator headless at ~8pm daily (whenever the Mac is awake). It researches, curates 5–7 items, writes the edition, commits, pushes, and pings Slack. Operational details, commands, and troubleshooting: **`.curator/README.md`**.
