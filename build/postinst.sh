#!/bin/bash
# Post-installation script for Chat2API deb package

set -e

# Install launcher script
if [ -f "/opt/Chat2API/resources/scripts/chat2api-launcher.sh" ]; then
    echo "Installing Chat2API launcher script..."
    cp /opt/Chat2API/resources/scripts/chat2api-launcher.sh /usr/local/bin/chat2api-launcher
    chmod +x /usr/local/bin/chat2api-launcher
    echo "Launcher script installed at /usr/local/bin/chat2api-launcher"
fi

# Install systemd service (optional)
if [ -f "/opt/Chat2API/resources/scripts/chat2api.service" ]; then
    read -p "Do you want to install Chat2API as a systemd service? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Installing systemd service..."
        cp /opt/Chat2API/resources/scripts/chat2api.service /etc/systemd/system/
        systemctl daemon-reload
        systemctl enable chat2api
        echo "Service installed. You can start it with: sudo systemctl start chat2api"
    fi
fi

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
echo ""
echo "You can now run Chat2API in several ways:"
echo "1. Using the launcher (recommended for headless environments):"
echo "   /usr/local/bin/chat2api-launcher"
echo "2. Direct with virtual display:"
echo "   export DISPLAY=:99 && Xvfb :99 -screen 0 1024x768x24 &"
echo "   /opt/Chat2API/chat2api"
echo "3. As a systemd service (if installed):"
echo "   sudo systemctl start chat2api"
echo ""
echo "For headless environments, use the launcher script which automatically"
echo "sets up a virtual display."

exit 0
