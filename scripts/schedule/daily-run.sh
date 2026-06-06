#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOCK_FILE="$LOG_DIR/daily-post.lock"
mkdir -p "$LOG_DIR"

if [[ -f "$LOCK_FILE" ]]; then
  echo "$(date -Iseconds) skipped — another run in progress" >> "$LOG_DIR/daily-post.log"
  exit 0
fi

touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

LOG_FILE="$LOG_DIR/daily-post-$(date +%Y-%m-%d).log"

{
  echo "=== $(date -Iseconds) daily post start ==="
  echo "Project: $PROJECT_DIR"

  export NVM_DIR="$HOME/.nvm"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    nvm use 20
  else
    echo "ERROR: nvm not found at $NVM_DIR"
    exit 1
  fi

  cd "$PROJECT_DIR"

  if [[ -f "$PROJECT_DIR/.env.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_DIR/.env.local"
    set +a
  fi

  # Scheduled runs: headless by default (set POST_VISIBLE=true in .env.local to show browser)
  if [[ "${POST_VISIBLE:-}" == "true" || "${POST_VISIBLE:-}" == "1" ]]; then
    export HEADLESS=false
  else
    export HEADLESS=true
  fi

  npm run post:next

  echo "=== $(date -Iseconds) daily post finished (exit $?) ==="
} >> "$LOG_FILE" 2>&1
