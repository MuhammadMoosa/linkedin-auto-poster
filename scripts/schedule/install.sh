#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_LABEL="com.linkedin-auto-poster.daily"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
RUN_SCRIPT="$PROJECT_DIR/scripts/schedule/daily-run.sh"
LOG_DIR="$PROJECT_DIR/logs"

HOUR="${POST_SCHEDULE_HOUR:-9}"
MINUTE="${POST_SCHEDULE_MINUTE:-30}"

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"
chmod +x "$RUN_SCRIPT"

if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
  launchctl bootout "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || \
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${RUN_SCRIPT}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${HOUR}</integer>
    <key>Minute</key>
    <integer>${MINUTE}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/launchd.err.log</string>
  <key>LimitLoadToSessionType</key>
  <array>
    <string>Aqua</string>
  </array>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || \
  launchctl load "$PLIST_PATH" 2>/dev/null || LOAD_FAILED=1

echo ""
if [[ "${LOAD_FAILED:-}" == "1" ]]; then
  echo "⚠ Plist created but could not load from this environment."
  echo "  Open Terminal.app and run:"
  echo "  cd $PROJECT_DIR && npm run post:schedule:install"
  echo ""
fi

echo "✓ Daily LinkedIn posting scheduled"
echo "  Time:    ${HOUR}:$(printf '%02d' "${MINUTE}") local time (every day)"
echo "  Command: npm run post:next"
echo "  Plist:   ${PLIST_PATH}"
echo "  Logs:    ${LOG_DIR}/"
echo ""
echo "Next post: Day 2 (run npm run post:days to confirm)"
echo ""
echo "Useful commands:"
echo "  npm run post:schedule:status"
echo "  npm run post:schedule:uninstall"
echo "  POST_SCHEDULE_HOUR=10 POST_SCHEDULE_MINUTE=0 npm run post:schedule:install"
echo ""
