#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_LABEL="com.linkedin-auto-poster.daily"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
LOG_DIR="$PROJECT_DIR/logs"

echo "LinkedIn daily schedule status"
echo "=============================="
echo ""

if [[ -f "$PLIST_PATH" ]]; then
  echo "Schedule: INSTALLED"
  echo "Plist:    $PLIST_PATH"
  if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
    echo "Agent:    loaded"
  else
    echo "Agent:    plist exists but not loaded — run npm run post:schedule:install"
  fi
  HOUR=$(/usr/libexec/PlistBuddy -c "Print :StartCalendarInterval:Hour" "$PLIST_PATH" 2>/dev/null || echo "?")
  MINUTE=$(/usr/libexec/PlistBuddy -c "Print :StartCalendarInterval:Minute" "$PLIST_PATH" 2>/dev/null || echo "?")
  echo "Time:     ${HOUR}:$(printf '%02d' "${MINUTE}" 2>/dev/null || echo "$MINUTE") local time daily"
else
  echo "Schedule: NOT installed"
  echo "Install:  npm run post:schedule:install"
fi

echo ""
echo "Campaign:"
export NVM_DIR="$HOME/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null 2>&1
  cd "$PROJECT_DIR"
  npm run post:days 2>/dev/null | tail -n 5
fi

echo ""
echo "Recent logs:"
LOG_FILES=()
if [[ -d "$LOG_DIR" ]]; then
  for f in "$LOG_DIR"/daily-post-*.log; do
    [[ -e "$f" ]] || continue
    LOG_FILES+=("$f")
  done
fi
if (( ${#LOG_FILES[@]} )); then
  for f in "${LOG_FILES[@]:0:3}"; do
    echo "  $f"
    tail -n 2 "$f" | sed 's/^/    /'
  done
else
  echo "  (none yet)"
fi

echo ""
echo "Requirements:"
echo "  • Mac awake and logged in at post time"
echo "  • linkedin-session.json valid (npm run post:login if session expires)"
echo "  • POST_VISIBLE=true in .env.local to show browser window during auto-post"
