#!/bin/bash
# Post-installation script for Chat2API deb package

set -e

# Create user config directory
CONFIG_DIR="$HOME/.chat2api"
if [ ! -d "$CONFIG_DIR" ]; then
    mkdir -p "$CONFIG_DIR"
    chmod 755 "$CONFIG_DIR"
fi

# Create logs directory
LOGS_DIR="$CONFIG_DIR/logs"
if [ ! -d "$LOGS_DIR" ]; then
    mkdir -p "$LOGS_DIR"
    chmod 755 "$LOGS_DIR"
fi

# Set up desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi

# Set up mime database
if command -v update-mime-database >/dev/null 2>&1; then
    update-mime-database /usr/share/mime || true
fi

# Set up icon cache
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

# Add user to required groups if needed
if groups "$USER" | grep -q "audio"; then
    echo "User already in audio group"
else
    echo "Note: You may need to add your user to the audio group for sound support:"
    echo "sudo usermod -a -G audio $USER"
fi

echo "Chat2API installation completed successfully!"
echo "You can now:"
echo "1. Launch Chat2API from your application menu"
echo "2. Access Web Management at http://localhost:8080 (after starting the app)"
echo "3. Configure your AI providers in the desktop application"

exit 0
