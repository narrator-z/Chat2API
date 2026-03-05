#!/bin/sh
set -e

echo "=== Testing Docker Container ==="

# Start Xvfb
echo "Starting Xvfb..."
rm -f /tmp/.X*-lock /tmp/.X11-unix/X* 2>/dev/null
Xvfb :99 -screen 0 1024x768x24 &
export DISPLAY=:99

# Change to app directory
cd /app
export ELECTRON_IS_DEV=0
export NODE_ENV=production

# Check if node_modules exists
echo "Checking node_modules..."
ls -la /app/node_modules/ | head -5

# Install dependencies
echo "Installing dependencies..."
npm install --include=dev

# Reinstall Electron to ensure binary is downloaded
echo "Reinstalling Electron..."
npm install electron@^33.0.2 --force

# Check electron-vite
echo "Checking electron-vite..."
ls -la /app/node_modules/.bin/ | grep electron || echo "electron-vite not found in .bin"

# Check Electron binary
echo "Checking Electron binary..."
ls -la /app/node_modules/electron/dist/ || echo "Electron binary not found"

# Try to run electron-vite directly
echo "Testing electron-vite..."
./node_modules/.bin/electron-vite --version || echo "Failed to run electron-vite directly"

# Try npm run preview
echo "Testing npm run preview..."
timeout 30 npm run preview || echo "npm run preview failed or timed out"
