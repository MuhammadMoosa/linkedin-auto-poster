#!/bin/zsh
set -euo pipefail

PLIST_LABEL="com.linkedin-auto-poster.daily"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

if [[ -f "$PLIST_PATH" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || \
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "✓ Removed daily schedule ($PLIST_PATH)"
else
  echo "No schedule installed."
fi
