#!/bin/bash
# Design Daily — nightly curator runner (launchd LaunchAgent target).
# Runs Claude Code headless with permission checks skipped, so the curation
# publishes unattended. Trusted automation scoped to this repo.

REPO="/Users/manikbansal/Desktop/design-daily"
CURATOR="$REPO/.curator"
LOG="$CURATOR/run.log"

# launchd starts with a bare environment — put node (nvm), homebrew, and system bins on PATH.
export PATH="/Users/manikbansal/.nvm/versions/node/v24.13.1/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/manikbansal"

CLAUDE="/Users/manikbansal/.nvm/versions/node/v24.13.1/bin/claude"

{
  echo ""
  echo "===== Design Daily run: $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
  cd "$REPO" || { echo "repo not found"; exit 1; }
  "$CLAUDE" -p "$(cat "$CURATOR/prompt.md")" \
    --dangerously-skip-permissions \
    --output-format text
  echo "===== done: $(date '+%H:%M:%S') ====="
} >> "$LOG" 2>&1
