#!/bin/bash

# --- Configuration ---
# A unique label for the service. Convention is reverse-DNS format.
SERVICE_NAME="com.wooster.app"
# The full path to your Wooster project directory.
# Uses 'pwd' to get the current directory where the script is run.
PROJECT_DIR="$(pwd)"
# The directory where user LaunchAgent plists are stored.
PLIST_DIR="$HOME/Library/LaunchAgents"
# The full path to the final .plist file.
PLIST_PATH="$PLIST_DIR/$SERVICE_NAME.plist"
# The directory for logs.
LOG_DIR="$PROJECT_DIR/logs"

# --- Main Script ---

echo "🚀 Starting Wooster launchd service installation..."

# 1. Find the full paths for node and pnpm executables.
# This makes the script robust, even if they are installed in non-standard locations.
NODE_PATH=$(which node)
PNPM_PATH=$(which pnpm)

if [ -z "$NODE_PATH" ]; then
    echo "❌ Error: 'node' executable not found in PATH."
    echo "Please install Node.js and ensure it's in your PATH."
    exit 1
fi

if [ -z "$PNPM_PATH" ]; then
    echo "❌ Error: 'pnpm' executable not found in PATH."
    echo "Please install pnpm (e.g., 'npm install -g pnpm') and ensure it's in your PATH."
    exit 1
fi

echo "✅ Found executables:"
echo "   Node: $NODE_PATH"
echo "   pnpm: $PNPM_PATH"
echo "   Project Directory: $PROJECT_DIR"

# 2. Create necessary directories if they don't exist.
mkdir -p "$LOG_DIR"
mkdir -p "$PLIST_DIR"
echo "✅ Ensured log and LaunchAgent directories exist."

# 3. Define the .plist content using a HEREDOC.
# This dynamically inserts the correct paths into the template.
PLIST_CONTENT="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
    <key>Label</key>
    <string>$SERVICE_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$PNPM_PATH</string>
        <string>run</string>
        <string>dev</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/wooster.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/wooster.stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>"

# 4. Write the .plist file to the LaunchAgents directory.
echo "$PLIST_CONTENT" > "$PLIST_PATH"
echo "✅ Created service configuration file at $PLIST_PATH"

# 5. Unload any existing version of the service to ensure a clean start.
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# 6. Load the new service into launchd.
launchctl load "$PLIST_PATH"
echo "✅ Service loaded into launchd."

# 7. Manually start the service for the first time.
launchctl start "$SERVICE_NAME"
echo "✅ Service started."

echo "🎉 Wooster installation complete! The service is now running and will start automatically on login."
echo "   Check logs for status:"
echo "   - Output: tail -f $LOG_DIR/wooster.stdout.log"
echo "   - Errors: tail -f $LOG_DIR/wooster.stderr.log" 