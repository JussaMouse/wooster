#!/bin/bash

# --- Configuration ---
SERVICE_NAME="com.wooster.app"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$SERVICE_NAME.plist"

# --- Main Script ---

echo "🗑️  Attempting to uninstall the Wooster launchd service..."

# 1. Check if the .plist file exists.
if [ ! -f "$PLIST_PATH" ]; then
    echo "ℹ️  Service configuration file not found at $PLIST_PATH. Nothing to do."
    exit 0
fi

# 2. Stop the service if it's running.
echo "   Stopping service: $SERVICE_NAME"
launchctl stop "$SERVICE_NAME" 2>/dev/null || true

# 3. Unload the service from launchd.
echo "   Unloading service from launchd..."
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# 4. Remove the .plist file.
echo "   Removing configuration file: $PLIST_PATH"
rm "$PLIST_PATH"

echo "✅ Wooster service has been successfully uninstalled." 