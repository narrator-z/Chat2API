#!/bin/bash

# Chat2API Debug Script
# This script helps diagnose X11 and display issues

echo "=== Chat2API Debug Information ==="
echo

echo "1. User Information:"
echo "   User: $(whoami)"
echo "   UID: $(id -u)"
echo "   GID: $(id -g)"
echo "   Groups: $(id -Gn)"
echo

echo "2. Display Information:"
echo "   DISPLAY: ${DISPLAY:-not set}"
echo

echo "3. Xvfb Status:"
if pgrep -f "Xvfb :99" > /dev/null; then
    echo "   Xvfb is running"
    echo "   PIDs: $(pgrep -f "Xvfb :99")"
else
    echo "   Xvfb is not running"
fi
echo

echo "4. Display Test:"
if xdpyinfo -display :99 >/dev/null 2>&1; then
    echo "   Display :99 is accessible"
else
    echo "   Display :99 is NOT accessible"
    echo "   Trying to start Xvfb..."
    Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
    sleep 3
    if xdpyinfo -display :99 >/dev/null 2>&1; then
        echo "   Display :99 is now accessible"
    else
        echo "   Display :99 still not accessible"
    fi
fi
echo

echo "5. Chat2API Binary:"
if [ -f "/opt/Chat2API/chat2api" ]; then
    echo "   Binary exists: /opt/Chat2API/chat2api"
    echo "   Permissions: $(ls -la /opt/Chat2API/chat2api)"
else
    echo "   Binary NOT found: /opt/Chat2API/chat2api"
fi
echo

echo "6. Launcher Script:"
if [ -f "/usr/local/bin/chat2api-launcher" ]; then
    echo "   Launcher exists: /usr/local/bin/chat2api-launcher"
    echo "   Permissions: $(ls -la /usr/local/bin/chat2api-launcher)"
else
    echo "   Launcher NOT found: /usr/local/bin/chat2api-launcher"
fi
echo

echo "7. Manual Test:"
echo "   Testing direct execution with DISPLAY=:99..."
if [ -f "/opt/Chat2API/chat2api" ]; then
    timeout 5 DISPLAY=:99 /opt/Chat2API/chat2api --version 2>&1 || echo "   Direct execution failed"
fi
echo

echo "=== End Debug Information ==="
