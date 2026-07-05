#!/bin/bash
# Design Daily — nightly curator runner (launchd LaunchAgent target).
# Runs Claude Code headless with permission checks skipped, so the curation
# publishes unattended. Trusted automation scoped to this repo.

REPO="/Users/manikbansal/design-daily"
CURATOR="$REPO/.curator"
LOG="$CURATOR/run.log"

# launchd starts with a bare environment — put node (nvm), homebrew, and system bins on PATH.
export PATH="/Users/manikbansal/.nvm/versions/node/v24.13.1/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/manikbansal"

CLAUDE="/Users/manikbansal/.nvm/versions/node/v24.13.1/bin/claude"
WEBHOOK_FILE="$REPO/.secrets/slack-webhook"

# Post a short failure alert to Slack so a broken run is noticed the same day,
# not weeks later (the 2026-06-20 account switch silently 401'd this job for
# two weeks). Alerting must never affect the run itself — always returns 0.
notify_failure() {
  [ -f "$WEBHOOK_FILE" ] || return 0
  hook="$(tr -d '[:space:]' < "$WEBHOOK_FILE")"
  [ -n "$hook" ] || return 0
  # Message is a fixed, controlled string — no quotes/backslashes/backticks — so
  # it embeds safely in the JSON payload without escaping.
  msg="Design Daily run failed: $1. Check .curator/run.log on Manik's Mac."
  curl -s -m 15 -X POST "$hook" -H 'Content-Type: application/json' \
    --data "{\"text\":\":warning: $msg\"}" >/dev/null 2>&1 || true
}

{
  echo ""
  echo "===== Design Daily run: $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
  cd "$REPO" || { echo "repo not found"; notify_failure "runner could not enter the repo directory"; exit 1; }
  OUT="$("$CLAUDE" -p "$(cat "$CURATOR/prompt.md")" --dangerously-skip-permissions --output-format text 2>&1)"
  STATUS=$?
  printf '%s\n' "$OUT"
  # Failure-only detection. A normal publish, or a legitimate "edition already
  # exists / rest day" skip, exits 0 with no error strings and stays quiet.
  if printf '%s' "$OUT" | grep -qiE "Failed to authenticate|authentication_error|Invalid authentication credentials"; then
    notify_failure "authentication error - the claude CLI likely needs a re-login (open a terminal, run: claude, then /login)"
  elif [ "$STATUS" -ne 0 ]; then
    notify_failure "exit code $STATUS"
  elif printf '%s' "$OUT" | grep -qiE "API Error|rate.?limit"; then
    notify_failure "the curator reported an API error"
  elif [ -z "$(printf '%s' "$OUT" | tr -d '[:space:]')" ]; then
    notify_failure "the curator produced no output"
  fi
  echo "===== done: $(date '+%H:%M:%S') ====="
} >> "$LOG" 2>&1
