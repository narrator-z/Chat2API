#!/bin/bash

# Chat2API Linux Launcher Script
# This script sets up the necessary environment for Chat2API to run in headless mode

# Check if virtual framebuffer is available
if ! command -v xvfb-run &> /dev/null; then
    echo "Warning: xvfb-run not found. Installing xvfb..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y xvfb
    elif command -v yum &> /dev/null; then
        sudo yum install -y xorg-x11-server-Xvfb
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y xorg-x11-server-Xvfb
    else
        echo "Error: Cannot install xvfb. Please install it manually."
        exit 1
    fi
fi

# Set up virtual display
export DISPLAY=:99

# Start Xvfb if not running
if ! pgrep -f "Xvfb :99" > /dev/null; then
    echo "Starting virtual framebuffer..."
    Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
    sleep 2
fi

# Check if Chat2API binary exists
CHAT2API_BIN="/opt/Chat2API/chat2api"
if [ ! -f "$CHAT2API_BIN" ]; then
    echo "Error: Chat2API binary not found at $CHAT2API_BIN"
    exit 1
fi

# Run Chat2API with the user's arguments
echo "Starting Chat2API with virtual display..."
exec "$CHAT2API_BIN" "$@"
