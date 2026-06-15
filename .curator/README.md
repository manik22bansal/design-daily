# Curator runner (.curator/)

How Design Daily publishes itself each night, and how to operate/debug it.

## What's here
- `prompt.md` — the full instructions handed to the headless curator each run (timing/date rule, then "read CLAUDE.md and do the daily run"). Editable; this is what the agent executes.
- `run.sh` — the runner. Sets PATH (node/nvm, homebrew, system), then runs the `claude` CLI headless against `prompt.md` with permission checks skipped, appending to `run.log`.
- `run.log` — append-only log of each run's output (gitignored).
- `launchd.out.log` / `launchd.err.log` — stdout/stderr from launchd itself (gitignored). Check `launchd.err.log` first if a run didn't happen.

## How it's scheduled
A macOS LaunchAgent: `~/Library/LaunchAgents/com.manikbansal.designdaily.plist`
- Fires at **20:00 local (IST)** via `StartCalendarInterval`.
- Runs `/bin/bash ~/design-daily/.curator/run.sh`.
- Runs whenever the **Mac is awake** — the Claude app does NOT need to be open. If the Mac is asleep at 20:00, launchd fires the missed slot **once** on next wake (no multi-day backfill).
- Because the CLI runs with `--dangerously-skip-permissions`, the run never prompts. This is acceptable here: a trusted, self-contained automation scoped to this repo.

## Why the repo is at `~/design-daily`, not `~/Desktop`
macOS TCC (privacy) blocks background/launchd processes from reading or writing `~/Desktop`, `~/Documents`, `~/Downloads` unless you grant Full Disk Access. With the repo on the Desktop the job failed with `Operation not permitted`. Keeping it in the home root (unprotected) avoids that without a broad FDA grant. **Don't move this repo back under a protected folder.**

## Date logic (also in CLAUDE.md / prompt.md)
- Evening run (local hour ≥ 18) → edition dated **tomorrow** (it's prepping the next morning).
- Daytime catch-up (hour < 18, a missed night) → edition dated **today** (don't skip or jump ahead).
- If the target date's edition already exists → stop, no changes.

## Operating commands
```bash
UID_=$(id -u)
PLIST=~/Library/LaunchAgents/com.manikbansal.designdaily.plist

# Check it's loaded (second column is last exit code; 0 = ok)
launchctl list | grep designdaily

# Run it right now (test)
launchctl kickstart -k "gui/$UID_/com.manikbansal.designdaily"
tail -f ~/design-daily/.curator/run.log

# Reload after editing the plist
launchctl bootout "gui/$UID_/com.manikbansal.designdaily" 2>/dev/null
launchctl bootstrap "gui/$UID_" "$PLIST"

# Pause / resume automatic runs
launchctl bootout "gui/$UID_/com.manikbansal.designdaily"     # pause
launchctl bootstrap "gui/$UID_" "$PLIST"                       # resume

# Change the time: edit StartCalendarInterval Hour/Minute in the plist, then reload.
```

## Troubleshooting a missing edition
1. `launchctl list | grep designdaily` — present? exit code 0?
2. `tail -40 ~/design-daily/.curator/run.log` — did the run start? what did it decide?
3. `cat ~/design-daily/.curator/launchd.err.log` — `Operation not permitted` means a TCC/path problem (repo must stay out of protected folders); a node/`claude: command not found` means the PATH in `run.sh` is stale (check the nvm node version).
4. Mac was asleep all evening → expected; it runs on next wake, or skips if a full day passed.
5. The CLI must stay logged in (`claude` uses `~/.claude` auth). If auth lapses, runs fail silently — re-auth by opening Claude once.

## Note
There is also a **disabled** in-app Claude scheduled task (`~/.claude/scheduled-tasks/design-daily-curator/`). It was the first approach but prompted on every compound shell command, so it was replaced by this launchd job. Leave it disabled to avoid double-publishing.
